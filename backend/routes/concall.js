const express = require('express');
const multer = require('multer');
const { analyzeConcallTranscript, LLMNotConfiguredError } = require('../services/concallAnalyzer');
const { extractTextFromPDF } = require('../services/pdfExtractor');
const storage = require('../services/storage');

const router = express.Router();

// Configure Multer for in-memory upload (max 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 15) * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMime = [
      'application/pdf',
      'text/plain',
      'application/rtf',
      'text/markdown',
      'application/octet-stream' // fallback on some platforms
    ];
    const allowedExt = ['.pdf', '.txt', '.rtf', '.md'];
    const isAllowedExt = allowedExt.some(ext => file.originalname.toLowerCase().endsWith(ext));

    if (allowedMime.includes(file.mimetype) || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported formats are PDF (.pdf) and Plain Text (.txt, .rtf, .md).'));
    }
  }
});

/**
 * POST /api/concall/analyze
 * Analyzes an earnings-call transcript via PDF upload or raw text.
 */
router.post('/analyze', upload.single('transcriptFile'), async (req, res) => {
  try {
    let {
      companyName,
      ticker,
      quarter,
      fiscalYear,
      transcriptSource,
      transcriptText,
      priorTranscriptText,
      holdingInfo
    } = req.body;

    // If file was uploaded, extract its text
    if (req.file) {
      const isPDF = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
      if (isPDF) {
        const extracted = await extractTextFromPDF(req.file.buffer);
        transcriptText = extracted.text;
        transcriptSource = transcriptSource || `Uploaded PDF: ${req.file.originalname} (${extracted.numPages} pages)`;
      } else {
        // Plain text file
        transcriptText = req.file.buffer.toString('utf-8');
        transcriptSource = transcriptSource || `Uploaded Text File: ${req.file.originalname}`;
      }
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No transcript provided. Please upload a PDF, text file, or paste transcript text.'
      });
    }

    const analysis = await analyzeConcallTranscript({
      companyName,
      ticker,
      quarter,
      fiscalYear,
      transcriptText,
      priorTranscriptText,
      transcriptSource,
      holdingInfo
    });

    // Save to persistent history
    storage.saveAnalysis(analysis);

    return res.status(200).json({
      success: true,
      analysis
    });
  } catch (err) {
    if (err instanceof LLMNotConfiguredError || err.code === 'LLM_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'LLM_NOT_CONFIGURED',
        message: err.message,
        setupGuide: {
          step1: 'Open backend/.env (copy from backend/.env.example)',
          step2: 'Add GEMINI_API_KEY=your_key or OPENAI_API_KEY=your_key',
          step3: 'Restart the backend server (npm start)'
        }
      });
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'FILE_TOO_LARGE',
          message: `The uploaded file exceeds the ${process.env.MAX_FILE_SIZE_MB || 15}MB limit. Please provide a smaller transcript.`
        });
      }
      return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
    }

    const statusCode = err.message && err.message.includes('required') ? 400 : 500;
    return res.status(statusCode).json({
      error: statusCode === 400 ? 'VALIDATION_ERROR' : 'ANALYSIS_ERROR',
      message: err.message || 'An unexpected error occurred during concall transcript analysis.'
    });
  }
});

/**
 * GET /api/concall/history
 * Returns the list of previously analyzed transcripts.
 */
router.get('/history', (req, res) => {
  try {
    const list = storage.getAllAnalyses();
    // Return summaries for fast listing
    const summaries = list.map(item => ({
      id: item.id,
      createdAt: item.createdAt,
      metadata: item.metadata,
      executiveSummary: item.executiveSummary,
      findingsCount: item.findings ? item.findings.length : 0,
      risksCount: item.findings ? item.findings.filter(f => f.classification === 'risk').length : 0,
      positivesCount: item.findings ? item.findings.filter(f => f.classification === 'positiveDevelopment').length : 0
    }));

    return res.status(200).json({
      success: true,
      total: summaries.length,
      history: summaries
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/concall/:id
 * Returns the full analysis for a specific ID.
 */
router.get('/:id', (req, res) => {
  try {
    const analysis = storage.getAnalysisById(req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Analysis not found.' });
    }
    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/concall/:id
 * Deletes a previously saved analysis.
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = storage.deleteAnalysis(req.params.id);
    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
