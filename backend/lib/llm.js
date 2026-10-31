// Provider-agnostic JSON LLM calls (Gemini preferred, then OpenAI, then Anthropic).
// Keys stay server-side. Every call has a timeout and returns parsed JSON.

class LLMNotConfiguredError extends Error {
  constructor(message = 'No LLM API key configured. Set GEMINI_API_KEY in backend/.env.') {
    super(message);
    this.name = 'LLMNotConfiguredError';
    this.code = 'LLM_NOT_CONFIGURED';
  }
}

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 90000);

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function parseJson(text, provider) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    throw Object.assign(new Error(`${provider} returned text that is not valid JSON.`), { code: 'LLM_BAD_OUTPUT' });
  }
}

async function post(url, headers, body, provider, timeoutMs = TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw Object.assign(new Error(`${provider} ${timedOut ? `did not respond within ${Math.round(timeoutMs / 1000)}s` : `is unreachable: ${err.message}`}`), { code: 'LLM_UNAVAILABLE', retryable: true });
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    const retry = text.match(/"retryDelay":s*"(d+)s"/);
    throw Object.assign(new Error(`${provider} API error (${res.status}): ${text}`), {
      retryAfterMs: retry ? Number(retry[1]) * 1000 : null,
      code: res.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UNAVAILABLE',
      retryable: [404, 429, 500, 502, 503, 504].includes(res.status),
    });
  }
  return res.json();
}

// Primary model plus fallbacks: Google retires models for new keys (404), and
// models are sometimes overloaded (503/429) or simply hang. A model that fails
// is skipped for a few minutes so later requests don't wait on it again.
function geminiModels() {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-flash-latest').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}
const unhealthyUntil = new Map();
const noMinimalThinking = new Set();
const COOLDOWN_MS = 5 * 60 * 1000;

async function callGemini(prompt, { system, temperature, fast, timeoutMs }) {
  const all = geminiModels();
  const healthy = all.filter((m) => !(unhealthyUntil.get(m) > Date.now()));
  const order = healthy.length ? [...healthy, ...all.filter((m) => !healthy.includes(m))] : all;
  const perCall = Math.min(timeoutMs || 30000, TIMEOUT_MS);
  const started = Date.now();
  const budget = Math.max(perCall * 2, 60000);
  let lastErr;
  for (const model of order) {
    if (Date.now() - started > budget) break;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature },
    };
    // Gemini 3 models accept a thinking level; minimal is much faster for short, grounded replies.
    // Some models reject it (400), so we remember those and send no thinking config to them.
    if (fast && /gemini-3|latest/.test(model) && !noMinimalThinking.has(model)) body.generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let data;
    try {
      try {
        data = await post(url, { 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, 'Gemini', perCall);
      } catch (err) {
        if (!(/\(400\)/.test(err.message) && /thinking/i.test(err.message) && body.generationConfig.thinkingConfig)) throw err;
        noMinimalThinking.add(model);
        delete body.generationConfig.thinkingConfig;
        data = await post(url, { 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, 'Gemini', perCall);
      }
    } catch (err) {
      lastErr = err;
      if (err.retryable) { unhealthyUntil.set(model, Date.now() + Math.max(COOLDOWN_MS, err.retryAfterMs || 0)); continue; }
      throw err;
    }
    unhealthyUntil.delete(model);
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
    if (!text) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty response';
      throw Object.assign(new Error(`Gemini returned no content (${reason}).`), { code: 'LLM_BAD_OUTPUT' });
    }
    return { json: parseJson(text, 'Gemini'), provider: 'Google Gemini', model: data.modelVersion || model };
  }
  throw lastErr || Object.assign(new Error('Gemini did not respond in time.'), { code: 'LLM_UNAVAILABLE' });
}

async function callOpenAI(prompt, { system, temperature }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const data = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
    model,
    messages: [{ role: 'system', content: system || 'Respond only with valid JSON.' }, { role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature,
  }, 'OpenAI');
  return { json: parseJson(data.choices?.[0]?.message?.content || '', 'OpenAI'), provider: 'OpenAI', model };
}

async function callAnthropic(prompt, { system, temperature }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const data = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, {
    model, max_tokens: 8192, temperature,
    system: `${system || ''}\nRespond with a single JSON object only, no markdown.`.trim(),
    messages: [{ role: 'user', content: prompt }],
  }, 'Anthropic');
  return { json: parseJson(data.content?.map((c) => c.text || '').join('') || '', 'Anthropic'), provider: 'Anthropic Claude', model };
}

/** Returns { json, provider, model }. Throws LLMNotConfiguredError when no key is set. */
async function generateJson(prompt, { system, temperature = 0.1, fast = false, timeoutMs } = {}) {
  if (process.env.GEMINI_API_KEY) return callGemini(prompt, { system, temperature, fast, timeoutMs });
  if (process.env.OPENAI_API_KEY) return callOpenAI(prompt, { system, temperature });
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(prompt, { system, temperature });
  throw new LLMNotConfiguredError();
}

/** Back-compat: returns only the parsed JSON. */
async function callLLM(prompt, opts) {
  return (await generateJson(prompt, opts)).json;
}

module.exports = { generateJson, callLLM, isConfigured, LLMNotConfiguredError };
