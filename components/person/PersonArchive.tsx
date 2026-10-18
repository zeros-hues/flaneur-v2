"use client";
import { useRef,useState } from "react";

export function PersonArchive({ personId,name,archivedAt }: {personId:string;name:string;archivedAt:string|null}) {
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const pending=useRef<string|null>(null);
  async function archive() {
    if(busy)return;
    pending.current??=crypto.randomUUID();setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/review",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"archive_person",payload:{requestId:pending.current,personId}})});
      if(response.ok){window.location.reload();return;}
      setMessage(response.status===409?"This person changed or is already archived. Refresh to inspect their history."
        :response.status===401?"Sign in again before archiving.":"Archiving couldn’t be completed. Retry uses the same decision.");
    }catch{setMessage("Archiving couldn’t be completed. Retry uses the same decision.");}
    finally{setBusy(false);}
  }
  if(archivedAt)return <p className="person-caveat">Archived {archivedAt}. Notes, captures and observation history are preserved.</p>;
  return <section className="person-observations" aria-label="Archive person">
    {!confirm?<button className="textlink small" type="button" onClick={()=>setConfirm(true)}>archive person</button>:<>
      <p className="small">Archive {name} from active memory? Their notes, captures and history will remain available.</p>
      <div className="observation-actions">
        <button className="textlink small" type="button" disabled={busy} onClick={()=>void archive()}>{busy?"archiving…":pending.current?"retry archive":"archive person"}</button>
        <button className="textlink small" type="button" disabled={busy} onClick={()=>{pending.current=null;setConfirm(false);setMessage("");}}>cancel</button>
      </div>
      {message&&<p className="quiet small" role="alert">{message}</p>}
    </>}
  </section>;
}
