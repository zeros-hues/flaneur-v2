import "server-only";
import { sql } from "@/lib/db";
import { postgresSessionStore } from "../session/postgres";
import { postgresExportSource } from "./postgres-v2";
import { notebookDownload } from "./download";

let download: ReturnType<typeof notebookDownload> | undefined;
/** Lazy server composition using the app pool. DIRECT_URL is administrative only. */
export function getNotebookDownload() {
  return download ??= notebookDownload(postgresExportSource(sql), postgresSessionStore(sql), {
    origin: process.env.OWNER_SESSION_ORIGIN ?? "",
    ownerPrincipalId: process.env.OWNER_PRINCIPAL_ID ?? "",
  });
}
