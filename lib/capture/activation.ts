/** Private local rollout policy. Empty/invalid controls fail closed. No environment values are logged. */
export function captureActivation(env: Record<string, string | undefined>) {
  const since = env.CAPTURE_V2_ACTIVATED_AT;
  const hosts = (env.CAPTURE_V2_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const configured = Boolean(since && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(since) && Number.isFinite(Date.parse(since)) && hosts.length &&
    hosts.every(host => /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host)));
  return { enabled: env.CAPTURE_V2_ENABLED === 'true' && configured,
    since: configured ? since! : null,
    accepts(sourceUrl: string) { try { return configured && hosts.includes(new URL(sourceUrl).hostname.toLowerCase()); } catch { return false; } } };
}
