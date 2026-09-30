"use client";

import Link from "next/link";
import { useState } from "react";
import type { WalkAction } from "@/lib/walk/actions";
import type { WalkItem } from "@/lib/walk/select";

const ACTIONS: { action: WalkAction; label: string }[] = [
  { action: "say_hello", label: "say hello" },
  { action: "keep_walking", label: "keep walking" },
  { action: "street_closed", label: "street's closed" },
  { action: "just_passing", label: "just passing" },
];

const mailto = (item: WalkItem) =>
  `mailto:?subject=${encodeURIComponent(`Following up — ${item.author}`)}&body=${encodeURIComponent(item.note ?? "")}`;

function Card({ item, onAnswered }: { item: WalkItem; onAnswered: () => void }) {
  const [failed, setFailed] = useState(false);

  async function answer(action: WalkAction) {
    const response = await fetch("/api/walk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifactId: item.artifactId, action }),
    }).catch(() => null);
    if (response?.ok) onAnswered();
    else setFailed(true);
  }

  return (
    <li className={item.overdue ? "walk-card walk-card--overdue" : "walk-card"}>
      {item.note && <p className="reading">{item.note}</p>}
      <div className="archive">
        <p>
          {item.personId ? <Link href={`/person/${item.personId}`}>{item.author}</Link> : item.author}
          {item.type === "connection_request" && item.status && <span className="quiet small"> · {item.status.replace(/_/g, " ")}</span>}
        </p>
        {item.headline && <p className="quiet small">{item.headline}</p>}
        {item.snippet && <p className="quiet">{item.snippet}</p>}
      </div>
      <p className="walk-actions archive">
        {ACTIONS.map(({ action, label }, i) => (
          <span key={action}>
            {i > 0 && <span className="quiet" aria-hidden="true">· </span>}
            {action === "say_hello" ? (
              // The mail client opens via the link; the schedule update runs alongside it.
              <a href={mailto(item)} onClick={() => void answer(action)}>
                {label}
              </a>
            ) : (
              <button type="button" className="textlink" onClick={() => void answer(action)}>
                {label}
              </button>
            )}
          </span>
        ))}
      </p>
      {failed && <p className="quiet small archive">That didn't save. Try again.</p>}
    </li>
  );
}

export function Walk({ items }: { items: WalkItem[] }) {
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const remaining = items.filter((i) => !answered.has(i.artifactId));

  if (!remaining.length) return <p className="ending">That's today's walk.</p>;
  return (
    <ol className="stack-lg">
      {remaining.map((item) => (
        <Card
          key={item.artifactId}
          item={item}
          onAnswered={() => setAnswered((prev) => new Set(prev).add(item.artifactId))}
        />
      ))}
    </ol>
  );
}
