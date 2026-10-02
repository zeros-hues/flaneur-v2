import type { Metadata } from "next";
import { Suspense } from "react";
import { Walk } from "@/components/walk/Walk";
import { requireSession } from "@/lib/auth";
import { selectWalk } from "@/lib/walk/select";
import "@/components/sheet/sheet.css";

export const metadata: Metadata = { title: "today's walk — flaneur" };
export const dynamic = "force-dynamic";

async function TodaysWalk() {
  return <Walk items={await selectWalk()} />;
}

export default async function WalkPage() {
  await requireSession();
  return (
    <main className="sheet">
      <div className="sheet__main">
        <Suspense fallback={null}>
          <TodaysWalk />
        </Suspense>
      </div>
    </main>
  );
}
