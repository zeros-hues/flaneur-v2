export function captureReadiness(states: { parse?: string; index?: string; enrich?: string }) {
  if (Object.values(states).some(state => state === 'failed' || state === 'quarantined'))
    return 'Saved. Processing needs attention.';
  if (states.parse === 'succeeded' && states.index === 'succeeded' && states.enrich === 'succeeded')
    return 'Ready in memory.';
  return 'Saved. Processing.';
}
