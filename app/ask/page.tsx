import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { Ask } from "./ask";

export const metadata: Metadata = { title: "ask your city — flaneur" };

export default async function AskPage() {
  await requireSession();
  return (
    <main className="page">
      <div className="page__main">
        <Ask />
      </div>
    </main>
  );
}
