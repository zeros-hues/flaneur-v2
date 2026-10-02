"use client";

import Link from "next/link";
import { Fragment, useState, type CSSProperties } from "react";
import type { CityNetwork, CityNode } from "@/lib/city/network";
import { domainName } from "@/lib/views/format";
import "./city.css";

type Filter = "all" | "connected" | "stub" | "domain";
const FILTERS: [Filter, string][] = [
  ["all", "all"],
  ["connected", "connected"],
  ["stub", "post only"],
  ["domain", "by domain"],
];

// "connected" keeps people with a profile in focus; "post only" keeps the stubs.
function dimmed(node: CityNode, filter: Filter): boolean {
  if (filter === "connected") return node.state === "stub";
  if (filter === "stub") return node.state !== "stub";
  return false;
}

const groupLabel = (n: CityNode) => (n.domain ? domainName(n.domain) : n.state === "stub" ? "post only" : "no domain yet");

function Person({ node, filter, showDomain }: { node: CityNode; filter: Filter; showDomain: boolean }) {
  return (
    <div className="city-person" data-stub={node.state === "stub" ? "" : undefined} data-dim={dimmed(node, filter) ? "" : undefined}>
      <Link href={`/person/${node.id}`} className="city-person__name">
        {node.name}
      </Link>
      {node.headline && <p className="city-person__headline">{node.headline}</p>}
      {showDomain && node.domain && <p className="city-person__domain">{domainName(node.domain)}</p>}
    </div>
  );
}

export function CityView({ network }: { network: CityNetwork }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { nodes, lines, width, height } = network;

  // Mobile: a plain list, grouped by domain, largest group first.
  const groups = new Map<string, CityNode[]>();
  for (const n of [...nodes].sort((a, b) => a.name.localeCompare(b.name))) {
    groups.set(groupLabel(n), [...(groups.get(groupLabel(n)) ?? []), n]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const curve = ([a, b]: [number, number]) => {
    const p = nodes[a] as CityNode;
    const q = nodes[b] as CityNode;
    const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.06;
    const my = (p.y + q.y) / 2 - (q.x - p.x) * 0.06;
    return `M${p.x} ${p.y} Q${mx.toFixed(1)} ${my.toFixed(1)} ${q.x} ${q.y}`;
  };

  return (
    <main className="city">
      <p className="city-filters" role="group" aria-label="Show">
        {FILTERS.map(([key, label], i) => (
          <Fragment key={key}>
            {i > 0 && (
              <span className="city-filters__dot" aria-hidden="true">
                ·
              </span>
            )}
            <button type="button" className="textlink" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          </Fragment>
        ))}
      </p>

      <div className="city-field" style={{ height }}>
        <svg className="city-lines" data-quiet={filter === "connected" || filter === "stub" ? "" : undefined} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={lines.map(curve).join(" ")} />
        </svg>
        {nodes.map((n) => (
          <div key={n.id} className="city-node" style={{ "--fx": n.x / width, top: n.y } as CSSProperties}>
            {n.state === "complete" && <span className="city-node__ring" data-dim={dimmed(n, filter) ? "" : undefined} aria-hidden="true" />}
            <Person node={n} filter={filter} showDomain={filter === "domain"} />
          </div>
        ))}
      </div>

      <div className="city-list">
        {ordered.map(([label, people]) => (
          <section key={label} className="city-group">
            <h2 className="city-group__label">{label}</h2>
            {people.map((n) => (
              <Person key={n.id} node={n} filter={filter} showDomain={false} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
