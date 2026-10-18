import { memoryExportHandler } from "./handler";
import type { ExportSource } from "./v2";
import type { SessionStore } from "../session/service";

// Buffered delivery stays below Vercel's 4.5 MB response limit, including room for overhead.
export const DOWNLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Shared route composition. Capacity failure returns an explicit error, never a partial/legacy export. */
export function notebookDownload(source: ExportSource, sessions: SessionStore, policy: {
  origin: string; ownerPrincipalId: string;
}) {
  return memoryExportHandler(source, sessions, { ...policy, limits: { maxBytes: DOWNLOAD_MAX_BYTES } });
}
