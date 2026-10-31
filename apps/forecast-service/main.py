"""FinSight forecast service.

Wraps Amazon Chronos-Bolt (amazon/chronos-bolt-small, Apache-2.0), a pretrained
time-series foundation model, behind a small HTTP API. It is stateless: the
Node backend sends the price series and gets quantile forecasts back.

Endpoints
  GET  /health    model id, device, load state
  POST /forecast  {"values": [...], "horizon": 20, "quantiles": [0.1, 0.5, 0.9]}
  POST /backtest  {"values": [...], "horizon": 20, "origins": 12}
                  rolling-origin evaluation against a naive last-value baseline

Forecasts are made on log prices (multiplicative behaviour of stock prices) and
converted back. They are statistical extrapolations, not predictions of events.
"""
from __future__ import annotations

import math
import os
import time
from typing import List

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from chronos import BaseChronosPipeline

MODEL_ID = os.environ.get("FORECAST_MODEL", "amazon/chronos-bolt-small")
MAX_CONTEXT = 2048
torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))

app = FastAPI(title="FinSight forecast service", version="1.0.0")
_pipeline = None
_loaded_at = None


def pipeline():
    global _pipeline, _loaded_at
    if _pipeline is None:
        _pipeline = BaseChronosPipeline.from_pretrained(MODEL_ID, device_map="cpu", torch_dtype=torch.float32)
        _loaded_at = time.time()
    return _pipeline


class ForecastRequest(BaseModel):
    values: List[float] = Field(..., min_length=60, max_length=10000)
    horizon: int = Field(20, ge=1, le=64)
    quantiles: List[float] = Field(default_factory=lambda: [0.1, 0.25, 0.5, 0.75, 0.9])


class BacktestRequest(BaseModel):
    values: List[float] = Field(..., min_length=200, max_length=10000)
    horizon: int = Field(20, ge=1, le=64)
    origins: int = Field(12, ge=3, le=40)


def _check(values: List[float]) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64)
    if not np.all(np.isfinite(arr)) or np.any(arr <= 0):
        raise HTTPException(status_code=422, detail="Values must be positive, finite prices.")
    return arr


def _predict(log_context: np.ndarray, horizon: int, quantiles: List[float]):
    ctx = torch.tensor(log_context[-MAX_CONTEXT:], dtype=torch.float32)
    q, mean = pipeline().predict_quantiles(ctx, prediction_length=horizon, quantile_levels=quantiles)
    # q: [batch=1, horizon, n_quantiles]
    return q[0].numpy(), mean[0].numpy()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "license": "Apache-2.0",
        "device": "cpu",
        "loaded": _pipeline is not None,
        "loadedAt": _loaded_at,
        "torch": torch.__version__,
    }


@app.post("/forecast")
def forecast(req: ForecastRequest):
    arr = _check(req.values)
    qs = sorted(set(round(q, 4) for q in req.quantiles if 0 < q < 1))
    if 0.5 not in qs:
        qs.append(0.5)
        qs.sort()
    started = time.time()
    q, mean = _predict(np.log(arr), req.horizon, qs)
    out = {f"p{int(round(level * 100))}": [float(math.exp(v)) for v in q[:, i]] for i, level in enumerate(qs)}
    return {
        "model": MODEL_ID,
        "horizon": req.horizon,
        "contextLength": int(min(len(arr), MAX_CONTEXT)),
        "quantiles": out,
        "lastValue": float(arr[-1]),
        "elapsedMs": int((time.time() - started) * 1000),
    }


@app.post("/backtest")
def backtest(req: BacktestRequest):
    """Rolling-origin backtest: forecast from N past origins and score against what happened."""
    arr = _check(req.values)
    logs = np.log(arr)
    h = req.horizon
    last_origin = len(arr) - h
    step = max(h, (last_origin - 120) // req.origins)
    origins = [last_origin - k * step for k in range(req.origins) if last_origin - k * step >= 120]
    if len(origins) < 3:
        raise HTTPException(status_code=422, detail="Not enough history for a backtest at this horizon.")
    rows = []
    for o in sorted(origins):
        q, _ = _predict(logs[:o], h, [0.1, 0.5, 0.9])
        actual = arr[o + h - 1]
        start = arr[o - 1]
        p10, p50, p90 = (math.exp(q[h - 1, 0]), math.exp(q[h - 1, 1]), math.exp(q[h - 1, 2]))
        rows.append({
            "originIndex": int(o), "start": float(start), "actual": float(actual),
            "p10": p10, "p50": p50, "p90": p90,
            "modelAbsPctError": abs(p50 - actual) / actual * 100,
            "naiveAbsPctError": abs(start - actual) / actual * 100,
            "inside80": bool(p10 <= actual <= p90),
            "directionCorrect": bool((p50 - start) * (actual - start) > 0),
        })
    n = len(rows)
    model_mape = sum(r["modelAbsPctError"] for r in rows) / n
    naive_mape = sum(r["naiveAbsPctError"] for r in rows) / n
    return {
        "model": MODEL_ID,
        "horizon": h,
        "origins": n,
        "modelMAPE": round(model_mape, 3),
        "naiveMAPE": round(naive_mape, 3),
        "skillVsNaivePct": round((1 - model_mape / naive_mape) * 100, 2) if naive_mape > 0 else None,
        "coverage80Pct": round(sum(r["inside80"] for r in rows) / n * 100, 1),
        "directionHitRatePct": round(sum(r["directionCorrect"] for r in rows) / n * 100, 1),
        "rows": rows,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
