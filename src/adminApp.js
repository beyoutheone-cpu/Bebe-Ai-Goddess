// Private owner admin API. Separate Express app + separate Vercel function (api/admin.js).
// The public chat (src/app.js) never imports this file or src/admin/*.
import express from "express";
import helmet from "helmet";
import { TRUST_PROXY_HOPS } from "./clientIp.js";
import { requireOwner } from "./admin/auth.js";
import { shopifyEnabled, storeInsights } from "./admin/shopify.js";

export const adminApp = express();
adminApp.disable("x-powered-by");
adminApp.set("trust proxy", TRUST_PROXY_HOPS);
adminApp.use(helmet({ contentSecurityPolicy: false, frameguard: { action: "deny" } }));
adminApp.use((req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex"); next(); });
adminApp.use(express.json({ limit: "8kb" }));
// Every admin route requires the owner check.
adminApp.use("/api/admin", requireOwner);
adminApp.get("/api/admin/me", (req, res) => res.json({ owner: true, email: req.owner.email, storeToolsEnabled: shopifyEnabled(), writeTools: false }));
adminApp.get("/api/admin/insights", async (_req, res) => {
  if (!shopifyEnabled()) return res.status(503).json({ error: "store_tools_disabled", message: "Set SHOPIFY_ADMIN_TOKEN (read-only scopes) in Vercel to enable." });
  try { res.json(await storeInsights()); }
  catch (e) { console.error("admin insights:", e.message); res.status(502).json({ error: "shopify_error" }); }
});
adminApp.all("/api/admin/*", (_req, res) => res.status(404).json({ error: "not_found" }));
// eslint-disable-next-line no-unused-vars
adminApp.use((err, _req, res, _next) => { console.error("admin error:", err?.message); res.status(500).json({ error: "server_error" }); });
export default adminApp;
