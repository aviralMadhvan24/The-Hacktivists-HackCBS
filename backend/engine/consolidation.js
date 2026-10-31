// Consolidates a family's (or one member's) financial position from raw records.
// Pure and deterministic: no I/O, no clock, no randomness.
//
// Ownership rule (no double counting):
//   Each record has owners with share percentages that sum to at most 100.
//   - Individual view of user U: record counts at U's share.
//   - Family view: record counts at the sum of shares held by active family
//     members. Shares held by people outside the family are excluded.
//   Every record is therefore counted once, at the fraction the scope owns.

const { round2, clamp } = require('./money');

const FREQUENCY_TO_MONTHLY = { monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 };
const EQUITY_INSTRUMENTS = new Set(['equity', 'etf', 'mutual_fund']);
const DIVERSIFIED_INSTRUMENTS = new Set(['etf', 'mutual_fund']);

/** Returns the weight (0..1) at which a record counts for the given scope. */
function ownershipWeight(owners, scope, memberIds) {
  if (!Array.isArray(owners) || owners.length === 0) return 0;
  if (scope.type === 'individual') {
    const own = owners.find((o) => o.userId === scope.userId);
    return own ? clamp(own.sharePct / 100, 0, 1) : 0;
  }
  const members = memberIds instanceof Set ? memberIds : new Set(memberIds);
  const total = owners
    .filter((o) => members.has(o.userId))
    .reduce((sum, o) => sum + o.sharePct, 0);
  return clamp(total / 100, 0, 1);
}

/** Validates that owner shares are positive and sum to at most 100%. */
function validateOwners(owners) {
  if (!Array.isArray(owners) || owners.length === 0) return 'At least one owner is required.';
  const seen = new Set();
  let total = 0;
  for (const o of owners) {
    if (!o.userId) return 'Each owner needs a userId.';
    if (seen.has(o.userId)) return 'An owner is listed twice.';
    seen.add(o.userId);
    if (!(o.sharePct > 0 && o.sharePct <= 100)) return 'Each ownership share must be between 0 and 100%.';
    total += o.sharePct;
  }
  if (total > 100.0001) return `Ownership shares add up to ${round2(total)}%, which is more than 100%.`;
  return null;
}

function monthlyAmount(cashflow) {
  const factor = FREQUENCY_TO_MONTHLY[cashflow.frequency || 'monthly'];
  if (factor === undefined) throw new Error(`Unknown frequency: ${cashflow.frequency}`);
  return cashflow.amount * factor;
}

function holdingValue(h) {
  const price = h.lastPrice != null ? h.lastPrice : h.avgPrice;
  return (h.quantity || 0) * (price || 0);
}

/**
 * Builds the position for a scope.
 * @param {object} data { accounts, holdings, liabilities, cashflows } — only records visible to the viewer.
 * @param {{type:'family'}|{type:'individual', userId:string}} scope
 * @param {string[]} memberIds active family member ids
 * @param {{asOf?: string}} [opts] reference date (YYYY-MM-DD) for cash flows with start/end dates
 */
function consolidate(data, scope, memberIds, opts = {}) {
  const members = new Set(memberIds);
  const asOf = opts.asOf || null;
  const holdingsByAccount = new Map();
  for (const h of data.holdings || []) {
    if (!holdingsByAccount.has(h.accountId)) holdingsByAccount.set(h.accountId, []);
    holdingsByAccount.get(h.accountId).push(h);
  }

  const assets = { total: 0, liquid: 0, semiLiquid: 0, illiquid: 0, equityExposure: 0, byKind: {} };
  const positions = []; // scope-weighted investment positions, for concentration analysis
  const accountRows = [];

  for (const acct of data.accounts || []) {
    const w = ownershipWeight(acct.owners, scope, members);
    if (w === 0) continue;
    const accountHoldings = holdingsByAccount.get(acct.id) || [];
    const useHoldings = acct.valueSource === 'holdings' || acct.valueSource === 'broker';
    let gross;
    let equityGross;
    if (useHoldings) {
      gross = 0;
      equityGross = 0;
      for (const h of accountHoldings) {
        const v = holdingValue(h);
        gross += v;
        const instrument = h.instrument || 'equity';
        // Stocks and ETFs move fully with equity markets; fund holdings use the
        // account's equity percentage; bonds are treated as non-equity.
        let equityShare = 0;
        if (instrument === 'mutual_fund') equityShare = (acct.equityPct ?? 100) / 100;
        else if (EQUITY_INSTRUMENTS.has(instrument)) equityShare = 1;
        equityGross += v * equityShare;
        positions.push({
          accountId: acct.id,
          symbol: h.symbol,
          exchange: h.exchange || 'NSE',
          name: h.name || h.symbol,
          sector: h.sector || 'Unclassified',
          instrument,
          diversified: DIVERSIFIED_INSTRUMENTS.has(instrument),
          value: v * w,
          equityValue: v * equityShare * w,
        });
      }
    } else {
      gross = acct.value || 0;
      equityGross = gross * ((acct.equityPct || 0) / 100);
      if (equityGross > 0) {
        positions.push({
          accountId: acct.id,
          symbol: null,
          name: acct.name,
          sector: acct.kind === 'mutual_fund' ? 'Diversified fund' : 'Unclassified',
          instrument: acct.kind === 'mutual_fund' ? 'mutual_fund' : 'other',
          diversified: acct.kind === 'mutual_fund' || acct.kind === 'retirement',
          value: equityGross * w,
          equityValue: equityGross * w,
        });
      }
    }
    const value = gross * w;
    assets.total += value;
    assets.equityExposure += equityGross * w;
    assets.byKind[acct.kind] = (assets.byKind[acct.kind] || 0) + value;
    if (acct.liquidity === 'liquid') assets.liquid += value;
    else if (acct.liquidity === 'semi_liquid') assets.semiLiquid += value;
    else assets.illiquid += value;
    accountRows.push({ id: acct.id, name: acct.name, kind: acct.kind, liquidity: acct.liquidity, weight: w, value: round2(value) });
  }

  const liabilities = { total: 0, monthlyEmi: 0, floatingEmi: 0, byKind: {} };
  const liabilityRows = [];
  for (const l of data.liabilities || []) {
    const w = ownershipWeight(l.owners, scope, members);
    if (w === 0) continue;
    const outstanding = (l.outstanding || 0) * w;
    const emi = (l.emiMonthly || 0) * w;
    liabilities.total += outstanding;
    liabilities.monthlyEmi += emi;
    if (l.rateType === 'floating') liabilities.floatingEmi += emi;
    liabilities.byKind[l.kind] = (liabilities.byKind[l.kind] || 0) + outstanding;
    liabilityRows.push({ id: l.id, name: l.name, kind: l.kind, weight: w, outstanding: round2(outstanding), emi: round2(emi), rateType: l.rateType });
  }

  const cashflow = { monthlyIncome: 0, essentialExpenses: 0, discretionaryExpenses: 0, incomeByUser: {} };
  for (const c of data.cashflows || []) {
    if (asOf && c.startsOn && c.startsOn > asOf) continue;
    if (asOf && c.endsOn && c.endsOn < asOf) continue;
    const w = ownershipWeight(c.owners, scope, members);
    if (w === 0) continue;
    const m = monthlyAmount(c) * w;
    if (c.direction === 'income') {
      cashflow.monthlyIncome += m;
      // Attribute income to owners so "member X loses job" scenarios can target it.
      for (const o of c.owners) {
        if (scope.type === 'individual' ? o.userId === scope.userId : members.has(o.userId)) {
          cashflow.incomeByUser[o.userId] = (cashflow.incomeByUser[o.userId] || 0) + monthlyAmount(c) * (o.sharePct / 100);
        }
      }
    } else if (c.essential) cashflow.essentialExpenses += m;
    else cashflow.discretionaryExpenses += m;
  }

  return finalisePosition({ assets, liabilities, cashflow, positions, accountRows, liabilityRows });
}

/** Derives totals and ratios from a raw position. Also used after stress shocks. */
function finalisePosition({ assets, liabilities, cashflow, positions, accountRows = [], liabilityRows = [] }) {
  const monthlyExpenses = cashflow.essentialExpenses + cashflow.discretionaryExpenses;
  const monthlyOutflows = monthlyExpenses + liabilities.monthlyEmi;
  const essentialOutflows = cashflow.essentialExpenses + liabilities.monthlyEmi;
  const monthlySavings = cashflow.monthlyIncome - monthlyOutflows;
  const netBurn = Math.max(0, -monthlySavings);
  const r = (v) => round2(v);
  const byKind = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));

  return {
    assets: {
      total: r(assets.total), liquid: r(assets.liquid), semiLiquid: r(assets.semiLiquid),
      illiquid: r(assets.illiquid), equityExposure: r(assets.equityExposure), byKind: byKind(assets.byKind),
    },
    liabilities: {
      total: r(liabilities.total), monthlyEmi: r(liabilities.monthlyEmi),
      floatingEmi: r(liabilities.floatingEmi || 0), byKind: byKind(liabilities.byKind),
    },
    netWorth: r(assets.total - liabilities.total),
    cashflow: {
      monthlyIncome: r(cashflow.monthlyIncome),
      essentialExpenses: r(cashflow.essentialExpenses),
      discretionaryExpenses: r(cashflow.discretionaryExpenses),
      monthlyExpenses: r(monthlyExpenses),
      monthlyEmi: r(liabilities.monthlyEmi),
      monthlyOutflows: r(monthlyOutflows),
      essentialOutflows: r(essentialOutflows),
      monthlySavings: r(monthlySavings),
      savingsRatePct: cashflow.monthlyIncome > 0 ? r((monthlySavings / cashflow.monthlyIncome) * 100) : null,
      netBurn: r(netBurn),
      incomeByUser: byKind(cashflow.incomeByUser || {}),
    },
    runway: computeRunway(assets.liquid, assets.semiLiquid, monthlyOutflows, essentialOutflows, netBurn),
    positions: positions.map((p) => ({ ...p, value: r(p.value), equityValue: r(p.equityValue) })),
    accounts: accountRows,
    liabilityItems: liabilityRows,
  };
}

/**
 * Runway definitions (months):
 *  - currentBurn: liquid assets / net monthly burn. null when income covers outflows (no burn).
 *  - ifIncomeStops: liquid assets / all monthly outflows.
 *  - ifIncomeStopsEssentialOnly: liquid assets / (essential expenses + EMIs).
 *  - withSemiLiquid: (liquid + semi-liquid) / all outflows, if income stops and FDs/investments are drawn.
 * Infinite values are returned as null with an explanatory state.
 */
function computeRunway(liquid, semiLiquid, outflows, essentialOutflows, netBurn) {
  const div = (a, b) => (b > 0 ? round2(a / b) : null);
  return {
    state: netBurn > 0 ? 'burning' : 'self_sustaining',
    currentBurnMonths: netBurn > 0 ? round2(liquid / netBurn) : null,
    ifIncomeStopsMonths: div(liquid, outflows),
    ifIncomeStopsEssentialOnlyMonths: div(liquid, essentialOutflows),
    withSemiLiquidMonths: div(liquid + semiLiquid, outflows),
  };
}

module.exports = { consolidate, finalisePosition, ownershipWeight, validateOwners, monthlyAmount, holdingValue, computeRunway, FREQUENCY_TO_MONTHLY };
