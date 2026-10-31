// Company fundamentals from Yahoo Finance quoteSummary (unofficial; needs a
// session cookie + crumb). Returned figures are labelled with their source and
// retrieval time. Failures return null fields, never invented values.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const MODULES = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistory,price';
const TTL_MS = 12 * 3600 * 1000;

let session = null; // { cookie, crumb, at }
const cache = new Map();

async function newSession() {
  const c = await fetch('https://fc.yahoo.com', { headers: UA, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const cookie = (c.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Yahoo did not issue a session cookie.');
  const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...UA, Cookie: cookie }, signal: AbortSignal.timeout(10000) });
  const crumb = await r.text();
  if (!r.ok || !crumb || crumb.length > 40) throw new Error(`Could not obtain Yahoo crumb (HTTP ${r.status}).`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}

const raw = (v) => (v && typeof v === 'object' && 'raw' in v ? v.raw : typeof v === 'number' ? v : null);
const pct = (v) => (raw(v) === null ? null : Math.round(raw(v) * 10000) / 100);

async function getFundamentals(symbol, exchange = 'NSE') {
  const sym = `${String(symbol).toUpperCase().replace(/\.(NS|BO)$/, '')}${exchange === 'BSE' ? '.BO' : '.NS'}`;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  let json;
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = session && Date.now() - session.at < 3600000 ? session : await newSession();
    const res = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`,
      { headers: { ...UA, Cookie: s.cookie }, signal: AbortSignal.timeout(12000) });
    if (res.status === 401 || res.status === 403) { session = null; continue; }
    if (res.status === 404) throw new Error(`No fundamentals for ${sym}.`);
    if (!res.ok) throw new Error(`Yahoo quoteSummary HTTP ${res.status}`);
    json = await res.json();
    break;
  }
  const q = json?.quoteSummary?.result?.[0];
  if (!q) throw new Error(`No fundamentals for ${sym}.`);
  const fd = q.financialData || {}; const sd = q.summaryDetail || {}; const ks = q.defaultKeyStatistics || {}; const ap = q.assetProfile || {};
  const income = (q.incomeStatementHistory?.incomeStatementHistory || []).map((y) => ({
    fiscalYearEnd: y.endDate?.fmt || null, revenue: raw(y.totalRevenue), netIncome: raw(y.netIncome), operatingIncome: raw(y.operatingIncome),
  }));
  const data = {
    symbol: sym, name: q.price?.longName || q.price?.shortName || null,
    sector: ap.sector || null, industry: ap.industry || null, employees: ap.fullTimeEmployees ?? null,
    businessSummary: ap.longBusinessSummary ? ap.longBusinessSummary.slice(0, 1500) : null, website: ap.website || null,
    marketCap: raw(sd.marketCap) ?? raw(q.price?.marketCap), currency: sd.currency || 'INR',
    valuation: { trailingPE: raw(sd.trailingPE), forwardPE: raw(sd.forwardPE), priceToBook: raw(ks.priceToBook), dividendYieldPct: pct(sd.dividendYield) },
    profitability: { returnOnEquityPct: pct(fd.returnOnEquity), operatingMarginPct: pct(fd.operatingMargins), profitMarginPct: pct(fd.profitMargins) },
    growth: { revenueGrowthPct: pct(fd.revenueGrowth), earningsGrowthPct: pct(fd.earningsGrowth) },
    balanceSheet: { debtToEquity: raw(fd.debtToEquity), currentRatio: raw(fd.currentRatio), totalCash: raw(fd.totalCash), totalDebt: raw(fd.totalDebt) },
    incomeHistory: income,
    analystView: fd.recommendationKey ? { recommendation: fd.recommendationKey, analysts: raw(fd.numberOfAnalystOpinions), targetMean: raw(fd.targetMeanPrice) } : null,
    source: 'Yahoo Finance quoteSummary (unofficial)',
    retrievedAt: new Date().toISOString(),
  };
  cache.set(sym, { data, at: Date.now() });
  return data;
}

module.exports = { getFundamentals };
