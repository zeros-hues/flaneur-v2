import type { Delivery } from "./outbox";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No global URL/secret access. The packaged background entry point does not enable v2 delivery yet.
export async function sendV2(payload: { requestId: string }, endpoint: string, secret: string | null,
  transport: typeof fetch = fetch): Promise<Delivery> {
  if (!secret) return { state: "blocked", code: "AUTH_REQUIRED" };
  const response = await transport(endpoint, { method: "POST",
    headers: { "content-type": "application/json", "x-capture-secret": secret },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
  if (response.status === 401 || response.status === 403) return { state: "blocked", code: "AUTH_REJECTED" };
  if (response.status === 409) return { state: "failed", code: "REQUEST_PAYLOAD_CONFLICT" };
  // A packaged extension may reach an older deployment during cutover. Keep its original for later v2 delivery.
  if (response.status === 404 || response.status === 405) return { state: "retry", code: "CAPTURE_VERSION_UNAVAILABLE" };
  if (response.status === 429 || response.status >= 500) return { state: "retry", code: "SERVER_UNAVAILABLE" };
  if (!response.ok) return { state: "failed", code: "CAPTURE_REJECTED" };
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("version" in body) || body.version !== 2 ||
    !("state" in body) || body.state !== "saved" || !("requestId" in body) || body.requestId !== payload.requestId ||
    !("snapshotId" in body) || typeof body.snapshotId !== "string" || !UUID.test(body.snapshotId) ||
    !("encounterId" in body) || typeof body.encounterId !== "string" || !UUID.test(body.encounterId) ||
    !("processing" in body) || typeof body.processing !== "string" ||
    !["queued","leased","succeeded","failed","superseded","quarantined"].includes(body.processing) ||
    !("replayed" in body) || typeof body.replayed !== "boolean") {
    return { state: "retry", code: "INVALID_ACKNOWLEDGMENT" };
  }
  return { state: "saved", requestId: payload.requestId, processing: body.processing };
}
