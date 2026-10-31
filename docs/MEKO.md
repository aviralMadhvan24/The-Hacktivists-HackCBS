# Meko Integration

## How memory works now (person memory)

**FinSight never writes memories.** Meko builds each person's memory by itself from:

1. **Chats with the FinSight chatbot.** Every question and answer is sent with
   `conversation_add_message`. Meko extracts memories from what the user said.
2. **Activity in the app.** Short first-person notes such as "I ran a family stress test:
   market fall 30%…" are sent to the same conversation after a stress test, investment
   evaluation, proposal, vote, Zerodha sync, concall analysis or document upload.

Users can **see** their memories and **forget** any of them (Memory page,
`GET/DELETE /api/me/memory`). Nobody can type or edit a memory. The old
"add context" routes were removed.

### One person, one place

- When the Meko plan allows it, each person gets **their own datapack**.
- On the free tier Meko refuses new datapacks (`FREE_TIER_DATAPACK_LIMIT`, seen live even
  with one datapack left). Then the person gets **their own conversation** inside the shared
  datapack (`MEKO_DATAPACK_ID` or the account default), and every read is filtered to that
  conversation (`memory_get_all` rows carry `conversation_id`; `memory_search` uses `run_id`).
  Verified live: a turn produced two memories tagged with that conversation, and `run_id`
  returned only them.
- The code tries a dedicated datapack first for each new person, so lifting the limit needs
  no code change. `MEKO_PERSON_DATAPACKS=never` skips the attempt.

### Family planning

The chat has two modes: **Just me** and **Family planning**. A member can share their memory
and documents with a family (`PUT /api/families/:fid/memory-sharing`). Family planning
searches the memory and documents of every member who shares. Personal mode never does.

## Documents (knowledge base)

`POST /api/me/documents` uploads a PDF/txt (≤ 5 MB on the free tier) to the user's Meko
knowledge base through Meko's presigned S3 upload. The user must confirm that the
**original file**, including any PAN, Aadhaar or account numbers, is stored in Meko.
FinSight keeps only metadata, never the file.

- Indexing status comes from `knowledgebase_document_status`. It has no document id, so
  FinSight finds the id by searching for a short text fingerprint of the file.
- The chatbot's `search_documents` tool only returns passages from documents the person
  (or, in family mode, a sharing member) uploaded.
- AI extracts suggested income, accounts, holdings and loans from the text. They are added
  to a family's records only when the user approves them.
- Verified live: upload → indexed → searchable → deleted.

## Configuration

| Variable | Meaning |
|---|---|
| `MEKO_ENABLED`, `MEKO_MCP_URL`, `MEKO_API_KEY` | Connection |
| `MEKO_DATAPACK_ID` | Shared datapack used when a personal one can't be created |
| `MEKO_PERSON_DATAPACKS` | `try` (default) or `never` |
| `MEKO_AGENT_ID` | Agent id used on all calls |

## Legacy

`services/meko/contextService.js` (family context written by the app, modes
`shared`/`family`/`datapack`) is kept only to clean up memories created before this change,
on account deletion and demo reset.
