"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type { AskResult, AskSource } from "@/lib/ask";
import { formatDay } from "@/lib/views/format";

const sourceHref = (s: AskSource) => `/person/${s.person_id}${s.artifact_id ? `#post-${s.artifact_id}` : ""}`;

const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

export function Ask() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    startTransition(async () => {
      setResult(null);
      setFailed(false);
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text }),
        });
        if (!response.ok) throw new Error(String(response.status));
        setResult((await response.json()) as AskResult);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="stack-lg">
      <form onSubmit={submit}>
        <input
          className="search-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="ask your city anything"
          aria-label="Ask a question"
          aria-busy={pending}
          autoFocus
        />
      </form>

      {pending && <p className="asking">asking your city...</p>}
      {failed && !pending && <p className="quiet">The question didn't go through. Try again.</p>}

      {result && !pending && (
        <div className="stack-lg" aria-live="polite">
          {/* The one place on this page in the reading register. */}
          <p className={result.retrieved_count === 0 ? "reading quiet" : "reading"}>{result.answer}</p>

          {result.sources.length > 0 && (
            <div className="archive stack">
              <ul className="stack small quiet">
                {result.sources.map((s) => (
                  <li key={s.artifact_id ?? `synthesis-${s.person_id}`}>
                    <Link href={sourceHref(s)}>
                      {s.person_name} · {s.snippet} · {formatDay(new Date(s.captured_at))}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="small quiet">drawn from {items(result.corpus_size)} in your city</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
