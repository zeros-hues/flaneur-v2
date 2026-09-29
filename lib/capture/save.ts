import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { note, snapshot } from "@/db/schema";
import { db } from "@/lib/db";
import type { StoredSnapshot } from "@/lib/parsers/run";
import type { CaptureBody } from "./schema";

const gzipAsync = promisify(gzip);

// Posts with a known URN get their canonical URL; everything else keeps the page it came from.
function canonicalSourceUrl(body: CaptureBody): string {
  if (body.type === "post" && body.urn) {
    return `https://www.linkedin.com/feed/update/${body.urn}/`;
  }
  return body.sourceUrl;
}

/** Stores the raw capture unparsed, committed on its own so a parse failure can never lose it. */
export async function saveCapture(body: CaptureBody): Promise<StoredSnapshot> {
  const contentGzip = await gzipAsync(Buffer.from(body.html, "utf8"));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(snapshot)
      .values({
        captureType: body.type,
        sourceUrl: canonicalSourceUrl(body),
        contentGzip,
        parserVersion: `ext-${body.extensionVersion}`,
      })
      .returning({
        id: snapshot.id,
        capturedAt: snapshot.capturedAt,
        sourceUrl: snapshot.sourceUrl,
        captureType: snapshot.captureType,
      });
    if (!row) throw new Error("snapshot insert returned no row");

    if (body.note) {
      await tx.insert(note).values({ snapshotId: row.id, body: body.note });
    }
    return row;
  });
}
