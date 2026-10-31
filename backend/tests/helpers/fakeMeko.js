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
  const state = { datapacks: new Map(), conversations: new Map(), calls: [] };
  const wrap = (obj) => ({ content: [{ type: 'text', text: JSON.stringify({ result: JSON.stringify(obj) }) }] });
  const err = (code, detail) => wrap({ error: code, detail });

  function build() {
    const server = new McpServer({ name: 'fake-meko', version: '0.0.1' });
    const log = (name, args) => state.calls.push({ name, args });
    server.tool('datapack_create', { name: z.string(), conversation_id: z.string().optional() }, async (a) => {
      log('datapack_create', a);
      if ([...state.datapacks.values()].some((d) => d.name === a.name)) return err('datapack_exists', 'name must be unique');
      const id = randomUUID();
      state.datapacks.set(id, { id, name: a.name, memories: new Map() });
      return wrap({ datapack_id: id, datapack_name: a.name });
    });
    server.tool('datapack_delete', { datapack_id: z.string() }, async (a) => {
      log('datapack_delete', a);
      if (!state.datapacks.delete(a.datapack_id)) return err('not_found', 'datapack not found');
      return wrap({ deleted: true });
    });
    server.tool('conversation_create', { datapack_id: z.string().optional(), agent_id: z.string().optional(), title: z.string().optional() }, async (a) => {
      log('conversation_create', a);
      if (!a.datapack_id) return err('datapack_id_required', 'missing');
      const id = randomUUID().replace(/-/g, '');
      state.conversations.set(id, a.datapack_id);
      return wrap({ id, agent_id: a.agent_id, title: a.title });
    });
    server.tool('memory_add', { text: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional(), metadata: z.string().optional() }, async (a) => {
      log('memory_add', a);
      const dp = state.datapacks.get(a.datapack_id);
      if (!dp) return err('datapack_not_found', a.datapack_id);
      const id = randomUUID();
      dp.memories.set(id, { id, memory: a.text, agent_id: a.agent_id, metadata: a.metadata ? JSON.parse(a.metadata) : null });
      return wrap({ results: [{ id, memory: a.text, event: 'ADD' }] });
    });
    server.tool('memory_search', { query: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional(), limit: z.number().optional() }, async (a) => {
      log('memory_search', a);
      const dp = state.datapacks.get(a.datapack_id);
      if (!dp) return err('datapack_not_found', a.datapack_id);
      const terms = a.query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
      const results = [...dp.memories.values()] // NOTE: not filtered by agent_id, like the real service
        .map((m) => ({ ...m, score: terms.filter((t) => m.memory.toLowerCase().includes(t)).length / Math.max(1, terms.length) }))
        .filter((m) => m.score > 0).sort((x, y) => y.score - x.score).slice(0, a.limit || 10);
      return wrap({ results });
    });
    server.tool('memory_delete_by_id', { memory_id: z.string(), conversation_id: z.string(), datapack_id: z.string().optional(), agent_id: z.string().optional() }, async (a) => {
      log('memory_delete_by_id', a);
      const dp = state.datapacks.get(a.datapack_id);
      if (!dp || !dp.memories.delete(a.memory_id)) return err('not_found', 'memory not found');
      return wrap({ deleted: true });
    });
    return server;
  }

  const httpServer = http.createServer(async (req, res) => {
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
      return `http://127.0.0.1:${httpServer.address().port}/mcp`;
    },
    async stop() { httpServer.closeAllConnections?.(); await new Promise((r) => httpServer.close(r)); },
    /** Plants a memory directly in a datapack (simulates data LiquidityOS never wrote). */
    inject(datapackId, text) {
      const id = randomUUID();
      state.datapacks.get(datapackId).memories.set(id, { id, memory: text, agent_id: 'someone_else' });
      return id;
    },
  };
}

module.exports = { createFakeMeko };
