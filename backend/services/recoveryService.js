const { randomUUID } = require('crypto');

/**
 * Deterministic Financial Calculations for Recovery Plans.
 */
function calculateDeterministicPlans({
  currentCash,
  monthlyIncome,
  monthlyExpenses,
  monthlyDebtPayments = 0,
  emergencyExpense = 0,
  incomeLossDurationMonths = 0,
  portfolioValue = 0,
  simulatedPortfolioLoss = 0
}) {
  const cash = Math.max(0, currentCash);
  const income = Math.max(0, monthlyIncome);
  const baseExpenses = Math.max(0, monthlyExpenses);
  const debt = Math.max(0, monthlyDebtPayments);
  const totalOutflows = baseExpenses + debt;
  const emergency = Math.max(0, emergencyExpense);
  const incomeMonths = Math.max(0, incomeLossDurationMonths);

  // Shock impact on cash
  const incomeLostTotal = income * incomeMonths;
  const immediatePostShockCash = Math.max(0, cash - emergency);

  // Baseline Burn
  const baselineNetBurn = Math.max(0, totalOutflows - income);
  const baselineRunway = baselineNetBurn > 0 ? immediatePostShockCash / baselineNetBurn : 99.0;

  // Assume discretionary expenses are ~40% of base expenses
  const estimatedDiscretionary = baseExpenses * 0.40;

  // Plan 1: Conservative (15% discretionary cut)
  const consCut = estimatedDiscretionary * 0.15;
  const consOutflows = totalOutflows - consCut;
  const consBurn = Math.max(0, consOutflows - income);
  const consRunway = consBurn > 0 ? immediatePostShockCash / consBurn : 99.0;
  const consMonthlySavings = consCut;
  const consTargetCash = consOutflows * 3;
  const consRebuildMonths = consMonthlySavings > 0 ? Math.ceil(emergency / consMonthlySavings) : 12;

  // Plan 2: Balanced (30% discretionary cut + optional debt relief)
  const balCut = estimatedDiscretionary * 0.30;
  const balOutflows = totalOutflows - balCut;
  const balBurn = Math.max(0, balOutflows - income);
  const balRunway = balBurn > 0 ? immediatePostShockCash / balBurn : 99.0;
  const balMonthlySavings = balCut;
  const balRebuildMonths = balMonthlySavings > 0 ? Math.ceil(emergency / balMonthlySavings) : 8;

  // Plan 3: Aggressive (50% discretionary cut + strict freeze)
  const aggCut = estimatedDiscretionary * 0.50;
  const aggOutflows = totalOutflows - aggCut;
  const aggBurn = Math.max(0, aggOutflows - income);
  const aggRunway = aggBurn > 0 ? immediatePostShockCash / aggBurn : 99.0;
  const aggMonthlySavings = aggCut;
  const aggRebuildMonths = aggMonthlySavings > 0 ? Math.ceil(emergency / aggMonthlySavings) : 5;

  return {
    baseline: {
      initialCash: cash,
      emergencyExpense: emergency,
      immediatePostShockCash,
      totalMonthlyOutflows: totalOutflows,
      monthlyIncome: income,
      baselineNetBurn,
      baselineRunwayMonths: parseFloat(baselineRunway.toFixed(1)),
      portfolioValue,
      simulatedPortfolioLoss
    },
    plans: [
      {
        id: 'plan-conservative',
        tier: 'Conservative',
        title: 'Mild Expense Optimization',
        description: 'Trims non-essential discretionary subscriptions and minor lifestyle expenditures by 15%.',
        monthlyExpenseReduction: Math.round(consMonthlySavings),
        newMonthlyOutflow: Math.round(consOutflows),
        newNetBurn: Math.round(consBurn),
        newRunwayMonths: parseFloat(consRunway.toFixed(1)),
        runwayExtensionMonths: parseFloat(Math.max(0, consRunway - baselineRunway).toFixed(1)),
        monthsToRebuildEmergencyFund: consRebuildMonths,
        tradeOffs: 'Low lifestyle disruption, but takes longer to restore safety reserves.',
        actionSteps: [
          'Audit recurring digital subscriptions, gym memberships, and streaming packages.',
          'Cap dining out and entertainment at 85% of standard budget.',
          'Redirect savings of ₹' + Math.round(consMonthlySavings) + '/mo directly to liquid emergency cash.'
        ]
      },
      {
        id: 'plan-balanced',
        tier: 'Balanced',
        title: 'Disciplined Budget Rebalance',
        description: 'Moderate 30% reduction across all discretionary spending plus renegotiating utility and recurring bills.',
        monthlyExpenseReduction: Math.round(balMonthlySavings),
        newMonthlyOutflow: Math.round(balOutflows),
        newNetBurn: Math.round(balBurn),
        newRunwayMonths: parseFloat(balRunway.toFixed(1)),
        runwayExtensionMonths: parseFloat(Math.max(0, balRunway - baselineRunway).toFixed(1)),
        monthsToRebuildEmergencyFund: balRebuildMonths,
        tradeOffs: 'Noticeable reduction in optional spending, but recovers cash runway significantly faster.',
        actionSteps: [
          'Freeze major luxury, electronics, and vacation purchases for 90 days.',
          'Consolidate insurance premium payments or explore lower deductible policies.',
          'Target savings of ₹' + Math.round(balMonthlySavings) + '/mo to replenish emergency buffer in ~' + balRebuildMonths + ' months.'
        ]
      },
      {
        id: 'plan-aggressive',
        tier: 'Aggressive',
        title: 'Emergency Austerity & Protection',
        description: 'Deep 50% cut to all non-essential outflows to immediately stop cash bleed and prevent forced asset liquidation.',
        monthlyExpenseReduction: Math.round(aggMonthlySavings),
        newMonthlyOutflow: Math.round(aggOutflows),
        newNetBurn: Math.round(aggBurn),
        newRunwayMonths: parseFloat(aggRunway.toFixed(1)),
        runwayExtensionMonths: parseFloat(Math.max(0, aggRunway - baselineRunway).toFixed(1)),
        monthsToRebuildEmergencyFund: aggRebuildMonths,
        tradeOffs: 'High discipline required. Minimizes reliance on selling depressed stock holdings.',
        actionSteps: [
          'Strictly restrict outflows to rent, groceries, essential utilities, and debt obligations.',
          debt > 0 ? 'Inquire with lender about temporary EMI restructuring or tenure extension.' : 'Eliminate all discretionary purchases.',
          'Rebuild liquid reserves by ₹' + Math.round(aggMonthlySavings) + '/mo to achieve full stability in ~' + aggRebuildMonths + ' months.'
        ]
      }
    ]
  };
}

/**
 * Enhances deterministic plans with AI narrative if an LLM is configured.
 */
async function generateRecoveryNarrative(plansData, userGoals) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    // Return rule-based deterministic response without LLM
    return {
      aiGenerated: false,
      aiProvider: 'Rule-Based Deterministic Engine',
      summary: `Based on your monthly cash flow and shock simulations, your baseline runway is ${plansData.baseline.baselineRunwayMonths} months. Adopting the Balanced Plan extends your survival runway by +${plansData.plans[1].runwayExtensionMonths} months without needing to sell portfolio holdings.`,
      plans: plansData.plans
    };
  }

  const prompt = `You are an expert financial risk advisor for FinSight.
Review the following deterministic financial recovery plans calculated for a user:
Baseline Cash: ₹${plansData.baseline.initialCash}
Emergency Expense: ₹${plansData.baseline.emergencyExpense}
Monthly Outflows: ₹${plansData.baseline.totalMonthlyOutflows}
Monthly Income: ₹${plansData.baseline.monthlyIncome}
Baseline Runway: ${plansData.baseline.baselineRunwayMonths} months
User Goal: ${userGoals || 'Prevent forced stock sales and rebuild emergency buffer'}

PLANS:
1. Conservative: Saves ₹${plansData.plans[0].monthlyExpenseReduction}/mo, Runway: ${plansData.plans[0].newRunwayMonths} mos
2. Balanced: Saves ₹${plansData.plans[1].monthlyExpenseReduction}/mo, Runway: ${plansData.plans[1].newRunwayMonths} mos
3. Aggressive: Saves ₹${plansData.plans[2].monthlyExpenseReduction}/mo, Runway: ${plansData.plans[2].newRunwayMonths} mos

RULES:
- Do NOT alter any calculated numbers.
- Provide a concise 2-sentence executive guidance explaining the trade-offs.
- Do NOT promise investment returns or give stock buy/sell advice.
- Respond in JSON: { "executiveSummary": "...", "recommendedTier": "Balanced", "riskAdvisory": "..." }`;

  try {
    let rawContent = '';
    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });
      if (res.ok) {
        const d = await res.json();
        rawContent = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } else if (openaiKey) {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const d = await res.json();
        rawContent = d.choices?.[0]?.message?.content || '';
      }
    }

    if (rawContent) {
      const parsed = JSON.parse(rawContent);
      return {
        aiGenerated: true,
        aiProvider: geminiKey ? 'Google Gemini' : 'OpenAI',
        summary: parsed.executiveSummary || 'Balanced recovery plan provides the optimal risk-to-discipline trade-off.',
        recommendedTier: parsed.recommendedTier || 'Balanced',
        riskAdvisory: parsed.riskAdvisory || 'Ensure critical debt EMI obligations are maintained to avoid credit score penalties.',
        plans: plansData.plans
      };
    }
  } catch (err) {
    console.warn('AI narrative generation failed, falling back to rule-based:', err.message);
  }

  return {
    aiGenerated: false,
    aiProvider: 'Rule-Based Deterministic Engine',
    summary: `Your baseline runway is ${plansData.baseline.baselineRunwayMonths} months under current shocks. Implementing the Balanced Plan extends runway by +${plansData.plans[1].runwayExtensionMonths} months.`,
    recommendedTier: 'Balanced',
    riskAdvisory: 'Maintain non-negotiable living expenses and debt commitments while trimming discretionary outlays.',
    plans: plansData.plans
  };
}

module.exports = {
  calculateDeterministicPlans,
  generateRecoveryNarrative
};
