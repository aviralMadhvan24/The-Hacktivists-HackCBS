const express = require('express');
const { calculateDeterministicPlans, generateRecoveryNarrative } = require('../services/recoveryService');

const router = express.Router();

/**
 * POST /api/recovery/plan
 * Generates deterministic financial recovery options enhanced with AI explanations.
 */
router.post('/plan', async (req, res) => {
  try {
    const {
      currentCash = 0,
      monthlyIncome = 0,
      monthlyExpenses = 0,
      monthlyDebtPayments = 0,
      emergencyExpense = 0,
      incomeLossDurationMonths = 0,
      portfolioValue = 0,
      simulatedPortfolioLoss = 0,
      userGoals = ''
    } = req.body;

    const deterministic = calculateDeterministicPlans({
      currentCash: Number(currentCash),
      monthlyIncome: Number(monthlyIncome),
      monthlyExpenses: Number(monthlyExpenses),
      monthlyDebtPayments: Number(monthlyDebtPayments),
      emergencyExpense: Number(emergencyExpense),
      incomeLossDurationMonths: Number(incomeLossDurationMonths),
      portfolioValue: Number(portfolioValue),
      simulatedPortfolioLoss: Number(simulatedPortfolioLoss)
    });

    const narrative = await generateRecoveryNarrative(deterministic, userGoals);

    return res.status(200).json({
      success: true,
      baseline: deterministic.baseline,
      recovery: narrative
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'RECOVERY_PLAN_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
