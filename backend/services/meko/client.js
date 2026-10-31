// Meko over MCP (Streamable HTTP), the integration method Meko publishes.
// Endpoint and key stay on the backend. One lazily-connected client per process,
// reconnected on failure. Every call has a timeout.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const TIMEOUT_MS = Number(process.env.MEKO_TIMEOUT_MS || 20000);
let clientPromise = null;

class MekoError extends Error {
  constructor(message, code = 'MEKO_ERROR') {
    super(message);
    this.code = code;
  }
}

function isEnabled() {
  return process.env.MEKO_ENABLED === 'true' && Boolean(process.env.MEKO_MCP_URL && process.env.MEKO_API_KEY);
}

async function connect() {
  const transport = new StreamableHTTPClientTransport(new URL(process.env.MEKO_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.MEKO_API_KEY}`, 'User-Agent': 'finsight-backend/2.0' } },
  });
  const client = new Client({ name: 'finsight-backend', version: '2.0.0' });
  await client.connect(transport);
  return client;
}

async function getClient() {
  if (!isEnabled()) throw new MekoError('Meko is not enabled on this server.', 'MEKO_DISABLED');
  if (!clientPromise) {
    clientPromise = connect().catch((err) => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

/** Meko tool results arrive as text content, sometimes wrapping a JSON string in {"result": "..."}. */
function parseToolResult(res) {
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let data = res.structuredContent ?? null;
  if (data === null) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  for (let i = 0; i < 2 && data && typeof data === 'object' && typeof data.result === 'string'; i++) {
    try { data = JSON.parse(data.result); } catch { break; }
  }
  if (res.isError) throw new MekoError(typeof data === 'string' ? data : JSON.stringify(data).slice(0, 300), 'MEKO_TOOL_ERROR');
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string') {
    throw new MekoError(`${data.error}${data.detail ? `: ${data.detail}` : ''}`, 'MEKO_TOOL_ERROR');
  }
  return data;
}

async function callTool(name, args) {
  let client;
  try {
    client = await getClient();
  } catch (err) {
    if (err instanceof MekoError) throw err;
    throw new MekoError(`Cannot connect to Meko: ${err.message}`, 'MEKO_UNAVAILABLE');
  }
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: TIMEOUT_MS });
    return parseToolResult(res);
  } catch (err) {
    if (err instanceof MekoError) throw err;
    clientPromise = null; // force reconnect next time
    throw new MekoError(`Meko call ${name} failed: ${err.message}`, 'MEKO_UNAVAILABLE');
  }
}

async function listTools() {
  const client = await getClient();
  return (await client.listTools()).tools.map((t) => t.name);
}

async function reset() {
  if (clientPromise) {
    try { (await clientPromise).close(); } catch { /* ignore */ }
  }
  clientPromise = null;
}

module.exports = { isEnabled, callTool, listTools, parseToolResult, reset, MekoError };
