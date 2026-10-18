"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
interface NoteRow{id:string;body:string}
function Editor({personId,note,onSaved}:{personId:string;note?:NoteRow;onSaved():void}){
 const [open,setOpen]=useState(!note),[text,setText]=useState(note?.body??""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const pending=useRef<{requestId:string;body:string}|null>(null);
 async function save(){
  if(busy||!text.trim())return;
  pending.current??={requestId:crypto.randomUUID(),body:text};setBusy(true);setMessage("");
  try{
   const body=note?{action:"correct_observation",payload:{requestId:pending.current.requestId,observationId:note.id,bodyText:pending.current.body}}
    :{requestId:pending.current.requestId,personId,body:pending.current.body};
   const response=await fetch(note?"/api/review":"/api/notes",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   if(!response.ok){setMessage(response.status===409?"This note changed. Refresh before revising it.":response.status===401?"Sign in again before saving.":"The note couldn't be saved. Retry uses the same words and decision.");return;}
   pending.current=null;setText("");setOpen(false);onSaved();
  }catch{setMessage("The note couldn't be saved. Retry uses the same words and decision.");}finally{setBusy(false);}
 }
 if(!open)return <button type="button" className="textlink small" onClick={()=>{setText(note?.body??"");setOpen(true);}}>{note?"revise note":"add a note"}</button>;
 return <div className="person-notes">
  <textarea className="person-note person-note__field" aria-label={note?"Revise note":"New note"} rows={4} value={text} maxLength={20000}
   disabled={busy||pending.current!==null} onChange={event=>setText(event.target.value)} />
  <div className="observation-actions">
   <button type="button" className="textlink small" disabled={busy||!text.trim()} onClick={()=>void save()}>{busy?"saving...":pending.current?"retry save":note?"save revision":"save note"}</button>
   <button type="button" className="textlink small" disabled={busy} onClick={()=>{pending.current=null;setOpen(false);setMessage("");}}>cancel</button>
  </div>
  {message&&<p className="quiet small" role="alert">{message}</p>}
 </div>;
}
export function Notes({personId,initial,authored,readOnly=false}:{personId:string;initial:NoteRow[];authored:NoteRow[];readOnly?:boolean}){
 const router=useRouter();
 return <div className="person-notes">
  {initial.map(note=><div id={`legacy-note-${note.id}`} key={"legacy:"+note.id}><p className="quiet small">Earlier note · preserved</p><p className="person-note observation-text">{note.body}</p></div>)}
  {authored.map(note=><div key={note.id}><p className="person-note observation-text">{note.body}</p>{!readOnly&&<Editor personId={personId} note={note} onSaved={()=>router.refresh()} />}</div>)}
  {!readOnly&&<Editor personId={personId} onSaved={()=>router.refresh()} />}
 </div>;
}
