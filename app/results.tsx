"use client";

import Link from "next/link";
import { useState } from "react";
import type { AskSource } from "@/lib/ask";
import type { Coverage, EmptyReason, RoutedQuery, SearchHit } from "@/lib/search/types";
import type { UnifiedResult } from "@/lib/search/unified";
import { formatDay } from "@/lib/views/format";

const EMPTY: Record<EmptyReason, string> = {
  insufficient_data: "Your city is still quiet on this.",
  no_match: "Nobody in your city matches this yet.",
  parse_error: "Try asking that a different way.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function coverageSentence(c: Coverage): string {
  const parts = [`${c.matched} matched among ${plural(c.searched_over, "person", "people")} searched.`];
  if (c.unenriched > 0) parts.push(`${c.unenriched} not yet enriched.`);
  if (c.incomplete_timelines > 0) {
    parts.push(`${c.incomplete_timelines} ${c.incomplete_timelines === 1 ? "has an incomplete timeline" : "have incomplete timelines"}.`);
  }
  return parts.join(" ");
}

const sourceHref = (s: AskSource) => `/person/${s.person_id}${s.artifact_id ? `#post-${s.artifact_id}` : ""}`;

function Answer({ answer, sources, corpusSize }: { answer: string; sources: AskSource[]; corpusSize: number }) {
  return (
    <div className="stack-lg">
      <p className="reading">{answer}</p>
      <div className="archive stack small quiet">
        {sources.length > 0 && (
          <ul className="stack">
            {sources.map((s) => (
              <li key={s.artifact_id ?? `synthesis-${s.person_id}`}>
                <Link href={sourceHref(s)}>
                  {s.person_name} · {s.snippet} · {formatDay(new Date(s.captured_at))}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p>drawn from {plural(corpusSize, "item", "items")} in your city</p>
      </div>
    </div>
  );
}

type SaveState = "idle" | "saved" | "failed";

function SaveSearch({ text, routed }: { text: string; routed: RoutedQuery }) {
  const [saved, setSaved] = useState<SaveState>("idle");

  async function save() {
    const response = await fetch("/api/search/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, routed_json: routed }),
    }).catch(() => null);
    setSaved(response?.ok ? "saved" : "failed");
  }

  return (
    <p>
      {saved === "saved" ? (
        "Saved."
      ) : (
        <button type="button" className="textlink" onClick={save}>
          save this search
        </button>
      )}
      {saved === "failed" && " That didn't save."}
    </p>
  );
}

interface PeopleProps {
  people: SearchHit[];
  coverage: Coverage | null;
  routed: RoutedQuery | null;
  text: string;
}

function People({ people, coverage, routed, text }: PeopleProps) {
  return (
    <div className="stack-lg">
      <ol className="stack">
        {people.map((hit) => (
          <li key={hit.person_id}>
            <Link href={`/person/${hit.person_id}`}>{hit.name}</Link>
            {hit.headline && <p className="quiet small">{hit.headline}</p>}
            {hit.synthesis && <p className="reading quiet small excerpt">{hit.synthesis}</p>}
          </li>
        ))}
      </ol>
      <div className="stack small quiet">
        {coverage && <p>{coverageSentence(coverage)}</p>}
        {routed && <SaveSearch text={text} routed={routed} />}
      </div>
    </div>
  );
}

/** Adapts to what came back: an answer, people, or the answer above the people. */
export function Results({ result, text }: { result: UnifiedResult; text: string }) {
  if (result.empty_reason) return <p className="reading quiet">{EMPTY[result.empty_reason]}</p>;

  const people = result.people?.length ? result.people : null;
  return (
    <div>
      {result.answer && <Answer answer={result.answer} sources={result.sources ?? []} corpusSize={result.corpus_size} />}
      {result.answer && people && <hr className="divider" />}
      {people && <People people={people} coverage={result.coverage} routed={result.routed_json} text={text} />}
    </div>
  );
}
