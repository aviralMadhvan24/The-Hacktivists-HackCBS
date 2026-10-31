# Security and Privacy Assessment

_Self-assessment, 2026-10-31. Not a penetration test or a legal opinion._

## Controls in place

| Area | Control |
|---|---|
| Passwords | PBKDF2-HMAC-SHA512, 210,000 iterations, per-user salt; legacy 10k-iteration hashes upgraded on next login. Min length 8. |
| Sessions | 256-bit random tokens; only SHA-256 stored; 7-day expiry; revocation on logout and password change. httpOnly, SameSite=Lax, Secure in production. |
| CSRF | Cookie-authenticated writes require `X-LOS-CSRF: 1` (cannot be sent cross-site without a CORS preflight); CORS limited to configured origins. |
| Login abuse | Same error for unknown email and wrong password (timing equalised); rate limits: 20 logins / 15 min, 10 registrations / hour, 300 API calls / min per IP. |
| Authorisation | Family role checks (owner/admin/member/viewer) on every route; non-members get 404; record-level checks for private records (owners only) and edit rights. Tested end to end. |
| Privacy | Private records excluded from other members' lists, totals, scores, stress tests, proposals (impact figures redacted for non-proposers), exports and Meko searches. |
| Secrets at rest | Broker access tokens AES-256-GCM encrypted (`APP_ENCRYPTION_KEY`). LLM, Meko and Zerodha keys only in server env. |
| Input validation | zod schemas on every write; parameterised SQL; table names only from fixed config. |
| Output | React escaping; only http(s) links rendered; CSP via helmet (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`). |
| SSRF | User-supplied URLs (IR pages, PDFs): http(s) and standard ports only; private/reserved IPs blocked at DNS pre-check **and** at connect time (DNS-rebinding safe); redirects re-checked; size and time limits; robots.txt honoured. |
| Uploads | 15MB limit, extension + MIME allow-list, PDF magic-byte check. multer upgraded from 1.x (known CVEs) to 2.0.2. |
| AI | Family data is sent to an LLM only with explicit `ai_analysis` consent; LLM never computes figures; quotes verified against transcripts. |
| Audit | Append-only audit log of logins, membership changes, record writes, broker actions, AI evaluations, consent changes and exports. Admins can view their family's log. |
| Data rights | Consent grant/withdraw; full JSON export; account deletion (removes sole-owned records, shares in joint records, sessions, broker tokens, Meko private datapack). |
| Availability | Core finance needs only the database; market data, Meko, AI and forecasting failures degrade gracefully (tested for Meko). |

## Issues fixed from the original code

Public endpoint listing every user's email; one Zerodha session shared by all users; tokens in memory only; reflected XSS in the Zerodha callback; seeded accounts with published passwords; silent fallback to fake prices; concall history shared across users; no auth on data routes; open CORS; vulnerable multer.

## Known gaps (to do before production)

| Gap | Note |
|---|---|
| Password reset / email verification | No email service configured. |
| MFA | Not implemented. Strongly recommended for a finance app. |
| Field-level encryption | Financial values are protected by database access controls and TLS. YugabyteDB Aeon encrypts storage at rest; per-field encryption isn't applied. |
| Rate limiting across instances | In-memory limiter; use a shared store (e.g. Redis) when running more than one API instance. |
| Backups | Rely on YugabyteDB Aeon's scheduled backups and point-in-time recovery; configure retention and test a restore. |
| Monitoring | Logs go to stdout; add error tracking and alerting. |
| Dependency scanning | Run `npm audit` / Dependabot in CI. |
| External pen test | Recommended before launch. |

## Indian regulatory considerations (requires legal review)

- **Digital Personal Data Protection Act, 2023 (DPDP)**: consent-based processing, purpose limitation, data-principal rights (access, correction, erasure), breach notification. Consent, export and deletion are implemented; a privacy notice, grievance officer, retention schedule and processor agreements (AI provider, Meko, hosting) are still needed. DPDP Rules timelines should be checked.
- **SEBI (Investment Advisers) Regulations, 2013**: personalised investment recommendations generally require registration. The agent is framed as decision support (no buy/sell recommendations, no trade execution, alternatives always shown), but whether it counts as "investment advice" needs a legal opinion before any paid launch.
- **SEBI (Research Analysts) Regulations, 2014**: relevant to publishing research on listed companies; concall summaries are for the user's own use and are not distributed.
- **RBI Account Aggregator framework**: required for any future bank-data aggregation (not implemented; no credential scraping is used).
- **Market data licensing**: Yahoo data is unofficial; production use needs a licensed feed (see `DATA_SOURCES.md`).

LiquidityOS does not claim compliance with any of these.
