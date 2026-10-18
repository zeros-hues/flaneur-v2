import { z } from "zod";
import { confirmObservation, type ConfirmationStore } from "./confirmation";
import { correctObservation } from "./correction";
import { rejectObservation } from "./rejection";
import { archiveObservation, type ArchiveStore } from "./archive";
import { archivePerson, type PersonArchiveStore } from "./person-archive";
import { confirmProfileIdentity, type IdentityStore } from "../identity/confirmation";
import { rejectProfileIdentity, type RejectionStore } from "../identity/rejection";
import { createPersonFromProfile,type PersonCreationStore } from "../identity/creation";
import { reassignProfileIdentity,type IdentityReassignmentStore } from '../identity/reassignment';

const schema = z.object({ action: z.enum(["confirm_observation", "correct_observation", "reject_observation",
  "archive_observation", "archive_person", "confirm_identity", "reject_identity", "create_person_from_profile", "reassign_identity", "review_authorship", "review_concept_association"]), payload: z.unknown() }).strict();
// Covers the service's 20,000 UTF-16 text units plus comment, even with JSON escape expansion.
const MAX_BYTES = 144000;
export interface ReviewDependencies {
  observations: ConfirmationStore; observationArchive: ArchiveStore; personArchive: PersonArchiveStore;
  identities: IdentityStore; identityRejection: RejectionStore;
  personCreation:PersonCreationStore;
  identityReassignment:IdentityReassignmentStore;
  authorship:{decide(payload:unknown):Promise<unknown>};
  conceptAssociation:{decide(payload:unknown):Promise<unknown>};
}
function reply(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", vary: "Cookie, Authorization",
    "x-content-type-options": "nosniff", ...extra } });
}
async function boundedJson(request: Request) {
  if (!request.body) throw new Error("INVALID_REVIEW_BODY");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("REVIEW_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally { reader.releaseLock(); }
}
function failure(error: unknown) {
  if (error instanceof z.ZodError) return reply({ error: "invalid_review" }, 400);
  const code = error instanceof Error ? error.message : "";
  if(['CONCEPT_ASSOCIATION_REQUEST_CONFLICT','CONCEPT_ASSOCIATION_STALE','CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE'].includes(code))return reply({error:'concept_association_conflict'},409);
  if(code==='RELATIONSHIP_REVIEW_REQUIRED')return reply({error:'relationship_review_required'},409);
  if(['AUTHORSHIP_REQUEST_CONFLICT','AUTHORSHIP_STALE','AUTHORSHIP_TARGET_UNAVAILABLE'].includes(code))
    return reply({error:'authorship_review_conflict'},409);
  if (["REVIEW_REQUEST_CONFLICT", "ARCHIVE_REQUEST_CONFLICT", "IDENTITY_REQUEST_CONFLICT", "IDENTITY_REVIEW_REQUEST_CONFLICT"].includes(code))
    return reply({ error: "request_conflict" }, 409);
  if (code === "IDENTITY_REVIEW_REQUIRED" || code === "IDENTITY_REASSIGNMENT_REQUIRES_REVIEW")
    return reply({ error: "identity_review_required" }, 409);
  if (code === "REVIEW_AUTHORED_TEXT_REQUIRES_REVISION") return reply({ error: "authored_revision_required" }, 409);
  if (["REVIEW_OBSERVATION_UNAVAILABLE", "ARCHIVE_OBSERVATION_UNAVAILABLE", "ARCHIVE_PERSON_UNAVAILABLE",
    "IDENTITY_PERSON_UNAVAILABLE", "IDENTITY_CAPTURE_UNAVAILABLE", "IDENTITY_REVIEW_STALE_OR_AMBIGUOUS", "IDENTITY_PROOF_CONFLICT"].includes(code))
    return reply({ error: "review_target_unavailable" }, 409);
  if (["IDENTITY_SNAPSHOT_UNSUPPORTED", "REVIEW_CONFIRMATION_TEXT_UNSUPPORTED"].includes(code))
    return reply({ error: "unsupported_review" }, 422);
  if(code==='PERSON_CREATION_NOT_READY')return reply({error:'person_creation_not_ready'},503);
  return reply({ error: "review_unavailable" }, 503);
}

/** Strict explicit-review boundary. Authorization validates a revocable owner session and write permission. */
export function reviewHandler(dependencies: ReviewDependencies, policy: {
  origin: string; authorize(request: Request): boolean | Promise<boolean>;
}) {
  let trusted: URL;
  try { trusted = new URL(policy.origin); } catch { throw new Error("INVALID_REVIEW_ORIGIN"); }
  if (trusted.protocol !== "https:" || trusted.username || trusted.password ||
      trusted.pathname !== "/" || trusted.search || trusted.hash) throw new Error("INVALID_REVIEW_ORIGIN");
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405, { allow: "POST" });
    try { if (!await policy.authorize(request)) return reply({ error: "unauthorised" }, 401); }
    catch { return reply({ error: "review_unavailable" }, 503); }
    // Exact origin comparison rejects missing/multiple/null origins as well as cross-site requests.
    if (request.headers.get("origin") !== trusted.origin) return reply({ error: "origin_not_allowed" }, 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
      return reply({ error: "json_required" }, 415);
    let input: unknown;
    try { input = await boundedJson(request); }
    catch (error) { return reply({ error: "invalid_review" }, error instanceof Error && error.message === "REVIEW_BODY_TOO_LARGE" ? 413 : 400); }
    try {
      const { action, payload } = schema.parse(input);
      const result = await ({
        confirm_observation: () => confirmObservation(payload, dependencies.observations),
        correct_observation: () => correctObservation(payload, dependencies.observations),
        reject_observation: () => rejectObservation(payload, dependencies.observations),
        archive_observation: () => archiveObservation(payload, dependencies.observationArchive),
        archive_person: () => archivePerson(payload, dependencies.personArchive),
        confirm_identity: () => confirmProfileIdentity(payload, dependencies.identities),
        reject_identity: () => rejectProfileIdentity(payload, dependencies.identityRejection),
        create_person_from_profile:()=>createPersonFromProfile(payload,dependencies.personCreation),
        reassign_identity:()=>reassignProfileIdentity(payload,dependencies.identityReassignment),
        review_authorship:()=>dependencies.authorship.decide(payload),
        review_concept_association:()=>dependencies.conceptAssociation.decide(payload),
      })[action]();
      return reply(result, 200);
    } catch (error) { return failure(error); }
  };
}
