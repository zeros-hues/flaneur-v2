import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { memoryInspection } from "@/lib/inspection/runtime";
import { inspectionOffset } from "@/lib/inspection/source";
import type { InspectionParams } from "@/lib/inspection/page";
import { SourceIdentityReview } from "@/components/inspection/SourceIdentityReview";
import { SourceAuthorshipReview } from "@/components/inspection/SourceAuthorshipReview";
import { CaptureProgress } from '@/components/inspection/CaptureProgress';
import "@/components/sheet/sheet.css";
import "@/components/inspection/inspection.css";
export const dynamic="force-dynamic";
export const metadata={title:"Captured source — flaneur"};
export default async function SnapshotPage({params,searchParams}:InspectionParams){
 await requireSession();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();const query=await searchParams;
 const offset=query.offset,representation=query.representation;
 try{inspectionOffset(offset);if(representation!==undefined)z.uuid().parse(representation);}catch{notFound();}
 let snapshot;try{snapshot=await memoryInspection.snapshot(id,offset as string|undefined,representation as string|undefined);}catch{
  return <main className="sheet"><p role="alert">Captured source inspection is unavailable. Please try again.</p></main>;}
 if(!snapshot)notFound();
 return <main className="sheet"><article className="sheet__main memory-detail">
  <h1>Captured source</h1><p>Stored capture time: {snapshot.capturedAt}</p>
  <CaptureProgress snapshotId={id}/>
  <p className="quiet small">{snapshot.adapterId==='web'?'Web page':snapshot.captureType} capture · {snapshot.sectionsCovered.length?`Recorded sections: ${snapshot.sectionsCovered.join(", ")}`:"Section coverage was not recorded."} This does not establish complete page coverage or an independently verified historical clock.</p>
  {snapshot.artifactId&&<p><Link href={`/artifact/${snapshot.artifactId}`}>recorded Artifact</Link></p>}
  {snapshot.encounterId&&<p><Link href={`/encounter/${snapshot.encounterId}`}>recorded Encounter</Link></p>}
  {snapshot.sourceUrl&&<p><a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">open original source</a></p>}
  {snapshot.downloadAvailable?<p><a href={`/api/snapshot/${snapshot.id}/download`}>download original stored bytes (.gz)</a></p>:<p>The original capture exceeds this download&apos;s size limit. It remains preserved in notebook storage.</p>}
  <p className="quiet small">Parser: {snapshot.parserVersion}{snapshot.adapterId&&` · adapter: ${snapshot.adapterId}`}</p>
  <p className="quiet small">{snapshot.contentHash?"A content hash was recorded; this view does not establish its historical verification.":"No historical content hash was recorded."}</p>
  <h2>{snapshot.representation?"Exact normalized representation":"Captured markup as plain text"}</h2>
  <p className="quiet small">Source markup is displayed as text and is never executed. Normalized representations are separate immutable inputs used by evidence locators.</p>
  {snapshot.state==="text"?<pre>{snapshot.text}</pre>:<p>The captured markup could not be decoded within the viewer&apos;s limits. The original stored bytes remain available where the download limit allows.</p>}
  {snapshot.nextOffset!==null&&<Link href={`?${new URLSearchParams({offset:String(snapshot.nextOffset),...(snapshot.representation?{representation:snapshot.representation}:{})})}`}>next source section</Link>}
  {snapshot.adapterId!=='web'&&<SourceIdentityReview snapshotId={snapshot.id}/>}
  {snapshot.adapterId!=='web'&&snapshot.captureType==='post'&&<SourceAuthorshipReview snapshotId={snapshot.id}/>}
  <h2>Representations</h2><ul><li><Link href={`/snapshot/${id}`}>captured markup</Link></li>{snapshot.representations.map(item=><li key={item.id}>
   <Link href={`?representation=${item.id}`}>{item.version}</Link></li>)}</ul>
 </article></main>;
}
