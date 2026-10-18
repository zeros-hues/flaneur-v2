import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const output=await build({entryPoints:["lib/database-timestamp.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {databaseTimestamp}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
test("native driver Dates and Drizzle zoned strings resolve to the same instant",()=>{
 const date=new Date("2026-10-12T10:00:00.123Z");
 for(const value of [date,"2026-10-12 10:00:00.123+00","2026-10-12T15:30:00.123+05:30"])
  assert.equal(databaseTimestamp(value).toISOString(),date.toISOString());
});
test("invalid and unzoned driver timestamps fail with a stable private error",()=>{
 for(const value of [null,0,"PRIVATE_INVALID",new Date(NaN),"2026-10-12T10:00:00"])
  assert.throws(()=>databaseTimestamp(value),{message:"DATABASE_TIMESTAMP_INVALID"});
});
