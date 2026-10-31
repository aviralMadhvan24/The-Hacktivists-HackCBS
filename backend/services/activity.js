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
  concall(userId, { company, ticker, quarter, fiscalYear }) {
    return person.recordActivity(userId, `I analysed the ${quarter} ${fiscalYear} earnings call of ${company} (${ticker}) in FinSight.`);
  },
};

module.exports = activity;
