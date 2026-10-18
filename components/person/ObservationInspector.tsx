"use client";
import { useRef, useState } from "react";
import type { InspectedObservation, InspectionPage } from "@/lib/review/inspection";

type Action = "confirm_observation" | "correct_observation" | "reject_observation" | "archive_observation";
const names: Record<Action, string> = { confirm_observation: "confirm", correct_observation: "correct",
  reject_observation: "reject", archive_observation: "archive" };
function ReviewControls({ observation, refresh }: { observation: InspectedObservation; refresh(): Promise<void> }) {
  const [action, setAction] = useState<Action | null>(null), [text, setText] = useState(observation.bodyText);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef<{ action: Action; payload: { requestId: string; observationId: string; bodyText?: string } } | null>(null);
  async function submit() {
    if (!action || busy) return;
    pending.current ??= { action, payload: { requestId: crypto.randomUUID(), observationId: observation.id,
      ...(action === "correct_observation" ? { bodyText: text } : {}) } };
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/review", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      if (!response.ok) {
        setMessage(response.status === 409 ? "This observation changed or needs a different review. Refresh to inspect it."
          : response.status === 401 ? "Sign in again before reviewing."
          : response.status === 400 || response.status === 422 ? "This review couldn’t be accepted. Cancel to revise it."
          : "The review couldn’t be completed. Retry uses the same decision.");
        return;
      }
      pending.current = null; setAction(null); await refresh();
    } catch { setMessage("The review couldn’t be completed. Retry uses the same decision."); }
    finally { setBusy(false); }
  }
  if (observation.identityProof) return <p className="quiet small">Review this association on its captured source.</p>;
  if (observation.relationshipReview) return <p className="quiet small">Review this association in reviewed Concept relationships.</p>;
  if (!observation.active) return null;
  return <div className="observation-controls">
    {!action ? <div className="observation-actions">
      {Object.entries(observation.actions).filter(([, allowed]) => allowed).map(([name]) => {
        const selected = `${name}_observation` as Action;
        return <button className="textlink small" type="button" key={name} onClick={() => { setAction(selected); setMessage(""); setText(observation.bodyText); }}>{name}</button>;
      })}
    </div> : <div className="stack">
      {action === "correct_observation" ? <label className="small">Your revised words
        <textarea value={text} maxLength={20000} disabled={busy || pending.current !== null}
          onChange={event => setText(event.target.value)} rows={5} />
      </label> : <p className="small">{action === "confirm_observation" ? "Record these exact words as your confirmed observation?"
        : action === "reject_observation" ? "Reject this assertion and withdraw dependent generated work?"
        : "Archive this observation from active memory? Its history will remain available."}</p>}
      <div className="observation-actions">
        <button type="button" className="textlink small" disabled={busy || (action === "correct_observation" && !text.trim())}
          onClick={() => void submit()}>{busy ? "saving…" : pending.current ? "retry decision" : names[action]}</button>
        <button type="button" className="textlink small" disabled={busy} onClick={() => { pending.current = null; setAction(null); setMessage(""); }}>cancel</button>
      </div>
      {message && <p className="quiet small" role="alert">{message}</p>}
    </div>}
  </div>;
}
function Observation({ item, refresh }: { item: InspectedObservation; refresh(): Promise<void> }) {
  return <li id={`observation-${item.id}`} className="observation-item">
    <p className="quiet small">{item.layer === "user" ? "Your words / confirmation" : item.layer === "source" ? "Source text"
      : item.layer === "extracted" ? "Extracted from a source" : "Inference"} · {item.active ? "active" : "history"}</p>
    <p className="observation-text">{item.bodyText}</p>
    <p className="quiet small">{item.semanticRole.replaceAll("_", " ")} · stored support: {item.supportStatus.replaceAll("_", " ")}</p>
    <details><summary className="small">sources and decisions</summary>
      <p className="quiet small">Recorded {item.recordedAt}</p>
      {item.supersedesId && <p className="quiet small">Revises observation {item.supersedesId}</p>}
      {!item.evidence.length && <p className="quiet small">No direct source evidence is recorded.</p>}
      {item.evidence.map(evidence => <div key={evidence.id} className="observation-evidence">
        <p className="quiet small">{evidence.role === "contradicts" ? "Contradicting evidence" : "Supporting evidence"}</p>
        {evidence.quote && <blockquote className="observation-text">{evidence.quote}</blockquote>}
        {evidence.quote && <p className="quiet small">{evidence.quoteVerified ? "Exact excerpt checked against stored source text." : "Excerpt location could not be verified."}</p>}
        {!evidence.quote && evidence.excerpt && <p className="observation-text">{evidence.excerpt}</p>}
        {evidence.sourceUrl && <a className="textlink small" href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">open original source</a>}
        {evidence.snapshotId && <p className="quiet small">Stored capture {evidence.snapshotId}</p>}
        {evidence.supportingObservationId && <p className="quiet small">Supporting observation {evidence.supportingObservationId}</p>}
      </div>)}
      {item.reviews.map((review, index) => <p key={index} className="quiet small">{review.decision} · {review.reviewedAt}
        {review.comment && <span className="observation-text"> · {review.comment}</span>}
        {review.replacementId && <span> · replacement {review.replacementId}</span>}
      </p>)}
    </details>
    <ReviewControls observation={item} refresh={refresh} />
  </li>;
}
export function ObservationInspector({ personId }: { personId: string }) {
  const [page, setPage] = useState<InspectionPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const cursor = useRef<string | undefined>(undefined);
  async function load(next?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/person/${personId}/observations${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const data = await response.json() as InspectionPage; cursor.current = next; setPage(data);
    } catch { setError("Observation history couldn’t be loaded. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="person-observations" aria-label="Observation history">
    <h2 className="sheet-label">memory and evidence</h2>
    {!page && <button type="button" className="textlink" disabled={busy} onClick={() => void load()}>{busy ? "loading…" : "inspect observations"}</button>}
    {error && <p className="quiet small" role="alert">{error}</p>}
    {page && <>
      {page.archived && <p className="quiet small">This person is archived. Their observation history is preserved.</p>}
      {!page.observations.length && <p className="quiet small">No observation history is available on this page.</p>}
      <ul className="observation-list">{page.observations.map(item => <Observation key={item.id} item={item} refresh={() => load(cursor.current)} />)}</ul>
      <div className="observation-actions">
        <button type="button" className="textlink small" disabled={busy} onClick={() => void load()}>first page / refresh</button>
        {page.nextCursor && <button type="button" className="textlink small" disabled={busy} onClick={() => void load(page.nextCursor!)}>next observations</button>}
      </div>
    </>}
  </section>;
}
