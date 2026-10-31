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

async function post(url, headers, body, provider) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw Object.assign(new Error(`${provider} is unreachable: ${err.message}`), { code: 'LLM_UNAVAILABLE' });
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw Object.assign(new Error(`${provider} API error (${res.status}): ${text}`), { code: res.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UNAVAILABLE' });
  }
  return res.json();
}

// Primary model plus fallbacks: Google retires models for new keys (404) and
// popular ones are sometimes overloaded (503/429), so we try the next one.
function geminiModels() {
  const primary = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.6-flash,gemini-3.5-flash').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

async function callGemini(prompt, { system, temperature }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let lastErr;
  // Two passes over the model list; pause before the second if everything was busy.
  const chain = [...geminiModels(), null, ...geminiModels()];
  for (const model of chain) {
    if (model === null) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    let data;
    try {
      data = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, 'Gemini');
    } catch (err) {
      lastErr = err;
      if (/\((404|429|500|503)\)/.test(err.message)) continue; // retired, rate-limited or overloaded → next model
      throw err;
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
    if (!text) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty response';
      throw Object.assign(new Error(`Gemini returned no content (${reason}).`), { code: 'LLM_BAD_OUTPUT' });
    }
    return { json: parseJson(text, 'Gemini'), provider: 'Google Gemini', model: data.modelVersion || model };
  }
  throw lastErr;
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
async function generateJson(prompt, { system, temperature = 0.1 } = {}) {
  if (process.env.GEMINI_API_KEY) return callGemini(prompt, { system, temperature });
  if (process.env.OPENAI_API_KEY) return callOpenAI(prompt, { system, temperature });
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(prompt, { system, temperature });
  throw new LLMNotConfiguredError();
}

/** Back-compat: returns only the parsed JSON. */
async function callLLM(prompt, opts) {
  return (await generateJson(prompt, opts)).json;
}

module.exports = { generateJson, callLLM, isConfigured, LLMNotConfiguredError };
