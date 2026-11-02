// /widget.js must be embeddable as a script on the Shopify storefront.
// Every other response keeps Helmet's Cross-Origin-Resource-Policy: same-origin.
import { once } from "node:events";
import { app } from "../src/app.js";

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function headers(path) {
  const res = await fetch(base + path);
  return { status: res.status, corp: res.headers.get("cross-origin-resource-policy"), csp: res.headers.get("content-security-policy") || "" };
}

const widget = await headers("/widget.js");
const home = await headers("/");
const appJs = await headers("/app.js");
const css = await headers("/style.css");
const health = await headers("/api/health");

console.log(JSON.stringify({ widget, home: home.corp, appJs: appJs.corp, css: css.corp, health: health.corp }, null, 2));

assert(widget.status === 200, `widget.js status ${widget.status}`);
assert(widget.corp === "cross-origin", `widget.js CORP ${widget.corp}`);
assert(widget.csp.includes("frame-ancestors") && widget.csp.includes("https://beberaygardon.myshopify.com"), "widget.js lost frame-ancestors");
for (const [name, res] of [["/", home], ["/app.js", appJs], ["/style.css", css], ["/api/health", health]]) {
  assert(res.status === 200, `${name} status ${res.status}`);
  assert(res.corp === "same-origin", `${name} CORP ${res.corp}`);
  assert(res.csp.includes("frame-ancestors"), `${name} lost frame-ancestors`);
}
console.log("widget.js is cross-origin; other responses stay same-origin");
server.close();
