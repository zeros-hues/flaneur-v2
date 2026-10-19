import type {TrajectoryChronology as Chronology} from '@/lib/relationships/trajectory';
export function TrajectoryChronology({value,order}:{value?:Chronology;order:string}){
 return <div className="quiet small"><p>{order==='ordered'?'Recorded periods establish A before B; dates alone do not establish a move.':order==='overlapping_or_uncertain'?'Periods overlap or their precision cannot establish order.':'Temporal order is unknown; the transition date is not established.'}</p>
  {value&&(['from','to'] as const).map(side=><p key={side}>{side==='from'?'Origin period':'Destination period'}: {value[side].start??'start unknown'} → {value[side].ongoing?'open-ended':value[side].end??'end unknown'}. Precision is as recorded.</p>)}
 </div>;
}
