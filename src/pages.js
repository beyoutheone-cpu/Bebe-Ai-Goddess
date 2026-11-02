// Public store pages (no auth) used by the size-guide and policy tools.
import { cfg } from "./config.js";
export const PAGES = {
  size_guide: { path: "/pages/size-guide-faq", title: "Size Guide & FAQ" },
  refunds_returns: { path: "/pages/refunds-returns", title: "Refunds & Returns" },
  refund_policy: { path: "/policies/refund-policy", title: "Refund Policy" },
  shipping: { path: "/policies/shipping-policy", title: "Shipping Policy" },
  contact: { path: "/pages/contact", title: "Contact" },
  help_center: { path: "/pages/star-help-center", title: "Star Help Center" },
  about: { path: "/pages/about-us", title: "About Star" },
  privacy: { path: "/policies/privacy-policy", title: "Privacy Policy" },
  terms: { path: "/policies/terms-of-service", title: "Terms of Service" },
};
const cache = new Map();
const toText = html => {
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  return main.replace(/<(script|style|noscript|svg|form)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
};
export async function getPage(key) {
  const p = PAGES[key]; if (!p) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < cfg.productTtlMs) return hit.v;
  const url = cfg.storeUrl + p.path;
  try {
    const r = await fetch(url, { headers: { Accept: "text/html" } });
    if (!r.ok) throw new Error(String(r.status));
    const v = { title: p.title, url, text: toText(await r.text()).slice(0, 3500) };
    cache.set(key, { at: Date.now(), v }); return v;
  } catch { return { title: p.title, url, text: "(Page text unavailable right now — please open the link.)" }; }
}
