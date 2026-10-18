import { z } from "zod";
export type TrailParams={params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
export function trailQuery(raw:Record<string,string|string[]|undefined>) {
  const query:Record<string,string>={};
  for(const key of ["encounters","artifacts","observations"]) {
    if(raw[key]===undefined)continue;
    query[key]=z.uuid().parse(raw[key]).toLowerCase();
  }
  return query;
}
