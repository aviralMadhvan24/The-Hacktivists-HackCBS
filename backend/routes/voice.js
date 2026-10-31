// POST /api/voice/tts — natural speech for FinSight answers via Gemini TTS.
// Returns audio/wav. Cached by (voice, text) so replaying an answer costs no quota.
// The browser falls back to its built-in voice if this fails (e.g. quota exhausted).
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { wrap, validate, HttpError } = require('../lib/http');

const router = express.Router();
const MODEL = () => process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICES = ['Kore', 'Aoede', 'Puck', 'Charon', 'Leda', 'Orus', 'Zephyr'];
const cache = new Map(); // key -> Buffer (LRU, 60 entries)

router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' }));

/** Wraps 16-bit mono PCM in a WAV header. */
function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const schema = z.object({
  text: z.string().trim().min(1).max(1500),
  lang: z.enum(['en-IN', 'hi-IN']).default('en-IN'),
  voice: z.enum(VOICES).optional(),
}).strict();

router.post('/tts', wrap(async (req, res) => {
  if (!process.env.GEMINI_API_KEY) throw new HttpError(503, 'TTS_NOT_CONFIGURED', 'Natural voice needs GEMINI_API_KEY.');
  const { text, lang, voice: v } = validate(schema, req.body);
  const voice = v || process.env.GEMINI_TTS_VOICE || 'Kore';
  const key = crypto.createHash('sha256').update(`${MODEL()}|${voice}|${lang}|${text}`).digest('hex');
  let wav = cache.get(key);
  if (!wav) {
    const style = lang === 'hi-IN'
      ? 'Read this aloud in natural Hindi, warm and clear, like a friendly family finance guide:'
      : 'Read this aloud in a warm, clear Indian English accent, like a friendly family finance guide. Pronounce Hindi words naturally:';
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${style}\n\n${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }),
      });
    } catch (err) {
      throw new HttpError(504, 'TTS_TIMEOUT', `Voice service did not respond: ${err.message}`);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 502, r.status === 429 ? 'TTS_QUOTA' : 'TTS_FAILED', (j.error?.message || `TTS HTTP ${r.status}`).slice(0, 200));
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!part?.data) throw new HttpError(502, 'TTS_FAILED', 'Voice service returned no audio.');
    const rate = Number((part.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000);
    wav = pcmToWav(Buffer.from(part.data, 'base64'), rate);
    cache.set(key, wav);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(wav);
}));

module.exports = Object.assign(router, { pcmToWav });
