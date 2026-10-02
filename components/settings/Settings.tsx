"use client";

import Link from "next/link";
import { useState } from "react";
import { setPref, usePrefs } from "@/lib/prefs";
import type { SearchHit } from "@/lib/search/types";
import { formatDay } from "@/lib/views/format";
import "./settings.css";

export interface SavedQueryRow {
  id: string;
  text: string;
  lastRunAt: string | null;
}

type Run =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; people: SearchHit[]; isNew: boolean; at: string }
  | { kind: "failed" };

function SavedQuery({ query }: { query: SavedQueryRow }) {
  const [run, setRun] = useState<Run>({ kind: "idle" });

  async function go() {
    setRun({ kind: "running" });
    const response = await fetch(`/api/search/saved/${query.id}/run`, { method: "POST" }).catch(() => null);
    if (!response?.ok) return setRun({ kind: "failed" });
    const body = (await response.json()) as { results: SearchHit[]; new_results: boolean };
    setRun({ kind: "done", people: body.results, isNew: body.new_results, at: new Date().toISOString() });
  }

  const lastRun = run.kind === "done" ? run.at : query.lastRunAt;
  return (
    <li className="settings-query">
      {/* The accent marks a saved query whose results changed: the only accent on this page. */}
      <p className="settings-query__text" data-new={run.kind === "done" && run.isNew ? "" : undefined}>
        {query.text}
      </p>
      <p className="settings-query__meta">
        <span>{lastRun ? `last run ${formatDay(new Date(lastRun))}` : "not run yet"}</span>
        {run.kind === "running" ? (
          <span>thinking...</span>
        ) : (
          <button type="button" className="textlink" onClick={() => void go()}>
            run
          </button>
        )}
      </p>
      {run.kind === "failed" && <p className="settings-query__meta">That didn&apos;t run. Try again.</p>}
      {run.kind === "done" &&
        (run.people.length ? (
          <ul className="settings-query__people">
            {run.people.map((p) => (
              <li key={p.person_id}>
                <Link href={`/person/${p.person_id}`}>{p.name}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-query__meta">Nobody in your city matches this yet.</p>
        ))}
    </li>
  );
}

export function Settings({ saved }: { saved: SavedQueryRow[] }) {
  const prefs = usePrefs();
  return (
    <div className="settings">
      <section className="settings-section">
        <h2 className="sheet-label">sound</h2>
        <button type="button" className="textlink settings-toggle" aria-pressed={prefs.sound} onClick={() => setPref("sound", !prefs.sound)}>
          {prefs.sound ? "on" : "off"}
        </button>
      </section>

      <section className="settings-section">
        <h2 className="sheet-label">motion</h2>
        <button
          type="button"
          className="textlink settings-toggle"
          aria-pressed={prefs.reduceMotion}
          onClick={() => setPref("reduceMotion", !prefs.reduceMotion)}
        >
          {prefs.reduceMotion ? "always reduced" : "as your system sets it"}
        </button>
      </section>

      <section className="settings-section">
        <h2 className="sheet-label">extension</h2>
        <a href="/flaneur-extension.zip" download>
          download extension
        </a>
      </section>

      <section className="settings-section">
        <h2 className="sheet-label">export</h2>
        <a href="/api/export" download>
          export everything as JSON
        </a>
      </section>

      <section className="settings-section">
        <h2 className="sheet-label">saved queries</h2>
        {saved.length ? (
          <ol className="settings-queries">
            {saved.map((q) => (
              <SavedQuery key={q.id} query={q} />
            ))}
          </ol>
        ) : (
          <p className="settings-query__meta">None saved yet.</p>
        )}
      </section>
    </div>
  );
}
