import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Settings } from "@/components/settings/Settings";
import { savedQuery } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import "@/components/sheet/sheet.css";

export const metadata: Metadata = { title: "settings — flaneur" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession();
  const saved = await db
    .select({ id: savedQuery.id, text: savedQuery.text, lastRunAt: savedQuery.lastRunAt })
    .from(savedQuery)
    .orderBy(desc(savedQuery.lastRunAt));
  return (
    <main className="sheet">
      <div className="sheet__main">
        <Settings saved={saved.map((q) => ({ ...q, lastRunAt: q.lastRunAt?.toISOString() ?? null }))} />
      </div>
    </main>
  );
}
