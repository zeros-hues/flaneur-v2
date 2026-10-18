import { randomUUID, createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { captureFingerprint, captureV2, CaptureConflict, type CaptureV2, type CaptureAcknowledgment, type ProcessingState } from "./v2-contract";

const compress = promisify(gzip);

export type DurableCapture = { body: CaptureV2; payloadHash: string; snapshotId: string;
  encounterId: string; reasonId: string | null; jobId: string; contentGzip: Buffer;
  contentHash: string; receivedAt: Date };
export interface CaptureTransaction {
  findRequest(id: string): Promise<{ payloadHash: string; snapshotId: string; encounterId: string; processing: ProcessingState } | null>;
  storeCapture(capture: DurableCapture): Promise<void>;
}
export interface CaptureStore {
  // Must serialize a request ID and commit source resolution plus snapshot/encounter/reason/job/request rows atomically.
  transaction<T>(requestId: string, work: (tx: CaptureTransaction) => Promise<T>): Promise<T>;
}

// Injectable save transaction: no DB imports, providers, parsers, or after().
export async function saveCaptureV2(store: CaptureStore, input: unknown,
  clock: () => Date = () => new Date()): Promise<CaptureAcknowledgment> {
  const body = captureV2.parse(input);
  const payloadHash = captureFingerprint(body);
  const contentGzip = await compress(Buffer.from(body.html, "utf8"));
  return store.transaction(body.requestId, async (tx) => {
    const existing = await tx.findRequest(body.requestId);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new CaptureConflict();
      return { version: 2, requestId: body.requestId, snapshotId: existing.snapshotId,
        encounterId: existing.encounterId, state: "saved", processing: existing.processing, replayed: true };
    }
    const capture: DurableCapture = { body, payloadHash, contentGzip,
      contentHash: createHash("sha256").update(body.html).digest("hex"),
      snapshotId: randomUUID(), encounterId: randomUUID(), reasonId: body.reasonForNoticing ? randomUUID() : null,
      jobId: randomUUID(), receivedAt: clock() };
    await tx.storeCapture(capture);
    return { version: 2, requestId: body.requestId, snapshotId: capture.snapshotId,
      encounterId: capture.encounterId, state: "saved", processing: "queued", replayed: false };
  });
}
