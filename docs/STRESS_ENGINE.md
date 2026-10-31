# Stress-Testing Engine

Code: `backend/engine/stress.js`, `engine/whatif.js`, `engine/recovery.js` · Tests: `backend/tests/engine.test.js`

## Shock types (combine any number)

| Type | Parameters | Effect |
|---|---|---|
| `market` | `declinePct` | All equity exposure falls by this % at t = 0 |
| `stock` | `symbol`, `declinePct` | That stock falls, compounded with any market fall: value × (1 − m) × (1 − s) |
| `sector` | `sector`, `declinePct` | All stocks in the sector fall, compounded |
| `one_time_expense` | `amount`, `month` (0 = now) | Cash outflow in that month |
| `recurring_expense` | `monthlyAmount`, `months`, `startMonth` | e.g. ₹30,000/month medical care for 6 months |
| `income_change` | `changePct` (−100 = job loss), `months`, `startMonth`, optional `userId` | Household income, or one member's income only |
| `expense_change` | `changePct`, `months`, `startMonth` | Living costs rise or fall |
| `inflation` | `annualPct` | Expenses compound monthly |
| `emi_change` | `changePct`, `floatingOnly` (default true) | Floating-rate EMIs rise |

## Projection

1. Market shocks reduce asset values immediately; losses are allocated to the liquidity bucket of the account holding the position.
2. Month by month over the horizon (default 24, extended to cover the shock plus 6 months, max 120): `cash += income − expenses − EMIs − scenario costs`.
3. If cash goes negative and forced selling is allowed, semi-liquid assets (FDs, funds, stocks at post-shock value) are drawn down. Otherwise the shortfall is shown.
4. **Investments earn nothing during the projection.** This is deliberately conservative and stated in every result.

## Outputs

Before/after net worth, liquid cash, monthly burn, EMI/income, emergency cover and five-pillar score; portfolio loss; cash runway (months until liquid cash runs out, fractional); total runway (including semi-liquid assets); forced sales and the month they start; shortfall; hardest-hit holdings; the month-by-month series; a verdict (ok / warning / severe / critical).

**Recovery**: months to rebuild liquid cash at the normal savings rate, after the shock period; months for the portfolio to recover the loss at an *assumed* annual equity return (default 10%, user-editable, labelled as an assumption).

## Reverse stress testing

Finds the smallest shock that breaks a chosen condition, by bisection:

- Variables: market decline (%), one-time expense (₹), months without income, extra monthly expense (₹, 12 months).
- Conditions: liquid cash below a floor; forced selling needed; runway under N months; score below N; net worth down more than N%.

It first checks the extremes (already breached with no shock, or never breached in range) and reports those explicitly.

## What-if decisions

`whatif.js` applies a decision (buy/sell stock, purchase, loan, new recurring cost) to the position and returns before/after values, score and pillar deltas, diversification before/after, and how both positions fare in a 30% crash. Used by proposals and the investment agent.

## Recovery plans

`recovery.js` builds conservative / balanced / aggressive plans (15% / 30% / 60% cuts to *recorded discretionary* spending), with runway and months to rebuild a 6-month emergency fund. The previous version assumed discretionary spending was 40% of expenses; it now uses the family's own essential/discretionary split.

## Verified examples (tests)

Same family as `RESILIENCE_SCORE.md`. Market −20% + ₹1L medical + all income lost for 6 months:

- Portfolio loss ₹80,000 (20% of ₹4L equity); immediate net-worth change −₹1,80,000
- Cash: ₹3,00,000 after the bill; burns ₹1,07,000/month → cash runway 2.8 months
- Forced sales ₹3,42,000 starting month 3; never fully runs out (FDs/investments cover it)
- After income returns, +₹73,000/month → cash ₹13,14,000 at month 24
- Cash rebuild 6 months; portfolio recovery 29 months at an assumed 10%/year
- Score after shock 38.2 (critical)

Reverse tests: a 61.25% crash cuts net worth by 10%; a bill over ₹3,00,000 takes cash under ₹1L; 4 months without income forces investment sales.
