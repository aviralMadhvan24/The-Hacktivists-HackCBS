// /api/families — family management, financial records, analytics, stress tests, proposals.
// Every route requires a session (mounted behind requireAuth) and checks the
// caller's family role in the service layer.
const express = require('express');
const { wrap } = require('../lib/http');
const families = require('../services/familyService');
const records = require('../services/recordsService');
const analytics = require('../services/analyticsService');
const proposals = require('../services/proposalService');
const db = require('../db/pool');
const context = require('../services/meko/contextService');
const agent = require('../services/investmentAgent');

const router = express.Router();
const ip = (req) => req.ip;
const uid = (req) => req.user.id;

// ---- Families & membership ---------------------------------------------------
router.get('/', wrap(async (req, res) => res.json({ success: true, families: await families.listFamilies(uid(req)) })));
router.post('/', wrap(async (req, res) => res.status(201).json({ success: true, family: await families.createFamily(uid(req), req.body?.name, ip(req)) })));
router.get('/invitations/mine', wrap(async (req, res) => res.json({ success: true, invitations: await families.myInvitations(req.user) })));
router.post('/invitations/accept', wrap(async (req, res) => res.json({ success: true, family: await families.acceptInvitation(req.user, req.body || {}, ip(req)) })));

router.get('/:fid', wrap(async (req, res) => res.json({ success: true, family: await families.getFamily(req.params.fid, uid(req)) })));
router.patch('/:fid', wrap(async (req, res) => res.json({ success: true, family: await families.updateFamily(req.params.fid, uid(req), req.body || {}, ip(req)) })));
router.delete('/:fid', wrap(async (req, res) => { await families.deleteFamily(req.params.fid, uid(req), ip(req)); res.json({ success: true }); }));

router.get('/:fid/invitations', wrap(async (req, res) => res.json({ success: true, invitations: await families.listInvitations(req.params.fid, uid(req)) })));
router.post('/:fid/invitations', wrap(async (req, res) => res.status(201).json({ success: true, invitation: await families.inviteMember(req.params.fid, uid(req), req.body || {}, ip(req)) })));
router.delete('/:fid/invitations/:iid', wrap(async (req, res) => { await families.revokeInvitation(req.params.fid, uid(req), req.params.iid, ip(req)); res.json({ success: true }); }));
router.patch('/:fid/members/:uid', wrap(async (req, res) => { await families.changeRole(req.params.fid, uid(req), req.params.uid, req.body?.role, ip(req)); res.json({ success: true, family: await families.getFamily(req.params.fid, uid(req)) }); }));
router.delete('/:fid/members/:uid', wrap(async (req, res) => { await families.removeMember(req.params.fid, uid(req), req.params.uid, ip(req)); res.json({ success: true }); }));

// ---- Financial records (accounts, liabilities, cashflows) ----------------------
for (const entity of Object.keys(records.ENTITIES)) {
  router.get(`/:fid/${entity}`, wrap(async (req, res) => {
    await families.requireRole(req.params.fid, uid(req), 'viewer');
    res.json({ success: true, [entity]: await records.listVisible(entity, req.params.fid, uid(req)) });
  }));
  router.post(`/:fid/${entity}`, wrap(async (req, res) => res.status(201).json({ success: true, item: await records.create(entity, req.params.fid, uid(req), req.body, ip(req)) })));
  router.get(`/:fid/${entity}/:id`, wrap(async (req, res) => res.json({ success: true, item: await records.get(entity, req.params.fid, uid(req), req.params.id) })));
  router.patch(`/:fid/${entity}/:id`, wrap(async (req, res) => res.json({ success: true, item: await records.update(entity, req.params.fid, uid(req), req.params.id, req.body, ip(req)) })));
  router.delete(`/:fid/${entity}/:id`, wrap(async (req, res) => { await records.remove(entity, req.params.fid, uid(req), req.params.id, ip(req)); res.json({ success: true }); }));
}

router.get('/:fid/accounts/:aid/holdings', wrap(async (req, res) => res.json({ success: true, holdings: await records.listHoldings(req.params.fid, uid(req), req.params.aid) })));
router.post('/:fid/accounts/:aid/holdings', wrap(async (req, res) => res.status(201).json({ success: true, holding: await records.upsertHolding(req.params.fid, uid(req), req.params.aid, req.body, ip(req)) })));
router.delete('/:fid/accounts/:aid/holdings/:hid', wrap(async (req, res) => { await records.deleteHolding(req.params.fid, uid(req), req.params.aid, req.params.hid, ip(req)); res.json({ success: true }); }));
router.get('/:fid/accounts/:aid/transactions', wrap(async (req, res) => res.json({ success: true, transactions: await records.listTransactions(req.params.fid, uid(req), req.params.aid, { limit: Number(req.query.limit) || 100 }) })));
router.post('/:fid/accounts/:aid/transactions', wrap(async (req, res) => res.status(201).json({ success: true, transaction: await records.addTransaction(req.params.fid, uid(req), req.params.aid, req.body, ip(req)) })));
router.delete('/:fid/accounts/:aid/transactions/:tid', wrap(async (req, res) => { await records.deleteTransaction(req.params.fid, uid(req), req.params.aid, req.params.tid, ip(req)); res.json({ success: true }); }));

// ---- Analytics ---------------------------------------------------------------------
router.get('/:fid/dashboard', wrap(async (req, res) => res.json({ success: true, ...(await analytics.dashboard(req.params.fid, uid(req), req.query)) })));
router.get('/:fid/score/history', wrap(async (req, res) => res.json({ success: true, history: await analytics.scoreHistory(req.params.fid, uid(req), req.query) })));
router.get('/:fid/stress/presets', wrap(async (req, res) => { await families.requireRole(req.params.fid, uid(req), 'viewer'); res.json({ success: true, presets: analytics.presets() }); }));
router.post('/:fid/stress/run', wrap(async (req, res) => res.json({ success: true, result: await analytics.runStress(req.params.fid, uid(req), req.body, ip(req)) })));
router.post('/:fid/stress/compare', wrap(async (req, res) => res.json({ success: true, ...(await analytics.compareStress(req.params.fid, uid(req), req.body)) })));
router.post('/:fid/stress/reverse', wrap(async (req, res) => res.json({ success: true, result: await analytics.reverseStress(req.params.fid, uid(req), req.body) })));
router.post('/:fid/whatif', wrap(async (req, res) => res.json({ success: true, result: await analytics.whatIf(req.params.fid, uid(req), req.body) })));
router.get('/:fid/simulations', wrap(async (req, res) => res.json({ success: true, simulations: await analytics.listSimulations(req.params.fid, uid(req)) })));
router.get('/:fid/simulations/:sid', wrap(async (req, res) => res.json({ success: true, simulation: await analytics.getSimulation(req.params.fid, uid(req), req.params.sid) })));
router.delete('/:fid/simulations/:sid', wrap(async (req, res) => { await analytics.deleteSimulation(req.params.fid, uid(req), req.params.sid); res.json({ success: true }); }));

// ---- Proposals ---------------------------------------------------------------------
router.get('/:fid/proposals', wrap(async (req, res) => res.json({ success: true, proposals: await proposals.list(req.params.fid, uid(req), { status: req.query.status }) })));
router.post('/:fid/proposals', wrap(async (req, res) => res.status(201).json({ success: true, proposal: await proposals.create(req.params.fid, uid(req), req.body, ip(req)) })));
router.get('/:fid/proposals/:pid', wrap(async (req, res) => res.json({ success: true, proposal: await proposals.get(req.params.fid, uid(req), req.params.pid) })));
router.get('/:fid/proposals/:pid/impact', wrap(async (req, res) => res.json({ success: true, impact: await proposals.impactForViewer(req.params.fid, uid(req), req.params.pid) })));
router.post('/:fid/proposals/:pid/comments', wrap(async (req, res) => res.status(201).json({ success: true, proposal: await proposals.comment(req.params.fid, uid(req), req.params.pid, req.body, ip(req)) })));
router.post('/:fid/proposals/:pid/vote', wrap(async (req, res) => res.json({ success: true, proposal: await proposals.vote(req.params.fid, uid(req), req.params.pid, req.body, ip(req)) })));
router.post('/:fid/proposals/:pid/withdraw', wrap(async (req, res) => res.json({ success: true, proposal: await proposals.withdraw(req.params.fid, uid(req), req.params.pid, ip(req)) })));

// ---- Investment intelligence agent -------------------------------------------------
router.post('/:fid/agent/evaluate', wrap(async (req, res) => res.json({ success: true, evaluation: await agent.evaluate(req.params.fid, uid(req), req.body, ip(req)) })));
router.get('/:fid/agent/evaluations', wrap(async (req, res) => res.json({ success: true, evaluations: await agent.list(req.params.fid, uid(req)) })));
router.get('/:fid/agent/evaluations/:eid', wrap(async (req, res) => res.json({ success: true, evaluation: await agent.get(req.params.fid, uid(req), req.params.eid) })));

// ---- Contextual memory (Meko) ------------------------------------------------------
router.get('/:fid/context', wrap(async (req, res) => res.json({ success: true, memories: await context.list(req.params.fid, uid(req), { kind: req.query.kind }) })));
router.get('/:fid/context/search', wrap(async (req, res) => res.json({ success: true, ...(await context.search(req.params.fid, uid(req), req.query.q, { limit: Math.min(20, Number(req.query.limit) || 8) })) })));
router.post('/:fid/context', wrap(async (req, res) => res.status(201).json({ success: true, ...(await context.add(req.params.fid, uid(req), req.body, ip(req))) })));
router.post('/:fid/context/resync', wrap(async (req, res) => res.json({ success: true, results: await context.resync(req.params.fid, uid(req)) })));
router.patch('/:fid/context/:mid', wrap(async (req, res) => res.json({ success: true, ...(await context.correct(req.params.fid, uid(req), req.params.mid, req.body, ip(req))) })));
router.delete('/:fid/context/:mid', wrap(async (req, res) => { await context.remove(req.params.fid, uid(req), req.params.mid, ip(req)); res.json({ success: true }); }));

// ---- Audit log (admins) ------------------------------------------------------------
router.get('/:fid/audit', wrap(async (req, res) => {
  await families.requireRole(req.params.fid, uid(req), 'admin');
  const { rows } = await db.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS actor_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.family_id = $1 ORDER BY a.created_at DESC LIMIT 200`, [req.params.fid]);
  res.json({ success: true, entries: rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, actor: r.actor_name, at: r.created_at })) });
}));

module.exports = router;
