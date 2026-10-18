"use client";
import { useState, type FormEvent } from "react";

export function OwnerLogin() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, credential = new FormData(form).get("password");
    if (typeof credential !== "string") return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/session", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "login", credential }) });
      form.reset();
      if (response.ok) { window.location.assign("/"); return; }
      setMessage(response.status === 401 ? "That password didn’t match." : response.status === 429
        ? "Too many attempts. Please try again later." : "Sign-in is unavailable. Please try again later.");
    } catch { form.reset(); setMessage("Sign-in is unavailable. Please try again later."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(event) => void login(event)} className="page__main stack">
    <p className="quiet">flaneur</p>
    <input className="search-input" type="password" name="password" placeholder="password"
      aria-label="Owner password" autoComplete="current-password" required maxLength={1024} autoFocus disabled={busy} />
    {message && <p className="quiet small" role="alert">{message}</p>}
    <button type="submit" className="textlink small" disabled={busy}>{busy ? "signing in…" : "enter"}</button>
  </form>;
}
