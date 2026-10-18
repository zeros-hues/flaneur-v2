import { z } from "zod";
import type { Evidence } from "../retrieval/evidence";

export const WALK_EVENT_KINDS = ["shown", "opened", "kept", "useful", "reduced", "dismissed", "passed"] as const;
export type WalkEventKind = typeof WALK_EVENT_KINDS[number];
export interface StoredWalkStop {
  id: string; objectId: string; position: number;
  selectionReasons: { code: string; text: string }[];
  selectionSupport: Pick<Evidence, "id" | "layer" | "verified" | "provenance">[];
  selectionInputs: { savedAt: string; lastEncounterAt: string | null; encounterCount: number };
  resolution: WalkEventKind | "unavailable" | null; resolvedAt: string | null;
}
export interface StoredWalkSession {
  id: string; ownerId: string; localDay: string; timezone: string; context: string | null;
  createdAt: string; completedAt: string | null; stops: StoredWalkStop[];
}
export interface OpenWalk { ownerId: string; timezone: string; context?: string }
export interface RecordWalkEvent { ownerId: string; sessionId: string; stopId: string; eventId: string; kind: WalkEventKind }
export interface WalkSessionStore {
  open(input: OpenWalk): Promise<StoredWalkSession>;
  record(input: RecordWalkEvent): Promise<{ session: StoredWalkSession; eventId: string; replayed: boolean }>;
}
const timezone = z.string().min(1).max(100).transform((value, ctx) => {
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { ctx.addIssue({ code: "custom", message: "Invalid timezone" }); return z.NEVER; }
});
const uuid = z.uuid().transform(value => value.toLowerCase());
const openInput = z.object({ ownerId: uuid, timezone, context: z.string().max(2000).optional() }).strict();
const eventInput = z.object({ ownerId: uuid, sessionId: uuid, stopId: uuid, eventId: uuid, kind: z.enum(WALK_EVENT_KINDS) }).strict();

/** The future HTTP layer must supply ownerId from a verified owner session, never the caller body. */
export function openWalk(input: OpenWalk, store: WalkSessionStore) {
  return store.open(openInput.parse(input));
}
export function recordWalkEvent(input: RecordWalkEvent, store: WalkSessionStore) {
  return store.record(eventInput.parse(input));
}
