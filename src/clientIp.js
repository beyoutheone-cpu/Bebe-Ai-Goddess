// Render's public path is Client → Cloudflare → Render proxy → this process.
// `trust proxy: 1` stops at the nearest X-Forwarded-For hop, which is a
// Cloudflare edge address and changes between requests, so per-IP limits never
// accumulate. Three hops (socket + the two proxies that append to
// X-Forwarded-For) is the count that still returns the client when the
// leftmost X-Forwarded-For entry is forged. Cloudflare overwrites
// CF-Connecting-IP; True-Client-IP is only a fallback and never wins when the
// two disagree, so a client cannot rotate that header to open a new bucket.
import { isIP } from "node:net";

export const TRUST_PROXY_HOPS = 3;

function singleIp(header) {
  if (!header) return "";
  const value = String(header).trim();
  if (!value || value.includes(",")) return "";
  return isIP(value) ? value : "";
}

export function clientIp(req) {
  if (req.get("cf-ray")) {
    const connecting = singleIp(req.get("cf-connecting-ip"));
    if (connecting) return connecting;
    const trueClient = singleIp(req.get("true-client-ip"));
    if (trueClient) return trueClient;
  }
  return req.ip || "unknown";
}
