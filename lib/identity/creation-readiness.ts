import type postgres from "postgres";
/** Catalog-only check; old installed schemas keep creation disabled until migration 0017 is applied. */
export async function sourceNeutralPeople(sql:postgres.TransactionSql){
 const [column]=await sql`select not attnotnull as nullable from pg_catalog.pg_attribute
   where attrelid='public.person'::regclass and attname='profile_url' and not attisdropped`;
 return column?.nullable===true;
}
