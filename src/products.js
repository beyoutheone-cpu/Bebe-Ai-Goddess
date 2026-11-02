import { cfg } from "./config.js";
let index = [], loadedAt = 0, loading = null;
const strip = s => String(s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

async function load() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${cfg.storeUrl}/products.json?limit=250&page=${page}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`products.json HTTP ${r.status}`);
    const { products = [] } = await r.json();
    for (const p of products) {
      // The public endpoint only lists published products; also skip anything with no available variant.
      const variants = p.variants || [];
      if (!variants.length || !variants.some(v => v.available !== false)) continue;
      const prices = variants.map(v => Number(v.price)).filter(Number.isFinite);
      out.push({
        title: p.title, type: p.product_type || "", tags: (p.tags || []).join?.(" ") ?? String(p.tags || ""),
        price: prices.length ? Math.min(...prices).toFixed(2) : "",
        url: `${cfg.storeUrl}/products/${p.handle}`,
        description: strip(p.body_html).slice(0, 220),
      });
    }
    if (products.length < 250) break;
  }
  index = out; loadedAt = Date.now();
  console.log(`Product index loaded: ${out.length} products`);
}

export async function ensureProducts() {
  if (Date.now() - loadedAt < cfg.productTtlMs && index.length) return index;
  loading ??= load().catch(e => console.error("Product refresh failed:", e.message)).finally(() => { loading = null; });
  await loading; return index;
}
export const productCount = () => index.length;
export async function refreshProducts() { loadedAt = 0; return (await ensureProducts()).length; }

export async function searchProducts(query, n = 6, maxPrice = null) {
  const list = (await ensureProducts()).filter(p => !maxPrice || Number(p.price) <= maxPrice);
  const words = String(query).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  if (!words.length) return [];
  return list.map(p => {
    const t = p.title.toLowerCase(), hay = `${t} ${p.type} ${p.tags} ${p.description}`.toLowerCase();
    let s = 0; for (const w of words) { if (t.includes(w)) s += 3; else if (hay.includes(w)) s += 1; }
    return [s, p];
  }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, p]) => p);
}
