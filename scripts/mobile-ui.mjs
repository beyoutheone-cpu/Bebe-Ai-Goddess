// Phone and desktop checks for the standalone chat and the storefront widget.
// Run: NODE_PATH=<playwright dir> node scripts/mobile-ui.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const PORT = process.env.PORT || "4173";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = "/opt/cursor/artifacts/screenshots/mobile";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

const phones = [
  { name: "iphone-se", width: 375, height: 667, dsf: 2 },
  { name: "iphone-14-pro", width: 393, height: 852, dsf: 3 },
  { name: "pixel-7", width: 412, height: 915, dsf: 2.625 },
];
const desktop = { name: "desktop", width: 1280, height: 800, dsf: 1 };

function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }

const hostHtml = `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  body{margin:0;font-family:Georgia,serif}
  .page{height:1800px;padding:24px}
  .atc{position:fixed;left:0;right:0;bottom:0;height:64px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center}
</style></head>
<body>
  <div class="page"><h1>Star boutique</h1><p id="story">A long product story for scroll lock.</p></div>
  <div class="atc">Add to cart</div>
  <script src="/widget.js"></script>
</body></html>`;

async function overflowOk(scope) {
  const target = typeof scope.evaluate === "function" ? scope : scope.locator("html");
  return target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function inputFont(target) {
  return target.locator("#prompt").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}
async function sendHi(frame) {
  await frame.locator("#prompt").fill("hi");
  await frame.locator("#send").click();
  await frame.locator(".bubble.user").waitFor({ timeout: 10000 });
  await frame.locator(".bubble.assistant").nth(1).waitFor({ timeout: 20000 });
  const scrolled = await frame.locator("#messages").evaluate(async (el) => {
    const start = Date.now();
    while (Date.now() - start < 1500) {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  });
  if (scrolled !== true) fail(`messages not scrolled ${JSON.stringify(scrolled)}`);
  return true;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const notes = [];
  try {
    for (const spec of [...phones, desktop]) {
      const context = await browser.newContext({
        viewport: { width: spec.width, height: spec.height },
        deviceScaleFactor: spec.dsf,
        isMobile: spec.name !== "desktop",
        hasTouch: spec.name !== "desktop",
        userAgent: spec.name.startsWith("iphone")
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : spec.name === "pixel-7"
            ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            : undefined,
      });
      const page = await context.newPage();
      await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
      await page.locator("#prompt").waitFor();
      const font = await inputFont(page);
      assert(font >= 16, `${spec.name} input font ${font}`);
      assert(await overflowOk(page), `${spec.name} standalone overflows`);
      if (spec.name !== "desktop") {
        const avatar = await page.locator("#avatar").boundingBox();
        assert(avatar && avatar.width <= 162 && avatar.height <= 177, `${spec.name} avatar ${avatar && avatar.width}x${avatar && avatar.height}`);
        for (const id of ["#send", "#mic", "#speaker"]) {
          const box = await page.locator(id).boundingBox();
          assert(box && box.width >= 44 && box.height >= 44, `${spec.name} ${id} tap ${box && Math.round(box.width)}x${box && Math.round(box.height)}`);
        }
      }
      await page.screenshot({ path: `${OUT}/${spec.name}-standalone.png`, fullPage: false });
      const scrolled = await sendHi(page);
      assert(scrolled, `${spec.name} standalone did not scroll to the newest message`);
      assert(await overflowOk(page), `${spec.name} standalone overflows after reply`);

      const host = await context.newPage();
      await host.route(ORIGIN + "/widget-host.html", (route) => route.fulfill({
        status: 200, contentType: "text/html; charset=utf-8", body: hostHtml,
      }));
      await host.goto(ORIGIN + "/widget-host.html", { waitUntil: "load" });
      if (spec.name !== "desktop") {
        await host.evaluate(() => window.scrollTo(0, 480));
        const before = await host.evaluate(() => window.scrollY);
        assert(before > 400, `${spec.name} host did not scroll (${before})`);
        const bubble = await host.locator("#bebe-btn").boundingBox();
        assert(bubble && bubble.width >= 56 && bubble.height >= 56, `${spec.name} bubble ${bubble && bubble.width}`);
        await host.locator("#bebe-btn").click();
        await host.locator("#bebe-panel.open").waitFor();
        const panel = await host.locator("#bebe-panel").boundingBox();
        assert(panel && panel.x <= 1 && panel.y <= 1, `${spec.name} panel origin ${panel && panel.x},${panel && panel.y}`);
        assert(panel && panel.width >= spec.width - 1 && panel.height >= spec.height - 2, `${spec.name} panel ${panel && Math.round(panel.width)}x${panel && Math.round(panel.height)}`);
        const close = await host.locator("#bebe-close").boundingBox();
        assert(close && close.width >= 44 && close.height >= 44, `${spec.name} close button too small`);
        const locked = await host.evaluate(() => document.body.style.position === "fixed" && document.documentElement.style.overflow === "hidden");
        assert(locked, `${spec.name} background scroll was not locked`);
        const frame = host.frameLocator("#bebe-panel iframe");
        await frame.locator("#prompt").waitFor({ timeout: 15000 });
        const embedFont = await inputFont(frame);
        assert(embedFont >= 16, `${spec.name} embed input font ${embedFont}`);
        const avatarInView = await frame.locator("#avatar").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 40 && r.top >= -1 && r.bottom <= window.innerHeight + 1;
        });
        assert(avatarInView, `${spec.name} embed avatar is clipped`);
        const topBefore = await frame.locator("#avatar").evaluate((el) => el.getBoundingClientRect().top);
        await sendHi(frame);
        const topAfter = await frame.locator("#avatar").evaluate((el) => el.getBoundingClientRect().top);
        assert(Math.abs(topBefore - topAfter) < 2, `${spec.name} avatar moved when messages scrolled`);
        assert(await overflowOk(frame), `${spec.name} embed overflows`);
        await host.screenshot({ path: `${OUT}/${spec.name}-widget-open.png`, fullPage: false });
        await host.locator("#bebe-close").click();
        await host.waitForTimeout(100);
        const closed = await host.locator("#bebe-panel").evaluate((el) => !el.classList.contains("open"));
        const restored = await host.evaluate(() => ({ y: window.scrollY, pos: document.body.style.position, overflow: document.documentElement.style.overflow }));
        assert(closed, `${spec.name} panel stayed open`);
        assert(restored.pos !== "fixed" && restored.overflow !== "hidden", `${spec.name} scroll lock stuck`);
        assert(restored.y > 400, `${spec.name} scroll not restored (${restored.y})`);
      } else {
        await host.locator("#bebe-btn").click();
        const panel = await host.locator("#bebe-panel").boundingBox();
        assert(panel && panel.width < 500 && panel.height < 700, `desktop panel went fullscreen ${panel && panel.width}x${panel && panel.height}`);
        const frame = host.frameLocator("#bebe-panel iframe");
        await frame.locator("#prompt").waitFor();
        await sendHi(frame);
        assert(await overflowOk(host), "desktop widget host overflows");
      }
      await host.close();
      notes.push(spec.name + " ok");
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(`${OUT}/results.txt`, notes.join("\n") + "\n");
  console.log(notes.join("\n"));
}

main().catch((err) => { console.error(err); process.exit(1); });
