export interface ProfileProof {observationId:string;personId:string;snapshotId:string;encounterId:string;layer:string;originKey:string|null;noticedPeople:string[]}
export interface ProfileEdge {id:string;personId:string;state:string}
export interface ProfileSupport {relationshipId:string;proofId:string;snapshotId:string;personId:string;assertionId:string}
export function eligibleProfileProofs(rows:ProfileProof[]){
 const grouped=new Map<string,ProfileProof[]>();
 for(const row of rows)grouped.set(row.snapshotId,[...(grouped.get(row.snapshotId)??[]),row]);
 return [...grouped.values()].flatMap(group=>group.length===1&&group[0]!.noticedPeople.length===1&&
  group[0]!.noticedPeople[0]===group[0]!.personId?group:[]);
}
export function profileEdgeView(edge:ProfileEdge,proofs:ProfileProof[],supports:ProfileSupport[]){
 const current=eligibleProfileProofs(proofs),people=new Set(current.map(proof=>proof.personId));
 const support=supports.filter(item=>item.relationshipId===edge.id&&item.personId===edge.personId&&
  current.some(proof=>proof.observationId===item.proofId&&proof.snapshotId===item.snapshotId&&proof.personId===edge.personId&&
   proof.layer==='user'&&proof.originKey?.startsWith('identity-confirmation:')));
 return {state:edge.state==='rejected'?'rejected' as const:!support.length?'historical' as const:people.size>1?'conflict' as const:
  edge.state==='active'?'supported' as const:'candidate' as const,
  support:support.map(item=>({...item,encounterId:current.find(proof=>proof.observationId===item.proofId)!.encounterId}))};
}
