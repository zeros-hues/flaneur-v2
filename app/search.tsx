"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { UnifiedResult } from "@/lib/search/unified";
import { Results } from "./results";

interface Answered {
  text: string;
  result: UnifiedResult;
}

export function Search() {
  const [query, setQuery] = useState("");
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    startTransition(async () => {
      setAnswered(null);
      setFailed(false);
      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: text }),
        });
        if (!response.ok) throw new Error(String(response.status));
        setAnswered({ text, result: (await response.json()) as UnifiedResult });
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="stack-lg">
      <form onSubmit={submit} role="search">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="who or what are you looking for, or ask anything"
          aria-label="Search or ask"
          aria-busy={pending}
          autoFocus
        />
      </form>

      <div aria-live="polite">
        {pending && <p className="asking">thinking...</p>}
        {!pending && failed && <p className="reading quiet">Something went wrong. Try again.</p>}
        {!pending && answered && <Results result={answered.result} text={answered.text} />}
      </div>
    </div>
  );
}
