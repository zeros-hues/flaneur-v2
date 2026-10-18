import { getOwnerReviewHandler } from "@/lib/review/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try { return await getOwnerReviewHandler()(request); }
  catch { return Response.json({ error: "review_unavailable" }, { status: 503, headers: {
    "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff",
  } }); }
}
