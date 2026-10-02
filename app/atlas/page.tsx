import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import "@/components/sheet/sheet.css";
import "@/components/sheet/atlas.css";

export const metadata: Metadata = { title: "atlas — flaneur" };

// Districts are not computed yet, so the atlas only ever shows its cold start. Nothing here is faked.
export default async function AtlasPage() {
  await requireSession();
  return (
    <main className="atlas">
      <div className="atlas__map">
        <p className="atlas__cold">
          Your city is still finding its shape.
          <br />
          Keep capturing, districts form around 30 people.
        </p>
      </div>
      <p className="atlas__foot">
        <Link href="/city">the whole city</Link>
      </p>
    </main>
  );
}
