import assert from "node:assert/strict";
import { markdownToHtml } from "../public/markdown.js";

const bold = markdownToHtml("**New arrivals at Star**");
assert.match(bold, /^<p><strong>New arrivals at Star<\/strong><\/p>$/);

const italic = markdownToHtml("*Channel your inner school icon*");
assert.match(italic, /<em>Channel your inner school icon<\/em>/);

const list = markdownToHtml("- **Y2K skirt** — $73.99\n*Plaid preppy skirt*");
assert.match(list, /<ul><li><strong>Y2K skirt<\/strong>/);
assert.match(list, /<p><em>Plaid preppy skirt<\/em><\/p>/);

const link = markdownToHtml("[the skirt](https://beberaygardon.myshopify.com/products/y2k)");
assert.match(link, /href="https:\/\/beberaygardon\.myshopify\.com\/products\/y2k"/);
assert.match(link, /rel="noopener noreferrer"/);

const bare = markdownToHtml("See https://beberaygardon.myshopify.com/pages/contact.");
assert.match(bare, /href="https:\/\/beberaygardon\.myshopify\.com\/pages\/contact"/);

const nasty = markdownToHtml('<img src=x onerror="alert(1)"><script>alert(1)</script>');
assert.equal(nasty.includes("<script>"), false);
assert.equal(nasty.includes("<img"), false);
assert.match(nasty, /&lt;script&gt;/);

const js = markdownToHtml("[click](javascript:alert(1))");
assert.equal(js.includes("href="), false);
assert.match(js, /javascript:alert\(1\)/);

const http = markdownToHtml("[x](http://example.com/a)");
assert.equal(http.includes("href="), false);

const amp = markdownToHtml("[ok](https://example.com/a?b=1&c=2)");
assert.match(amp, /href="https:\/\/example.com\/a\?b=1&amp;c=2"/);

console.log("markdown safe");
