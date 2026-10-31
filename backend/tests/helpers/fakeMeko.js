// In-process MCP server imitating Meko's documented tool surface, for tests.
// Mirrors the semantics that matter for isolation: memory_search returns every
// memory in the datapack regardless of agent_id. Responses use the same
// {"result": "<json string>"} envelope observed from the real server.
const http = require('http');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

function createFakeMeko({ apiKey = 'mko_test_key_123456789' } = {}) {
  const state = { datapacks: new Map(), conversations: new Map(), calls: [], kbPending: new Map(), kbDocs: new Map(), baseUrl: '' };
  const DEFAULT_DP = randomUUID();
  state.datapacks.set(DEFAULT_DP, { id: DEFAULT_DP, name: 'meko_default_datapack', memories: new Map() });
  const needConv = (a) => (!a.conversation_id || !state.conversations.has(a.conversation_id)) && err('conversation_id_required', 'Pass conversation_id from the stored chat (conversation_create / add_message).');
  const wrap = (obj) => ({ content: [{ type: 'text', text: JSON.stringify({ result: JSON.stringify(obj) }) }] });
  const err = (code, detail) => wrap({ error: code, detail });

  function build() {
    const server = new McpServer({ name: 'fake-meko', version: '0.0.1' });
    const log = (name, args) => state.calls.push({ name, args });
    server.tool('datapack_create', { name: z.string(), conversation_id: z.string().optional() }, async (a) => {
      log('datapack_create', a);
      if (needConv(a)) return needConv(a);
      if ([...state.datapacks.values()].some((d) => d.name === a.name)) return err('datapack_exists', 'name must be unique');
      if (state.refuseCreate) return err('FREE_TIER_DATAPACK_LIMIT', 'Upgrade to Standard to create a new datapack.');
      const id = randomUUID();
      state.datapacks.set(id, { id, name: a.name, memories: new Map() });
      return wrap({ datapack_id: id, datapack_name: a.name });
    });
    server.tool('datapack_delete', { datapack_id: z.string(), conversation_id: z.string().optional() }, async (a) => {
      log('datapack_delete', a);
      if (needConv(a)) return needConv(a);
      if (!state.datapacks.delete(a.datapack_id)) return err('not_found', 'datapack not found');
      return wrap({ deleted: true });
    });
    server.tool('conversation_create', { datapack_id: z.string().optional(), agent_id: z.string().optional(), title: z.string().optional(), metadata: z.string().optional() }, async (a) => {
      log('conversation_create', a);
      const id = randomUUID().replace(/-/g, '');
      state.conversations.set(id, a.datapack_id || DEFAULT_DP); // no datapack → account default, like live Meko
      (state.titles ||= new Map()).set(id, a.title || null);
      return wrap({ id, agent_id: a.agent_id, title: a.title });
    });
    server.tool('memory_add', { text: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional(), metadata: z.string().optional() }, async (a) => {
      log('memory_add', a);
      const dp = state.datapacks.get(a.datapack_id || state.conversations.get(a.conversation_id));
      if (!dp) return err('datapack_not_found', a.datapack_id);
      const id = randomUUID();
      dp.memories.set(id, { id, memory: a.text, agent_id: a.agent_id, conversation_id: a.conversation_id, metadata: a.metadata ? JSON.parse(a.metadata) : null });
      return wrap({ results: [{ id, memory: a.text, event: 'ADD' }] });
    });
    server.tool('memory_search', { query: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional(), limit: z.number().optional() }, async (a) => {
      log('memory_search', a);
      const dp = state.datapacks.get(a.datapack_id || state.conversations.get(a.conversation_id));
      if (!dp) return err('datapack_not_found', a.datapack_id);
      const terms = a.query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
      const results = [...dp.memories.values()] // NOTE: not filtered by agent_id, like the real service
        .map((m) => ({ ...m, score: terms.filter((t) => m.memory.toLowerCase().includes(t)).length / Math.max(1, terms.length) }))
        .filter((m) => m.score > 0).sort((x, y) => y.score - x.score).slice(0, a.limit || 10);
      return wrap({ results });
    });
    server.tool('memory_delete_by_id', { memory_id: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional() }, async (a) => {
      log('memory_delete_by_id', a);
      const dp = state.datapacks.get(a.datapack_id || state.conversations.get(a.conversation_id));
      if (!dp || !dp.memories.delete(a.memory_id)) return err('not_found', 'memory not found');
      return wrap({ deleted: true });
    });
    server.tool('conversation_delete', { conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional() }, async (a) => {
      log('conversation_delete', a);
      if (!state.conversations.delete(a.conversation_id)) return err('not_found', 'conversation not found');
      return wrap({ deleted: true });
    });
    // ---- Person memory: conversations -> memories (Meko extracts from the user side) ----
    const dpOf = (a) => state.datapacks.get(a.datapack_id || state.conversations.get(a.conversation_id));
    server.tool('conversation_add_message', { conversation_id: z.string(), input: z.string(), output: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional(), metadata: z.string().optional() }, async (a) => {
      log('conversation_add_message', a);
      if (needConv(a)) return needConv(a);
      const dp = dpOf(a);
      const id = randomUUID();
      // Meko returns dashed conversation ids in memory rows; mimic that.
      const dashed = a.conversation_id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      dp.memories.set(id, { id, memory: `User said: ${a.input}`, conversation_id: dashed, created_at: new Date().toISOString() });
      return wrap({ status: 'accepted', message_id: randomUUID().replace(/-/g, '') });
    });
    server.tool('memory_get_all', { conversation_id: z.string(), datapack_id: z.string().optional(), page: z.number().optional(), page_size: z.number().optional(), agent_id: z.string().optional() }, async (a) => {
      log('memory_get_all', a);
      const dp = dpOf(a);
      if (!dp) return err('datapack_not_found', a.datapack_id);
      const all = [...dp.memories.values()].map((m) => ({ id: m.id, data: m.memory, conversation_id: m.conversation_id || null, created_at: m.created_at || null }));
      const size = a.page_size || 20; const page = a.page || 1;
      return wrap({ results: all.slice((page - 1) * size, page * size), total: all.length, total_pages: Math.max(1, Math.ceil(all.length / size)) });
    });
    server.tool('conversation_list', { agent_id: z.string().optional(), limit: z.number().optional(), datapack_id: z.string().optional() }, async (a) => {
      log('conversation_list', a);
      return wrap({ conversations: [], datapack_id: a.datapack_id || DEFAULT_DP });
    });
    // ---- Knowledge base -------------------------------------------------------------
    server.tool('knowledgebase_upload_document', { filename: z.string(), size: z.number(), content_hash: z.string(), content_head_base64: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional() }, async (a) => {
      log('knowledgebase_upload_document', a);
      const key = `${a.datapack_id || DEFAULT_DP}/${a.content_hash}/${a.filename}`;
      state.kbPending.set(key, { datapack: a.datapack_id || DEFAULT_DP, filename: a.filename });
      return wrap({ datapack_id: a.datapack_id || DEFAULT_DP, url: `${state.baseUrl}/s3`, fields: { key, policy: 'p' }, key });
    });
    server.tool('knowledgebase_document_status', { document_key: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional() }, async (a) => {
      log('knowledgebase_document_status', a);
      const doc = [...state.kbDocs.values()].find((d) => d.key === a.document_key);
      return wrap(doc ? { state: 'completed', document_status: 'COMPLETED', message: 'The file is indexed and searchable.' } : { state: 'pending', document_status: 'PENDING' });
    });
    server.tool('knowledgebase_search', { query: z.string(), conversation_id: z.string(), datapack_id: z.string(), limit: z.number().optional(), agent_id: z.string().optional() }, async (a) => {
      log('knowledgebase_search', a);
      const terms = a.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      const results = [...state.kbDocs.values()].filter((d) => d.datapack === a.datapack_id)
        .map((d) => ({ id: randomUUID(), chunk_text: d.text, document_id: d.id, score: terms.filter((t) => d.text.toLowerCase().includes(t)).length }))
        .filter((h) => h.score > 0).sort((x, y) => y.score - x.score).slice(0, a.limit || 10);
      return wrap({ results, count: results.length });
    });
    server.tool('knowledgebase_delete_document', { document_id: z.string(), conversation_id: z.string(), datapack_id: z.string().optional() }, async (a) => {
      log('knowledgebase_delete_document', a);
      if (!state.kbDocs.delete(a.document_id)) return err('not_found', 'document not found');
      return wrap({ chunks_deleted: 1, document_id: a.document_id, s3_deleted: true });
    });
    return server;
  }

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/s3' && req.method === 'POST') { // stands in for the presigned S3 upload
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('latin1');
      const key = (raw.match(/name="key"\r\n\r\n([^\r]+)/) || [])[1];
      const pending = key && state.kbPending.get(key);
      if (!pending) { res.writeHead(400).end('bad key'); return; }
      const fileText = raw.split('name="file"').pop();
      const id = randomUUID();
      state.kbDocs.set(id, { id, key, datapack: pending.datapack, filename: pending.filename, text: fileText });
      res.writeHead(204).end(); return;
    }
    if (req.headers.authorization !== `Bearer ${apiKey}`) { res.writeHead(401).end('unauthorized'); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const server = build();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    });
  });

  return {
    state,
    apiKey,
    async start() {
      await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
      state.baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      return `${state.baseUrl}/mcp`;
    },
    async stop() { httpServer.closeAllConnections?.(); await new Promise((r) => httpServer.close(r)); },
    /** Plants a memory directly in a datapack (simulates data FinSight never wrote). */
    inject(datapackId, text) {
      const id = randomUUID();
      state.datapacks.get(datapackId).memories.set(id, { id, memory: text, agent_id: 'someone_else' });
      return id;
    },
  };
}

module.exports = { createFakeMeko };
