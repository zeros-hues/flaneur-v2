import { unauthorisedResponse } from "@/lib/auth";
import { runMemoryQuery } from "@/lib/query/memory-runtime";
import { memoryQueryHandler } from "@/lib/query/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = memoryQueryHandler({ authorize: unauthorisedResponse, run: runMemoryQuery });
