const $ = s => document.querySelector(s);
const cfg = await fetch("/api/config").then(r => r.json()).catch(() => ({}));
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { $("#msg").textContent = "Sign-in is not configured yet."; $("#f button").disabled = true; }
else {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const call = async path => { const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(path, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } }); return [r.status, await r.json().catch(() => ({}))]; };
  async function refresh() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { $("#panel").hidden = true; $("#f").hidden = false; return; }
    const [st, me] = await call("/api/admin/me");
    $("#f").hidden = true; $("#panel").hidden = false;
    $("#who").textContent = st === 200 ? `Signed in as owner ${me.email}. Store tools: ${me.storeToolsEnabled ? "enabled (read-only)" : "disabled — SHOPIFY_ADMIN_TOKEN not set"}.` : "This account is not authorized for admin.";
    $("#load").hidden = st !== 200;
  }
  $("#f").onsubmit = async e => { e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({ email: $("#email").value.trim(), options: { emailRedirectTo: location.origin + "/admin", shouldCreateUser: false } });
    $("#msg").textContent = error ? "Couldn't send link." : "If this email is registered, a link is on its way."; };
  $("#load").onclick = async () => { const [, d] = await call("/api/admin/insights"); $("#out-data").textContent = JSON.stringify(d, null, 2); };
  $("#out").onclick = async () => { await sb.auth.signOut(); refresh(); };
  sb.auth.onAuthStateChange(() => refresh()); refresh();
}
