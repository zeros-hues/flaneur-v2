import "server-only";
import { sql } from "@/lib/db";
import { memoryInspectionReader } from "./postgres";
export const memoryInspection=memoryInspectionReader(sql);
