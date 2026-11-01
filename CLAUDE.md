# FinSight — team protocol for coding agents

Our team (The Hacktivists, hackCBS 9.0) shares build context through one Meko datapack.

## Build datapack

- Name: `hacktivists-build` (owner: Ishita; Aviral is a Maintainer)
- It holds **build decisions only**: architecture choices, API contracts, schemas, datapack names, gotchas.
- It is never used by the FinSight app, and the app's datapacks are never touched by coding agents.

## Protocol (every teammate's coding agent)

1. **Recall before every task.** Search `hacktivists-build` for decisions related to the task before changing code, and follow them.
2. **Save a short summary when a task ends**: what changed and why, in two or three sentences.
3. **Promote every decision the others must follow.** Only promoted rows reach the rest of the team. Start each one with
   `Decided by <teammate>:` so everyone knows who made it.
4. **Never put keys, passwords, tokens or personal data** in the build datapack.

## Product context (not the build datapack)

The FinSight app uses its own Meko account and datapacks (one per person), configured in `backend/.env`.
See `docs/MEKO.md` for how the product uses Meko.
