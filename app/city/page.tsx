import type { Metadata } from "next";
import { CityView } from "@/components/city/CityView";
import { requireSession } from "@/lib/auth";
import { loadNetwork } from "@/lib/city/network";
import "@/components/sheet/sheet.css";

export const metadata: Metadata = { title: "the city — flaneur" };
export const dynamic = "force-dynamic";

export default async function CityPage() {
  await requireSession();
  return <CityView network={await loadNetwork()} />;
}
