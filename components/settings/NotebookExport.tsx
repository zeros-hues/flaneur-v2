"use client";
import { useState } from "react";

export function NotebookExport() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setMessage("");
    let url: string | undefined;
    try {
      const response = await fetch("/api/export", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const size = body !== null && typeof body === "object" && "error" in body && body.error === "export_size_limit";
        setMessage(response.status === 401 ? "Sign in again to export your notebook." : size
          ? "Your notebook is too large for this download. Nothing was exported."
          : "The export couldn’t be built. Please try again.");
        return;
      }
      const filename = response.headers.get("content-disposition")?.match(/filename="(flaneur-memory-v[23]-\d{4}-\d{2}-\d{2}\.json)"/)?.[1];
      if (!filename || !response.headers.get("content-type")?.startsWith("application/json")) throw new Error("INVALID_DOWNLOAD");
      const blob = await response.blob();
      url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      // Let the browser consume the object URL before releasing it.
      const completedUrl = url; setTimeout(() => URL.revokeObjectURL(completedUrl), 60000); url = undefined;
    } catch { setMessage("The export couldn’t be built. Please try again."); }
    finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
  }
  return <section className="settings-section">
    <h2 className="sheet-label">export</h2>
    <button type="button" className="textlink" disabled={busy} onClick={() => void download()}>
      {busy ? "building export…" : "download notebook JSON"}
    </button>
    {message && <p className="quiet small" role="alert">{message}</p>}
  </section>;
}
