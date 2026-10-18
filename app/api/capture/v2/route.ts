import { sql } from "@/lib/db";
import { isAuthorisedCapture } from "@/lib/capture/auth";
import { postgresCaptureStore } from "@/lib/capture/v2-postgres";
import { captureV2Handler } from "@/lib/capture/v2-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = captureV2Handler(postgresCaptureStore(sql), isAuthorisedCapture,
  { enabled: () => process.env.CAPTURE_V2_ENABLED === "true" });
