import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOwnerSessionRuntime } from "@/lib/session/runtime";
import { SESSION_COOKIE_V2 } from "@/lib/session/service";
import { dashboardRequestGuard } from "@/lib/session/dashboard-guard";

/** Dashboard routes accept revocable owner sessions only. Capture has its own guard. */
export async function unauthorisedResponse(request: Request): Promise<Response | null> {
  try { return await dashboardRequestGuard(request, getOwnerSessionRuntime(), process.env.OWNER_SESSION_ORIGIN ?? ""); }
  catch { return Response.json({ error: "session_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}

/** Pages revalidate owner identity, permission, expiry and revocation on every request. */
export async function requireSession(): Promise<void> {
  const value = (await cookies()).get(SESSION_COOKIE_V2)?.value;
  if (!value) redirect("/login");
  let authorized = false;
  try {
    authorized = await getOwnerSessionRuntime().authorize(new Request("https://session.internal", {
      headers: { cookie: SESSION_COOKIE_V2 + "=" + value },
    }), "read");
  } catch { throw new Error("SESSION_UNAVAILABLE"); }
  if (!authorized) redirect("/login");
}
