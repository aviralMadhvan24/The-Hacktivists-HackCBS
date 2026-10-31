# Stock Forecasting — Model Verification Report

_Verified 2026-10-31. Raw results: `docs/evidence/forecast-backtest.json`._

## Model

| Check | Result |
|---|---|
| Model | **Chronos-Bolt Small** (`amazon/chronos-bolt-small`), a pretrained time-series foundation model, ~48M parameters |
| Repository | https://github.com/amazon-science/chronos-forecasting — exists, not archived, ~6.2k stars, last push 2026-10-05 |
| Licence | Apache-2.0 (code and weights) |
| Weights | Real `model.safetensors` on Hugging Face (https://huggingface.co/amazon/chronos-bolt-small), ~6.6M downloads; downloaded and loaded locally |
| Package | `chronos-forecasting==2.3.2` (PyPI), Python ≥3.10; deps torch 2.x, transformers, accelerate, einops, pandas |
| Runtime | CPU only (torch 2.15.0+cpu). First load ~75 s incl. download; inference ~tens of ms per series |
| API used | `BaseChronosPipeline.from_pretrained(...).predict_quantiles(inputs, prediction_length, quantile_levels)` — signature inspected in the installed package |
| Indian equities | Model is domain-agnostic (univariate series). Input: NSE daily adjusted closes from Yahoo Finance (5 years, ~1,236 sessions), as log prices |

## Inference test

RELIANCE (NSE), last close ₹1,164.90 on 2026-10-30, 20 trading days ahead:
p10 ₹1,095 · p25 ₹1,131 · **p50 ₹1,170** · p75 ₹1,211 · p90 ₹1,251 (median +0.5%, 80% range −6.0% to +7.4%).

## Backtest

Method: rolling-origin backtest, 24 forecast origins per stock and horizon over the last 5 years. Score the median forecast at the horizon against the actual close (MAPE), and compare with the **naive** forecast "price stays at the last close". Also measure how often the actual close fell inside the 80% band, and how often the median got the direction right.

| Horizon | Model MAPE | Naive MAPE | Skill vs naive | Inside 80% band | Direction right | Stocks beating naive |
|---|---:|---:|---:|---:|---:|---:|
| 5 days | 2.57% | 2.39% | **−7.9%** | 75.5% | 45.8% | 1 / 8 |
| 20 days | 4.65% | 4.47% | **−4.9%** | 82.8% | 52.1% | 2 / 8 |
| 60 days | 8.42% | 7.59% | **−10.3%** | 77.1% | 55.6% | 2 / 8 |

Stocks: RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, ITC, LT, BHARTIARTL.

## Conclusion

- **The median forecast does not beat a naive "no change" forecast** on these large-cap Indian stocks, and direction accuracy is roughly a coin flip. This matches the long-standing finding that short-horizon large-cap prices are close to a random walk. No model should be presented as predicting them.
- **The uncertainty bands are reasonably calibrated** (75–83% coverage for a nominal 80% band). That is the useful output: a data-driven range of plausible prices for planning and stress testing.

How the product uses it:

1. The forecast page leads with the **range**, and shows each stock's own backtest (accuracy vs naive, band coverage, direction rate) beside every forecast, with an explicit message when the model did not beat the naive guess.
2. The median is drawn as a dashed line, never labelled a target.
3. Forecasts are **not** used in the resilience score, stress tests or the investment agent's checks. Those use historical ranges and explicit scenarios.
4. Forecasting is a metered (premium-ready) feature and the service is optional: if it's down, everything else works.

## Alternatives considered

| Model | Why not chosen (now) |
|---|---|
| Chronos-2 (`Chronos2Pipeline`, in the same package) | Larger; multivariate covariates would need a reliable feature set we don't have yet. Worth a future comparison with the same backtest harness. |
| Google TimesFM | Viable (Apache-2.0); heavier to run on CPU. Not evaluated. |
| Salesforce Moirai | Weights licensed CC-BY-NC — not suitable for a commercial product. |
| Training our own LSTM/transformer | No evidence it would beat the naive baseline; high maintenance. |

## Running it

```bash
cd apps/forecast-service
py -3.12 -m venv .venv            # or python3.12
.venv/Scripts/pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.2,<3"
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python main.py       # serves on 127.0.0.1:8000
# backend/.env: FORECAST_SERVICE_URL=http://127.0.0.1:8000
# Re-run the evaluation: node backend/scripts/evaluate-forecast.js docs/evidence/forecast-backtest.json
```
