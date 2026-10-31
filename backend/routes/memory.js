// /api/me/memory   — what Meko remembers about me (view + forget; never edit)
// /api/me/documents — documents in my Meko knowledge base
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const person = require('../services/meko/personMemory');
const documents = require('../services/documents');
const { wrap, validate, HttpError, badRequest } = require('../lib/http');

const router = express.Router();

router.get('/memory', wrap(async (req, res) => res.json({ success: true, ...(await person.list(req.user.id)) })));
router.delete('/memory/:mid', wrap(async (req, res) => { await person.forget(req.user.id, req.params.mid, req.ip); res.json({ success: true }); }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'FILE_TOO_LARGE', 'Files up to 5 MB are supported.'));
    return next(badRequest(err.message));
  });
}

router.get('/documents', wrap(async (req, res) => res.json({ success: true, documents: await documents.list(req.user.id), kinds: documents.KIND_LABEL })));
router.post('/documents', handleUpload, wrap(async (req, res) => {
  const r = await documents.upload(req.user.id, req.file, { kind: req.body?.kind, consent: req.body?.consent }, req.ip);
  res.status(r.duplicate ? 200 : 201).json({ success: true, ...r });
}));
router.delete('/documents/:id', wrap(async (req, res) => {
  validate(z.object({ id: z.string().uuid() }), { id: req.params.id });
  await documents.remove(req.user.id, req.params.id, req.ip);
  res.json({ success: true });
}));
router.post('/documents/:id/apply', wrap(async (req, res) => {
  validate(z.object({ id: z.string().uuid() }), { id: req.params.id });
  res.json({ success: true, ...(await documents.apply(req.user.id, req.params.id, req.body, req.ip)) });
}));

module.exports = router;
