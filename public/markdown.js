// Safe subset: bold, italic, https links, lists, line breaks. HTML is escaped first.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

function safeHttps(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return "";
    if (u.username || u.password) return "";
    return u.href;
  } catch { return ""; }
}

function inline(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("**", i) || src.startsWith("__", i)) {
      const mark = src.slice(i, i + 2);
      const end = src.indexOf(mark, i + 2);
      if (end !== -1) { out += "<strong>" + inline(src.slice(i + 2, end)) + "</strong>"; i = end + 2; continue; }
    }
    if (src[i] === "*") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && !src.slice(i + 1, end).includes("*")) {
        out += "<em>" + esc(src.slice(i + 1, end)) + "</em>"; i = end + 1; continue;
      }
    }
    const link = src.slice(i).match(/^\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/);
    if (link) {
      const href = safeHttps(link[2]);
      out += href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(link[1])}</a>`
        : esc(link[0]);
      i += link[0].length; continue;
    }
    const bare = src.slice(i).match(/^https:\/\/[^\s<]+/);
    if (bare) {
      const trimmed = bare[0].replace(/[),.;:]+$/g, "");
      const href = safeHttps(trimmed);
      out += href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(trimmed)}</a>`
        : esc(bare[0]);
      i += bare[0].length; continue;
    }
    out += esc(src[i]); i += 1;
  }
  return out;
}

const LIST = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/;

export function markdownToHtml(src) {
  const lines = String(src ?? "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let list = "";
  const close = () => { if (list) { html += list + "</ul>"; list = ""; } };
  for (const line of lines) {
    const item = line.match(LIST);
    if (item) { if (!list) list = "<ul>"; list += "<li>" + inline(item[1]) + "</li>"; continue; }
    close();
    if (!line.trim()) { html += "<br>"; continue; }
    html += "<p>" + inline(line) + "</p>";
  }
  close();
  return html;
}
