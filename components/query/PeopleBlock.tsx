"use client";

import Link from "next/link";
import { useState } from "react";
import type { Coverage, RoutedQuery, SearchHit } from "@/lib/search/types";
import { ms } from "./timing";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function coverageSentence(c: Coverage): string {
  const parts = [`${c.matched} matched among ${plural(c.searched_over, "person", "people")} searched.`];
  if (c.unenriched > 0) parts.push(`${c.unenriched} not yet enriched.`);
  if (c.incomplete_timelines > 0) {
    parts.push(`${c.incomplete_timelines} ${c.incomplete_timelines === 1 ? "has an incomplete timeline" : "have incomplete timelines"}.`);
  }
  return parts.join(" ");
}

export interface SaveTarget {
  text: string;
  routed: RoutedQuery;
}

function SaveSearch({ text, routed }: SaveTarget) {
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");

  async function save() {
    const response = await fetch("/api/search/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, routed_json: routed }),
    }).catch(() => null);
    setSaved(response?.ok ? "saved" : "failed");
  }

  return (
    <p className="q-save">
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

// People arrive together; each synthesis line 80ms after its name.
export function PeopleBlock({ items, coverage, save, at }: { items: SearchHit[]; coverage: Coverage; save: SaveTarget | null; at: number }) {
  return (
    <section className="q-people">
      <ol className="q-people__list">
        {items.map((p) => (
          <li key={p.person_id} className="q-person">
            <div className="q-person__id" style={ms(at)}>
              <Link href={`/person/${p.person_id}`} className="q-person__name">
                {p.name}
              </Link>
              {p.headline && <p className="q-person__headline">{p.headline}</p>}
            </div>
            {p.synthesis && (
              <p className="q-person__synth" data-generated="true" style={ms(at + 80)}>
                {p.synthesis}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="q-people__foot" style={ms(at + 580)}>
        <p>{coverageSentence(coverage)}</p>
        {save && <SaveSearch {...save} />}
      </div>
    </section>
  );
}
