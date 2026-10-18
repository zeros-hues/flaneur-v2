import "server-only";
import { sql } from "@/lib/db";
import { trailReader } from "./postgres";
export const readTrail = trailReader(sql);
