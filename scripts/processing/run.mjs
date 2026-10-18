import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { databaseUrl,safeFailure } from "../phase0/environment.mjs";

// No environment load, connection or job claim without the explicit --run argument.
const args=process.argv.slice(2);
let connection;
const shutdown=new AbortController(),stop=()=>shutdown.abort();
try {
  if(!args.length || (args.length===1 && args[0]==="--check")) {
    console.log(JSON.stringify({status:"parse_worker_prepared",worker_started:false,
      command:"npm run worker:parse -- --run",max_jobs:5,max_runtime_ms:30_000,
      connection_setting:"DATABASE_URL",providers_enabled:false}));
  } else {
    if(args[0]!=="--run" || args.length>2 || (args[1] && !/^--max-jobs=\d+$/.test(args[1])))
      throw Object.assign(new Error("INVALID_WORKER_OPTIONS"),{code:"INVALID_WORKER_OPTIONS"});
    const outfile=resolve("node_modules/.cache/flaneur/parse-worker.mjs");
    await build({entryPoints:["scripts/processing/runtime.ts"],outfile,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent"});
    const { runParseBatch,validateBatchOptions }=await import(pathToFileURL(outfile).href);
    const options={maxJobs:args[1]?Number(args[1].slice("--max-jobs=".length)):5,maxRuntimeMs:30_000,leaseDurationMs:120_000,signal:shutdown.signal};
    validateBatchOptions(options);
    process.once("SIGINT",stop);process.once("SIGTERM",stop);
    connection=postgres(databaseUrl("DATABASE_URL"),{max:2,connect_timeout:15,idle_timeout:5,onnotice:()=>{}});
    const report=await runParseBatch(connection,options);
    console.log(JSON.stringify({status:"parse_worker_finished",...report,providers_enabled:false}));
  }
}catch(error){safeFailure(error);process.exitCode=1;}
finally {
  process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);
  try {await connection?.end({timeout:5});} catch {console.error(JSON.stringify({status:"failed",code:"WORKER_CLOSE_FAILED"}));process.exitCode=1;}
}
