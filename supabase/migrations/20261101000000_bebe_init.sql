-- Bebe AI: conversations, messages (user-owned, RLS) + server-only usage/alert/rate tables.

create table if not exists public.bebe_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_id_idx on public.bebe_conversations(user_id);

create table if not exists public.bebe_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.bebe_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_id_idx on public.bebe_messages(conversation_id);
create index if not exists messages_user_id_idx on public.bebe_messages(user_id);

alter table public.bebe_conversations enable row level security;
alter table public.bebe_messages enable row level security;

create policy "own conversations select" on public.bebe_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "own conversations insert" on public.bebe_conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own conversations update" on public.bebe_conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own conversations delete" on public.bebe_conversations for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own messages select" on public.bebe_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "own messages insert" on public.bebe_messages for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.bebe_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);
create policy "own messages delete" on public.bebe_messages for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.bebe_conversations, public.bebe_messages from anon;
grant select, insert, update, delete on public.bebe_conversations to authenticated;
grant select, insert, delete on public.bebe_messages to authenticated;

-- ===== Server-only tables (RLS on, no policies, no grants: reachable only via the token-gated RPCs below) =====
create table if not exists public.bebe_usage_counters (
  period text primary key,            -- 'day:2026-11-01' or 'month:2026-11'
  requests integer not null default 0,
  tokens bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.bebe_usage_alerts (
  id bigint generated always as identity primary key,
  period text not null,
  metric text not null,               -- 'requests' | 'tokens'
  threshold integer not null,         -- 50 | 80 | 100
  value bigint not null,
  limit_value bigint not null,
  created_at timestamptz not null default now(),
  unique (period, metric, threshold)
);
create table if not exists public.bebe_rate_limits (
  key text primary key,               -- 'ip:<hash>:<window>' / 'user:<uuid>:<window>'
  hits integer not null default 0,
  expires_at timestamptz not null
);
alter table public.bebe_usage_counters enable row level security;
alter table public.bebe_usage_alerts enable row level security;
alter table public.bebe_rate_limits enable row level security;
revoke all on public.bebe_usage_counters, public.bebe_usage_alerts, public.bebe_rate_limits from anon, authenticated;

-- ===== Server RPCs (no service_role key needed) =====
-- The app server calls these with the public anon key PLUS a private server token (env BEBE_RPC_TOKEN).
-- Only the SHA-256 hash of that token is stored here; the table has RLS on and no grants.
create table if not exists public.bebe_server_config (
  id boolean primary key default true check (id),
  rpc_token_sha256 text not null
);
alter table public.bebe_server_config enable row level security;
revoke all on public.bebe_server_config from anon, authenticated;

create or replace function public.bebe_check_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from public.bebe_server_config
    where rpc_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.bebe_add_usage(p_token text, p_period text, p_requests integer, p_tokens bigint)
returns table(requests integer, tokens bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.bebe_check_token(p_token);
  if p_period !~ '^(day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$' or p_requests not between 0 and 1
     or p_tokens not between 0 and 50000 then
    raise exception 'invalid usage values' using errcode = '22023';
  end if;
  return query
  insert into public.bebe_usage_counters as u (period, requests, tokens) values (p_period, p_requests, p_tokens)
  on conflict (period) do update set requests = u.requests + excluded.requests,
    tokens = u.tokens + excluded.tokens, updated_at = now()
  returning u.requests, u.tokens;
end $$;

create or replace function public.bebe_rate_hit(p_token text, p_key text, p_window_seconds integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.bebe_check_token(p_token);
  if length(p_key) > 120 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate key' using errcode = '22023';
  end if;
  delete from public.bebe_rate_limits where expires_at < now() - interval '1 hour';
  insert into public.bebe_rate_limits as r (key, hits, expires_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set hits = r.hits + 1
  returning r.hits into n;
  return n;
end $$;

-- Returns true if a new alert row was stored (false if this threshold was already alerted).
create or replace function public.bebe_record_alert(p_token text, p_period text, p_metric text, p_threshold integer, p_value bigint, p_limit bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.bebe_check_token(p_token);
  if p_metric not in ('requests','tokens') or p_threshold not in (50,80,100) then
    raise exception 'invalid alert' using errcode = '22023';
  end if;
  insert into public.bebe_usage_alerts(period, metric, threshold, value, limit_value)
    values (p_period, p_metric, p_threshold, p_value, p_limit)
  on conflict (period, metric, threshold) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.bebe_check_token(text) from public, anon, authenticated;
revoke execute on function public.bebe_add_usage(text, text, integer, bigint) from public;
revoke execute on function public.bebe_rate_hit(text, text, integer) from public;
revoke execute on function public.bebe_record_alert(text, text, text, integer, bigint, bigint) from public;
grant execute on function public.bebe_add_usage(text, text, integer, bigint) to anon, authenticated;
grant execute on function public.bebe_rate_hit(text, text, integer) to anon, authenticated;
grant execute on function public.bebe_record_alert(text, text, text, integer, bigint, bigint) to anon, authenticated;

-- After migrating, set the token hash ONCE in the SQL editor (never commit the token itself):
--   insert into public.bebe_server_config(rpc_token_sha256)
--   values (encode(sha256(convert_to('<YOUR_BEBE_RPC_TOKEN>', 'UTF8')), 'hex'))
--   on conflict (id) do update set rpc_token_sha256 = excluded.rpc_token_sha256;

-- ===== Owner allowlist for the private /admin area =====
create table if not exists public.bebe_owner_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.bebe_owner_emails enable row level security;
revoke all on public.bebe_owner_emails from anon, authenticated;
-- True only if the CALLER's verified JWT email is on the allowlist. Can't be used to probe other emails.
create or replace function public.bebe_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bebe_owner_emails o
                 where o.email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
$$;
revoke execute on function public.bebe_is_owner() from public, anon;
grant execute on function public.bebe_is_owner() to authenticated;
-- Add the owner (SQL editor):  insert into public.bebe_owner_emails(email) values ('owner@example.com');
