// Produces Vercel Build Output API v3 (.vercel/output) so the deploy can be uploaded as a single bundle.
// Usage in Vercel: installCommand "node scripts/vercel-build.mjs unpack && npm install", buildCommand "node scripts/vercel-build.mjs build".
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const mode = process.argv[2];
if (mode === "unpack") {
  if (fs.existsSync("bundle.tgz.b64")) {
    fs.writeFileSync("/tmp/bundle.tgz", Buffer.from(fs.readFileSync("bundle.tgz.b64", "utf8"), "base64"));
    execSync("tar -xzf /tmp/bundle.tgz -C .", { stdio: "inherit" });
  }
  process.exit(0);
}
const vc = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const out = ".vercel/output"; fs.rmSync(out, { recursive: true, force: true });
fs.cpSync("public", `${out}/static`, { recursive: true });
for (const fn of ["index", "admin"]) {
  const dir = `${out}/functions/api/${fn}.func`;
  for (const p of ["api", "src", "node_modules", "package.json"]) fs.cpSync(p, path.join(dir, p), { recursive: true });
  fs.writeFileSync(`${dir}/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: `api/${fn}.js`, launcherType: "Nodejs", shouldAddHelpers: true, maxDuration: 30 }));
}
const routes = [];
for (const h of vc.headers || []) routes.push({ src: "^" + h.source.replace("(.*)", ".*") + "$", headers: Object.fromEntries(h.headers.map(x => [x.key, x.value])), continue: true });
routes.push({ handle: "filesystem" });
routes.push({ src: "^/admin/?$", dest: "/admin/index.html" });
routes.push({ src: "^/api/admin(/.*)?$", dest: "/api/admin" });
routes.push({ src: "^/api(/.*)?$", dest: "/api/index" });
fs.writeFileSync(`${out}/config.json`, JSON.stringify({ version: 3, routes }, null, 2));
console.log("Build output written");
