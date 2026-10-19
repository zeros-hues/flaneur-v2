import {relationshipName,RelationshipClarification} from './relationship-filters';
import {trajectoryQueryValue} from '../relationships/trajectory';
/** Guard the explicitly supported transition-language grammar; never infer a transition from A+B. */
export function validateTrajectoryIntent(question:string,raw:unknown){
 const normalized=relationshipName(question),verb='(?:moved|transitioned|went|shifted|changed|switched)';
 const directed=new RegExp(`\\b${verb}\\s+from\\s+(.+?)\\s+(?:into|to)\\s+(.+)`,'u').exec(normalized);
 const destination=new RegExp(`\\b${verb}\\s+into\\s+(.+)`,'u').exec(normalized);
 const transitionLanguage=new RegExp(`\\b${verb}\\s+(?:from|into)\\b`,'u').test(normalized);
 if(transitionLanguage&&!raw)throw new RelationshipClarification(['This asks for a transition. Specify a reviewed directed trajectory; separate education or Concept filters cannot establish a move.']);
 if(!raw)return null;
 const value=trajectoryQueryValue.parse(raw);
 // Restrict endpoint identity to its clause. A Concept in a later AND filter is not the destination.
 const endpointSpan=(part:string)=>part.split(/\s+(?:and|who|with|that|while|but)\b|[?,;.!]/u,1)[0]!.trim().replace(/^["“‘']+|["”’']+$/gu,'');
 const equals=(part:string,label:string)=>endpointSpan(part)===relationshipName(label);
 if(/\b(?:not|never|without)\b/u.test(normalized)||
  [...normalized.matchAll(new RegExp(`\\b${verb}\\s+(?:from|into)\\b`,'gu'))].length>1)
  throw new RelationshipClarification(['Ask for one positive directed transition at a time; negation and multi-step paths are unsupported.']);
 if(!transitionLanguage||(!directed&&!destination)||directed&&(!value.from||!equals(directed[1]!,value.from)||!equals(directed[2]!,value.to))||
  !directed&&(!destination||value.from!==null||!equals(destination[1]!,value.to)))
  throw new RelationshipClarification(['Write the intended origin and destination in transition order, using their exact saved labels or explicit concept:UUID identifiers.']);
 return value;
}
