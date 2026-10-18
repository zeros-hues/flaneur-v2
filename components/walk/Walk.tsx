"use client";
import { useEffect,useRef,useState } from "react";
import type { WalkRead,WalkCardView } from "@/lib/walk/view";
import { mergeWalkView } from "@/lib/walk/view";
import type { WalkEventKind } from "@/lib/walk/sessions";
import { exposureGate } from "@/lib/walk/exposure";
import "./walk.css";

async function read(){const response=await fetch("/api/walk",{cache:"no-store"});if(!response.ok)throw new Error("WALK_READ_FAILED");return response.json() as Promise<WalkRead>;}
export function Walk(){
 const [view,setView]=useState<WalkRead|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [timezone,setTimezone]=useState(""),[context,setContext]=useState("");
 const update=(value:WalkRead)=>setView(previous=>mergeWalkView(previous,value));
 const refresh=async()=>{const value=await read();update(value);setTimezone(value.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone);return value;};
 useEffect(()=>{let alive=true;read().then(value=>{if(alive){setView(value);setTimezone(value.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone);}}).catch(()=>{if(alive)setError("Your Walk could not be loaded. Please try again.");});return()=>{alive=false;};},[]);
 async function start(){setBusy(true);setError("");try{
  const response=await fetch("/api/walk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start",timezone:view?.session?.timezone??timezone,context:view?.session?.context??context})});
  if(!response.ok)throw new Error();update(await response.json());
 }catch{setError("Your Walk could not be started. Please try again.");}finally{setBusy(false);}}
 return <section className="walk" aria-label="Your Walk">
  <h1>A short Walk</h1>
  {error&&<p role="alert">{error} <button className="textlink" onClick={()=>void refresh().then(()=>setError("")).catch(()=>{})}>retry loading</button></p>}
  {!view&&!error&&<p role="status">Loading your Walk...</p>}
  {view&&!view.session&&<form onSubmit={event=>{event.preventDefault();void start();}}>
   <p>Up to three discoveries from your saved trail. The session stays fixed for the day.</p>
   <label>Timezone <input value={timezone} onChange={event=>setTimezone(event.target.value)} readOnly={!!view.timezone} maxLength={100} required /></label>
   <label>What are you working on? (optional)<textarea value={context} onChange={event=>setContext(event.target.value)} maxLength={2000}/></label>
   <button type="submit" disabled={busy||!timezone}>{busy?"Starting...":"Start Walk"}</button>
  </form>}
  {view?.session&&<>
   <p className="walk__date">{view.session.localDay} · {view.session.timezone}</p>
   {view.session.context&&<p className="observation-text">{view.session.context}</p>}
   {view.session.needsResume&&!view.session.completed&&<p>Some stops are no longer available. <button className="textlink" disabled={busy} onClick={()=>void start()}>{busy?"Resuming...":"Resume Walk"}</button></p>}
   {view.session.completed?<p className="walk-ending">That is today&apos;s Walk.</p>:<ol className="walk__cards">{view.session.stops.map(stop=>
    <li className="walk-slot" key={stop.id}><div className="walk-slot__inner"><Stop stop={stop} sessionId={view.session!.id} update={update} refresh={refresh}/></div></li>)}</ol>}
  </>}
 </section>;
}
function Stop({stop,sessionId,update,refresh}:{stop:WalkCardView;sessionId:string;update(value:WalkRead):void;refresh():Promise<WalkRead>}){
 const header=useRef<HTMLDivElement>(null),pending=useRef<{kind:WalkEventKind;eventId:string}|null>(null),active=useRef(false);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[observed,setObserved]=useState(false);
 const sendRef=useRef<(kind:WalkEventKind)=>Promise<boolean>>(async()=>false);
 async function send(kind:WalkEventKind){
  if(active.current)return false;
  if(pending.current&&pending.current.kind!==kind)return false;
  pending.current??={kind,eventId:crypto.randomUUID()};active.current=true;setBusy(true);setError("");
  try{
   const response=await fetch("/api/walk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"event",sessionId,stopId:stop.id,...pending.current})});
   if(!response.ok){if(response.status===409){await refresh();pending.current=null;}throw new Error();}
   update(await response.json());pending.current=null;return true;
  }catch{setError("This action could not be saved. Retry before choosing another action.");return false;}
  finally{active.current=false;setBusy(false);}
 }
 sendRef.current=send;
 useEffect(()=>{
  if(stop.shown||!header.current||typeof IntersectionObserver==="undefined")return;
  const gate=exposureGate({visible:()=>document.visibilityState==="visible",schedule:(work,ms)=>window.setTimeout(work,ms),cancel:id=>window.clearTimeout(id as number),notify:()=>{setObserved(true);void sendRef.current("shown");}});
  const observer=new IntersectionObserver(entries=>gate.intersection(entries[0]?.intersectionRatio??0),{threshold:[0,0.5,1]});
  observer.observe(header.current);const visibility=()=>gate.visibilityChanged();document.addEventListener("visibilitychange",visibility);
  return()=>{gate.dispose();observer.disconnect();document.removeEventListener("visibilitychange",visibility);};
 },[stop.shown]);
 const ready=stop.shown&&!busy&&!pending.current;
 return <article className="walk-card" tabIndex={0}>
  <div ref={header}><h2>{stop.label}</h2><p className="observation-text">{Array.from(stop.evidence[0]?.text??"").slice(0,200).join("")}</p></div>
  {stop.reasons.length>0&&<p className="quiet small">Selected at the start: {stop.reasons.join(" · ")}</p>}
  {stop.evidence.map(item=><div key={item.id}><p className="quiet small">{item.layer==="user"?"Your saved words":item.layer==="source"?"Source text":item.layer==="inferred"?"Inference":"Extracted text"}{!item.verified&&" · support unverified"}</p><p className="observation-text">{item.text}</p></div>)}
  <p className="walk-card__actions">
   {stop.href&&<button className="textlink" disabled={!ready} onClick={()=>void send("opened").then(ok=>{if(ok)window.location.assign(stop.href!);})}>open memory</button>}
   {(["useful","kept","reduced","passed"] as const).map(kind=><button key={kind} className="textlink" disabled={!ready} onClick={()=>void send(kind)}>{({useful:"useful",kept:"keep",reduced:"show less",passed:"continue"})[kind]}</button>)}
  </p>
  {!stop.shown&&!error&&<p className="quiet small">{observed?"Saving this appearance...":"Actions become available when this stop has been visible."}</p>}
  {error&&<p role="alert">{error} <button className="textlink" disabled={busy} onClick={()=>{const kind=pending.current?.kind;if(kind)void send(kind);else void refresh();}}>retry</button></p>}
 </article>;
}
