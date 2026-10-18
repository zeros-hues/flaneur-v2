import { memoryDetailPage,type InspectionParams } from "@/lib/inspection/page";
import "@/components/sheet/sheet.css";
export const dynamic="force-dynamic";
export const metadata={title:"Artifact — flaneur"};
export default function ArtifactPage(props:InspectionParams){return memoryDetailPage("artifact",props);}
