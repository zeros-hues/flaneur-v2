import { sql } from "@/lib/db";
import { isAuthorisedCapture } from "@/lib/capture/auth";
import { postgresCaptureStore } from "@/lib/capture/v2-postgres";
import { captureV2Handler } from "@/lib/capture/v2-handler";
import { captureActivation } from '@/lib/capture/activation';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = captureV2Handler(postgresCaptureStore(sql), isAuthorisedCapture,
  { enabled: () => captureActivation(process.env).enabled,
    accepts: sourceUrl => captureActivation(process.env).accepts(sourceUrl) });
