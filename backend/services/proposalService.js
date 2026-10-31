// Shared family decisions: propose, discuss, vote, decide — with audit trail.
//
// Decision rule
//   Eligible voters: active members with role ≥ member, excluding the proposer.
//   required = min(family approval threshold, number of eligible voters), at least 1
//     (a single-member family can't approve its own proposal; it stays open for the record).
//   Approved when approvals ≥ required.
//   Rejected when the remaining possible approvals can no longer reach required.
const { randomUUID } = require('crypto');
const { z } = require('zod');
const db = require('../db/pool');
const { validate, notFound, forbidden, badRequest, conflict } = require('../lib/http');
const { audit } = require('../lib/audit');
const familyService = require('./familyService');
const analytics = require('./analyticsService');
const { evaluateDecision } = require('../engine/whatif');

const { ROLE_RANK } = familyService;

const createSchema = z.object({
  kind: z.enum(['buy_stock', 'sell_stock', 'purchase', 'loan', 'other']),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).optional(),
  amount: z.number().positive().max(1e12).optional(),
  decision: z.record(z.any()).optional(), // engine decision payload, validated below when present
}).strict();

function toDecision(input) {
  if (input.kind === 'other') return null;
  const base = { ...(input.decision || {}) };
  if (input.kind === 'loan') return { kind: 'loan', principal: input.amount, emiMonthly: base.emiMonthly ?? 0, cashReceived: base.cashReceived ?? false };
  return { ...base, kind: input.kind, amount: input.amount };
}

async function eligibleVoters(familyId, proposerId, client = db) {
  const { rows } = await client.query(
    `SELECT user_id FROM family_members WHERE family_id = $1 AND status = 'active' AND role IN ('owner','admin','member') AND user_id <> $2`,
    [familyId, proposerId]);
  return rows.map((r) => r.user_id);
}

async function create(familyId, actorId, body, ip) {
  const m = await familyService.requireRole(familyId, actorId, 'member');
  const input = validate(createSchema, body);
  if (input.kind !== 'other' && !input.amount) throw badRequest('amount is required for this kind of proposal.');
  let impact = null;
  const decision = toDecision(input);
  if (decision) {
    const parsed = validate(analytics.decisionSchema, decision);
    // Impact uses the proposer's view of the family (shared + their private records).
    const { position } = await analytics.positionFor(familyId, actorId, { scope: 'family' });
    impact = evaluateDecision(position, parsed);
    delete impact.scoreAfter; // keep the stored payload compact
    impact.computedAt = new Date().toISOString();
    impact.computedFor = actorId;
  }
  const voters = await eligibleVoters(familyId, actorId);
  const required = Math.max(1, Math.min(m.approval_threshold, voters.length || 1));
  const id = randomUUID();
  await db.query(
    `INSERT INTO proposals (id, family_id, created_by, kind, title, description, amount, payload, impact, required_approvals)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, familyId, actorId, input.kind, input.title, input.description || null, input.amount || null,
      JSON.stringify(decision || {}), impact ? JSON.stringify(impact) : null, required]);
  await audit({ familyId, actorId, action: 'proposal.create', entityType: 'proposal', entityId: id, details: { kind: input.kind, title: input.title }, ip });
  return get(familyId, actorId, id);
}

async function list(familyId, viewerId, { status } = {}) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const params = [familyId];
  let where = 'p.family_id = $1';
  if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
  const { rows } = await db.query(
    `SELECT p.*, u.name AS proposer_name,
       (SELECT count(*)::int FROM proposal_votes v WHERE v.proposal_id = p.id AND v.vote = 'approve') AS approvals,
       (SELECT count(*)::int FROM proposal_votes v WHERE v.proposal_id = p.id AND v.vote = 'reject') AS rejections,
       (SELECT count(*)::int FROM proposal_comments c WHERE c.proposal_id = p.id) AS comments
     FROM proposals p JOIN users u ON u.id = p.created_by WHERE ${where} ORDER BY p.created_at DESC LIMIT 100`, params);
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, amount: r.amount, status: r.status, createdBy: r.created_by, proposerName: r.proposer_name,
    approvals: r.approvals, rejections: r.rejections, requiredApprovals: r.required_approvals, comments: r.comments,
    scoreDelta: r.impact ? r.impact.scoreDelta : null, createdAt: r.created_at, decidedAt: r.decided_at,
  }));
}

async function get(familyId, viewerId, id) {
  await familyService.requireRole(familyId, viewerId, 'viewer');
  const { rows } = await db.query(
    'SELECT p.*, u.name AS proposer_name FROM proposals p JOIN users u ON u.id = p.created_by WHERE p.id = $1 AND p.family_id = $2', [id, familyId]);
  const p = rows[0];
  if (!p) throw notFound('Proposal not found.');
  const [votes, comments] = await Promise.all([
    db.query('SELECT v.user_id, v.vote, v.note, v.created_at, u.name FROM proposal_votes v JOIN users u ON u.id = v.user_id WHERE v.proposal_id = $1 ORDER BY v.created_at', [id]),
    db.query('SELECT c.id, c.user_id, c.body, c.created_at, u.name FROM proposal_comments c JOIN users u ON u.id = c.user_id WHERE c.proposal_id = $1 ORDER BY c.created_at', [id]),
  ]);
  // The stored impact was computed from the proposer's view, which may include their
  // private records. Only the proposer sees the full figures; others see the deltas.
  let impact = p.impact;
  if (impact && impact.computedFor !== viewerId) {
    impact = {
      scoreDelta: impact.scoreDelta, pillarDeltas: impact.pillarDeltas, warnings: impact.warnings,
      stressTest: impact.stressTest && { shocks: impact.stressTest.shocks },
      computedAt: impact.computedAt, redacted: true,
      note: "Figures are hidden because they were computed from the proposer's view. Use 'Recalculate for me' to see the impact on your view.",
    };
  }
  return {
    id: p.id, familyId: p.family_id, kind: p.kind, title: p.title, description: p.description, amount: p.amount,
    decision: p.payload, impact, status: p.status, requiredApprovals: p.required_approvals,
    createdBy: p.created_by, proposerName: p.proposer_name, createdAt: p.created_at, decidedAt: p.decided_at,
    votes: votes.rows.map((v) => ({ userId: v.user_id, name: v.name, vote: v.vote, note: v.note, at: v.created_at })),
    comments: comments.rows.map((c) => ({ id: c.id, userId: c.user_id, name: c.name, body: c.body, at: c.created_at })),
  };
}

/** Recomputes the decision's impact on the viewer's own view (not stored). */
async function impactForViewer(familyId, viewerId, id) {
  const p = await get(familyId, viewerId, id);
  if (!p.decision || !p.decision.kind) throw badRequest('This proposal has no quantified decision to evaluate.');
  const decision = validate(analytics.decisionSchema, p.decision);
  const { position } = await analytics.positionFor(familyId, viewerId, { scope: 'family' });
  const r = evaluateDecision(position, decision);
  delete r.scoreAfter;
  return r;
}

async function comment(familyId, actorId, id, body, ip) {
  await familyService.requireRole(familyId, actorId, 'viewer');
  const text = validate(z.object({ body: z.string().trim().min(1).max(4000) }).strict(), body).body;
  const { rowCount } = await db.query('SELECT 1 FROM proposals WHERE id = $1 AND family_id = $2', [id, familyId]);
  if (!rowCount) throw notFound('Proposal not found.');
  const cid = randomUUID();
  await db.query('INSERT INTO proposal_comments (id, proposal_id, user_id, body) VALUES ($1,$2,$3,$4)', [cid, id, actorId, text]);
  await audit({ familyId, actorId, action: 'proposal.comment', entityType: 'proposal', entityId: id, ip });
  return get(familyId, actorId, id);
}

async function vote(familyId, actorId, id, body, ip) {
  const m = await familyService.requireRole(familyId, actorId, 'member');
  const { vote: v, note } = validate(z.object({ vote: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional() }).strict(), body);
  await db.withTransaction(async (c) => {
    const { rows } = await c.query('SELECT * FROM proposals WHERE id = $1 AND family_id = $2 FOR UPDATE', [id, familyId]);
    const p = rows[0];
    if (!p) throw notFound('Proposal not found.');
    if (p.status !== 'open') throw conflict(`This proposal is already ${p.status}.`);
    if (p.created_by === actorId) throw forbidden("You can't vote on your own proposal.");
    if (ROLE_RANK[m.role] < ROLE_RANK.member) throw forbidden('Viewers cannot vote.');
    await c.query(
      `INSERT INTO proposal_votes (proposal_id, user_id, vote, note) VALUES ($1,$2,$3,$4)
       ON CONFLICT (proposal_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, note = EXCLUDED.note, created_at = now()`,
      [id, actorId, v, note || null]);
    const tally = await c.query(
      `SELECT count(*) FILTER (WHERE vote = 'approve')::int AS a, count(*) FILTER (WHERE vote = 'reject')::int AS r
       FROM proposal_votes WHERE proposal_id = $1`, [id]);
    const voters = await eligibleVoters(familyId, p.created_by, c);
    const { a, r } = tally.rows[0];
    let status = 'open';
    if (a >= p.required_approvals) status = 'approved';
    else if (voters.length - r < p.required_approvals) status = 'rejected';
    if (status !== 'open') {
      await c.query('UPDATE proposals SET status = $2, decided_at = now(), updated_at = now() WHERE id = $1', [id, status]);
    }
    await audit({ familyId, actorId, action: 'proposal.vote', entityType: 'proposal', entityId: id, details: { vote: v, resultingStatus: status }, ip }, c);
  });
  return get(familyId, actorId, id);
}

async function withdraw(familyId, actorId, id, ip) {
  await familyService.requireRole(familyId, actorId, 'member');
  const r = await db.query(
    "UPDATE proposals SET status = 'withdrawn', decided_at = now(), updated_at = now() WHERE id = $1 AND family_id = $2 AND created_by = $3 AND status = 'open'",
    [id, familyId, actorId]);
  if (!r.rowCount) throw notFound('No open proposal of yours with that id.');
  await audit({ familyId, actorId, action: 'proposal.withdraw', entityType: 'proposal', entityId: id, ip });
  return get(familyId, actorId, id);
}

module.exports = { create, list, get, impactForViewer, comment, vote, withdraw };
