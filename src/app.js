import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cfg } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { userFromToken, storageEnabled } from "./db.js";
import { chatWithFallback, providerChain } from "./llm.js";
import { checkRate, budgetStatus, recordUsage, hashIp } from "./limits.js";
import { TRUST_PROXY_HOPS, clientIp } from "./clientIp.js";
import { ensureProducts, productCount } from "./products.js";
import { runTool } from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY_HOPS);
const supa = cfg.supabaseUrl ? new URL(cfg.supabaseUrl).origin : "";
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "https://esm.sh"], styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"], workerSrc: ["'self'"], connectSrc: ["'self'", "https://esm.sh", ...(supa ? [supa, supa.replace("https", "wss")] : [])],
    frameAncestors: ["'self'", ...cfg.embedOrigins], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
  } },
  frameguard: false, // framing is controlled by CSP frame-ancestors (store domain only)
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
// Helmet defaults CORP to same-origin, which blocks the storefront from loading this
// file as a classic script. The widget inlines its CSS and only opens an iframe of
// this same deployment, so no other static asset is fetched cross-origin.
app.use((req, res, next) => {
  if (req.path === "/widget.js") res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use((req, res, next) => { res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()"); next(); });
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.json({ limit: cfg.maxBodyBytes }));
app.use(express.static(path.join(__dirname, "..", "public")));

const say = (res, status, reply, extra = {}) => res.status(status).json({ reply, ...extra });
const NOT_CONFIGURED = "Bebe AI chat is not configured yet. The store team is finishing setup — please check back soon! Meanwhile you can browse https://beberaygardon.myshopify.com/collections/all ✨";
const RESTING = "Bebe is resting right now 🌙 — we've hit today's chat limit. Please come back later, or contact the Star team at https://beberaygardon.myshopify.com/pages/contact.";
const REFUSE = "I'm Bebe, Star's AI style assistant — I can't share my internal instructions or any admin or store-backend information. But I'd love to help you find a look! What aesthetic are you going for? 🖤";

export const cleanText = s => String(s).replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const INJECTION = /(system prompt|initial prompt|hidden (instructions|prompt)|your (instructions|prompt|rules)|ignore (all |the |your )?(previous|prior|above)|developer mode|jailbreak|reveal .*(prompt|instructions|config)|admin (panel|token|password|data|access)|api[ _-]?key|access token|customer (list|records|data|emails)|all orders|env(ironment)? var)/i;

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Bebe AI", chatConfigured: providerChain().length > 0, providers: providerChain().map((p) => p.name), products: productCount(), storage: storageEnabled() }));
app.get("/api/config", (_req, res) => res.json({ supabaseUrl: cfg.supabaseUrl || null, supabaseAnonKey: cfg.supabaseAnonKey || null, maxMessageChars: cfg.maxMessageChars }));

app.post("/api/chat", async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return say(res, 400, "Please send a message.", { error: "bad_request" });
    if (body.messages.length === 0) return say(res, 400, "Please send a message.", { error: "empty" });
    if (body.messages.length > 50) return say(res, 413, "This conversation is too long — please start a new chat.", { error: "too_long" });
    const msgs = [];
    for (const m of body.messages) {
      if (!m || typeof m !== "object" || !["user", "assistant"].includes(m.role) || typeof m.content !== "string") return say(res, 400, "Invalid message format.", { error: "bad_message" });
      const content = cleanText(m.content);
      if (m.role === "user" && content.length > cfg.maxMessageChars) return say(res, 413, `Messages can be at most ${cfg.maxMessageChars} characters.`, { error: "too_long" });
      if (content) msgs.push({ role: m.role, content: content.slice(0, 4000) });
    }
    const history = msgs.slice(-cfg.maxHistory);
    const last = history[history.length - 1];
    if (!last || last.role !== "user") return say(res, 400, "Please send a message.", { error: "empty" });

    const ipHash = hashIp(clientIp(req));
    const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const userId = token ? await userFromToken(token) : null;
    const rl = await checkRate(ipHash, userId);
    if (rl.limited) { res.setHeader("Retry-After", String(rl.retryAfter)); return say(res, 429, "Whoa, that's a lot of messages! Please wait a moment and try again. 💫", { error: "rate_limited" }); }

    if (INJECTION.test(last.content)) return say(res, 200, REFUSE, { refused: true });
    if (!providerChain().length) return say(res, 503, NOT_CONFIGURED, { error: "not_configured" });
    if ((await budgetStatus()).exhausted) return say(res, 503, RESTING, { error: "budget_exhausted" });

    const found = [];
    const convo = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
    let tokens = 0, reply = "";
    const addTokens = async (n) => { tokens += n; };
    try { ({ reply } = await chatWithFallback(convo, found, addTokens)); }
    catch {
      if (tokens) await recordUsage(tokens);
      return say(res, 502, "Bebe couldn't answer just now. Please try again in a moment.", { error: "upstream" });
    }
    await recordUsage(tokens);
    res.json({ reply: reply || "Hmm, I couldn't find the words. Try asking another way?", products: found.slice(0, 4).map(({ title, price, url }) => ({ title, price, url })) });
  } catch (e) { next(e); }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") return say(res, 413, "That request is too large.", { error: "too_large" });
  if (err?.type === "entity.parse.failed") return say(res, 400, "Invalid request.", { error: "bad_json" });
  console.error("Unhandled error:", err?.message);
  say(res, 500, "Something went wrong on our side. Please try again.", { error: "server_error" });
});
ensureProducts().catch(() => {});
export default app;
