/** Derivations outside the current input head remain historical evidence, never current retrieval facts. */
export function currentDerivation(input: { fingerprint: string | null; identityObservationId: string | null },
  head: { fingerprint: string; identityObservationId: string | null; identityActive: boolean } | null) {
  return !!head && !!input.fingerprint && !!input.identityObservationId &&
    input.fingerprint === head.fingerprint && input.identityObservationId === head.identityObservationId && head.identityActive;
}
