import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { readTrail } from "@/lib/trail/runtime";
import { trailQuery, type TrailParams } from "@/lib/trail/params";
import { MemoryTrail } from "@/components/inspection/MemoryTrail";
import {ConceptRelationships} from '@/components/inspection/ConceptRelationships';
import "@/components/sheet/sheet.css";
import "@/components/sheet/concept.css";

export const metadata = { title: "Concept · flaneur" };
export const dynamic = "force-dynamic";
export default async function ConceptPage({params,searchParams}:TrailParams) {
  await requireSession();
  const {id}=await params;
  if(!z.uuid().safeParse(id).success)notFound();
  let query;try{query=trailQuery(await searchParams);}catch{notFound();}
  let view;try{view=await readTrail("concept",id,query);}catch{
    return <main className="sheet"><p role="alert">Concept inspection is unavailable. Please try again.</p></main>;
  }
  if(!view)notFound();
  return <main className="sheet"><article className="sheet__main">
    <header className="concept-head"><h1 className="concept-title">{view.label}</h1>
      <p className="concept-kind">Stored concept category: {view.conceptKind}</p></header>
    {view.archived&&<p role="note">Archived Concept history. This object is excluded from active retrieval.</p>}
    <MemoryTrail view={view} query={query}/>
    <ConceptRelationships kind="concept" id={id}/>
  </article></main>;
}
