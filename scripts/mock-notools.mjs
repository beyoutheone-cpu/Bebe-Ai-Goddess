// Test-only mock of an OpenAI-compatible server (e.g. a small Ollama model) that rejects tool calls.
import http from "node:http";
http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
  const j = JSON.parse(b || "{}"); res.setHeader("content-type", "application/json");
  if (j.tools) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: "registry.ollama.ai/library/tiny does not support tools" } })); }
  const ctx = j.messages.filter((m) => m.role === "system")[1]?.content || "";
  res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "MOCK(retrieval) first context line: " + ctx.split("\n")[1] } }], usage: { total_tokens: 42 } }));
}); }).listen(4998);
