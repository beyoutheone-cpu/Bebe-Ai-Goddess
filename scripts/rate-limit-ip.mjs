// Same client must be limited on request 11 within a minute, even when proxy
// hops and a forged leftmost X-Forwarded-For / True-Client-IP change per request.
import { once } from "node:events";
import { app } from "../src/app.js";

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address().port;

async function post(headers) {
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  return res.status;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// Edge headers: CF-Connecting-IP stays put. True-Client-IP and both XFF hops vary.
const edge = [];
for (let i = 1; i <= 11; i++) {
  edge.push(await post({
    "cf-ray": "test-ray-IAD",
    "cf-connecting-ip": "203.0.113.10",
    "true-client-ip": `198.51.100.${i}`,
    "x-forwarded-for": `198.51.100.${i}, 203.0.113.10, 172.16.0.${i}, 104.16.${i}.1`,
  }));
}
console.log("edge statuses", edge.join(","));
assert(edge.slice(0, 10).every((s) => s !== 429), "a fresh client was limited before request 11");
assert(edge[10] === 429, `request 11 status ${edge[10]}, expected 429`);
const still = await post({
  "cf-ray": "test-ray-IAD",
  "cf-connecting-ip": "203.0.113.10",
  "true-client-ip": "203.0.113.99",
  "x-forwarded-for": "203.0.113.99, 203.0.113.10, 172.16.8.8, 104.16.9.9",
});
assert(still === 429, `spoofed True-Client-IP dodged the limit (status ${still})`);
const other = await post({
  "cf-ray": "test-ray-IAD",
  "cf-connecting-ip": "203.0.113.20",
  "true-client-ip": "203.0.113.10",
  "x-forwarded-for": "203.0.113.10, 203.0.113.20, 172.16.0.2, 104.16.0.2",
});
assert(other !== 429, `a different client was limited (status ${other})`);

// No Cloudflare headers. Unforged chain is client, render hop, cloudflare hop.
// A forged leftmost entry must stay in the same bucket.
const hops = [];
for (let i = 1; i <= 11; i++) {
  const chain = i % 2
    ? `203.0.113.30, 172.16.1.${i}, 104.17.${i}.1`
    : `198.51.100.${i}, 203.0.113.30, 172.16.1.${i}, 104.17.${i}.1`;
  hops.push(await post({ "x-forwarded-for": chain }));
}
console.log("hop statuses", hops.join(","));
assert(hops.slice(0, 10).every((s) => s !== 429), "hop-derived client was limited before request 11");
assert(hops[10] === 429, `hop-derived request 11 status ${hops[10]}, expected 429`);
const forged = await post({
  "x-forwarded-for": "203.0.113.77, 203.0.113.30, 172.16.9.9, 104.18.1.1",
});
assert(forged === 429, `forged leftmost X-Forwarded-For dodged the limit (status ${forged})`);

console.log("rate limit keys the same client and ignores forged proxy headers");
server.close();
