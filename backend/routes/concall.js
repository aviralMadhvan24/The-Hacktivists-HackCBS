const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const db = require('../db/pool');
const { analyzeConcallTranscript } = require('../services/concallAnalyzer');
const { extractTextFromPDF } = require('../services/pdfExtractor');
const entitlements = require('../services/entitlements');
const { wrap, HttpError, notFound, badRequest } = require('../lib/http');
const { audit } = require('../lib/audit');

const router = express.Router();
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 15;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|txt|md)$/i.test(file.originalname) && ['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream'].includes(file.mimetype);
    cb(ok ? null : new HttpError(400, 'INVALID_FILE_TYPE', 'Supported formats: PDF (.pdf) and plain text (.txt, .md).'), ok);
  },
});

function handleUpload(req, res, next) {
  upload.single('transcriptFile')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'FILE_TOO_LARGE', `The file exceeds the ${MAX_MB}MB limit.`));
    return next(err instanceof HttpError ? err : badRequest(err.message));
  });
}

function summary(row) {
  const a = row.analysis;
  return {
    id: row.id, createdAt: row.created_at, ticker: row.ticker, company: row.company, quarter: row.quarter, fiscalYear: row.fiscal_year,
    source: row.source, sourceUrl: row.source_url, executiveSummary: a.executiveSummary,
    findingsCount: (a.findings || []).length,
    risksCount: (a.findings || []).filter((f) => f.classification === 'risk').length,
    positivesCount: (a.findings || []).filter((f) => f.classification === 'positiveDevelopment').length,
    quoteVerification: a.quoteVerification || null,
  };
}

async function saveAnalysis(userId, { familyId, analysis, sourceUrl }) {
  const id = randomUUID();
  const md = analysis.metadata;
  const { rows } = await db.query(
    `INSERT INTO concall_analyses (id, user_id, family_id, ticker, company, quarter, fiscal_year, source, source_url, analysis)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, userId, familyId || null, md.ticker.toUpperCase(), md.companyName, md.quarter, md.fiscalYear, md.transcriptSource || null, sourceUrl || null, JSON.stringify({ ...analysis, id })]);
  return rows[0];
}

// POST /api/concall/analyze — transcript via file upload or pasted text.
router.post('/analyze', handleUpload, wrap(async (req, res) => {
  let { companyName, ticker, quarter, fiscalYear, transcriptSource, transcriptText, priorTranscriptText, holdingInfo, sourceUrl } = req.body || {};
  if (req.file) {
    if (/\.pdf$/i.test(req.file.originalname)) {
      const extracted = await extractTextFromPDF(req.file.buffer).catch((e) => { throw badRequest(e.message); });
      transcriptText = extracted.text;
      transcriptSource = transcriptSource || `Uploaded PDF: ${req.file.originalname} (${extracted.numPages} pages)`;
    } else {
      transcriptText = req.file.buffer.toString('utf-8');
      transcriptSource = transcriptSource || `Uploaded text file: ${req.file.originalname}`;
    }
  }
  if (!transcriptText || !String(transcriptText).trim()) throw badRequest('No transcript provided. Upload a PDF or text file, or paste the transcript.');

  const usage = await entitlements.consume(req.user.id, 'concall_analysis');
  let analysis;
  try {
    analysis = await analyzeConcallTranscript({ companyName, ticker, quarter, fiscalYear, transcriptText, priorTranscriptText, transcriptSource, holdingInfo });
  } catch (err) {
    await usage.release();
    if (err.code === 'LLM_NOT_CONFIGURED') throw new HttpError(503, 'LLM_NOT_CONFIGURED', err.message);
    if (/required|too short/.test(err.message)) throw badRequest(err.message);
    if (String(err.code || '').startsWith('LLM_')) throw new HttpError(502, err.code, err.message);
    throw err;
  }
  const row = await saveAnalysis(req.user.id, { analysis, sourceUrl });
  await audit({ actorId: req.user.id, action: 'concall.analyze', entityType: 'concall', entityId: row.id, details: { ticker: row.ticker }, ip: req.ip });
  await require('../services/activity').concall(req.user.id, { company: row.company, ticker: row.ticker, quarter: row.quarter, fiscalYear: row.fiscal_year });
  res.json({ success: true, analysis: row.analysis });
}));

// ---- Discovery from company investor-relations pages -----------------------
const discovery = require('../services/concallDiscovery');
const { z } = require('zod');
const { validate } = require('../lib/http');

function fetchError(err) {
  if (err.code === 'FETCH_BLOCKED') return new HttpError(422, 'FETCH_BLOCKED', err.message);
  return new HttpError(502, 'FETCH_FAILED', `Could not fetch the page: ${err.message}`);
}

async function markImported(userId, transcripts) {
  const urls = transcripts.map((t) => t.url);
  if (!urls.length) return transcripts;
  const { rows } = await db.query('SELECT id, source_url FROM concall_analyses WHERE user_id = $1 AND source_url = ANY($2::text[])', [userId, urls]);
  const done = new Map(rows.map((r) => [r.source_url, r.id]));
  return transcripts.map((t) => ({ ...t, importedAnalysisId: done.get(t.url) || null }));
}

// Automatic: ticker -> company website -> investor pages -> newest transcript.
// The found source is saved so it can be re-checked for new quarters later.
router.post('/auto', wrap(async (req, res) => {
  const { ticker } = validate(z.object({ ticker: z.string().trim().min(1).max(30) }).strict(), req.body);
  let r;
  try { r = await require('../services/concallAuto').findLatest(ticker); } catch (err) { throw err.code === 'LOOKUP_FAILED' ? badRequest(err.message) : fetchError(err); }
  if (r.found && r.irUrl) {
    await db.query(
      `INSERT INTO research_sources (id, user_id, ticker, company, ir_url) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, ticker, ir_url) DO UPDATE SET company = EXCLUDED.company`, [randomUUID(), req.user.id, r.ticker, r.company, r.irUrl]);
  }
  res.json({ success: true, ...r, transcripts: r.transcripts ? await markImported(req.user.id, r.transcripts) : [] });
}));

router.post('/discover', wrap(async (req, res) => {
  const { irUrl } = validate(z.object({ irUrl: z.string().url().max(500) }).strict(), req.body);
  let r;
  try { r = await discovery.discover(irUrl); } catch (err) { throw fetchError(err); }
  res.json({ success: true, ...r, transcripts: await markImported(req.user.id, r.transcripts) });
}));

const importSchema = z.object({
  pdfUrl: z.string().url().max(800),
  companyName: z.string().trim().min(1).max(160),
  ticker: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase()),
  quarter: z.string().regex(/^Q[1-4]$/),
  fiscalYear: z.string().regex(/^FY\d{2}$/),
  holdingInfo: z.string().max(500).optional(),
}).strict();

// Imports a transcript PDF from a public URL, compares it with the previous
// saved analysis for the same company, and stores it with its source URL.
router.post('/import', wrap(async (req, res) => {
  const input = validate(importSchema, req.body);
  const dup = await db.query('SELECT id FROM concall_analyses WHERE user_id = $1 AND source_url = $2', [req.user.id, input.pdfUrl]);
  if (dup.rowCount) return res.json({ success: true, alreadyImported: true, analysisId: dup.rows[0].id });
  let file;
  try { file = await discovery.fetchTranscriptPdf(input.pdfUrl); } catch (err) { throw err.code === 'FETCH_BLOCKED' ? fetchError(err) : badRequest(err.message); }
  const extracted = await extractTextFromPDF(file.buffer).catch((e) => { throw badRequest(e.message); });

  const prior = await db.query(
    `SELECT quarter, fiscal_year, analysis FROM concall_analyses WHERE user_id = $1 AND ticker = $2
     AND NOT (quarter = $3 AND fiscal_year = $4) ORDER BY fiscal_year DESC, quarter DESC LIMIT 1`, [req.user.id, input.ticker, input.quarter, input.fiscalYear]);
  const priorText = prior.rows[0]
    ? `PREVIOUS QUARTER ANALYSIS SUMMARY (${prior.rows[0].quarter} ${prior.rows[0].fiscal_year}; this is FinSight's earlier analysis, not a transcript):\n${JSON.stringify({ executiveSummary: prior.rows[0].analysis.executiveSummary, growthAndGuidance: prior.rows[0].analysis.growthAndGuidance, financialPerformance: prior.rows[0].analysis.financialPerformance })}`
    : null;

  const usage = await entitlements.consume(req.user.id, 'concall_analysis');
  let analysis;
  try {
    analysis = await analyzeConcallTranscript({
      companyName: input.companyName, ticker: input.ticker, quarter: input.quarter, fiscalYear: input.fiscalYear,
      transcriptText: extracted.text, priorTranscriptText: priorText, transcriptSource: `Company website: ${new URL(file.url).hostname} (${extracted.numPages} pages)`, holdingInfo: input.holdingInfo,
    });
  } catch (err) {
    await usage.release();
    if (err.code === 'LLM_NOT_CONFIGURED') throw new HttpError(503, 'LLM_NOT_CONFIGURED', err.message);
    if (String(err.code || '').startsWith('LLM_')) throw new HttpError(502, err.code, err.message);
    throw err;
  }
  analysis.comparedWith = prior.rows[0] ? `${prior.rows[0].quarter} ${prior.rows[0].fiscal_year}` : null;
  const row = await saveAnalysis(req.user.id, { analysis, sourceUrl: file.url });
  await audit({ actorId: req.user.id, action: 'concall.import', entityType: 'concall', entityId: row.id, details: { ticker: row.ticker, source: new URL(file.url).hostname }, ip: req.ip });
  await require('../services/activity').concall(req.user.id, { company: row.company, ticker: row.ticker, quarter: row.quarter, fiscalYear: row.fiscal_year });
  res.json({ success: true, analysis: row.analysis, meta: summary(row) });
}));

router.get('/sources', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM research_sources WHERE user_id = $1 ORDER BY ticker', [req.user.id]);
  res.json({ success: true, sources: rows.map((r) => ({ id: r.id, ticker: r.ticker, company: r.company, irUrl: r.ir_url, lastChecked: r.last_checked, lastResult: r.last_result })) });
}));

router.post('/sources', wrap(async (req, res) => {
  const s = validate(z.object({ ticker: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()), company: z.string().trim().min(1).max(160), irUrl: z.string().url().max(500) }).strict(), req.body);
  const { checkUrl } = require('../lib/safeFetch');
  try { await checkUrl(s.irUrl); } catch (err) { throw fetchError(err); }
  const { rows } = await db.query(
    `INSERT INTO research_sources (id, user_id, ticker, company, ir_url) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, ticker, ir_url) DO UPDATE SET company = EXCLUDED.company RETURNING *`, [randomUUID(), req.user.id, s.ticker, s.company, s.irUrl]);
  res.status(201).json({ success: true, source: { id: rows[0].id, ticker: rows[0].ticker, company: rows[0].company, irUrl: rows[0].ir_url } });
}));

router.post('/sources/:id/check', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM research_sources WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) throw notFound('Source not found.');
  let r;
  try { r = await discovery.discover(rows[0].ir_url); } catch (err) {
    await db.query('UPDATE research_sources SET last_checked = now(), last_result = $2 WHERE id = $1', [rows[0].id, JSON.stringify({ error: err.message })]);
    throw fetchError(err);
  }
  const transcripts = await markImported(req.user.id, r.transcripts);
  const summaryResult = { found: transcripts.length, notImported: transcripts.filter((t) => !t.importedAnalysisId).length };
  await db.query('UPDATE research_sources SET last_checked = now(), last_result = $2 WHERE id = $1', [rows[0].id, JSON.stringify(summaryResult)]);
  res.json({ success: true, ...r, transcripts, ticker: rows[0].ticker, company: rows[0].company });
}));

router.delete('/sources/:id', wrap(async (req, res) => {
  const r = await db.query('DELETE FROM research_sources WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!r.rowCount) throw notFound('Source not found.');
  res.json({ success: true });
}));

router.get('/history', wrap(async (req, res) => {
  const params = [req.user.id];
  let where = 'user_id = $1';
  if (req.query.ticker) { params.push(String(req.query.ticker).toUpperCase()); where += ` AND ticker = $${params.length}`; }
  const { rows } = await db.query(`SELECT * FROM concall_analyses WHERE ${where} ORDER BY created_at DESC LIMIT 100`, params);
  const history = rows.map(summary);
  res.json({ success: true, total: history.length, history });
}));

router.get('/:id', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Analysis not found.');
  const { rows } = await db.query('SELECT * FROM concall_analyses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) throw notFound('Analysis not found.');
  res.json({ success: true, analysis: rows[0].analysis, meta: summary(rows[0]) });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Analysis not found.');
  const r = await db.query('DELETE FROM concall_analyses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!r.rowCount) throw notFound('Analysis not found.');
  res.json({ success: true });
}));

module.exports = Object.assign(router, { saveAnalysis });
