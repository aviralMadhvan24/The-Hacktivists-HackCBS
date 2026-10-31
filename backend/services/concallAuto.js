// Automatic concall discovery from just a ticker.
//
// 1. The company's official website comes from its Yahoo Finance profile.
// 2. On the homepage we follow links that look like "Investor Relations".
// 3. On those pages (and one level of result / earnings / analyst sub-pages on the
//    same site) we look for transcript PDFs with the existing discovery logic.
// 4. The newest transcript (by inferred quarter and fiscal year) is returned.
// Nothing is guessed: if no transcript is found we say where we looked.
const { safeFetch } = require('../lib/safeFetch');
const discovery = require('./concallDiscovery');
const { getFundamentals } = require('./marketData/fundamentals');

const IR_RE = /(investor|shareholder|stakeholder)/i;
const SUB_RE = /(financial|result|earning|analyst|concall|con-call|conference|transcript|quarter|presentation|disclosure|reg(ulation)?[\s-]?46|announcement)/i;
const MAX_PAGES = 25;
// Higher = more likely to lead to transcripts.
function priority(hay) {
  if (/(transcript|con[\s-]?call|earnings[\s-]?call|conference[\s-]?call)/i.test(hay)) return 4;
  if (/(analyst|investor[\s-]?(meet|call|presentation)|presentation)/i.test(hay)) return 3;
  if (/(financial|result|earning|quarter)/i.test(hay)) return 2;
  return 1;
}

function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let url;
    try { url = new URL(m[1].trim().replace(/&amp;/g, '&'), base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || /\.(pdf|jpg|png|zip|xlsx?)(\?|$)/i.test(url.pathname)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ url: url.toString(), host: url.hostname, text, hay: `${text} ${decodeURIComponent(url.pathname)}` });
  }
  return out;
}

const sameSite = (a, b) => a.replace(/^www\./, '').split('.').slice(-2).join('.') === b.replace(/^www\./, '').split('.').slice(-2).join('.');
const fyNum = (t) => Number(String(t.fiscalYear || '').replace(/\D/g, '')) || 0;
const qNum = (t) => Number(String(t.quarter || '').replace(/\D/g, '')) || 0;

async function fetchHtml(url) {
  const page = await safeFetch(url, { maxBytes: 5 * 1024 * 1024, accept: 'text/html,application/xhtml+xml' });
  if (!/html/i.test(page.contentType)) return null;
  return { url: page.url, html: page.buffer.toString('utf-8') };
}

async function findLatest(ticker) {
  const symbol = String(ticker).toUpperCase().trim();
  const steps = [];
  const f = await getFundamentals(symbol).catch((err) => { throw Object.assign(new Error(`Could not look up ${symbol}: ${err.message}`), { code: 'LOOKUP_FAILED' }); });
  const website = f?.website;
  const company = f?.name || symbol;
  if (!website) return { ticker: symbol, company, found: false, steps, note: `No official website is listed for ${symbol}. Add the investor-relations page URL manually.` };
  steps.push(`Official website: ${website}`);

  const queue = []; const seen = new Set();
  const home = await fetchHtml(website).catch((err) => { steps.push(`Could not open the website: ${err.message}`); return null; });
  if (!home) return { ticker: symbol, company, website, found: false, steps, note: 'The company website could not be read automatically. Add its investor-relations page URL manually.' };
  const homeHost = new URL(home.url).hostname;
  // Investor pages, best matches first; the homepage itself is a last resort.
  const ir = links(home.html, home.url).filter((l) => IR_RE.test(l.hay) && sameSite(l.host, homeHost));
  ir.sort((a, b) => Number(/relation/i.test(b.hay)) - Number(/relation/i.test(a.hay)));
  for (const l of ir) if (!seen.has(l.url)) { seen.add(l.url); queue.push({ url: l.url, p: 5 }); }
  queue.push({ url: home.url, p: 0 });
  steps.push(ir.length ? `Investor pages found: ${ir.length}` : 'No "Investor" link on the homepage');

  let visited = 0; const found = []; let irUrl = null;
  const dated = () => found.some((t) => t.quarter && t.fiscalYear);
  while (queue.length && visited < MAX_PAGES && !dated()) {
    queue.sort((a, b) => b.p - a.p);
    const { url } = queue.shift();
    visited++;
    let page;
    try { page = await fetchHtml(url); } catch (err) { steps.push(`Skipped ${url}: ${err.message}`); continue; }
    if (!page) continue;
    const t = discovery.extractTranscriptLinks(page.html, page.url);
    // AGM or undated transcripts are kept as a fallback; keep looking for quarterly ones.
    const known = new Set(found.map((x) => x.url));
    const fresh = t.filter((x) => !known.has(x.url) && !/(^|[^a-z])agm([^a-z]|$)|annual[ _-]?general/i.test(`${x.title} ${x.url.replace(/[_0-9]+/g, " ")}`));
    if (fresh.length) { found.push(...fresh); irUrl = irUrl || page.url; if (dated()) { irUrl = page.url; break; } }
    for (const l of links(page.html, page.url)) {
      if (sameSite(l.host, homeHost) && SUB_RE.test(l.hay) && !seen.has(l.url)) { seen.add(l.url); queue.push({ url: l.url, p: priority(l.hay) }); }
    }
  }
  steps.push(`Pages checked: ${visited}`);
  if (!found.length) {
    return { ticker: symbol, company, website, found: false, steps, note: 'No transcript PDFs were found automatically (the site may load them with JavaScript). Add the investor-relations page URL manually.' };
  }
  found.sort((a, b) => Number(Boolean(b.quarter && b.fiscalYear)) - Number(Boolean(a.quarter && a.fiscalYear)) || fyNum(b) - fyNum(a) || qNum(b) - qNum(a));
  return { ticker: symbol, company, website, irUrl, found: true, steps, latest: found[0], transcripts: found.slice(0, 12) };
}

module.exports = { findLatest, links };
