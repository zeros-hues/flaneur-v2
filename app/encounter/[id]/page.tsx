import { memoryDetailPage,type InspectionParams } from "@/lib/inspection/page";
import "@/components/sheet/sheet.css";
export const dynamic="force-dynamic";
export const metadata={title:"Encounter — flaneur"};
export default function EncounterPage(props:InspectionParams){return memoryDetailPage("encounter",props);}
