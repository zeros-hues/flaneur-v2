"use client";
import { useState } from "react";

export function OwnerLogout() {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  async function logout(all: boolean) {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/session", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: all ? "logout_all" : "logout" }) });
      if (response.ok) { window.location.assign("/login"); return; }
      setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <section className="settings-section">
    <h2 className="sheet-label">sign out</h2>
    <button type="button" className="textlink" disabled={busy} onClick={() => void logout(false)}>this device</button>
    <button type="button" className="textlink" disabled={busy} onClick={() => void logout(true)}>all devices</button>
    {failed && <p className="quiet small" role="alert">Couldn’t sign out. Please try again.</p>}
  </section>;
}
