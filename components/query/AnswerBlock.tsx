import Link from "next/link";
import type { AskSource } from "@/lib/ask";
import { formatDay } from "@/lib/views/format";
import { ms } from "./timing";

const sourceHref = (s: AskSource) => `/person/${s.person_id}${s.artifact_id ? `#post-${s.artifact_id}` : ""}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// One 400ms reveal, never streamed; sources 300ms after it ends, the footnote 400ms after them.
export function AnswerBlock({ text, sources, drawnFrom, at }: { text: string; sources: AskSource[]; drawnFrom: number; at: number }) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section className="q-answer">
      <div className="q-answer__text" data-generated="true" style={ms(at)}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {sources.length > 0 && (
        <ul className="q-sources" style={ms(at + 700)}>
          {sources.map((s) => (
            <li key={s.artifact_id ?? `synthesis-${s.person_id}`} className="q-source">
              <Link href={sourceHref(s)} className="q-source__who">
                {s.person_name}
              </Link>
              <span className="q-source__what">{s.snippet}</span>
              <span className="q-source__when">{formatDay(new Date(s.captured_at))}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="q-answer__foot" style={ms(at + 1350)}>
        drawn from {plural(drawnFrom, "item", "items")} in your city
      </p>
    </section>
  );
}
