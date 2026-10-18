import { createHash } from "node:crypto";

// UUIDv8: application-specific SHA-256 namespace. Never used as source identity proof.
export function migrationId(key: string): string {
  const bytes = createHash("sha256").update(`flaneur:phase1:v1:${key}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
