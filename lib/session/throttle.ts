import { createHash } from "node:crypto";
import { z } from "zod";

const policySchema = z.object({ ownerPrincipalId: z.uuid(),
  maxAttempts: z.number().int().min(1).max(100).default(8),
  windowSeconds: z.number().int().min(60).max(86400).default(900) }).strict();
export interface LoginThrottleAttempt { bucketKey: string; maxAttempts: number; windowSeconds: number }
export interface LoginThrottleStore { consume(attempt: LoginThrottleAttempt): Promise<boolean> }
export function validateThrottleAttempt(value: LoginThrottleAttempt): LoginThrottleAttempt {
  return z.object({ bucketKey: z.string().regex(/^[0-9a-f]{64}$/),
    maxAttempts: z.number().int().min(1).max(100),
    windowSeconds: z.number().int().min(60).max(86400) }).strict().parse(value);
}

/** One server-owned bucket across instances. No request header or credential chooses its identity. */
export function ownerLoginThrottle(store: LoginThrottleStore, configuration: {
  ownerPrincipalId: string; maxAttempts?: number; windowSeconds?: number;
}): (request: Request) => Promise<boolean> {
  const policy = policySchema.parse(configuration);
  const bucketKey = createHash("sha256").update(`flaneur-owner-login-v1:${policy.ownerPrincipalId.toLowerCase()}`).digest("hex");
  return async (_request) => store.consume({ bucketKey, maxAttempts: policy.maxAttempts, windowSeconds: policy.windowSeconds });
}
