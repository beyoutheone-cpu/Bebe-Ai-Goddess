import { initAvatar } from "/avatar.js";
import { createVoice } from "/voice.js";
import { markdownToHtml } from "/markdown.js";
const $ = s => document.querySelector(s);
if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");
let avatar = { set() {} };
initAvatar($("#avatar")).then(a => { avatar = a; }).catch(() => {});
const voice = createVoice({ onState: m => avatar.set(m) });
const GREETING = "Hi, I'm Bebe — Star's AI style assistant ✨ I can find pieces in the shop, explain sizing, returns and shipping, or share tips on running an online store. What are you looking for?";
const form = $("#chat-form"), input = $("#prompt"), send = $("#send"), messagesEl = $("#messages");
let history = [], sb = null, session = null, convId = null, talkTimer = 0;

function addMessage(role, content, products = []) {
  const b = document.createElement("div"); b.className = `bubble ${role}`;
  const n = document.createElement("span"); n.className = "who"; n.textContent = role === "user" ? "You" : "Bebe AI";
  const body = document.createElement("div"); body.className = "md";
  if (role === "assistant") body.innerHTML = markdownToHtml(content);
  else body.textContent = content;
  b.append(n, body);
  if (products.length) {
    const ul = document.createElement("ul"); ul.className = "products";
    for (const pr of products) {
      if (!/^https:\/\/beberaygardon\.myshopify\.com\//.test(pr.url)) continue;
      const li = document.createElement("li"), a = document.createElement("a"), pz = document.createElement("span");
      a.href = pr.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = pr.title;
      pz.className = "price"; pz.textContent = `from $${pr.price}`; a.append(pz); li.append(a); ul.append(li);
    }
    b.append(ul);
  }
  messagesEl.appendChild(b);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}
function resetChat() {
  history = []; convId = null; messagesEl.innerHTML = "";
  addMessage("assistant", GREETING);
}

async function save(role, content) {
  if (!sb || !session) return;
  try {
    if (!convId) {
      const { data, error } = await sb.from("bebe_conversations").insert({ user_id: session.user.id, title: content.slice(0, 80) }).select("id").single();
      if (error) throw error; convId = data.id; loadConversations();
    }
    await sb.from("bebe_messages").insert({ conversation_id: convId, user_id: session.user.id, role, content: content.slice(0, 8000) });
    await sb.from("bebe_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  } catch { /* saving is best-effort */ }
}

async function sendMessage(text) {
  addMessage("user", text); history.push({ role: "user", content: text });
  input.value = ""; updateCount(); send.disabled = true; send.textContent = "Thinking…";
  const typing = document.createElement("div"); typing.className = "bubble assistant typing"; typing.innerHTML = "<strong>Bebe AI</strong><div><span></span><span></span><span></span></div>";
  messagesEl.appendChild(typing); messagesEl.scrollTop = messagesEl.scrollHeight; avatar.set("thinking");
  try {
    const headers = { "Content-Type": "application/json" };
    if (session) headers.Authorization = `Bearer ${session.access_token}`;
    const r = await fetch("/api/chat", { method: "POST", headers, body: JSON.stringify({ messages: history.slice(-12) }) });
    const data = await r.json().catch(() => ({}));
    const reply = data.reply || "Sorry, something went wrong. Please try again.";
    typing.remove(); addMessage("assistant", reply, data.products || []);
    clearTimeout(talkTimer);
    if (voice.enabled && voice.speak(reply)) { /* onstart/onend drive the mouth */ }
    else { avatar.set("speaking"); talkTimer = setTimeout(() => avatar.set("idle"), 1400); }
    if (r.ok) { history.push({ role: "assistant", content: reply }); save("user", text).then(() => save("assistant", reply)); }
    else history.pop();
  } catch { typing.remove(); avatar.set("idle"); history.pop(); addMessage("assistant", "I couldn't reach the server. Please check your connection and try again."); }
  finally { send.disabled = false; send.textContent = "Send ↑"; input.focus(); }
}

async function loadConversations() {
  const list = $("#conv-list"); list.innerHTML = "";
  const { data } = await sb.from("bebe_conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
  for (const c of data || []) {
    const li = document.createElement("li"), btn = document.createElement("button");
    btn.type = "button"; btn.textContent = c.title; btn.onclick = () => openConversation(c.id); li.append(btn); list.append(li);
  }
}
async function openConversation(id) {
  const { data } = await sb.from("bebe_messages").select("role,content").eq("conversation_id", id).order("id");
  messagesEl.innerHTML = ""; convId = id; history = (data || []).map(m => ({ role: m.role, content: m.content }));
  history.forEach(m => addMessage(m.role, m.content));
}
function renderAuth() {
  $("#signin-btn").hidden = !!session; $("#signout-btn").hidden = !session; $("#history").hidden = !session;
  $("#who").textContent = session ? session.user.email : "Guest";
  $("#mode-note").textContent = session ? "Signed in — your chats are saved privately to your account." : "Guest chats aren't saved — they disappear when you close the page.";
  if (session) { $("#signin-form").hidden = true; loadConversations(); }
}

async function initAuth() {
  const cfg = await fetch("/api/config").then(r => r.json()).catch(() => ({}));
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return; // sign-in unavailable; guest chat still works
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  $("#signin-btn").hidden = false;
  ({ data: { session } } = await sb.auth.getSession()); renderAuth();
  sb.auth.onAuthStateChange((_e, s) => { session = s; renderAuth(); });
  $("#signin-btn").onclick = () => { $("#signin-form").hidden = false; $("#email").focus(); };
  $("#signout-btn").onclick = async () => { await sb.auth.signOut(); resetChat(); };
  $("#signin-form").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({ email: $("#email").value.trim(), options: { emailRedirectTo: location.origin } });
    $("#signin-msg").textContent = error ? "Couldn't send the link. Please try again later." : "Check your email for the sign-in link ✨";
  };
}

form.addEventListener("submit", e => { e.preventDefault(); const t = input.value.trim(); if (t && !send.disabled) sendMessage(t.slice(0, 2000)); });
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.prompt; input.focus(); }));
$("#new-chat").addEventListener("click", resetChat);
function updateCount() { $("#count").textContent = `${input.value.length}/2000`; }
input.addEventListener("input", () => { updateCount(); input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; });
const speaker = $("#speaker");
if (!voice.ttsSupported) speaker.hidden = true;
speaker.addEventListener("click", () => { const on = voice.toggle(); speaker.setAttribute("aria-pressed", String(on)); speaker.textContent = on ? "🔊" : "🔇"; speaker.title = on ? "Mute Bebe's voice" : "Turn Bebe's voice on"; if (!on) avatar.set("idle"); });
const mic = $("#mic");
const voiceStatus = $("#voice-status");
mic.hidden = false;
function setVoiceStatus(text) { if (voiceStatus) voiceStatus.textContent = text || ""; }
function stopListening() { mic.classList.remove("live"); mic.disabled = false; mic.setAttribute("aria-pressed", "false"); mic.title = "Speak your message"; }
mic.addEventListener("click", () => {
  if (!voice.sttSupported) {
    setVoiceStatus("Voice typing isn't supported in this browser. On iPhone Safari, type your message instead.");
    return;
  }
  mic.classList.add("live"); mic.disabled = true; mic.setAttribute("aria-pressed", "true"); mic.title = "Listening";
  setVoiceStatus("Listening… speak now.");
  voice.listen({
    onText: (t) => { input.value = (input.value + " " + t).trim().slice(0, 2000); updateCount(); setVoiceStatus("Heard you. Press Send when you're ready."); },
    onError: (err) => {
      if (err === "not-allowed" || err === "service-not-allowed") setVoiceStatus("Microphone permission was blocked. Allow the microphone for this site and try again.");
      else if (err === "unsupported") setVoiceStatus("Voice typing isn't supported in this browser. On iPhone Safari, type your message instead.");
      else if (err !== "aborted") setVoiceStatus("Couldn't hear that. Try again.");
    },
    onEnd: () => { stopListening(); input.focus(); },
  });
});
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty("--vvh", Math.round(h) + "px");
  document.documentElement.style.setProperty("--vvtop", Math.round(top) + "px");
  const narrow = matchMedia("(max-width: 640px)").matches || document.body.classList.contains("embed");
  document.body.classList.toggle("short-vv", narrow && h < 560);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
if (window.visualViewport) {
  visualViewport.addEventListener("resize", syncViewport);
  visualViewport.addEventListener("scroll", syncViewport);
}
addEventListener("resize", syncViewport);
syncViewport();
resetChat();
initAuth();
