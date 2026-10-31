// Gemini fallback chain: busy primary → fallback; models that reject "minimal"
// thinking are retried without it and remembered. fetch is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');

test('Gemini: falls back on 503 and retries without unsupported thinking level', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'x', GEMINI_MODEL: 'm-busy', GEMINI_FALLBACK_MODELS: 'gemini-3-nomin' });
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body); const model = url.split('/models/')[1].split(':')[0];
    calls.push(`${model}:${body.generationConfig.thinkingConfig?.thinkingLevel || '-'}`);
    if (model === 'm-busy') return { ok: false, status: 503, text: async () => 'busy' };
    if (body.generationConfig.thinkingConfig) return { ok: false, status: 400, text: async () => 'Thinking level MINIMAL is not supported for this model.' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }] }) };
  };
  const llm = require('../lib/llm');
  assert.equal((await llm.generateJson('hi', { fast: true })).json.answer, 'ok');
  assert.deepEqual(calls, ['m-busy:-', 'gemini-3-nomin:minimal', 'gemini-3-nomin:-']);
  calls.length = 0;
  await llm.generateJson('again', { fast: true });
  assert.deepEqual(calls, ['gemini-3-nomin:-']); // busy model cooling down; no-minimal remembered
});
