import crypto from "node:crypto";
import { cfg } from "./config.js";
import { rpc, storageEnabled } from "./db.js";

const mem = new Map(); // fallback when Supabase is not configured (per-instance only)
const memUsage = new Map();

export const hashIp = ip => crypto.createHash("sha256").update(cfg.ipSalt + ip).digest("hex").slice(0, 24);

async function hit(key, windowSec) {
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${key}:${windowSec}:${slot}`;
  if (storageEnabled()) {
    const { data, error } = await rpc("bebe_rate_hit", { p_key: k, p_window_seconds: windowSec });
    if (!error) return data;
    console.error("rate_hit failed", error.message);
  }
  const n = (mem.get(k) || 0) + 1; mem.set(k, n);
  if (mem.size > 5000) for (const key of mem.keys()) { mem.delete(key); if (mem.size < 2500) break; }
  return n;
}

export async function checkRate(ipHash, userId) {
  const checks = [[`ip:${ipHash}`, 60, cfg.ipPerMinute], [`ip:${ipHash}`, 3600, cfg.ipPerHour]];
  if (userId) checks.push([`user:${userId}`, 60, cfg.userPerMinute], [`user:${userId}`, 3600, cfg.userPerHour]);
  for (const [k, w, max] of checks) if ((await hit(k, w)) > max) return { limited: true, retryAfter: w };
  return { limited: false };
}

const periods = () => { const d = new Date().toISOString(); return { day: `day:${d.slice(0, 10)}`, month: `month:${d.slice(0, 7)}` }; };

async function addUsage(period, requests, tokens) {
  if (storageEnabled()) {
    const { data, error } = await rpc("bebe_add_usage", { p_period: period, p_requests: requests, p_tokens: tokens });
    if (!error && data?.[0]) return { requests: Number(data[0].requests), tokens: Number(data[0].tokens) };
    console.error("add_usage failed", error?.message);
  }
  const cur = memUsage.get(period) || { requests: 0, tokens: 0 };
  cur.requests += requests; cur.tokens += tokens; memUsage.set(period, cur); return { ...cur };
}

export async function budgetStatus() {
  const p = periods();
  const day = await addUsage(p.day, 0, 0), month = await addUsage(p.month, 0, 0);
  const exhausted = day.requests >= cfg.dailyRequestLimit || day.tokens >= cfg.dailyTokenLimit ||
    month.requests >= cfg.monthlyRequestLimit || month.tokens >= cfg.monthlyTokenBudget;
  return { exhausted, day, month };
}

const fired = new Set();
async function alert(period, metric, value, limit) {
  for (const t of [50, 80, 100]) {
    if (value < (limit * t) / 100) continue;
    const id = `${period}:${metric}:${t}`; if (fired.has(id)) continue; fired.add(id);
    const row = { period, metric, threshold: t, value, limit_value: limit };
    console.warn("[BEBE BUDGET ALERT]", JSON.stringify(row));
    let isNew = true;
    if (storageEnabled()) {
      const { data, error } = await rpc("bebe_record_alert", { p_period: period, p_metric: metric, p_threshold: t, p_value: value, p_limit: limit });
      isNew = !error && data === true; // false => already alerted by another instance
    }
    if (isNew && cfg.alertWebhook) {
      fetch(cfg.alertWebhook, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Bebe AI usage alert: ${metric} ${t}% of ${period} budget (${value}/${limit})` }) }).catch(() => {});
    }
  }
}

export async function recordUsage(tokens) {
  const p = periods();
  tokens = Math.min(tokens, 50000);
  const day = await addUsage(p.day, 1, tokens), month = await addUsage(p.month, 1, tokens);
  await Promise.all([
    alert(p.day, "requests", day.requests, cfg.dailyRequestLimit),
    alert(p.day, "tokens", day.tokens, cfg.dailyTokenLimit),
    alert(p.month, "requests", month.requests, cfg.monthlyRequestLimit),
    alert(p.month, "tokens", month.tokens, cfg.monthlyTokenBudget),
  ]);
}
