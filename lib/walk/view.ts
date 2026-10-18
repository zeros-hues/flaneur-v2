import type { ContextualCandidate } from "./contextual";
import type { StoredWalkSession } from "./sessions";
import type { Evidence } from "../retrieval/evidence";
import { memoryEvidenceExcerpt } from "../query/memory";
export interface WalkCardView {id:string;objectId:string;kind:"person"|"artifact";label:string;href:string|null;shown:boolean;reasons:string[];evidence:Evidence[]}
export interface WalkRead {timezone:string|null;session:null|{id:string;localDay:string;timezone:string;context:string|null;completed:boolean;needsResume:boolean;stops:WalkCardView[]}}
/** Concurrent acknowledgements cannot reintroduce resolved stops or undo shown/completion. */
export function mergeWalkView(previous:WalkRead|null,next:WalkRead):WalkRead{
 if(!previous?.session||previous.session.id!==next.session?.id)return next;
 if(previous.session.completed)return previous;
 const before=new Map(previous.session.stops.map(stop=>[stop.id,stop]));
 return {...next,session:{...next.session!,stops:next.session!.stops.filter(stop=>previous.session!.needsResume||before.has(stop.id))
   .map(stop=>({...stop,shown:stop.shown||!!before.get(stop.id)?.shown}))}};
}
export function presentWalk(session:StoredWalkSession,candidates:ContextualCandidate[],shown:Set<string>):WalkRead{
 const byId=new Map(candidates.map(item=>[item.id,item]));
 const stops=session.stops.flatMap(stop=>{
  if(stop.resolution)return [];
  const current=byId.get(stop.objectId);if(!current)return [];
  const evidence=current.evidence.filter(item=>item.text.trim()&&!item.provenance?.encounterId);
  if(!evidence.length)return [];
  const support=new Set(current.evidence.map(item=>item.id));
  const reasons=stop.selectionSupport.some(item=>support.has(item.id))?stop.selectionReasons.map(reason=>reason.text):[];
  const href=`/${current.kind}/${current.id}`;
  return [{id:stop.id,objectId:current.id,kind:current.kind,label:current.label,href,shown:shown.has(stop.id),reasons,
    evidence:evidence.slice(0,2).map(item=>memoryEvidenceExcerpt(item,[session.context??""],600))}];
 });
 return {timezone:session.timezone,session:{id:session.id,localDay:session.localDay,timezone:session.timezone,context:session.context,
  completed:!!session.completedAt,needsResume:session.stops.filter(stop=>!stop.resolution).length>stops.length,stops}};
}
