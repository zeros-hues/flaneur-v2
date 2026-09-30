"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type { Coverage, EmptyReason, SearchResult } from "@/lib/search/types";

const EMPTY: Record<EmptyReason, string> = {
  no_match: "No one matched.",
  insufficient_data: "Not enough people have been enriched to answer this yet.",
  parse_error: "That couldn't be understood. Try saying it another way.",
};

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function coverageSentence(c: Coverage): string {
  const parts = [`${c.matched} matched among ${people(c.searched_over)} searched.`];
  if (c.unenriched > 0) parts.push(`${c.unenriched} not yet enriched.`);
  if (c.incomplete_timelines > 0) {
    parts.push(`${c.incomplete_timelines} ${c.incomplete_timelines === 1 ? "has an incomplete timeline" : "have incomplete timelines"}.`);
  }
  return parts.join(" ");
}

type SaveState = "idle" | "saved" | "failed";

export function Search() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<SaveState>("idle");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    startTransition(async () => {
      setSaved("idle");
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: text }),
        });
        if (!response.ok) throw new Error(String(response.status));
        setResult((await response.json()) as SearchResult);
        setFailed(false);
      } catch {
        setResult(null);
        setFailed(true);
      }
    });
  }

  async function save() {
    if (!result?.routed_json) return;
    const response = await fetch("/api/search/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: query.trim(), routed_json: result.routed_json }),
    }).catch(() => null);
    setSaved(response?.ok ? "saved" : "failed");
  }

  return (
    <div className="stack-lg">
      <form onSubmit={submit} role="search">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="who or what are you looking for"
          aria-label="Search"
          aria-busy={pending}
          autoFocus
        />
      </form>

      {failed && <p className="quiet">The search didn't go through. Try again.</p>}

      {result && (
        <div className="stack-lg" aria-live="polite">
          <div className="stack small quiet">
            {result.interpretation && <p>{result.interpretation}</p>}
            <p>{coverageSentence(result.coverage)}</p>
          </div>

          {result.empty_reason ? (
            <p>{EMPTY[result.empty_reason]}</p>
          ) : (
            <ol className="stack">
              {result.results.map((hit) => (
                <li key={hit.person_id}>
                  <Link href={`/person/${hit.person_id}`}>{hit.name}</Link>
                  {hit.headline && <p className="quiet small">{hit.headline}</p>}
                  {hit.synthesis && <p className="reading quiet small excerpt">{hit.synthesis}</p>}
                </li>
              ))}
            </ol>
          )}

          {result.results.length > 0 && (
            <p className="small quiet">
              {saved === "saved" ? (
                "Saved."
              ) : (
                <button type="button" className="textlink" onClick={save}>
                  save this search
                </button>
              )}
              {saved === "failed" && " That didn't save."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
