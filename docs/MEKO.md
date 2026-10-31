# Meko Integration

Meko is LiquidityOS's contextual memory: approved family goals, preferences, decision reasoning, stress-test summaries and company research. **It never stores or supplies balances**: every number comes from YugabyteDB.

## How the backend connects

Meko publishes its tools over **MCP (Streamable HTTP)** at `https://mcp.mekodata.ai/mcp`, authenticated with `Authorization: Bearer mko_…`. That is the integration method used here (`backend/services/meko/client.js`, official `@modelcontextprotocol/sdk`). No undocumented REST endpoints are used.

> The Meko connection used by your coding assistant is separate from the app. The backend needs its **own** API key in `backend/.env`.

Tools used: `datapack_create`, `datapack_delete`, `conversation_create`, `memory_add`, `memory_search`, `memory_delete_by_id`.

## Configuration

```env
MEKO_ENABLED=true
MEKO_MCP_URL=https://mcp.mekodata.ai/mcp
MEKO_API_KEY=mko_...            # create a dedicated key for the LiquidityOS backend
MEKO_DATAPACK_PREFIX=liquidityos # datapack names: <prefix>-family-<uuid>, <prefix>-user-<uuid>
MEKO_AGENT_ID=liquidityos_backend
```

With `MEKO_ENABLED=false` (default) everything still works: memories are saved to the YugabyteDB index and search uses local keyword matching, labelled as such in the UI.

## Isolation design

Two facts about Meko shape the design:

1. **An API key covers every datapack in the account.**
2. **`memory_search` searches the whole datapack; `agent_id` does not filter it** (per the tool's own documentation).

So isolation is enforced by LiquidityOS, not by Meko:

| Control | Implementation |
|---|---|
| Separate stores | Shared family context lives in the family's datapack. A member's private context lives in that **user's own datapack**, so it's never in a datapack another member's search touches. |
| Authoritative index | Every memory is a row in `context_memories` (family, owner, kind, sanitised text, sources, Meko ids, sync status). |
| Result filtering | Search results are mapped back to index rows the viewer may see (shared, or their own private). Anything else, including memories written to Meko by other tools, is dropped. Tested with injected foreign memories. |
| Authorisation | Family role checks on every read and write. Shared writes need role ≥ member; only the author or a family admin can correct or delete shared context. |
| Consent | Writes require the user's `meko_context` consent (Settings → Privacy). |
| Sanitisation | Before storage: account numbers, Aadhaar, PAN, IFSC, card numbers, emails, phone numbers and API tokens are removed and the user is told what was removed. |
| No credentials | The Meko key stays on the server. Broker tokens and account numbers are never sent. |

## Lifecycle

- **Correct**: the old memory is deleted from Meko and marked `superseded`; the corrected text is written as a new memory. History stays in the index.
- **Delete**: removed from Meko first; if that fails nothing is changed and the user is asked to retry. The index keeps a content-free tombstone for the audit trail.
- **Outage**: saving succeeds locally with `sync_status = failed`; search falls back to keyword matching; "Retry Meko sync" pushes pending memories later.
- **Account deletion**: the user's private datapack is deleted; deletion is blocked (and retryable) if Meko can't be reached, so private context is never left behind silently.
- **Family deletion**: the family datapack is deleted (best effort, recorded in the audit log).

## Where context is used

- Investment agent: searches family context for the stock, company and sector; passes matches to the AI narrative as "family context".
- UI: "Save reasoning to memory" (agent), "Save summary to family memory" (concall analyses), and the Family memory page (add, search, correct, delete).

## Verification status

- **Tested** against an in-process MCP server that implements Meko's documented tool signatures and semantics (datapack-wide search, `{"result": "<json>"}` envelopes): isolation, injection filtering, sanitisation, correction, deletion, outage and resync, account deletion (`backend/tests/meko.test.js`).
- **Not yet verified against live Meko from the backend**: there is no backend API key in `.env`. The exact shape of `memory_add` / `memory_search` responses is handled defensively (several envelope formats accepted). First live check after adding a key: Family memory → Add context, then Search; the item should show **In Meko**.
