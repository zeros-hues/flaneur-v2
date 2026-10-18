export type OutboxItem<T> = { requestId: string; payload: T; state: "queued" | "blocked" | "failed";
  attempts: number; nextAttemptAt: number; lastErrorCode: string | null };
export interface OutboxStore<T> {
  list(): Promise<OutboxItem<T>[]>;
  put(item: OutboxItem<T>): Promise<void>;
  remove(id: string): Promise<void>;
}
export type Delivery = { state: "saved"; requestId: string; processing?: string } |
  { state: "retry" | "blocked" | "failed"; code: string };

// Storage must commit before returning queued. Transport never reads a page or reserializes HTML.
export async function enqueue<T extends { requestId: string }>(store: OutboxStore<T>,
  payload: Omit<T, "requestId">, id: () => string = () => crypto.randomUUID(), now = Date.now()) {
  const requestId = id();
  if ((await store.list()).some((item) => item.requestId === requestId)) throw new Error("OUTBOX_ID_COLLISION");
  const item: OutboxItem<T> = { requestId, payload: { ...structuredClone(payload), requestId } as T,
    state: "queued", attempts: 0, nextAttemptAt: now, lastErrorCode: null };
  await store.put(item);
  return item;
}

// Caller serializes drains in the single background worker; records survive its suspension.
export async function drain<T>(store: OutboxStore<T>, send: (payload: T) => Promise<Delivery>, now = Date.now()) {
  const results: { requestId: string; state: "saved" | "queued" | "blocked" | "failed" }[] = [];
  for (const item of await store.list()) {
    if (item.state !== "queued" || item.nextAttemptAt > now) continue;
    let result: Delivery;
    try { result = await send(structuredClone(item.payload)); } catch { result = { state: "retry", code: "NETWORK_ERROR" }; }
    if (result.state === "saved" && result.requestId === item.requestId) {
      await store.remove(item.requestId); results.push({ requestId: item.requestId, state: "saved" });
    } else {
      const attempts = item.attempts + 1;
      const state = result.state === "blocked" ? "blocked" : result.state === "failed" ? "failed" : "queued";
      const code = result.state === "saved" ? "ACK_ID_MISMATCH" : result.code;
      await store.put({ ...item, state, attempts, lastErrorCode: /^[A-Z0-9_]{1,64}$/.test(code) ? code : "DELIVERY_ERROR",
        nextAttemptAt: now + Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempts, 12)) });
      results.push({ requestId: item.requestId, state });
    }
  }
  return results;
}

export function outboxSession<T extends { requestId: string }>(store: OutboxStore<T>) {
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <R>(work: () => Promise<R>): Promise<R> => {
    const next = pending.then(work); pending = next.catch(() => undefined); return next;
  };
  return { enqueue: (payload: Omit<T, "requestId">) => serial(() => enqueue(store, payload)),
    resume: (requestId: string) => serial(async () => {
      const item = (await store.list()).find((i) => i.requestId === requestId);
      if (!item) throw new Error("OUTBOX_ITEM_NOT_FOUND");
      if (item.state === "failed") throw new Error("CAPTURE_REQUIRES_NEW_SAVE");
      await store.put({ ...item, state: "queued", nextAttemptAt: Date.now(), lastErrorCode: null });
    }),
    drain: (send: (payload: T) => Promise<Delivery>) => serial(() => drain(store, send)) };
}
