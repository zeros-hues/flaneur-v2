import type { Metadata } from "next";
import { Walk } from "@/components/walk/Walk";
import { requireSession } from "@/lib/auth";
import "@/components/sheet/sheet.css";
export const metadata:Metadata={title:"Walk — flaneur"};
export const dynamic="force-dynamic";
export default async function WalkPage(){
 await requireSession();
 return <main className="sheet"><div className="sheet__main"><Walk /></div></main>;
}
