// Short first-person notes about what a user did in the app, sent to their Meko
// conversation so Meko can remember it (see personMemory.recordActivity).
// Numbers here come from FinSight's engines; nothing is invented.
const person = require('./meko/personMemory');
const { formatINR } = require('../engine/money');

function describeShock(s) {
  const bits = Object.entries(s).filter(([k, v]) => k !== 'type' && v != null && typeof v !== 'object').map(([k, v]) => `${k} ${v}`);
  return `${String(s.type).replace(/_/g, ' ')}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

const activity = {
  stressTest(userId, { shocks, result, saveAs, scope }) {
    const v = result?.verdict?.text ? ` Result: ${result.verdict.text}` : '';
    return person.recordActivity(userId, `I ran a ${scope === 'individual' ? 'personal' : 'family'} stress test${saveAs ? ` named "${saveAs}"` : ''}: ${shocks.map(describeShock).join('; ')}.${v}`);
  },
  evaluation(userId, { symbol, amount }) {
    return person.recordActivity(userId, `I evaluated investing ${formatINR(amount)} in ${symbol} with FinSight's investment agent.`);
  },
  proposal(userId, { title, amount }) {
    return person.recordActivity(userId, `I proposed a family decision: "${title}"${amount ? ` (${formatINR(amount)})` : ''}.`);
  },
  vote(userId, { title, vote, status }) {
    return person.recordActivity(userId, `I voted to ${vote} the family proposal "${title}"${status && status !== 'open' ? `; it is now ${status}` : ''}.`);
  },
  brokerSync(userId, { holdings, simulated }) {
    return person.recordActivity(userId, `I synced ${holdings} holdings from my Zerodha account${simulated ? ' (simulated demo account)' : ''} into FinSight.`);
  },
  whatIf(userId, { decision, result }) {
    const what = {
      buy_stock: () => `buying ${formatINR(decision.amount)} of ${decision.symbol}`,
      sell_stock: () => `selling ${formatINR(decision.amount)} of ${decision.symbol}`,
      purchase: () => `a ${formatINR(decision.amount)} purchase`,
      loan: () => `taking a ${formatINR(decision.principal)} loan with an EMI of ${formatINR(decision.emiMonthly)}`,
      recurring: () => `a new ${decision.essential === false ? 'optional' : 'essential'} expense of ${formatINR(decision.monthlyAmount)} a month`,
    }[decision.kind]?.() || 'a financial decision';
    const delta = typeof result?.scoreDelta === 'number' ? ` FinSight showed my resilience score would change by ${result.scoreDelta > 0 ? '+' : ''}${result.scoreDelta}.` : '';
    return person.recordActivity(userId, `I checked in FinSight what would happen if I went ahead with ${what}.${delta}`);
  },
  breakingPoint(userId, { result }) {
    if (!result?.explanation) return undefined;
    return person.recordActivity(userId, `I tested my breaking point in FinSight: ${result.explanation}`);
  },
  concallSearch(userId, { ticker, company, found, quarter, fiscalYear }) {
    const name = company && company !== ticker ? `${company} (${ticker})` : ticker;
    return person.recordActivity(userId, found
      ? `I looked up the latest earnings call of ${name}${quarter && fiscalYear ? ` (${quarter} ${fiscalYear})` : ''} in FinSight.`
      : `I looked for the latest earnings call of ${name} in FinSight; it wasn't available automatically.`);
  },
  concall(userId, { company, ticker, quarter, fiscalYear }) {
    return person.recordActivity(userId, `I analysed the ${quarter} ${fiscalYear} earnings call of ${company} (${ticker}) in FinSight.`);
  },
};

module.exports = activity;
