import postgres from 'postgres';
import {databaseUrl,safeFailure} from '../phase0/environment.mjs';
// Read-only aggregate diagnostics. Never print backend identities, query text, hosts or credentials.
let client;
try{
 client=postgres(databaseUrl('DIRECT_URL'),{max:1,connect_timeout:15,idle_timeout:5,onnotice:()=>{}});
 const result=await client.begin('isolation level read committed read only',async sql=>{
  await sql`set local statement_timeout='10s'`;
  const [row]=await sql`select count(*) filter(where l.granted)::int as holders,
   count(*) filter(where not l.granted)::int as waiters,
   count(*) filter(where l.granted and a.state='idle in transaction')::int as idle_transaction_holders,
   coalesce(max(extract(epoch from clock_timestamp()-a.xact_start)) filter(where l.granted),0)::int as oldest_transaction_seconds
   from pg_catalog.pg_locks l left join pg_catalog.pg_stat_activity a on a.pid=l.pid
   where l.locktype='advisory' and l.classid=1790703955 and l.objid=1 and l.objsubid=2`;
  return row;
 });console.log(JSON.stringify({status:'memory_graph_lock_status',...result}));
}catch(error){safeFailure(error);process.exitCode=1;}
finally{await client?.end({timeout:2});}
