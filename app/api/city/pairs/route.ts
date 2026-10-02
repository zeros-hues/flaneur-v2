import { cityPairs } from "@/lib/city/pairs";
import { unauthorised } from "@/lib/search/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  try {
    return Response.json({ pairs: await cityPairs() });
  } catch (error) {
    console.error("[city/pairs] failed", error);
    return Response.json({ error: "pairs could not be loaded" }, { status: 502 });
  }
}
