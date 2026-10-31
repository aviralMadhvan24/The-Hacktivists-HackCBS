// Reports which optional external integrations are configured. Never exposes secrets.
function llm() {
  if (process.env.GEMINI_API_KEY) return { configured: true, provider: 'Google Gemini', model: process.env.GEMINI_MODEL || 'gemini-3.6-flash' };
  if (process.env.OPENAI_API_KEY) return { configured: true, provider: 'OpenAI', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  if (process.env.ANTHROPIC_API_KEY) return { configured: true, provider: 'Anthropic Claude', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5' };
  return { configured: false, provider: null };
}

function status() {
  return {
    llm: llm(),
    zerodha: { configured: Boolean(process.env.ZERODHA_API_KEY && process.env.ZERODHA_API_SECRET) },
    meko: { configured: Boolean(process.env.MEKO_API_KEY && process.env.MEKO_MCP_URL), enabled: process.env.MEKO_ENABLED === 'true' },
    marketData: { provider: (process.env.MARKET_DATA_PROVIDER || 'YAHOO').toUpperCase() },
    forecasting: { serviceUrl: Boolean(process.env.FORECAST_SERVICE_URL) },
  };
}

module.exports = { status, llm };
