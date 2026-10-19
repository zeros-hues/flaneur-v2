import type { Evidence } from "../retrieval/evidence";
import { evidenceSlice } from "../retrieval/evidence";
import { plannedQuery } from "../retrieval/planned-query";
import type { PlannerProvider } from "../retrieval/planner";
import type { RetrievalReader } from "../retrieval/pipeline";
export interface MemoryItem{
  id:string;
  kind:"person"|"artifact"|"encounter";
  label:string;
  uncertain:boolean;
  evidence:Evidence[];
  retrievalReason?: import("../retrieval/semantic-types").RetrievalReason;
  patternSignals?: import("../retrieval/pattern-types").PatternSupportItem[];
}
export interface MemoryBlock{
  type:"memory";mode:"recall"|"resurface"|"reflect"|null;interpretation:string;
  state:"matches"|"no_match"|"clarification"|"unavailable"|"insufficient_population";
  questions:string[];items:MemoryItem[];matchedTotal:number;uncertainTotal:number;evaluated:number;
  patterns?: import("../retrieval/pattern-types").DiscoveredPattern[];
}
export interface MemoryDependencies{
  planner:PlannerProvider;reader:RetrievalReader;
  labels(ids:string[]):Promise<{id:string;kind:MemoryItem["kind"];label:string}[]>;
}
/** Evidence result composition. No generated assertions or substituted legacy answer. */
function excerptStart(text:string,terms:string[]){
  const hits=terms.filter(Boolean).map(term=>new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"iu").exec(text)?.index)
    .filter((index):index is number=>index!==undefined);
  const point=hits.length?Array.from(text.slice(0,Math.min(...hits))).length:0;
  return Math.max(0,point-120);
}
export function memoryExcerpt(text:string,terms:string[]){
  const start=excerptStart(text,terms);
  return Array.from(text).slice(start,start+2000).join("");
}
export function memoryEvidenceExcerpt(item:Evidence,terms:string[],limit=2000){
  const start=excerptStart(item.text,terms);
  return evidenceSlice(item,start,start+limit);
}
export async function memoryQuery(question:string,referenceInstant:string,deps:MemoryDependencies){
  const outcome=await plannedQuery(question,referenceInstant,deps);
  const base:MemoryBlock={type:"memory",mode:null,interpretation:"",state:"unavailable",questions:[],items:[],matchedTotal:0,uncertainTotal:0,evaluated:0};
  if(outcome.plan.state==="clarification")return {...base,state:"clarification" as const,interpretation:outcome.plan.interpretation,questions:outcome.plan.ambiguities};
  if(outcome.plan.state!=="planned"||!outcome.result)return base;
  const {plan,result}=outcome,ranked=[...result.matches.map(match=>({match,uncertain:false})),...result.uncertain.slice(0,4).map(match=>({match,uncertain:true}))];
  let labels:Awaited<ReturnType<MemoryDependencies["labels"]>>;
  try{labels=await deps.labels(ranked.map(item=>item.match.candidate.id));}catch{return base;}
  const byId=new Map(labels.map(label=>[label.id,label]));
  const items:MemoryItem[]=ranked.flatMap(({match,uncertain})=>{
    const label=byId.get(match.candidate.id);if(!label)return [];
    const supported=match.evidenceIds.map(id=>match.candidate.evidence.find(e=>e.id===id)!);
    const supportIds=new Set(supported.flatMap(e=>e.provenance?.trajectory?.supportingObservationIds??[]));
    for(const e of match.candidate.evidence)if(e.provenance?.observationId&&supportIds.has(e.provenance.observationId)&&!supported.some(v=>v.id===e.id))supported.push(e);
    const evidence=[...supported.filter(e=>e.provenance?.relationship||e.provenance?.trajectory),...supported.filter(e=>!e.provenance?.relationship&&!e.provenance?.trajectory).slice(0,6)]
      .map(e=>memoryEvidenceExcerpt(e,[...plan.request.terms,...plan.request.constraints.map(c=>c.value)]));
    return [{
      ...label,
      uncertain,
      evidence,
      ...(match.candidate.retrievalReason?{retrievalReason:match.candidate.retrievalReason}:{}),
      ...(match.candidate.patternSupport?{patternSignals:match.candidate.patternSupport}:{}),
    }];
  });
  const patterns = (result as any).patterns as import("../retrieval/pattern-types").DiscoveredPattern[] | undefined;
  return {...base,mode:plan.request.mode,interpretation:plan.interpretation,items,evaluated:result.evaluated,
    matchedTotal:result.matchedTotal,uncertainTotal:result.uncertainTotal,
    ...(patterns?{patterns}:{}),
    state:result.state==="insufficient_population"?"insufficient_population" as const:(items.length||(patterns&&patterns.length))?"matches" as const:"no_match" as const};
}
