// Local RLS test using PGlite: cd /tmp/x && npm i @electric-sql/pglite && node rls-test.mjs <migration.sql>
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
await db.exec(fs.readFileSync("/workspace/bebe-ai/scripts/auth-stub.sql","utf8"));
await db.exec(fs.readFileSync(process.argv[2],"utf8"));
console.log("MIGRATION_OK");
const TOK="test-token-0123456789abcdef0123456789abcdef";
await db.exec(`insert into public.bebe_server_config(rpc_token_sha256) values (encode(sha256(convert_to('${TOK}','UTF8')),'hex'))`);
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002';
async function as(role, uid, sql, label){
  try { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid||''}',false); set role ${role};`);
    const r = await db.query(sql); console.log(label, "=>", JSON.stringify(r.rows ?? r.affectedRows), "affected:", r.affectedRows ?? "");
  } catch(e){ console.log(label, "=> ERROR:", e.message); }
}
await as("authenticated",A,"insert into public.bebe_conversations(id,title) values ('11111111-1111-1111-1111-111111111111','A secret chat')","A creates conv");
await as("authenticated",A,"insert into public.bebe_messages(conversation_id,role,content) values ('11111111-1111-1111-1111-111111111111','user','A private msg')","A adds msg");
await as("authenticated",B,"select count(*) from public.bebe_conversations","B reads conversations");
await as("authenticated",B,"select count(*) from public.bebe_messages","B reads messages");
await as("authenticated",B,"update public.bebe_conversations set title='hacked' where id='11111111-1111-1111-1111-111111111111'","B updates A conv");
await as("authenticated",B,"delete from public.bebe_messages","B deletes msgs");
await as("authenticated",B,"insert into public.bebe_messages(conversation_id,role,content) values ('11111111-1111-1111-1111-111111111111','user','inject')","B injects msg into A conv");
await as("authenticated",B,"insert into public.bebe_conversations(user_id,title) values ('"+A+"','spoof')","B spoofs user_id=A");
await as("authenticated",B,"select * from public.bebe_usage_counters","B reads usage_counters");
await as("authenticated",B,"select * from public.bebe_add_usage('wrong-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx','day:2026-11-01',1,1)","B calls add_usage w/ wrong token");
await as("anon",null,"select * from public.bebe_server_config","anon reads server_config");
await as("anon",null,"select public.bebe_check_token('x')","anon calls bebe_check_token");
await as("anon",null,"select count(*) from public.bebe_conversations","anon reads conversations");
await as("authenticated",A,"select title from public.bebe_conversations","A reads own convs");
await as("authenticated",A,"select count(*) from public.bebe_messages","A reads own msgs");
await as("anon",null,"select * from public.bebe_add_usage('"+TOK+"','day:2026-11-01',1,120)","server(anon+token) add_usage");
await as("anon",null,"select * from public.bebe_add_usage('"+TOK+"','day:2026-11-01',1,999999)","server add_usage oversized tokens");
await as("anon",null,"select public.bebe_rate_hit('"+TOK+"','ip:x:60:1',60) as hits","server rate_hit");
await as("anon",null,"select public.bebe_record_alert('"+TOK+"','day:2026-11-01','tokens',50,120,200) as new","server record_alert");
await as("anon",null,"select public.bebe_record_alert('"+TOK+"','day:2026-11-01','tokens',50,120,200) as new","server record_alert dup");
