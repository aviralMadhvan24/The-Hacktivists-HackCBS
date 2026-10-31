// Small numeric helpers shared by the financial engine.

/** Rounds to 2 decimals (paise), avoiding -0 and binary drift like 1.005 → 1.00. */
function round2(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return v;
  const r = Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function round1(v) {
  if (!Number.isFinite(v)) return v;
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Linear interpolation across sorted [x, y] breakpoints; flat beyond the ends. */
function piecewise(x, points) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** Formats rupees in the Indian grouping style, e.g. ₹12,34,567. */
function formatINR(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}₹${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;
}

module.exports = { round2, round1, clamp, piecewise, formatINR };
