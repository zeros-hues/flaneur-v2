import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { selectWalk } from "@/lib/walk/select";
import { Walk } from "./walk";

export const metadata: Metadata = { title: "today's walk — flaneur" };
export const dynamic = "force-dynamic";

async function TodaysWalk() {
  return <Walk items={await selectWalk()} />;
}

export default async function WalkPage() {
  await requireSession();
  return (
    <main className="page">
      <div className="page__main">
        <Suspense fallback={null}>
          <TodaysWalk />
        </Suspense>
      </div>
    </main>
  );
}
