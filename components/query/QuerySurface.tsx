"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { IdleCity } from "@/components/idle/IdleCity";
import { InkLine } from "@/components/ink/InkLine";
import type { QueryResponse } from "@/lib/query/blocks";
import { BlockRenderer, EmptyText } from "./BlockRenderer";
import "./query.css";

type State =
  | { phase: "idle" }
  | { phase: "thinking" }
  | { phase: "done"; text: string; response: QueryResponse }
  | { phase: "failed" };

const THINKING = "thinking...";

export function QuerySurface() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  // Each submit redraws the underline; responses to superseded submits are dropped.
  const [run, setRun] = useState(0);
  const latest = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  // Focus and keystrokes interrupt the idle loop. The autofocus at mount does not: it lands before this arms.
  const [interrupt, setInterrupt] = useState(0);
  const armed = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // Returning to the tab hands focus back to the input; that is not the person reaching for it.
  const restoring = useRef(false);
  useEffect(() => {
    armed.current = true;
    // Leaving the window or hiding the tab: either may come first, and either may be all there is.
    const onLeave = () => {
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        restoring.current ||= document.activeElement === field.current;
      }
    };
    // The restored focus lands in the same task as the window regaining focus; anything later is the person.
    const onReturn = () => window.setTimeout(() => (restoring.current = false), 0);
    window.addEventListener("blur", onLeave);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, []);
  const nudge = () => armed.current && setInterrupt((n) => n + 1);
  const onFocus = () => {
    if (restoring.current) restoring.current = false;
    else nudge();
  };

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = query.trim();
    if (!text) return;
    const id = ++latest.current;
    setRun(id);
    setState({ phase: "thinking" });
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as QueryResponse;
      if (id === latest.current) setState({ phase: "done", text, response: body });
    } catch {
      if (id === latest.current) setState({ phase: "failed" });
    }
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    nudge();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      latest.current++;
      setQuery("");
      setState({ phase: "idle" });
    }
  }

  const routed = state.phase === "done" ? state.response.routed_json : null;
  return (
    <main className="q">
      <div className="q__spacer" data-lifted={state.phase === "idle" ? undefined : ""} />
      <form ref={form} className="q__input" role="search" onSubmit={submit}>
        <textarea
          ref={field}
          className="q__field"
          rows={1}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKey}
          placeholder="who or what, or ask anything"
          aria-label="Search or ask"
          aria-busy={state.phase === "thinking"}
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        <InkLine
          key={run}
          className="q__line"
          weight="input"
          seed="query-input"
          draw={run > 0}
          duration={500}
          ease="cubic-bezier(.4,0,.3,1)"
        />
        {state.phase === "thinking" && (
          <p className="q__thinking" aria-live="polite">
            {THINKING.split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${500 + i * 40}ms` }}>
                {ch}
              </span>
            ))}
          </p>
        )}
      </form>

      {state.phase === "idle" && <IdleCity anchor={form} interrupt={interrupt} quiet={query === ""} />}

      <div aria-live="polite" style={{ display: "contents" }}>
        {state.phase === "failed" && (
          <div className="q__main">
            <EmptyText reason="error" />
          </div>
        )}
        {state.phase === "done" && (
          <BlockRenderer
            key={run}
            blocks={state.response.blocks}
            save={routed && state.response.blocks.some((b) => b.type === "people") ? { text: state.text, routed } : null}
          />
        )}
      </div>
    </main>
  );
}
