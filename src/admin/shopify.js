// READ-ONLY Shopify Admin API access. Only imported by src/adminApp.js (never by the public chat).
// Phase 1 has NO write operations. Any future write tool must require an explicit confirm step
// (e.g. POST /api/admin/actions/:id/confirm with a one-time nonce shown to the owner first).
const TOKEN = () => process.env.SHOPIFY_ADMIN_TOKEN || "";
const SHOP = () => (process.env.SHOPIFY_STORE_DOMAIN || "beberaygardon.myshopify.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
export const shopifyEnabled = () => Boolean(TOKEN());

async function gql(query, variables = {}) {
  if (/^\s*mutation/i.test(query)) throw new Error("writes are disabled");
  const r = await fetch(`https://${SHOP()}/admin/api/${VERSION}/graphql.json`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN() },
    body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Shopify Admin API error (${r.status})`);
  return j.data;
}

export async function storeInsights() {
  const counts = await gql(`{ active: productsCount(query:"status:active"){count} draft: productsCount(query:"status:draft"){count} all: productsCount{count} collectionsCount{count} }`);
  const oos = await gql(`{ productVariants(first: 100, query: "inventory_quantity:<=0") { nodes { id title sku inventoryQuantity product { title status } } } }`);
  const cols = await gql(`{ collections(first: 50, sortKey: TITLE) { nodes { title handle productsCount { count } } } }`);
  return {
    products: { all: counts.all.count, active: counts.active.count, draft: counts.draft.count },
    collectionsCount: counts.collectionsCount.count,
    outOfStockVariants: oos.productVariants.nodes.map(v => ({ product: v.product.title, status: v.product.status, variant: v.title, sku: v.sku, qty: v.inventoryQuantity })),
    collections: cols.collections.nodes.map(c => ({ title: c.title, handle: c.handle, products: c.productsCount?.count ?? null })),
  };
}
