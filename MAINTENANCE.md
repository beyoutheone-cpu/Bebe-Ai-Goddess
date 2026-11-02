# Bebe AI — Maintenance

## Rotate keys
- **Gemini**: Google AI Studio → API keys → create new → update Vercel `GEMINI_API_KEY` → Redeploy → test → delete the old key. Change order with `LLM_PROVIDERS`; rotate `GROQ_API_KEY` at console.groq.com the same way; change model with `GEMINI_MODEL` (check ai.google.dev/gemini-api/docs/models for current free-tier ids).
- **OpenAI**: create a new key in the OpenAI dashboard → Vercel env `OPENAI_API_KEY` (edit, Sensitive) → Redeploy → test `/api/health` and one chat → revoke the old key. Never paste keys in chat, code, or files in git.
- **BEBE_RPC_TOKEN**: generate a new random value (`openssl rand -hex 32`), update the hash in `bebe_server_config` (README step 1) and the Vercel env var together, then redeploy.
- **Supabase anon key**: public, but if rotated in Supabase update `SUPABASE_ANON_KEY` and redeploy. The app does not use the Supabase secret/service key.
- **SHOPIFY_ADMIN_TOKEN**: rotate in Shopify admin (custom app) → update Vercel → redeploy.

## Adjust budgets & limits
Edit `DAILY_REQUEST_LIMIT`, `DAILY_TOKEN_BUDGET`, `MONTHLY_REQUEST_LIMIT`, `MONTHLY_TOKEN_BUDGET`, `MAX_OUTPUT_TOKENS`, `RATE_LIMIT_*` in Vercel → redeploy. Days/months roll over in UTC. When a cap is hit visitors see "Bebe is resting". Keep a hard limit at the provider too (AI Studio free tier / spend cap, OpenAI usage limit). Gemini thinking tokens count toward `MAX_OUTPUT_TOKENS` and the token budget.
Current usage: `select * from bebe_usage_counters order by updated_at desc;`

## Review alerts
`select * from bebe_usage_alerts order by created_at desc;` — rows at 50/80/100 % per period and metric. Also Vercel logs lines `[BEBE BUDGET ALERT]`, and `ALERT_WEBHOOK_URL` if set.

## Refresh products & pages
Automatic at each cold start and every `PRODUCT_REFRESH_MINUTES` (default 60). To force: redeploy. Only published products from the public `/products.json` and public pages are used.

## Owner access
Add/remove owner: `insert into bebe_owner_emails values ('x@y.com')` / `delete from bebe_owner_emails where email='x@y.com'` (or `OWNER_EMAIL` env).

## Housekeeping
- `bebe_rate_limits` self-cleans; optionally `delete from bebe_usage_counters where updated_at < now() - interval '13 months';`
- Run Supabase Advisors (security + performance) after any schema change.
- `npm audit` and update dependencies monthly; three.js is self-hosted at `public/vendor/`.

## Multi-AI fallback (troubleshooting)
`src/llm.js` tries providers in `LLM_PROVIDERS` order (default `gemini,groq,openai,ollama`), skipping any without credentials (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`) or URL (`OLLAMA_BASE_URL`, local/self-hosted only — Vercel cannot reach your laptop). All use the OpenAI-compatible `/chat/completions` API with the **same** system prompt, tools, `MAX_OUTPUT_TOKENS`, rate limits and budgets (tokens from failed attempts are counted too).
- Falls to the next provider on 429 / quota or credit errors / 5xx / timeout (`LLM_TIMEOUT_MS`) / 401-403-404 (bad key or retired model). Other 4xx stops with the safe error.
- If a provider rejects tool calling, Bebe retries that provider in **retrieval mode**: it searches products.json (and the returns/shipping/size page when relevant) and injects results into the prompt.
- Logs one JSON line per attempt: `{"evt":"llm_answer"|"llm_fallback","provider","model","mode","status","code"}` — never message content or keys.
- Defaults: Gemini `gemini-3.5-flash-lite`, Groq `openai/gpt-oss-20b` (Groq's Llama 3.3 70B is now listed as Enterprise), OpenAI `gpt-4.1-mini`, Ollama `llama3.2`.
- To see who answers: filter function logs for `llm_answer`. Many `llm_fallback` lines with 429 = a provider's quota is used up; reorder or rotate keys.
- Test fallback locally: `LLM_PROVIDERS=gemini,groq GEMINI_MODEL=bogus node server.js` → Groq should answer. `scripts/mock-notools.mjs` tests retrieval mode (`OLLAMA_BASE_URL=http://127.0.0.1:4998`).
