# Five-Pillar Financial Resilience Score

Code: `backend/engine/resilience.js` · Tests: `backend/tests/engine.test.js` · Engine version `resilience-1.0.0`

The score (0–100) is deterministic: the same records always give the same score, and every point traces to a metric. No AI is involved. Each pillar is a continuous, piecewise-linear function, so small changes in inputs move the score smoothly.

| Pillar | Max | Metric | Scoring |
|---|---:|---|---|
| Emergency Cash Coverage | 30 | months = liquid assets ÷ (essential expenses + EMIs) | `min(30, 5 × months)` — full marks at 6 months |
| Cash Flow & Burn | 25 | savings rate s = (income − outflows) ÷ income | surplus: `15 + 10 × min(1, s ÷ 20%)`; deficit: `15 × (1 − burn ÷ outflows)` |
| Debt & EMI Burden | 15 | EMI ÷ income (FOIR-style) | 0% → 15, 20% → 12, 40% → 6, ≥60% → 0, linear between; EMIs with no income → 0 |
| Portfolio Diversification | 15 | largest single stock weight; largest sector weight (of equity) | stock: ≤10% → 8, ≥50% → 0; sector: ≤25% → 7, ≥70% → 0. Funds/ETFs count as already diversified. No market investments → 15 (no concentration risk) |
| Market Shock Absorption | 15 | drawdown = equity exposure × 30% ÷ net worth | `15 × clamp(1 − drawdown ÷ 30%, 0, 1)`; net worth ≤ 0 → 0 |

Bands: **strong** ≥ 85 · **healthy** 70–84.9 · **fragile** 40–69.9 · **critical** < 40.

## Definitions

- **Liquid assets**: accounts marked *liquid* (bank, savings, cash by default). FDs, funds and demat accounts are *semi-liquid* by default; property and retirement funds *illiquid*. Users can override per account.
- **Essential outflows**: expenses marked essential + all EMIs. Discretionary expenses are excluded from Pillar 1 because a family can cut them in an emergency.
- **Equity exposure**: stock/ETF holdings at full value; mutual-fund holdings and manually-valued accounts at their `equity_pct`.
- **Pillar 5 uses a fixed 30% reference shock** so the everyday score doesn't change with whatever scenario was last explored. Stress tests re-score the *stressed* position with the same formula.
- Recurring amounts are normalised to monthly (quarterly ÷ 3, half-yearly ÷ 6, yearly ÷ 12). Cash flows outside their start/end dates are ignored.

## Ownership and privacy

The score is computed on a *scope*:

- **Family**: every record visible to the viewer, counted at the sum of shares held by active family members. A flat co-owned 50/50 with a brother outside the family counts at 50%.
- **Individual**: records weighted by that member's share.

Individual views always add up to the family view, so joint records are never double counted (tested). Other members' private records are never included in anyone's view.

## Explanations and history

Each pillar returns its metrics, formula, a plain-English explanation and actions with the points they would add. A snapshot is stored when the score moves (or daily), and the dashboard explains the change against the most recent different snapshot, pillar by pillar.

## Changes from the original iOS engine

| iOS behaviour | Now |
|---|---|
| Pillar 5 maxed at 14 and depended only on the shock slider | 15 points, measured on the family's net worth |
| Diversification assumed a 35% top holding when none existed | No holdings → no concentration risk, flagged in notes |
| Sample "pitch deck" holdings used when the user had none | Never; only real records |
| Step-function pillars (jumps at thresholds) | Continuous piecewise-linear |
| Coverage measured against total expenses | Against essential expenses + EMIs |

## Worked example (from the test suite)

Family of A and B. Joint savings ₹4,00,000 (50/50); A's FD ₹2,00,000; B's demat (RELIANCE ₹1L energy, TCS ₹1L IT, INFY ₹1L IT); a flat worth ₹60L owned 50% by A and 50% by a relative outside the family; A's equity MF ₹1,00,000. Home loan ₹30L, EMI ₹30,000, floating, 50% A / 50% outsider. B's credit card ₹50,000. Salaries ₹1,20,000 + ₹60,000. Household ₹70,000 (essential), lifestyle ₹20,000 (discretionary), insurance ₹24,000/year (essential).

| Item | Family value |
|---|---|
| Assets | 4L + 2L + 3L + 30L (50% of flat) + 1L = **₹40,00,000** |
| Liabilities | 15L (50% of loan) + 0.5L = **₹15,50,000** |
| Net worth | **₹24,50,000** |
| Monthly outflows | 70,000 + 2,000 + 20,000 + 15,000 EMI = **₹1,07,000** |
| Essential outflows | 72,000 + 15,000 = **₹87,000** |
| Savings | 1,80,000 − 1,07,000 = **₹73,000 (40.6%)** |

| Pillar | Calculation | Points |
|---|---|---:|
| Emergency | 4,00,000 ÷ 87,000 = 4.60 months × 5 | 23.0 |
| Cash flow | savings rate 40.6% ≥ 20% | 25.0 |
| Debt | 15,000 ÷ 1,80,000 = 8.3% → 15 − 1.25 | 13.75 |
| Diversification | top stock 25% → 5.0; top sector IT 50% → 3.1 | 8.1 |
| Shock | 4,00,000 × 30% ÷ 24,50,000 = 4.9% → 15 × (1 − 0.163) | 12.6 |
| **Total** | | **82.4 (healthy)** |

Individual views: A ₹20,00,000 + B ₹4,50,000 = family ₹24,50,000.
