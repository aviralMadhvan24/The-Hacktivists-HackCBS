// Concall discovery from company investor-relations pages.
//
// Why this source: SEBI LODR Regulation 46 requires listed companies to publish
// earnings-call transcripts on their own websites. NSE and BSE block automated
// access to their announcement APIs, so FinSight does not scrape them.
//
// Flow: user (or a saved company profile) gives an IR page URL → we list PDF
// links that look like transcripts, inferring quarter/FY from the link text →
// user picks one → we fetch it, extract text, analyse it and store it with its
// source URL. Nothing is invented: if no transcript is found we say so.
const { safeFetch } = require('../lib/safeFetch');

const TRANSCRIPT_RE = /(transcript|con[\s-]?call|earnings[\s-]?call|conference[\s-]?call|analyst[\s-]?(meet|call)|investor[\s-]?call)/i;
const EXCLUDE_RE = /(audio|recording|mp3|intimation|schedule of|invitation)/i;

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

/** Infers quarter and fiscal year (Indian FY) from free text. */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Infers quarter and fiscal year (Indian FY, April–March) from free text.
 * Explicit "Q2 FY27" wins. Otherwise a call date is mapped to the quarter it
 * reports on (calls follow the quarter end), and flagged as inferred.
 */
function inferPeriod(text) {
  const t = text.replace(/[_-]+/g, ' ');
  const q = t.match(/(?:^|[^a-z0-9])Q\s?([1-4])(?![0-9])/i) || t.match(/\b(first|second|third|fourth)\s+quarter\b/i);
  let quarter = null;
  if (q) quarter = /^\d$/.test(q[1]) ? `Q${q[1]}` : `Q${['first', 'second', 'third', 'fourth'].indexOf(q[1].toLowerCase()) + 1}`;
  let fy = null;
  // "FY 2025-26" / "FY2025/26" → FY26; "FY26" / "FY 2026" → FY26
  const f = t.match(/FY\s?'?(\d{4})\s?[/ ]\s?(\d{2,4})(?![0-9])/i) || t.match(/FY\s?'?(\d{2,4})(?![0-9])/i);
  if (f) fy = `FY${String(Number(f[2] || f[1]) % 100).padStart(2, '0')}`;
  else {
    const y = t.match(/\b(20\d{2})\s?[/]\s?(\d{2,4})\b/);
    if (y) fy = `FY${String(Number(y[2]) % 100).padStart(2, '0')}`;
  }
  if (quarter && fy) return { quarter, fiscalYear: fy, inferredFromDate: false };

  // e.g. "Oct17-2026", "17 October 2026", "2026-10-17"
  const d = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?\d{0,2}\s?,?\s?(20\d{2})\b/i)
    || t.match(/\b\d{1,2}\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?,?\s?(20\d{2})\b/i);
  const iso = t.match(/\b(20\d{2})\s(\d{2})\s\d{2}\b/);
  let month = null; let year = null;
  if (d) { month = MONTHS.indexOf(d[1].toLowerCase().slice(0, 3)) + 1; year = Number(d[2]); } else if (iso) { year = Number(iso[1]); month = Number(iso[2]); }
  if (month && year) {
    // Call month → reported quarter: Apr–Jun → Q4 of FY ending that March; Jul–Sep → Q1;
    // Oct–Dec → Q2; Jan–Mar → Q3 (FY ends the coming March).
    let rq; let fyEnd;
    if (month >= 4 && month <= 6) { rq = 4; fyEnd = year; } else if (month >= 7 && month <= 9) { rq = 1; fyEnd = year + 1; } else if (month >= 10) { rq = 2; fyEnd = year + 1; } else { rq = 3; fyEnd = year; }
    return { quarter: quarter || `Q${rq}`, fiscalYear: fy || `FY${String(fyEnd % 100).padStart(2, '0')}`, inferredFromDate: true };
  }
  return { quarter, fiscalYear: fy, inferredFromDate: false };
}

/** Extracts candidate transcript links from an HTML page. */
function extractTranscriptLinks(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href;
    try { href = new URL(decodeEntities(m[1].trim()), baseUrl).toString(); } catch { continue; }
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const hay = `${text} ${decodeURIComponent(href)}`;
    if (!/\.pdf(\?|$)/i.test(href) || !TRANSCRIPT_RE.test(hay) || EXCLUDE_RE.test(hay)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ url: href, title: text.slice(0, 200) || decodeURIComponent(href.split('/').pop()), ...inferPeriod(hay) });
  }
  return out;
}

async function discover(irUrl) {
  const page = await safeFetch(irUrl, { maxBytes: 5 * 1024 * 1024, accept: 'text/html,application/xhtml+xml' });
  if (!/html/i.test(page.contentType)) {
    return { pageUrl: page.url, transcripts: [], note: 'That URL is not an HTML page. If it is a PDF transcript, import it directly.' };
  }
  const transcripts = extractTranscriptLinks(page.buffer.toString('utf-8'), page.url);
  return {
    pageUrl: page.url,
    fetchedAt: new Date().toISOString(),
    transcripts,
    note: transcripts.length ? undefined
      : 'No transcript PDFs were found on this page. Some sites load links with JavaScript or keep transcripts on a separate "Investor presentations" page.',
  };
}

async function fetchTranscriptPdf(pdfUrl) {
  const file = await safeFetch(pdfUrl, { accept: 'application/pdf' });
  if (file.buffer.subarray(0, 5).toString('utf-8') !== '%PDF-') throw new Error('The link did not return a PDF document.');
  return file;
}

module.exports = { discover, fetchTranscriptPdf, extractTranscriptLinks, inferPeriod };
