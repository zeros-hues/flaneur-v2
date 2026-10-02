"use client";

import { useState, type KeyboardEvent } from "react";

interface NoteRow {
  id: string;
  body: string;
}

const paragraphs = (body: string) => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

async function send(url: string, method: "POST" | "PATCH", payload: object): Promise<NoteRow | null> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as NoteRow) : null;
}

/**
 * One note, read as text and edited in place: click to edit; blur or Cmd/Ctrl+Enter saves;
 * Escape lets the edit go. An emptied note is left as it was (notes are not deleted here).
 */
function Note({ note, onSave }: { note: NoteRow | null; onSave: (body: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? "");
  const [failed, setFailed] = useState(false);

  async function commit() {
    const body = draft.trim();
    if (!body || body === note?.body) {
      setDraft(note?.body ?? "");
      setEditing(false);
      return;
    }
    const ok = await onSave(body);
    setFailed(!ok);
    if (ok) setEditing(false);
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.blur(); // blur saves, so there is one path
    }
    if (event.key === "Escape") {
      setDraft(note?.body ?? "");
      setFailed(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div>
        <textarea
          className="person-note person-note__field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKey}
          aria-label={note ? "Edit note" : "New note"}
          autoFocus
        />
        {failed && <p className="person-note__failed">That didn&apos;t save.</p>}
      </div>
    );
  }

  const open = () => {
    setDraft(note?.body ?? "");
    setEditing(true);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className={note ? "person-note" : "person-note person-note--empty"}
      aria-label={note ? "Edit note" : "Add a note"}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      {note ? paragraphs(note.body).map((p, i) => <p key={i}>{p}</p>) : <p>add a note</p>}
    </div>
  );
}

/** The user's notes about a person. With none yet, a quiet place to write the first. */
export function Notes({ personId, initial }: { personId: string; initial: NoteRow[] }) {
  const [notes, setNotes] = useState(initial);

  if (!notes.length) {
    return (
      <Note
        note={null}
        onSave={async (body) => {
          const created = await send("/api/notes", "POST", { personId, body });
          if (created) setNotes([created]);
          return !!created;
        }}
      />
    );
  }
  return (
    <div className="person-notes">
      {notes.map((n) => (
        <Note
          key={n.id}
          note={n}
          onSave={async (body) => {
            const updated = await send(`/api/notes/${n.id}`, "PATCH", { body });
            if (updated) setNotes((all) => all.map((x) => (x.id === updated.id ? updated : x)));
            return !!updated;
          }}
        />
      ))}
    </div>
  );
}
