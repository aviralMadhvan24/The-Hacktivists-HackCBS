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
  res.json({ success: true, analysis: row.analysis });
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
