import {z} from 'zod';
import type {Constraint,Request} from './evidence';
export const personRelationshipField=(field:string):field is 'authored_by'|'profile_of'=>field==='authored_by'||field==='profile_of';
export const relationshipField=(field:string):field is 'authored_by'|'profile_of'|'associated_with_concept'=>personRelationshipField(field)||field==='associated_with_concept';
export const relationshipName=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en').trim();
const literalMention=(question:string,value:string)=>new RegExp(`(?<![\\p{L}\\p{N}])${relationshipName(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'u').test(relationshipName(question));
export class RelationshipClarification extends Error{
 constructor(public readonly questions:string[]){super('RELATIONSHIP_CLARIFICATION');}
}
/** Names are exact and unique among active canonical people, never fuzzy or provider-resolved. */
export function resolveRelationshipPerson(filter:Constraint,people:{id:string;name:string}[],question?:string){
 const value=filter.value.trim(),explicit=/^person:(.+)$/i.exec(value);
 if(explicit){
  const id=z.uuid().safeParse(explicit[1]);
  if(!id.success||!question||!literalMention(question,value))
   throw new RelationshipClarification(['Include the saved Person identifier explicitly in your question before using it as a relationship filter.']);
  const person=people.find(row=>row.id.toLowerCase()===id.data.toLowerCase());
  if(person)return person;
 }else{
  if(question&&!literalMention(question,value))throw new RelationshipClarification(['Use the intended Person’s saved name explicitly in your question; inferred names and aliases are not accepted.']);
  const matches=people.filter(row=>relationshipName(row.name)===relationshipName(value));
  if(matches.length===1)return matches[0]!;
  if(matches.length>1)throw new RelationshipClarification([`More than one active Person has the saved name “${value}”. Use the intended Person’s explicit person:UUID identifier.`]);
 }
 throw new RelationshipClarification([`No active Person exactly matches “${value}”. Use their full saved name or an explicit person:UUID identifier.`]);
}
export function relationshipScope(request:Request){
 if(request.constraints.some(filter=>personRelationshipField(filter.field))&&request.objectKinds?.some(kind=>kind!=='artifact'))
  throw new RelationshipClarification(['Authorship and profile filters currently return saved Artifacts. Ask for posts or profiles; reverse Person or Encounter queries are not supported yet.']);
 if(request.constraints.some(filter=>filter.field==='associated_with_concept')&&request.objectKinds?.includes('encounter'))
  throw new RelationshipClarification(['Reviewed Concept associations currently return People or Artifacts, not Encounters. Choose the intended object population.']);
}
export function relationshipKinds(request:Request):Request['objectKinds']{
 relationshipScope(request);
 if(request.objectKinds)return request.objectKinds;
 if(request.constraints.some(filter=>personRelationshipField(filter.field)))return ['artifact'];
 if(request.constraints.some(filter=>filter.field==='associated_with_concept'))return ['person','artifact'];
 return undefined;
}
/** Labels are catalogue identities only; no similarity, category guessing or Concept merging. */
export function resolveRelationshipConcept(filter:Constraint,concepts:{id:string;label:string;kind:string}[],question?:string){
 const value=filter.value.trim(),explicit=/^concept:(.+)$/i.exec(value);
 if(explicit){
  const id=z.uuid().safeParse(explicit[1]);
  if(!id.success||!question||!literalMention(question,value))throw new RelationshipClarification(['Include the saved concept:UUID identifier explicitly in your question before using it as a Concept filter.']);
  const concept=concepts.find(row=>row.id.toLowerCase()===id.data.toLowerCase());if(concept)return concept;
 }else{
  if(question&&!literalMention(question,value))throw new RelationshipClarification(['Use the intended Concept’s saved label explicitly in your question; inferred labels and aliases are not accepted.']);
  const matches=concepts.filter(row=>relationshipName(row.label)===relationshipName(value));
  if(matches.length===1)return matches[0]!;
  if(matches.length>1)throw new RelationshipClarification([`More than one active Concept has the label “${value}”. Use the intended Concept’s explicit concept:UUID identifier.`]);
 }
 throw new RelationshipClarification([`No active Concept exactly matches “${value}”. Use its saved label or an explicit concept:UUID identifier.`]);
}
