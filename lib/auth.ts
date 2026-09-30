// Server-only. The capture secret doubles as the dashboard login until real sessions exist.
// It lives in an httpOnly cookie, so client code never sees it.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthorisedCapture } from "@/lib/capture/auth";

export const SESSION_COOKIE = "x-capture-secret";

const cookieFrom = (header: string | null): string | null => {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
};

/** API routes: accepts the secret as the x-capture-secret header (extension, scripts) or the cookie (dashboard). */
export function isAuthorisedRequest(request: Request): boolean {
  const header = request.headers.get("x-capture-secret");
  if (header && isAuthorisedCapture(header)) return true;
  const cookie = cookieFrom(request.headers.get("cookie"));
  return cookie !== null && isAuthorisedCapture(cookie);
}

export function unauthorisedResponse(request: Request): Response | null {
  return isAuthorisedRequest(request) ? null : Response.json({ error: "unauthorised" }, { status: 401 });
}

/** Pages: redirects to /login unless the session cookie holds the right secret. */
export async function requireSession(): Promise<void> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || !isAuthorisedCapture(value)) redirect("/login");
}
