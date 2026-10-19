import {z} from 'zod';
export const trajectoryUuid=z.uuid().transform(value=>value.toLowerCase());
const text=(max:number)=>z.string().min(1).max(max).refine(v=>!!v.trim()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v));
/** A coarse date is a range of possible days, never an invented precise instant. */
export function trajectoryDateBounds(value:string){
 if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)||+value.slice(0,4)<1)return null;
 const [year,month,day]=value.split('-').map(Number),m=month??1,d=day??1;
 const iso=(y:number,mo:number,da:number)=>`${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`;
 if(m<1||m>12||d<1||d>31)return null;
 const start=iso(year!,m,d),date=new Date(start+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==start)return null;
 const end=day?start:month?iso(year!,m,new Date(Date.UTC(year!<100?year!+400:year!,m,0)).getUTCDate()):iso(year!,12,31);
 return {earliest:start,latest:end,precision:day?'day' as const:month?'month' as const:'year' as const};
}
const date=z.string().refine(v=>!!trajectoryDateBounds(v));
const period=z.object({start:date.nullable(),end:date.nullable(),ongoing:z.boolean()}).strict().refine(v=>
 (!v.ongoing||v.end===null)&&(!v.start||!v.end||trajectoryDateBounds(v.start)!.earliest<=trajectoryDateBounds(v.end)!.latest));
export const trajectoryChronology=z.object({from:period,to:period}).strict();
export type TrajectoryChronology=z.infer<typeof trajectoryChronology>;
export function trajectoryOrder(value?:TrajectoryChronology){
 if(!value)return 'unknown' as const;
 const a=value.from,b=value.to;
 if(a.end&&b.start&&trajectoryDateBounds(a.end)!.latest<trajectoryDateBounds(b.start)!.earliest)return 'ordered' as const;
 if(b.end&&a.start&&trajectoryDateBounds(b.end)!.latest<trajectoryDateBounds(a.start)!.earliest)return 'reversed' as const;
 if(a.start&&a.end&&b.start&&b.end)return 'overlapping_or_uncertain' as const;
 return 'unknown' as const;
}
const endpoint=z.object({id:trajectoryUuid,label:text(300),kind:z.enum(['concept','topic'])}).strict();
const claim={personId:trajectoryUuid,from:endpoint,to:endpoint,reason:text(2000),
 supportingObservationIds:z.array(trajectoryUuid).max(12),chronology:trajectoryChronology.optional()};
const base={requestId:trajectoryUuid,...claim};
export const trajectoryDecision=z.discriminatedUnion('decision',[
 z.object({...base,decision:z.literal('confirm'),candidateId:trajectoryUuid.optional()}).strict(),
 z.object({...base,decision:z.literal('correct'),observationId:trajectoryUuid}).strict(),
 z.object({...base,decision:z.literal('candidate'),chronology:trajectoryChronology,
  supportingObservationIds:z.array(trajectoryUuid).min(2).max(12)}).strict(),
 z.object({requestId:trajectoryUuid,personId:trajectoryUuid,decision:z.enum(['reject','archive']),observationId:trajectoryUuid,reason:text(2000)}).strict(),
]).superRefine((v,ctx)=>{
 if('from' in v){
  if(v.from.id===v.to.id||new Set(v.supportingObservationIds).size!==v.supportingObservationIds.length||trajectoryOrder(v.chronology)==='reversed')
   ctx.addIssue({code:'custom',message:'Invalid directed trajectory or chronology'});
 }
});
export type TrajectoryDecision=z.infer<typeof trajectoryDecision>;
export const trajectoryQueryValue=z.object({from:z.string().trim().min(1).max(300).nullable(),to:z.string().trim().min(1).max(300)}).strict();
export const TRAJECTORY_VERSION='explicit-trajectory-v1';
