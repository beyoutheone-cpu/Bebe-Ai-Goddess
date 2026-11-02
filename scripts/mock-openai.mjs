// Local fake OpenAI endpoint for testing tool-calls and budgets without spending tokens.
import http from "node:http";
http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  const body = JSON.parse(b || "{}"); const hasTool = body.messages.some(m => m.role === "tool");
  const last = body.messages.filter(m => m.role === "user").pop()?.content || "";
  res.setHeader("content-type", "application/json");
  const msg = !hasTool && body.tools ? { role: "assistant", content: null, tool_calls: [
      /size/i.test(last) ? { id: "t1", type: "function", function: { name: "get_size_guide", arguments: "{}" } }
      : { id: "t1", type: "function", function: { name: "search_products", arguments: JSON.stringify({ query: last, max_price: 40 }) } }] }
    : { role: "assistant", content: "Hi! I'm Bebe, Star's AI style assistant (mock). Tool data length: " + (body.messages.find(m => m.role === "tool")?.content.length || 0) };
  res.end(JSON.stringify({ choices: [{ message: msg }], usage: { total_tokens: 100 } }));
}); }).listen(4999);
