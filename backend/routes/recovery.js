// POST /api/recovery/plan — recovery plans from the family's real records,
// optionally after a stress scenario. The numbers are deterministic; an LLM (if
// configured) only adds a short narrative and may not change any figure.
const express = require('express');
const { z } = require('zod');
const { wrap, validate } = require('../lib/http');
const analytics = require('../services/analyticsService');
const { recoveryPlans } = require('../engine/recovery');
const stress = require('../engine/stress');
const llm = require('../lib/llm');

const router = express.Router();

const schema = z.object({
  familyId: z.string().uuid(),
  scope: z.enum(['family', 'individual']).default('family'),
  userId: z.string().uuid().optional(),
  shocks: z.array(z.object({ type: z.enum(stress.SHOCK_TYPES) }).passthrough()).max(20).default([]),
  targetMonths: z.number().min(1).max(24).default(6),
  withNarrative: z.boolean().default(false),
}).strict();

router.post('/plan', wrap(async (req, res) => {
  const input = validate(schema, req.body);
  const { position } = await analytics.positionFor(input.familyId, req.user.id, input);
  let cashAfterShock;
  let scenario = null;
  if (input.shocks.length) {
    const r = stress.runScenario(position, input.shocks);
    const end = r.projection.reduce((min, p) => (p.cash < min.cash ? p : min), r.projection[0]);
    cashAfterShock = end.cash;
    scenario = { lowestCash: end.cash, lowestCashMonth: end.month, verdict: r.verdict };
  }
  const result = recoveryPlans(position, { cashAfterShock, targetMonths: input.targetMonths });

  let narrative = { aiGenerated: false, text: null };
  if (input.withNarrative && llm.isConfigured()) {
    try {
      const { json, provider } = await llm.generateJson(
        `Recovery plan figures (INR, monthly):\n${JSON.stringify({ baseline: result.baseline, plans: result.plans.map(({ actionSteps, ...p }) => p) })}\n\n` +
        'Write {"summary": "2-3 plain sentences comparing the trade-offs", "recommendedTier": "Conservative|Balanced|Aggressive", "reason": "one sentence"}. ' +
        'Use only the figures given. Do not invent numbers, promise returns, or recommend specific securities.',
        { system: 'You explain household cash-flow recovery plans to Indian families. Output JSON only.' });
      narrative = { aiGenerated: true, provider, text: json.summary, recommendedTier: json.recommendedTier, reason: json.reason };
    } catch (err) {
      narrative = { aiGenerated: false, text: null, error: `AI narrative unavailable: ${err.message}` };
    }
  }
  res.json({ success: true, scenario, ...result, narrative });
}));

module.exports = router;
