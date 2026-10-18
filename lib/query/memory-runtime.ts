import "server-only";
import { sql } from "@/lib/db";
import { generateText } from "@/lib/enrich/groq";
import { postgresRetrievalReader } from "../retrieval/postgres-reader";
import { memoryQuery } from "./memory";
import { memoryLabelsInTransaction } from "./postgres-labels";
/** Planner receives query/reference only. Stored evidence is displayed locally, not sent for synthesis. */
export async function runMemoryQuery(question:string){
  const block=await memoryQuery(question,new Date().toISOString(),{
    planner:{plan:generateText},reader:postgresRetrievalReader(sql),
    async labels(ids){
      if(!ids.length)return [];
      const result=await sql.begin("isolation level read committed read only",async tx=>{
        await tx`set local statement_timeout = '10s'`;
        return {rows:await memoryLabelsInTransaction(tx,ids)};
      });return result.rows;
    },
  });return {blocks:[block],routed_json:null};
}
