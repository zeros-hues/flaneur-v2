"use client";

import Link from "next/link";
import { useState } from "react";
import { InkLine } from "@/components/ink/InkLine";
import type { WalkAction } from "@/lib/walk/actions";
import type { HelloDraft } from "@/lib/walk/hello";
import type { WalkItem } from "@/lib/walk/select";
import { snippet } from "@/lib/views/format";

const ACTIONS: { action: WalkAction; label: string }[] = [
  { action: "say_hello", label: "say hello" },
  { action: "keep_walking", label: "keep walking" },
  { action: "street_closed", label: "street’s closed" },
  { action: "just_passing", label: "just passing" },
];

/** Records the answer on the item's schedule: the same request the walk has always made. */
async function record(artifactId: string, action: WalkAction): Promise<boolean> {
  const response = await fetch("/api/walk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artifactId, action }),
  }).catch(() => null);
  return !!response?.ok;
}

/** Copies text that is still being written. The write starts inside the click, so Safari allows it. */
function copyWhenReady(text: Promise<string>): Promise<void> {
  try {
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
  } catch {
    return text.then((t) => navigator.clipboard.writeText(t));
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "copied"; blockedUrl: string | null }
  | { kind: "failed" };

interface Props {
  item: WalkItem;
  /** Entrance delay, so the cards arrive one after another. */
  delay: number;
  /**
   * The person answered: the card sets itself aside now, and closes its gap once `saved` confirms.
   * Resolves false when the save failed and the card has come back.
   */
  onAnswered: (action: WalkAction, saved: Promise<boolean>) => Promise<boolean>;
}

export function WalkCard({ item, delay, onAnswered }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // One answer per card: further clicks are ignored while the first is on its way.
  const [locked, setLocked] = useState(false);

  async function answer(action: WalkAction) {
    if (locked) return;
    setLocked(true);
    if (action !== "say_hello" || !item.profileUrl) {
      if (!(await onAnswered(action, record(item.artifactId, action)))) {
        setLocked(false);
        setStatus({ kind: "failed" });
      }
      return;
    }

    setStatus({ kind: "thinking" });
    const saved = record(item.artifactId, action);
    const draft = fetch("/api/walk/hello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifactId: item.artifactId }),
    }).then((r) => (r.ok ? (r.json() as Promise<HelloDraft>) : Promise.reject(new Error(String(r.status)))));
    const copied = copyWhenReady(draft.then((d) => d.draft));
    const [ok] = await Promise.all([saved, copied.catch(() => undefined)]);
    if (!ok) {
      setLocked(false);
      return setStatus({ kind: "failed" });
    }

    // Their profile opens either way; if the browser holds the tab back, the link stays here.
    const url = (await draft.catch(() => null))?.profile_url ?? item.profileUrl;
    const opened = window.open(url, "_blank");
    if (opened) opened.opener = null;
    setStatus({ kind: "copied", blockedUrl: opened ? null : url });
    if (opened) window.setTimeout(() => void onAnswered(action, Promise.resolve(true)), 900);
  }

  const quiet = item.note ? snippet(item.snippet, 120) : null;
  return (
    <article className="walk-card" style={{ animationDelay: `${delay}ms` }}>
      {item.overdue && (
        <InkLine className="walk-card__mark" vertical weight="walkMark" tone="accent" seed={`mark:${item.artifactId}`} delay={delay + 400} duration={600} />
      )}

      {item.note ? (
        <p className="walk-card__note">{item.note}</p>
      ) : (
        item.snippet && <p className="walk-card__post">{item.snippet}</p>
      )}

      <div className="walk-card__who">
        {item.personId ? (
          <Link href={`/person/${item.personId}`} className="walk-card__name">
            {item.author}
          </Link>
        ) : (
          <span className="walk-card__name">{item.author}</span>
        )}
        {(item.headline || (item.type === "connection_request" && item.status)) && (
          <p className="sheet-sub">
            {[item.headline, item.type === "connection_request" ? item.status?.replace(/_/g, " ") : null].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {quiet && <p className="walk-card__snippet">{quiet}</p>}

      {status.kind === "thinking" && <p className="walk-card__status">thinking...</p>}
      {status.kind === "copied" && (
        <p className="walk-card__status">
          copied
          {status.blockedUrl && (
            <>
              {" · "}
              <a href={status.blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => window.setTimeout(() => void onAnswered("say_hello", Promise.resolve(true)), 300)}>
                open their profile ↗
              </a>
            </>
          )}
        </p>
      )}
      {(status.kind === "idle" || status.kind === "failed") && (
        <p className="walk-card__actions">
          {ACTIONS.map(({ action, label }) => (
            <button key={action} type="button" className="textlink" onClick={() => void answer(action)}>
              {label}
            </button>
          ))}
        </p>
      )}
      {status.kind === "failed" && <p className="walk-card__status">That didn&apos;t save. Try again.</p>}
    </article>
  );
}
