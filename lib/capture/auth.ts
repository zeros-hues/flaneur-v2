import { createHash, timingSafeEqual } from "node:crypto";

// Hash both sides so the comparison is constant-time regardless of length.
const digest = (value: string) => createHash("sha256").update(value).digest();

let expected: Buffer | undefined;

function expectedDigest(): Buffer {
  if (expected) return expected;
  const secret = process.env.CAPTURE_SECRET;
  if (!secret) throw new Error("CAPTURE_SECRET is not set");
  expected = digest(secret);
  return expected;
}

export function isAuthorisedCapture(header: string | null): boolean {
  if (!header) return false;
  return timingSafeEqual(digest(header), expectedDigest());
}
