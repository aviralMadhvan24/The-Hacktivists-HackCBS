// Dashboards, resilience scores (with history), stress tests and recovery plans,
// all computed from the records the viewer is allowed to see.
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../db/pool');
const { validate, badRequest, notFound } = require('../lib/http');
const { audit } = require('../lib/audit');
const familyService = require('./familyService');
const records = require('./recordsService');
const { consolidate } = require('../engine/consolidation');
const { scorePosition, explainChange, ENGINE_VERSION: SCORE_VERSION } = require('../engine/resilience');
const stress = require('../engine/stress');
const { evaluateDecision } = require('../engine/whatif');

const scopeSchema = z.object({
  scope: z.enum(['family', 'individual']).default('family'),
  userId: z.string().uuid().optional(),
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Resolves the viewer's position for a scope. Individual scope may target any active member. */
async function positionFor(familyId, viewerId, scopeInput = {}) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const { scope, userId } = validate(scopeSchema, scopeInput);
  const memberIds = await familyService.activeMemberIds(familyId);
  let engineScope = { type: 'family' };
  if (scope === 'individual') {
    const target = userId || viewerId;
    if (!memberIds.includes(target)) throw notFound('Member not found in this family.');
    engineScope = { type: 'individual', userId: target };
  }
  const data = await records.loadEngineData(familyId, viewerId);
  const position = consolidate(data, engineScope, memberIds, { asOf: today() });
  return { position, data, scope: engineScope, memberIds };
}

function dataFreshness(data) {
  const priced = data.holdings.filter((h) => h.priceAsOf);
  const oldest = priced.reduce((min, h) => (!min || h.priceAsOf < min ? h.priceAsOf : min), null);
  return {
    holdingsCount: data.holdings.length,
    holdingsWithoutMarketPrice: data.holdings.filter((h) => h.lastPrice == null).length,
    oldestPriceAsOf: oldest,
  };
}

async function dashboard(familyId, viewerId, scopeInput) {
  const { position, data, scope } = await positionFor(familyId, viewerId, scopeInput);
  const score = scorePosition(position);
  const history = await recordScore(familyId, viewerId, scope, score);
  return {
    scope,
    asOf: new Date().toISOString(),
    position,
    score,
    scoreChange: history.change,
    freshness: dataFreshness(data),
    privacyNote: scope.type === 'family'
      ? "Built from shared records plus your own private records. Other members' private records are never included."
      : 'Built from records visible to you, weighted by this member\'s ownership share.',
  };
}

/** Stores a snapshot when the score moved (or daily) and explains change vs the previous one. */
async function recordScore(familyId, viewerId, scope, report) {
  const scopeUser = scope.type === 'individual' ? scope.userId : null;
  // No records yet: don't store a baseline, or the first real score would show a misleading jump.
  if (!report.hasData) return { change: { delta: null, changes: [], summary: 'Add records to start tracking your score.' } };
  const { rows } = await db.query(
    `SELECT score, report, created_at FROM score_snapshots
     WHERE family_id = $1 AND viewer_id = $2 AND scope = $3 AND scope_user IS NOT DISTINCT FROM $4
     ORDER BY created_at DESC LIMIT 1`,
    [familyId, viewerId, scope.type, scopeUser]);
  const prev = rows[0];
  const moved = !prev || Math.abs(prev.score - report.score) >= 0.1;
  const stale = prev && Date.now() - new Date(prev.created_at).getTime() > 86400000;
  if (moved || stale) {
    await db.query(
      `INSERT INTO score_snapshots (id, family_id, scope, scope_user, viewer_id, score, report, engine_ver) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), familyId, scope.type, scopeUser, viewerId, report.score, JSON.stringify(slimReport(report)), SCORE_VERSION]);
  }
  // Compare against the latest snapshot that differs, so the explanation stays useful between refreshes.
  const { rows: diffRows } = await db.query(
    `SELECT report, created_at FROM score_snapshots
     WHERE family_id = $1 AND viewer_id = $2 AND scope = $3 AND scope_user IS NOT DISTINCT FROM $4 AND score <> $5
     ORDER BY created_at DESC LIMIT 1`,
    [familyId, viewerId, scope.type, scopeUser, report.score]);
  const change = diffRows[0]
    ? { ...explainChange(diffRows[0].report, report), comparedTo: diffRows[0].created_at }
    : { delta: null, changes: [], summary: 'No earlier score to compare against yet.' };
  return { change };
}

function slimReport(r) {
  return { score: r.score, band: r.band, pillars: r.pillars.map((p) => ({ key: p.key, name: p.name, points: p.points, metrics: p.metrics })) };
}

async function scoreHistory(familyId, viewerId, scopeInput) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const { scope, userId } = validate(scopeSchema, scopeInput);
  const { rows } = await db.query(
    `SELECT score, created_at FROM score_snapshots WHERE family_id = $1 AND viewer_id = $2 AND scope = $3
       AND scope_user IS NOT DISTINCT FROM $4 ORDER BY created_at DESC LIMIT 90`,
    [familyId, viewerId, scope, scope === 'individual' ? (userId || viewerId) : null]);
  return rows.reverse().map((r) => ({ score: r.score, at: r.created_at }));
}

// ---- Stress testing ---------------------------------------------------------
const shockSchema = z.object({ type: z.enum(stress.SHOCK_TYPES) }).passthrough();
const assumptionsSchema = z.object({
  horizonMonths: z.number().int().min(1).max(120).optional(),
  allowForcedSelling: z.boolean().optional(),
  assumedAnnualEquityReturnPct: z.number().min(-20).max(40).optional(),
}).strict().optional();

const runSchema = z.object({
  scope: z.enum(['family', 'individual']).default('family'),
  userId: z.string().uuid().optional(),
  shocks: z.array(shockSchema).min(1).max(20),
  assumptions: assumptionsSchema,
  saveAs: z.string().trim().min(1).max(120).optional(),
}).strict();

function engineError(err) {
  if (['INVALID_SHOCK', 'INVALID_CONDITION', 'INVALID_VARIABLE', 'INVALID_DECISION'].includes(err.code)) return badRequest(err.message);
  return err;
}

async function runStress(familyId, viewerId, body, ip) {
  const input = validate(runSchema, body);
  const { position, scope } = await positionFor(familyId, viewerId, input);
  let result;
  try { result = stress.runScenario(position, input.shocks, input.assumptions || {}); } catch (e) { throw engineError(e); }
  let savedId = null;
  if (input.saveAs) savedId = await saveSimulation(familyId, viewerId, scope, 'scenario', input.saveAs, input, result, ip);
  await require('./activity').stressTest(viewerId, { shocks: input.shocks, result, saveAs: input.saveAs, scope: scope.type });
  return { ...result, savedId };
}

const compareSchema = z.object({
  scope: z.enum(['family', 'individual']).default('family'),
  userId: z.string().uuid().optional(),
  scenarios: z.array(z.object({ name: z.string().trim().min(1).max(120), shocks: z.array(shockSchema).min(1).max(20) })).min(1).max(12),
  assumptions: assumptionsSchema,
}).strict();

async function compareStress(familyId, viewerId, body) {
  const input = validate(compareSchema, body);
  const { position } = await positionFor(familyId, viewerId, input);
  try { return { baseline: { score: scorePosition(position).score, netWorth: position.netWorth, liquid: position.assets.liquid }, scenarios: stress.compareScenarios(position, input.scenarios, input.assumptions || {}) }; } catch (e) { throw engineError(e); }
}

const reverseSchema = z.object({
  scope: z.enum(['family', 'individual']).default('family'),
  userId: z.string().uuid().optional(),
  variable: z.enum(Object.keys(stress.REVERSE_VARIABLES)),
  condition: z.discriminatedUnion('type', [
    z.object({ type: z.literal('cash_below'), floor: z.number().min(0).max(1e13) }),
    z.object({ type: z.literal('forced_selling') }),
    z.object({ type: z.literal('runway_below'), months: z.number().min(0.5).max(120) }),
    z.object({ type: z.literal('score_below'), score: z.number().min(1).max(100) }),
    z.object({ type: z.literal('networth_drop_above'), pct: z.number().min(0.1).max(100) }),
  ]),
  baseShocks: z.array(shockSchema).max(20).default([]),
  assumptions: assumptionsSchema,
}).strict();

async function reverseStress(familyId, viewerId, body) {
  const input = validate(reverseSchema, body);
  const { position } = await positionFor(familyId, viewerId, input);
  let result;
  try { result = stress.reverseStress(position, { variable: input.variable, condition: input.condition, baseShocks: input.baseShocks, assumptions: input.assumptions || {} }); } catch (e) { throw engineError(e); }
  await require('./activity').breakingPoint(viewerId, { result });
  return result;
}

const decisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('buy_stock'), amount: z.number().positive().max(1e12), symbol: z.string().trim().min(1).max(30), sector: z.string().max(80).optional(), name: z.string().max(160).optional(), fundFrom: z.enum(['liquid', 'semi_liquid']).default('liquid') }),
  z.object({ kind: z.literal('sell_stock'), amount: z.number().positive().max(1e12), symbol: z.string().trim().min(1).max(30) }),
  z.object({ kind: z.literal('purchase'), amount: z.number().positive().max(1e12), assetValue: z.number().min(0).max(1e12).optional(), fundFrom: z.enum(['liquid', 'semi_liquid']).default('liquid') }),
  z.object({ kind: z.literal('loan'), principal: z.number().positive().max(1e12), emiMonthly: z.number().min(0).max(1e10), cashReceived: z.boolean().default(false) }),
  z.object({ kind: z.literal('recurring'), monthlyAmount: z.number().positive().max(1e10), essential: z.boolean().default(true) }),
]);

async function whatIf(familyId, viewerId, body) {
  const decision = validate(decisionSchema, body?.decision);
  const { position } = await positionFor(familyId, viewerId, body || {});
  let result;
  try { result = evaluateDecision(position, decision); } catch (e) { throw engineError(e); }
  await require('./activity').whatIf(viewerId, { decision, result });
  return result;
}

async function saveSimulation(familyId, viewerId, scope, kind, name, input, output, ip) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO simulations (id, family_id, created_by, scope, scope_user, kind, name, input, output, engine_ver)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, familyId, viewerId, scope.type, scope.type === 'individual' ? scope.userId : null, kind, name,
      JSON.stringify(input), JSON.stringify(output), stress.ENGINE_VERSION]);
  await audit({ familyId, actorId: viewerId, action: 'simulation.save', entityType: 'simulation', entityId: id, details: { name, kind }, ip });
  return id;
}

/** Saved simulations are private to their creator (they embed private record values). */
async function listSimulations(familyId, viewerId) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const { rows } = await db.query(
    `SELECT id, kind, name, scope, created_at, output->'verdict' AS verdict, output->'impact'->'scoreChange' AS score_change
     FROM simulations WHERE family_id = $1 AND created_by = $2 ORDER BY created_at DESC LIMIT 50`, [familyId, viewerId]);
  return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, scope: r.scope, createdAt: r.created_at, verdict: r.verdict, scoreChange: r.score_change }));
}

async function getSimulation(familyId, viewerId, id) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const { rows } = await db.query('SELECT * FROM simulations WHERE id = $1 AND family_id = $2 AND created_by = $3', [id, familyId, viewerId]);
  if (!rows[0]) throw notFound('Simulation not found.');
  const r = rows[0];
  return { id: r.id, kind: r.kind, name: r.name, scope: r.scope, input: r.input, output: r.output, engineVersion: r.engine_ver, createdAt: r.created_at };
}

async function deleteSimulation(familyId, viewerId, id) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const r = await db.query('DELETE FROM simulations WHERE id = $1 AND family_id = $2 AND created_by = $3', [id, familyId, viewerId]);
  if (!r.rowCount) throw notFound('Simulation not found.');
}

module.exports = {
  positionFor, dashboard, scoreHistory, runStress, compareStress, reverseStress, whatIf, decisionSchema,
  listSimulations, getSimulation, deleteSimulation, presets: () => stress.PRESETS,
};
