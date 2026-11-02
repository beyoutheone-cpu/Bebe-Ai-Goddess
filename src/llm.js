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

async function call(p, body, deadline = Infinity) {
  const left = Math.min(cfg.llmTimeoutMs, deadline - Date.now());
  if (left < 1500) throw new Fallback(0, "deadline");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), left);
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
    // Any 400 while tools are in play (Groq tool_use_failed, Gemini function-call 400s) -> retry without tools.
    if (body.tools && r.status === 400) throw new ToolsUnsupported();
    // 429, quota, 5xx, auth/model errors (404/401/403) -> try next provider
    if (r.status === 429 || r.status >= 500 || [401, 403, 404, 408].includes(r.status) || /quota|credit|insufficient/i.test(code)) throw new Fallback(r.status, code);
    throw Object.assign(new Error("upstream"), { status: r.status, code });
  }
  return data;
}

async function withTools(p, convo, found, addTokens, deadline) {
  for (let round = 0; round < 3; round++) {
    // Keep the tool definitions on the last round (tool_choice "none") so providers can still parse the earlier tool turns.
    const data = await call(p, { messages: convo, tools: TOOL_DEFS, tool_choice: round < 2 ? "auto" : "none" }, deadline);
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

const STOP = /\b(show|me|find|some|any|i|want|need|please|do|you|have|the|a|an|hi|hello|hey|bebe|can|could|would|recommend|recommendation|suggest|from|star|for|with|and|what|something|good|nice|cute|my|is|are|to|of)\b/ig;
export function parseShopperQuery(q) {
  const maxPrice = Number((q.match(/(?:under|below|less than|<)\s*\$?\s*(\d+(?:\.\d+)?)/i) || [])[1]) || null;
  const terms = q.replace(/(?:under|below|less than|<)\s*\$?\s*\d+(?:\.\d+)?/ig, " ").replace(STOP, " ").replace(/\s+/g, " ").trim();
  return { terms: terms.slice(0, 200), maxPrice };
}
// Keyword search used when tool calling is unavailable. "accessory" style words are expanded to concrete product words.
export async function keywordProducts(q, n = 5) {
  const { terms, maxPrice } = parseShopperQuery(q);
  const expanded = /accessor/i.test(terms) ? `${terms} choker necklace bag earring ring belt gloves hat jewelry collar harness` : terms;
  return (await searchProducts(expanded, n, maxPrice)) || [];
}
const addFound = (found, hits) => hits.forEach((h) => { if (!found.some((f) => f.url === h.url)) found.push(h); });

// Fallback for providers/models without working tool calling: simple retrieval injected into the prompt.
async function withRetrieval(p, convo, found, addTokens, deadline) {
  const q = [...convo].reverse().find((m) => m.role === "user")?.content || "";
  const hits = await keywordProducts(q);
  let ctx = "Tool calling is unavailable for this reply: do not call any tools, answer directly in text.\n\nStore products matching the shopper's message (only link these real URLs):\n" +
    (hits.map((h) => `- ${h.title} (${h.price}) ${h.url}`).join("\n") || "(none found)");
  const topic = /return|refund|exchange/i.test(q) ? "refunds_returns" : /ship|deliver/i.test(q) ? "shipping" : /size|fit/i.test(q) ? "size_guide" : null;
  if (topic) {
    const pol = await runTool(topic === "size_guide" ? "get_size_guide" : "get_store_policy", JSON.stringify(topic === "size_guide" ? {} : { topic }), []);
    ctx += `\n\nStore page excerpt (${topic}):\n` + JSON.stringify(pol).slice(0, 4000);
  }
  const msgs = [convo[0], { role: "system", content: ctx }, ...convo.filter((m) => m.role === "user" || m.role === "assistant")];
  const data = await call(p, { messages: msgs }, deadline);
  await addTokens(Number(data.usage?.total_tokens) || 0);
  const reply = data.choices?.[0]?.message?.content || "";
  // Only publish these hits once this provider actually answered. A failed retrieval
  // must not attach its catalog guess to a later provider's reply.
  if (reply) addFound(found, hits);
  return reply;
}

export async function chatWithFallback(baseConvo, found, addTokens, budgetMs = Number(process.env.CHAT_DEADLINE_MS) || 25000) {
  const chain = providerChain();
  const deadline = Date.now() + budgetMs;
  let lastErr;
  for (const p of chain) {
    const t0 = Date.now();
    let mode = "tools";
    try {
      let reply;
      try { reply = await withTools(p, baseConvo.map((m) => ({ ...m })), found, addTokens, deadline); }
      catch (e) {
        if (!(e instanceof ToolsUnsupported)) throw e;
        console.warn(JSON.stringify({ evt: "llm_tools_failed", provider: p.name, model: p.model }));
        mode = "retrieval"; reply = await withRetrieval(p, baseConvo, found, addTokens, deadline);
      }
      if (!reply) throw Object.assign(new Error("empty_reply"), { code: "empty" });
      console.log(JSON.stringify({ evt: "llm_answer", provider: p.name, model: p.model, mode, ms: Date.now() - t0 }));
      return { reply, provider: p.name };
    } catch (e) {
      lastErr = e;
      // Always try the next provider; a non-retryable error on one provider says nothing about the others.
      console.warn(JSON.stringify({ evt: "llm_fallback", provider: p.name, model: p.model, mode, status: e.status ?? null, code: e.code || "" }));
    }
  }
  // Last resort: answer from the public catalog without an LLM, so product questions never 502.
  const q = [...baseConvo].reverse().find((m) => m.role === "user")?.content || "";
  const hits = found.length ? found.slice(0, 4) : await keywordProducts(q, 4).catch(() => []);
  if (hits.length) {
    addFound(found, hits);
    console.warn(JSON.stringify({ evt: "llm_catalog_fallback", count: hits.length }));
    return { reply: "Here are some Star pieces I think you'll love 🖤\n" + hits.map((h) => `• ${h.title} — $${h.price}: ${h.url}`).join("\n"), provider: "catalog" };
  }
  throw lastErr || new Error("no_provider");
}
