interface OwnerAuthorization { authorize(request: Request, required: "read" | "write"): Promise<boolean> }
function denied(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store",
    vary: "Cookie, Authorization", "x-content-type-options": "nosniff" } });
}
/** Browser dashboard access only. Capture credentials are scoped to /api/capture. */
export async function dashboardRequestGuard(request: Request, owner: OwnerAuthorization, trustedOrigin: string) {
  try {
    const origin = new URL(trustedOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
      return denied("session_unavailable", 503);
    const safe = ["GET", "HEAD"].includes(request.method);
    const supplied = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if ((!safe && supplied !== origin.origin) || (supplied !== null && supplied !== origin.origin) ||
        site === "cross-site" || site === "same-site") return denied("origin_not_allowed", 403);
    return await owner.authorize(request, safe ? "read" : "write") ? null : denied("unauthorised", 401);
  } catch { return denied("session_unavailable", 503); }
}
