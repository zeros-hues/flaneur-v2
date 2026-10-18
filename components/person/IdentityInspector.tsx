"use client";
import { useRef, useState } from "react";
import type { IdentityInspection, IdentityInspectionPage } from "@/lib/identity/inspection";

export function IdentityDecision({ capture, personId, personName, refresh }: {
  capture: IdentityInspection; personId: string; personName: string; refresh(): Promise<void>;
}) {
  const [decision, setDecision] = useState<"confirm_identity" | "reject_identity" | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef<{ action: string; payload: { requestId: string; snapshotId: string; personId?: string; observationId?: string } } | null>(null);
  async function submit() {
    if (!decision || busy) return;
    pending.current ??= { action: decision, payload: { requestId: crypto.randomUUID(), snapshotId: capture.snapshotId,
      ...(decision === "confirm_identity" ? { personId } : { observationId: capture.proof!.id }) } };
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/review", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      if (!response.ok) {
        setMessage(response.status === 409 ? "This association changed or conflicts with another person. Refresh before deciding."
          : response.status === 401 ? "Sign in again before reviewing." : response.status === 400 || response.status === 422
          ? "This identity decision couldn’t be accepted. Cancel and inspect the capture again."
          : "The decision couldn’t be completed. Retry uses the same decision.");
        return;
      }
      pending.current = null; setDecision(null); await refresh();
    } catch { setMessage("The decision couldn’t be completed. Retry uses the same decision."); }
    finally { setBusy(false); }
  }
  if (!capture.actions.confirm && !capture.actions.reject) return null;
  return <div className="observation-controls">
    {!decision ? <div className="observation-actions">
      {capture.actions.confirm && <button type="button" className="textlink small" onClick={() => setDecision("confirm_identity")}>confirm person association</button>}
      {capture.actions.reject && <button type="button" className="textlink small" onClick={() => setDecision("reject_identity")}>reject association</button>}
    </div> : <div>
      <p className="small">{decision === "confirm_identity" ? `Confirm that this captured profile belongs to ${personName}?`
        : `Reject this capture’s current association with ${personName}? Its history will remain; dependent generated work will be withdrawn.`}</p>
      <div className="observation-actions">
        <button type="button" className="textlink small" disabled={busy} onClick={() => void submit()}>
          {busy ? "saving…" : pending.current ? "retry decision" : decision === "confirm_identity" ? "confirm identity" : "reject identity"}
        </button>
        <button type="button" className="textlink small" disabled={busy} onClick={() => { pending.current = null; setDecision(null); setMessage(""); }}>cancel</button>
      </div>
      {message && <p className="quiet small" role="alert">{message}</p>}
    </div>}
  </div>;
}
export function IdentityInspector({ personId, personName }: { personId: string; personName: string }) {
  const [page, setPage] = useState<IdentityInspectionPage | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const cursor = useRef<string | undefined>(undefined);
  async function load(next?: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/person/${personId}/identities${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const data = await response.json() as IdentityInspectionPage; cursor.current = next; setPage(data);
    } catch { setMessage("Captured profile associations couldn’t be loaded. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="person-observations" aria-label="Captured profile identity">
    <h2 className="sheet-label">captured profile identity</h2>
    {!page && <button type="button" className="textlink" disabled={busy} onClick={() => void load()}>{busy ? "loading…" : "inspect person associations"}</button>}
    {message && <p className="quiet small" role="alert">{message}</p>}
    {page && <>
      {!page.captures.length && <p className="quiet small">No captured profile associations are available on this page.</p>}
      <ul className="observation-list">{page.captures.map(capture => <li key={capture.snapshotId} className="observation-item">
        <p className="quiet small">Captured {capture.capturedAt}</p>
        {capture.sourceUrl && <a className="textlink small" href={capture.sourceUrl} target="_blank" rel="noopener noreferrer">open original source</a>}
        <p className="quiet small">{capture.state === "associated" ? "A current identity assertion is recorded."
          : capture.state === "conflict" ? "This capture has conflicting person associations. It cannot be confirmed here."
          : capture.state === "unsupported" ? "This capture cannot be reviewed as a supported profile identity."
          : capture.state === "unavailable" ? "This capture or its source is inactive or unavailable for a new association." : "No current identity assertion is recorded."}</p>
        {capture.proof && <><p className="quiet small">{capture.proof.layer === "user" ? "User confirmation" : capture.proof.layer === "source" ? "Source identity assertion" : "Extracted identity assertion"}</p>
          {capture.proof.personId !== personId && <p className="quiet small">The current assertion is for another person.</p>}
          <p className="observation-text">{capture.proof.bodyText}</p></>}
        <IdentityDecision capture={capture} personId={personId} personName={personName} refresh={() => load(cursor.current)} />
      </li>)}</ul>
      <div className="observation-actions">
        <button type="button" className="textlink small" disabled={busy} onClick={() => void load()}>first page / refresh</button>
        {page.nextCursor && <button type="button" className="textlink small" disabled={busy} onClick={() => void load(page.nextCursor!)}>next captures</button>}
      </div>
    </>}
  </section>;
}
