import { notFound } from "next/navigation";
import { z } from "zod";
import { Notes } from "@/components/person/Notes";
import { ObservationInspector } from "@/components/person/ObservationInspector";
import { IdentityInspector } from "@/components/person/IdentityInspector";
import { PersonArchive } from "@/components/person/PersonArchive";
import { MemoryTrail } from "@/components/inspection/MemoryTrail";
import {ProfileRelationships} from '@/components/inspection/ProfileRelationships';
import {AuthorshipRelationships} from '@/components/inspection/AuthorshipRelationships';
import {ConceptRelationships} from '@/components/inspection/ConceptRelationships';
import { requireSession } from "@/lib/auth";
import { loadPerson } from "@/lib/views/person";
import { safeSourceUrl } from "@/lib/inspection/source";
import { readTrail } from "@/lib/trail/runtime";
import { trailQuery, type TrailParams } from "@/lib/trail/params";
import { Archive } from "./archive";
import "@/components/sheet/sheet.css";
import "@/components/person/person.css";

export const metadata={title:"Person · flaneur"};
export const dynamic="force-dynamic";
export default async function PersonPage({params,searchParams}:TrailParams) {
  await requireSession();
  const {id}=await params;
  if(!z.uuid().safeParse(id).success)notFound();
  let query;try{query=trailQuery(await searchParams);}catch{notFound();}
  let view,trail;try{[view,trail]=await Promise.all([loadPerson(id),readTrail("person",id,query)]);}catch{
    return <main className="sheet"><p role="alert">Person inspection is unavailable. Please try again.</p></main>;
  }
  if(!view||!trail)notFound();
  const profileUrl=safeSourceUrl(view.profileUrl);
  return <main className="sheet"><article className="sheet__main">
    <header className="person-head"><h1 className="sheet-name">{view.name}</h1>
      {view.headline&&<p className="sheet-sub">Earlier profile headline (unverified): {view.headline}</p>}
    </header>
    <div className="person-reading">
      <PersonArchive personId={view.id} name={view.name} archivedAt={view.archivedAt?.toISOString()??null}/>
      <h2>Why you noticed them</h2>
      <p className="quiet small">Your notes and the explicit context in your encounters preserve what brought this person into your world.</p>
      <Notes personId={view.id} initial={view.notes} authored={view.authoredNotes} readOnly={view.archivedAt!==null}/>
      <MemoryTrail view={trail} query={query}/>
      <ProfileRelationships kind="person" id={view.id}/>
      <AuthorshipRelationships kind="person" id={view.id}/>
      <ConceptRelationships kind="person" id={view.id}/>
      <h2>Recorded assertions and identity</h2>
      <ObservationInspector personId={view.id}/>
      <IdentityInspector personId={view.id} personName={view.name}/>
      <Archive view={view}/>
      <h2>Source access</h2>
      {profileUrl&&<p><a href={profileUrl} target="_blank" rel="noopener noreferrer">open recorded profile URL</a></p>}
      <p className="quiet small">Inspect an Encounter or saved Artifact above for its original captures and evidence. A profile URL alone does not verify an association.</p>
    </div>
  </article></main>;
}
