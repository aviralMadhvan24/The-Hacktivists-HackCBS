// Feature entitlements and usage limits, enforced on the backend.
// Core tracking, scoring and stress testing are always free. Prices and payment
// are deliberately not implemented (pending product decision).
const db = require('../db/pool');
const { HttpError } = require('../lib/http');

// monthly limits per plan; null = unlimited, 0 = not available
const LIMITS = {
  free: { investment_agent: 3, concall_analysis: 3, forecast: 10, advanced_stress: null },
  premium: { investment_agent: 200, concall_analysis: 100, forecast: 1000, advanced_stress: null },
};
const FEATURE_LABELS = {
  investment_agent: 'AI investment evaluations',
  concall_analysis: 'Concall analyses',
  forecast: 'Price forecasts',
  advanced_stress: 'Advanced stress testing',
};

function period(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

async function planFor(userId) {
  const { rows } = await db.query('SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = $1', [userId]);
  const s = rows[0];
  if (!s) return 'free';
  const active = s.status === 'active' && (!s.current_period_end || new Date(s.current_period_end) > new Date());
  return active ? s.plan : 'free';
}

async function summary(userId) {
  const plan = await planFor(userId);
  const { rows } = await db.query('SELECT feature, count FROM usage_counters WHERE user_id = $1 AND period = $2', [userId, period()]);
  const used = Object.fromEntries(rows.map((r) => [r.feature, r.count]));
  return {
    plan,
    period: period(),
    features: Object.entries(LIMITS[plan]).map(([feature, limit]) => ({
      feature, label: FEATURE_LABELS[feature], limit, used: used[feature] || 0,
      remaining: limit === null ? null : Math.max(0, limit - (used[feature] || 0)),
    })),
  };
}

/**
 * Atomically reserves one use of a metered feature, or throws 402.
 * Returns a release() to refund the use if the operation then fails.
 */
async function consume(userId, feature) {
  const plan = await planFor(userId);
  const limit = LIMITS[plan][feature];
  if (limit === undefined) throw new Error(`Unknown feature ${feature}`);
  const p = period();
  if (limit === 0) throw new HttpError(402, 'FEATURE_NOT_IN_PLAN', `${FEATURE_LABELS[feature]} is not included in your plan.`);
  if (limit !== null) {
    const { rows } = await db.query(
      `INSERT INTO usage_counters (user_id, feature, period, count) VALUES ($1,$2,$3,1)
       ON CONFLICT (user_id, feature, period) DO UPDATE SET count = usage_counters.count + 1
       WHERE usage_counters.count < $4
       RETURNING count`, [userId, feature, p, limit]);
    if (!rows.length) {
      throw new HttpError(402, 'USAGE_LIMIT_REACHED', `You have used all ${limit} ${FEATURE_LABELS[feature].toLowerCase()} in your ${plan} plan this month.`);
    }
  } else {
    await db.query(
      `INSERT INTO usage_counters (user_id, feature, period, count) VALUES ($1,$2,$3,1)
       ON CONFLICT (user_id, feature, period) DO UPDATE SET count = usage_counters.count + 1`, [userId, feature, p]);
  }
  return {
    release: async () => {
      await db.query('UPDATE usage_counters SET count = GREATEST(0, count - 1) WHERE user_id = $1 AND feature = $2 AND period = $3', [userId, feature, p]);
    },
  };
}

module.exports = { summary, consume, planFor, LIMITS };
