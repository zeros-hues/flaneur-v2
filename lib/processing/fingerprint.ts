import { createHash } from "node:crypto";
import { canonical } from "../migration/batch";

export function inputFingerprint(inputs: unknown, versions: { parser?: string; prompt?: string; model?: string }) {
  return createHash("sha256").update(canonical({ inputs, versions })).digest("hex");
}
