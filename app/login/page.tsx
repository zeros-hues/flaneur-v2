import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { isAuthorisedCapture } from "@/lib/capture/auth";

export const metadata: Metadata = { title: "flaneur" };

async function login(form: FormData): Promise<void> {
  "use server";
  const secret = String(form.get("secret") ?? "").trim();
  if (!secret || !isAuthorisedCapture(secret)) redirect("/login?failed=1");
  (await cookies()).set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const { failed } = await searchParams;
  return (
    <main className="page">
      <form action={login} className="page__main stack">
        <p className="quiet">flaneur</p>
        <input
          className="search-input"
          type="password"
          name="secret"
          placeholder="secret"
          aria-label="Secret"
          autoComplete="current-password"
          autoFocus
        />
        {failed && <p className="quiet small">That secret didn't match.</p>}
        <button type="submit" className="textlink small">enter</button>
      </form>
    </main>
  );
}
