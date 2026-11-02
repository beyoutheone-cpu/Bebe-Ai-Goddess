// Owner-only auth for /api/admin. Real auth: Supabase JWT + allowlist, checked on EVERY request.
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.SUPABASE_URL || "", ANON = process.env.SUPABASE_ANON_KEY || "";
const envOwners = (process.env.OWNER_EMAIL || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export async function requireOwner(req, res, next) {
  try {
    const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token || !URL_ || !ANON) return res.status(401).json({ error: "unauthorized" });
    const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await sb.auth.getUser(token);
    const user = data?.user;
    if (error || !user?.email || !user.email_confirmed_at) return res.status(401).json({ error: "unauthorized" });
    const email = user.email.toLowerCase();
    let owner = envOwners.includes(email);
    if (!owner) { const r = await sb.rpc("bebe_is_owner"); owner = r.data === true; }
    if (!owner) return res.status(403).json({ error: "forbidden" });
    req.owner = { id: user.id, email };
    next();
  } catch { res.status(401).json({ error: "unauthorized" }); }
}
