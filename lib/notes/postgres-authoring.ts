import type postgres from "postgres";
import type { UserNoteStore } from "./authoring";
import { withDependencyTransaction,invalidateDependencies } from "../processing/postgres-dependencies";

export function postgresUserNoteStore(connection:ReturnType<typeof postgres>):UserNoteStore{
  return {transaction(personId,work){
    return withDependencyTransaction(connection,async()=>[],[`enrich:object:${personId}`,`index:object:${personId}`],async(sql,context)=>work({
      async existing(id){
        const [row]=await sql`select id,subject_id as "personId",body_text as body,origin_key as "originKey",truth_layer,semantic_role
          from public.observation where id=${id}`;
        if(!row)return null;
        if(row.truth_layer!=='user'||row.semantic_role!=='note')throw new Error("NOTE_REQUEST_CONFLICT");
        return {id:row.id as string,personId:row.personId as string,body:row.body as string,originKey:row.originKey as string};
      },
      async available(id){
        const rows=await sql`select id from public.object_ref r where id=${id} and kind='person' and archived_at is null
          and not exists(select 1 from public.object_alias a where a.former_object_id=r.id) for share of r`;
        return rows.length===1;
      },
      async insert(note){
        await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status,origin_key)
          values(${note.id},${note.personId},'user','note',${note.body},'verified',${note.originKey})`;
      },
      async invalidate(id){await invalidateDependencies(sql,context,id);},
    }));
  }};
}
