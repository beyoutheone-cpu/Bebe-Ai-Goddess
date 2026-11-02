// No Supabase service/secret key is used. The server uses the public anon key:
//  - to verify a signed-in user's JWT (auth.getUser), and
//  - to call SECURITY DEFINER RPCs gated by a private server token (BEBE_RPC_TOKEN).
// Conversations/messages are read/written by the browser with the user's JWT, enforced by RLS.
import { createClient } from "@supabase/supabase-js";
import { cfg } from "./config.js";
let anon = null;
function client() {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  anon ??= createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return anon;
}
export const storageEnabled = () => Boolean(client() && cfg.rpcToken);
export async function rpc(fn, args) {
  if (!storageEnabled()) return { data: null, error: { message: "storage disabled" } };
  return client().rpc(fn, { p_token: cfg.rpcToken, ...args });
}
export async function userFromToken(token) {
  const c = client(); if (!token || !c) return null;
  try { const { data, error } = await c.auth.getUser(token); return error ? null : data.user?.id || null; }
  catch { return null; }
}
