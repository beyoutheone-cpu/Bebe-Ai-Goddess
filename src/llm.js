// Multi-provider LLM chain. All providers use the OpenAI-compatible /chat/completions API.
// Same system prompt, tools, max_tokens and budgets for every provider; fallback on 429/quota/5xx/timeout.
import { cfg } from "./config.js";
import { TOOL_DEFS, runTool } from "./tools.js";
import { searchProducts } from "./products.js";

const env = (k) => process.env[k] || "";
const DEFS = {
  gemini: () => ({ key: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") || "gemini-3.5-flash-lite",
    base: env("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai",
    extra: { reasoning_effort: env("GEMINI_REASONING_EFFORT") || "low" } }),
  groq: () => ({ key: env("GROQ_API_KEY"), model: env("GROQ_MODEL") || "openai/gpt-oss-20b",
    base: env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1", extra: {} }),
  openai: () => ({ key: env("OPENAI_API_KEY"), model: env("OPENAI_MODEL") || "gpt-4.1-mini",
    base: env("OPENAI_BASE_URL") || "https://api.openai.com/v1", extra: {} }),
  // Local / self-hosted only. Uses Ollama's OpenAI-compatible /v1 endpoint; no key needed.
  ollama: () => env("OLLAMA_BASE_URL") ? ({ key: "ollama", local: true, model: env("OLLAMA_MODEL") || "llama3.2",
    base: env("OLLAMA_BASE_URL").replace(/\/$/, "").replace(/\/v1$/, "") + "/v1", extra: {} }) : { key: "" },
};

export function providerChain() {
  const order = (env("LLM_PROVIDERS") || env("LLM_PROVIDER") || "gemini,groq,openai,ollama")
    .split(",").map((s) => s.trim().toLowerCase()).filter((n) => DEFS[n]);
  return [...new Set(order)].map((name) => ({ name, ...DEFS[name]() })).filter((p) => p.key);
}

class Fallback extends Error { constructor(status, code) { super("fallback"); this.status = status; this.code = code; } }
class ToolsUnsupported extends Error {}

async function call(p, body) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), cfg.llmTimeoutMs);
  let r;
  try {
    r = await fetch(`${p.base.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, max_tokens: cfg.maxTokens, temperature: 0.6, ...p.extra, ...body }) });
  } catch { throw new Fallback(0, "timeout_or_network"); } finally { clearTimeout(t); }
  const data = await r.json().catch(() => ({}));
  const err = data?.error || data?.[0]?.error || {};
  const code = String(err.code || err.status || err.type || "");
  if (!r.ok) {
    const msg = String(err.message || "").toLowerCase();
    if (body.tools && r.status === 400 && /tool|function/.test(msg + code)) throw new ToolsUnsupported();
    // 429, quota, 5xx, auth/model errors (404/401/403) -> try next provider
    if (r.status === 429 || r.status >= 500 || [401, 403, 404, 408].includes(r.status) || /quota|credit|insufficient/i.test(code)) throw new Fallback(r.status, code);
    throw Object.assign(new Error("upstream"), { status: r.status, code });
  }
  return data;
}

async function withTools(p, convo, found, addTokens) {
  for (let round = 0; round < 3; round++) {
    const data = await call(p, { messages: convo, ...(round < 2 ? { tools: TOOL_DEFS, tool_choice: "auto" } : {}) });
    await addTokens(Number(data.usage?.total_tokens) || 0);
    const msg = data.choices?.[0]?.message || {};
    if (msg.tool_calls?.length) {
      convo.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls.slice(0, 4)) {
        const out = await runTool(tc.function?.name, tc.function?.arguments, found);
        convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 6000) });
      }
      continue;
    }
    return msg.content || "";
  }
  return "";
}

// Fallback for providers/models without working tool calling: simple retrieval injected into the prompt.
async function withRetrieval(p, convo, found, addTokens) {
  const q = [...convo].reverse().find((m) => m.role === "user")?.content || "";
  const maxPrice = Number((q.match(/(?:under|below|less than|<)\s*\$?\s*(\d+(?:\.\d+)?)/i) || [])[1]) || undefined;
  const terms = q.replace(/(?:under|below|less than|<)\s*\$?\s*\d+(?:\.\d+)?/ig, " ").replace(/\b(show|me|find|some|any|i|want|need|please|do|you|have|the|a|an)\b/ig, " ").trim();
  const hits = (await searchProducts(terms.slice(0, 200), 5, maxPrice ?? null)) || [];
  hits.forEach((h) => { if (!found.some((f) => f.url === h.url)) found.push(h); });
  let ctx = "Store products matching the shopper's message (only link these real URLs):\n" +
    (hits.map((h) => `- ${h.title} (${h.price}) ${h.url}`).join("\n") || "(none found)");
  const topic = /return|refund|exchange/i.test(q) ? "refunds_returns" : /ship|deliver/i.test(q) ? "shipping" : /size|fit/i.test(q) ? "size_guide" : null;
  if (topic) {
    const pol = await runTool(topic === "size_guide" ? "get_size_guide" : "get_store_policy", JSON.stringify(topic === "size_guide" ? {} : { topic }), []);
    ctx += `\n\nStore page excerpt (${topic}):\n` + JSON.stringify(pol).slice(0, 4000);
  }
  const msgs = [convo[0], { role: "system", content: ctx }, ...convo.slice(1)];
  const data = await call(p, { messages: msgs });
  await addTokens(Number(data.usage?.total_tokens) || 0);
  return data.choices?.[0]?.message?.content || "";
}

export async function chatWithFallback(baseConvo, found, addTokens) {
  const chain = providerChain();
  let lastErr;
  for (const p of chain) {
    const t0 = Date.now();
    try {
      let reply, mode = "tools";
      try { reply = await withTools(p, baseConvo.map((m) => ({ ...m })), found, addTokens); }
      catch (e) { if (!(e instanceof ToolsUnsupported)) throw e; mode = "retrieval"; reply = await withRetrieval(p, baseConvo, found, addTokens); }
      console.log(JSON.stringify({ evt: "llm_answer", provider: p.name, model: p.model, mode, ms: Date.now() - t0 }));
      return { reply, provider: p.name };
    } catch (e) {
      lastErr = e;
      console.warn(JSON.stringify({ evt: "llm_fallback", provider: p.name, model: p.model, status: e.status ?? null, code: e.code || "" }));
      if (!(e instanceof Fallback)) break;
    }
  }
  throw lastErr || new Error("no_provider");
}
