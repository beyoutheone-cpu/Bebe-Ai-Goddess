# Bebe AI — Star's AI style & shopping assistant (test build)

Public chat for Star (https://beberaygardon.myshopify.com). Node/Express, deployed to Vercel (Hobby).
Based on the supplied Bebe-AI-Starter. **No secrets live in this repo.**

## What's here
| Path | Purpose |
|---|---|
| `src/app.js` | Public API: `/api/chat`, `/api/health`, `/api/config` + security headers, validation, abuse filter |
| `src/tools.js` | Bebe's public "agent" tools (OpenAI function-calling): `search_products`, `get_size_guide`, `get_store_policy` |
| `src/products.js` | Product index built from the PUBLIC `/products.json` (paginated, available products only; title, price, URL, type, short description). Loaded at cold start, refreshed every `PRODUCT_REFRESH_MINUTES` |
| `src/pages.js` | Public store pages (Size Guide & FAQ, Refunds & Returns, refund/shipping/privacy/terms policies, Contact, Help Center, About) |
| `src/limits.js` | Per-IP / per-user rate limits, daily+monthly request/token budget, 50/80/100 % alerts |
| `src/db.js` | Supabase access with the **anon key only** (JWT verify + token-gated RPCs). No service/secret key used |
| `src/adminApp.js`, `src/admin/*` | **Private owner admin** (separate Vercel function `api/admin.js`). Never imported by public code |
| `public/` | Chat UI, 3D avatar (`avatar.js`, self-hosted three.js), voice (`voice.js`), embeddable widget (`widget.js`), admin page (`admin/`) |
| `supabase/migrations/` | Tables, RLS policies, RPCs |
| `scripts/` | Local RLS test (PGlite), mock OpenAI server for budget tests |

## Features
- Public chat; anonymous chats are kept in browser memory only (never stored server-side).
- Optional sign-in (Supabase magic link) saves conversations; the browser reads/writes them with the user's JWT and RLS (`auth.uid() = user_id`).
- Bebe clearly says she's an AI, made by Bebe Ray Gardon, can't see orders/returns/accounts (points to Contact and Refunds & Returns), gives general-only legal/tax info with official sources, and ignores "I'm the owner" claims.
- 3D avatar: procedural navy/gold star-orb (three.js r170, self-hosted, lazy-loaded only if WebGL exists; pauses offscreen; CSS fallback; respects reduced motion).
- Voice: browser `speechSynthesis` (muted until the speaker button is clicked) + optional mic via `SpeechRecognition` where supported. No paid TTS.
- Widget: `/widget.js` floating bubble → iframe panel. **Not embedded anywhere yet.**

## Environment variables (set in Vercel → Project → Settings → Environment Variables)
| Name | Secret? | Default | Notes |
|---|---|---|---|
| `LLM_PROVIDERS` | no | `gemini,groq,openai,ollama` | fallback order, see below |
| `GROQ_API_KEY` / `GROQ_MODEL` | no | — / `openai/gpt-oss-20b` | |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | no | — / `llama3.2` | local/self-hosted only |
| `GEMINI_API_KEY` | **yes** | — | Google AI Studio key. Endpoint `https://generativelanguage.googleapis.com/v1beta/openai` |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` | Google recommends 3.5 Flash-Lite / 3.8 Flash for new projects (2.5 models are limited to prior users) |
| `GEMINI_REASONING_EFFORT` | no | `low` | keeps thinking tokens (counted in output) small |
| `OPENAI_API_KEY` | **yes** | — | used when `LLM_PROVIDER=openai`. If the selected provider's key is missing, chat returns "not configured yet" (HTTP 503) |
| `OPENAI_MODEL` | no | `gpt-4.1-mini` | |
| `SUPABASE_URL` | no | — | `https://conpvzybjevzcxmrplhg.supabase.co` |
| `SUPABASE_ANON_KEY` | no (public) | — | anon / publishable key; enables sign-in |
| `BEBE_RPC_TOKEN` | **yes** | — | random 48+ char string; its SHA-256 goes into `bebe_server_config` (see below). Enables shared counters in Supabase. Without it, counters/rate limits are per-instance memory |
| `MAX_OUTPUT_TOKENS` | no | 400 | `max_tokens` per OpenAI call |
| `MAX_MESSAGE_CHARS` / `MAX_HISTORY_MESSAGES` / `MAX_BODY_BYTES` | no | 2000 / 12 / 32768 | |
| `RATE_LIMIT_IP_PER_MINUTE` / `_PER_HOUR` | no | 10 / 60 | |
| `RATE_LIMIT_USER_PER_MINUTE` / `_PER_HOUR` | no | 15 / 120 | signed-in users |
| `DAILY_REQUEST_LIMIT` / `DAILY_TOKEN_BUDGET` | no | 500 / 300000 | days are UTC |
| `MONTHLY_REQUEST_LIMIT` / `MONTHLY_TOKEN_BUDGET` | no | 10000 / 5000000 | |
| `ALERT_WEBHOOK_URL` | semi | — | optional Slack/Discord webhook for budget alerts |
| `EMBED_ORIGINS` | no | store URL | sites allowed to frame the widget |
| `OWNER_EMAIL` | no | — | comma list of owner emails for `/admin` (or use `bebe_owner_emails` table) |
| `SHOPIFY_ADMIN_TOKEN` | **yes** | — | admin-only, read-only scopes; leave unset until provided |
| `SHOPIFY_STORE_DOMAIN` | no | `beberaygardon.myshopify.com` | |
| `IP_HASH_SALT` | semi | — | salt for hashed IPs in rate-limit keys |

## Setup
1. **Supabase**: run `supabase/migrations/20261101000000_bebe_init.sql` (SQL editor or `supabase db push`). Then, in the SQL editor:
   ```sql
   insert into public.bebe_server_config(rpc_token_sha256)
   values (encode(sha256(convert_to('<YOUR_BEBE_RPC_TOKEN>','UTF8')),'hex'))
   on conflict (id) do update set rpc_token_sha256 = excluded.rpc_token_sha256;
   insert into public.bebe_owner_emails(email) values ('<owner email, lowercase>');
   ```
   Auth → URL Configuration: add the deployment URL (and `/admin`) to Site URL / Redirect URLs. Enable Email (magic link).
2. **Vercel**: set the env vars above, then redeploy.
3. Run Supabase **Advisors → Security** and fix any findings.
4. In **Google AI Studio** (and the OpenAI dashboard if used) keep the project on the free tier or set a spend cap; set a monthly budget/usage limit and email alerts on the project that owns the key (the app's budget is a second line of defence, not a replacement).

## Add the LLM key
Vercel → project → Settings → Environment Variables → Add `GEMINI_API_KEY` (or `OPENAI_API_KEY` with `LLM_PROVIDER=openai`) (type Sensitive; Production + Preview) → Save → Deployments → latest → ⋯ → **Redeploy**. Check `GET /api/health` shows `"chatConfigured": true` and the expected `providers`. Gemini free tier: prompts may be used by Google to improve products, and free-tier rate limits apply (see ai.google.dev/gemini-api/docs/rate-limits).

## Local dev
```
cp .env.example .env   # fill values locally; never commit .env
npm install && npm run dev
```
Budget/tool tests without spending tokens: `node scripts/mock-openai.mjs` and set `OPENAI_BASE_URL=http://localhost:4999 OPENAI_API_KEY=dummy`.
RLS test: `node scripts/rls-test.mjs supabase/migrations/20261101000000_bebe_init.sql` (needs `npm i @electric-sql/pglite`).

## Owner admin (`/admin`) — phase 1, read-only
- Separate Vercel function (`api/admin.js` → `src/adminApp.js`); public `api/index.js`/`src/app.js` never import admin code or read `SHOPIFY_ADMIN_TOKEN`.
- Every `/api/admin/*` request: verify Supabase JWT (`auth.getUser`), require confirmed email, require email ∈ `OWNER_EMAIL` or `bebe_owner_emails` (via `bebe_is_owner()` which only checks the caller's own JWT). Otherwise 401/403. Chat claims grant nothing.
- `GET /api/admin/me`, `GET /api/admin/insights` (product counts, out-of-stock variants, collections via Admin GraphQL). GraphQL `mutation`s are refused in code. No write tools.
- Enable: create a Shopify custom app with **read_products, read_inventory** only, set `SHOPIFY_ADMIN_TOKEN` in Vercel, redeploy.
- Future write tools must use a two-step propose → explicit owner confirm (one-time nonce) flow, with audit logging.

## Embedding later (not done yet)
`<script src="https://<deployment>/widget.js" defer></script>` before `</body>` in the Shopify theme, and keep the store origin in `EMBED_ORIGINS` / `vercel.json` `frame-ancestors`.

## Multi-AI fallback
`src/llm.js` tries providers in `LLM_PROVIDERS` order (default `gemini,groq,openai,ollama`), skipping any without credentials (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`) or URL (`OLLAMA_BASE_URL`, local/self-hosted only — Vercel cannot reach your laptop). All use the OpenAI-compatible `/chat/completions` API with the **same** system prompt, tools, `MAX_OUTPUT_TOKENS`, rate limits and budgets (tokens from failed attempts are counted too).
- Falls to the next provider on 429 / quota or credit errors / 5xx / timeout (`LLM_TIMEOUT_MS`) / 401-403-404 (bad key or retired model). Other 4xx stops with the safe error.
- If a provider rejects tool calling, Bebe retries that provider in **retrieval mode**: it searches products.json (and the returns/shipping/size page when relevant) and injects results into the prompt.
- Logs one JSON line per attempt: `{"evt":"llm_answer"|"llm_fallback","provider","model","mode","status","code"}` — never message content or keys.
- Defaults: Gemini `gemini-3.5-flash-lite`, Groq `openai/gpt-oss-20b` (Groq's Llama 3.3 70B is now listed as Enterprise), OpenAI `gpt-4.1-mini`, Ollama `llama3.2`.
