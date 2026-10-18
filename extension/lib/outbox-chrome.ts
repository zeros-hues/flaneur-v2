import type { OutboxItem, OutboxStore } from "./outbox";

export const OUTBOX_PREFIX = "flaneur-outbox-v2:";
const PREFIX = OUTBOX_PREFIX;
// Private HTML remains in trusted extension storage; callers may validate stored envelopes.
export async function chromeOutbox<T>(validate?:(value:unknown)=>T): Promise<OutboxStore<T>> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  return {
    async list() {
      const records: Record<string, unknown> = await chrome.storage.local.get(null);
      return Object.entries(records).filter(([key]) => key.startsWith(PREFIX))
        .map(([key, item]) => {
          if (typeof item !== "object" || item === null || !("requestId" in item) || typeof item.requestId !== "string" ||
            key !== PREFIX + item.requestId || !("state" in item) || !["queued", "blocked", "failed"].includes(String(item.state)) ||
            !("payload" in item) || typeof item.payload !== "object" || item.payload === null ||
            !("requestId" in item.payload) || item.payload.requestId !== item.requestId ||
            !("attempts" in item) || !Number.isInteger(item.attempts) || Number(item.attempts) < 0 ||
            !("nextAttemptAt" in item) || !Number.isFinite(item.nextAttemptAt)) throw new Error("OUTBOX_STORAGE_INVALID");
          if(validate)validate(item.payload);
          return item as OutboxItem<T>;
        });
    },
    async put(item) { await chrome.storage.local.set({ [`${PREFIX}${item.requestId}`]: item }); },
    async remove(id) { await chrome.storage.local.remove(`${PREFIX}${id}`); },
  };
}
