// Deterministic recovery plans after a shock, built from the family's actual
// essential vs discretionary spending (replaces the old 40%-discretionary guess).
const { round1, round2, formatINR } = require('./money');

const TIERS = [
  { id: 'conservative', tier: 'Conservative', cutPct: 15, title: 'Trim discretionary spending by 15%' },
  { id: 'balanced', tier: 'Balanced', cutPct: 30, title: 'Cut discretionary spending by 30%' },
  { id: 'aggressive', tier: 'Aggressive', cutPct: 60, title: 'Emergency budget: cut discretionary spending by 60%' },
];

/**
 * @param {object} pos consolidated position
 * @param {{cashAfterShock?: number, targetMonths?: number}} opts
 *   cashAfterShock: liquid cash left after the shock (defaults to current liquid assets)
 *   targetMonths: emergency fund target in months of essential outflows (default 6)
 */
function recoveryPlans(pos, { cashAfterShock, targetMonths = 6 } = {}) {
  const cf = pos.cashflow;
  const cash = cashAfterShock ?? pos.assets.liquid;
  const target = cf.essentialOutflows * targetMonths;
  const gap = Math.max(0, target - cash);
  const baseSurplus = cf.monthlySavings;

  const plans = TIERS.map((t) => {
    const saving = cf.discretionaryExpenses * (t.cutPct / 100);
    const surplus = baseSurplus + saving;
    const burn = Math.max(0, -surplus);
    return {
      id: t.id, tier: t.tier, title: t.title, cutPct: t.cutPct,
      monthlyExpenseReduction: round2(saving),
      newMonthlyOutflows: round2(cf.monthlyOutflows - saving),
      newMonthlySurplus: round2(surplus),
      runwayMonths: burn > 0 ? round1(Math.max(0, cash) / burn) : null,
      monthsToRebuildEmergencyFund: gap === 0 ? 0 : surplus > 0 ? Math.ceil(gap / surplus) : null,
      actionSteps: [
        `Reduce discretionary spending from ${formatINR(cf.discretionaryExpenses)} to ${formatINR(cf.discretionaryExpenses - saving)} a month.`,
        surplus > 0
          ? `Move the ${formatINR(surplus)} monthly surplus into a liquid emergency fund until it reaches ${formatINR(target)}.`
          : `Even with this cut, outflows exceed income by ${formatINR(-surplus)} a month; essential costs or income must change too.`,
        ...(t.id === 'aggressive' && cf.monthlyEmi > 0 ? ['Ask lenders about temporary EMI restructuring or a longer tenure before missing any payment.'] : []),
      ],
    };
  });

  const notes = [];
  if (cf.discretionaryExpenses === 0) notes.push('No discretionary expenses are recorded, so spending cuts cannot help. Mark non-essential expenses as discretionary for useful plans.');
  return {
    baseline: {
      liquidCash: round2(cash), essentialMonthlyOutflows: cf.essentialOutflows, discretionaryMonthly: cf.discretionaryExpenses,
      monthlyIncome: cf.monthlyIncome, monthlySurplus: baseSurplus, emergencyTarget: round2(target), emergencyGap: round2(gap), targetMonths,
    },
    plans,
    notes,
  };
}

module.exports = { recoveryPlans, TIERS };
