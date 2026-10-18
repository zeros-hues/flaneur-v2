import { createHash } from "node:crypto";
import type { CaptureV2 } from "./v2-contract";

export const SOURCE_RESOLUTION_VERSION="capture-source-v1";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const postUrn=(value:string|null)=>value&&/^urn:li:(activity|ugcPost|share):\d+$/.test(value)?value:null;
export interface CaptureSourcePlan {
 type:"profile_page"|"social_post";sourceUrl:string;identityKind:string;externalKey:string;migrationKey:string;
 basis:"exact_profile_url"|"post_urn"|"snapshot_only";reason:string|null;
}
/** This identifies a recorded source document, never its owner/author or a Person. */
export function captureSourcePlan(body:CaptureV2,snapshotId:string):CaptureSourcePlan {
 const url=new URL(body.sourceUrl);
 let sourceUrl=body.sourceUrl,identityKind="artifact_snapshot_v1",externalKey=snapshotId,basis:CaptureSourcePlan["basis"]="snapshot_only",reason:string|null="stable_source_unavailable";
 if(body.kind==="profile_page"&&/^\/in\/[^/]+(?:\/|$)/.test(url.pathname)){
  // Hash keeps long exact URLs within PostgreSQL's index-key bound; canonical_url retains the full value.
  identityKind="artifact_profile_url_sha256_v1";externalKey=hash(body.sourceUrl);basis="exact_profile_url";reason=null;
 }else if(body.kind==="social_post"){
  const supplied=postUrn(body.urn),urlMatch=/^\/feed\/update\/(urn:li:(?:activity|ugcPost|share):\d+)\/?$/.exec(url.pathname),fromUrl=urlMatch?.[1]??null;
  if(body.urn!==null&&!supplied)reason="unsupported_post_identifier";
  else if(supplied&&fromUrl&&supplied!==fromUrl)reason="conflicting_post_identifiers";
  else if(supplied||fromUrl){
   const urn=supplied??fromUrl!;sourceUrl=`https://www.linkedin.com/feed/update/${urn}/`;
   identityKind="artifact_post_urn_sha256_v1";externalKey=hash(urn);basis="post_urn";reason=null;
  }
 }
 return {type:body.kind,sourceUrl,identityKind,externalKey,basis,reason,
  migrationKey:`${SOURCE_RESOLUTION_VERSION}:${hash(JSON.stringify([body.adapterId,identityKind,externalKey]))}`};
}
