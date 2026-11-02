// Public "agent" tools. They ONLY read the public product index and public store pages.
import { searchProducts } from "./products.js";
import { getPage, PAGES } from "./pages.js";

export const TOOL_DEFS = [
  { type: "function", function: { name: "search_products", description: "Search Star's public product catalog. Use for any product, outfit or recommendation request.",
    parameters: { type: "object", properties: { query: { type: "string", description: "keywords, e.g. 'black lace gothic dress'" }, max_price: { type: "number", description: "optional max price in USD" } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "get_size_guide", description: "Get Star's public Size Guide & FAQ page text.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_store_policy", description: "Get a public Star store page: refunds/returns, shipping, contact, help center, about, privacy or terms.",
    parameters: { type: "object", properties: { topic: { type: "string", enum: ["refunds_returns", "refund_policy", "shipping", "contact", "help_center", "about", "privacy", "terms"] } }, required: ["topic"], additionalProperties: false } } },
];

export async function runTool(name, rawArgs, found) {
  let args = {}; try { args = JSON.parse(rawArgs || "{}"); } catch { /* ignore */ }
  if (name === "search_products") {
    const q = String(args.query || "").slice(0, 200);
    const max = Number(args.max_price) > 0 ? Number(args.max_price) : null;
    const res = await searchProducts(q, 6, max);
    res.forEach(p => { if (!found.some(f => f.url === p.url)) found.push(p); });
    return res.length ? res.map(p => ({ title: p.title, price_usd: p.price, type: p.type, url: p.url, description: p.description })) : { result: "No matching products found." };
  }
  if (name === "get_size_guide") return await getPage("size_guide");
  if (name === "get_store_policy") return PAGES[args.topic] && args.topic !== "size_guide" ? await getPage(args.topic) : { error: "unknown topic" };
  return { error: "unknown tool" };
}
