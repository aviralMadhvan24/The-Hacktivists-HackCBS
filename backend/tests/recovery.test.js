const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDeterministicPlans } = require('../services/recoveryService');

test('Recovery Planner: Calculates deterministic plans and runway extensions', () => {
  const result = calculateDeterministicPlans({
    currentCash: 80000,
    monthlyIncome: 10000,
    monthlyExpenses: 20000,
    monthlyDebtPayments: 0,
    emergencyExpense: 50000,
    incomeLossDurationMonths: 0,
    portfolioValue: 500000,
    simulatedPortfolioLoss: 75000
  });

  assert.equal(result.baseline.immediatePostShockCash, 30000);
  assert.equal(result.baseline.baselineNetBurn, 10000);
  assert.equal(result.baseline.baselineRunwayMonths, 3.0); // 30,000 / 10,000 = 3.0

  assert.equal(result.plans.length, 3);
  const [conservative, balanced, aggressive] = result.plans;

  // Balanced plan should have higher savings than Conservative
  assert.ok(balanced.monthlyExpenseReduction > conservative.monthlyExpenseReduction);
  assert.ok(aggressive.monthlyExpenseReduction > balanced.monthlyExpenseReduction);

  // New burn should decrease
  assert.ok(balanced.newNetBurn < conservative.newNetBurn);
  assert.ok(aggressive.newNetBurn < balanced.newNetBurn);

  // Runway should increase
  assert.ok(balanced.newRunwayMonths > conservative.newRunwayMonths);
  assert.ok(aggressive.newRunwayMonths > balanced.newRunwayMonths);
});

test('Recovery Planner: Handles zero cash and edge cases gracefully without NaN', () => {
  const result = calculateDeterministicPlans({
    currentCash: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyDebtPayments: 0,
    emergencyExpense: 0
  });

  assert.equal(result.baseline.immediatePostShockCash, 0);
  assert.equal(result.baseline.baselineNetBurn, 0);
  assert.equal(Number.isNaN(result.baseline.baselineRunwayMonths), false);
  assert.equal(result.plans.length, 3);
});
