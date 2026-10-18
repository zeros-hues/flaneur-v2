import "server-only";
import { sql } from "@/lib/db";
import { getOwnerSessionRuntime } from "../session/runtime";
import { postgresReviewDependencies } from "./postgres-dependencies";
import { ownerReviewHandler } from "./owner-handler";

let review: ReturnType<typeof ownerReviewHandler> | undefined;
export function getOwnerReviewHandler() {
  return review ??= ownerReviewHandler(postgresReviewDependencies(sql), getOwnerSessionRuntime(),
    process.env.OWNER_SESSION_ORIGIN ?? "");
}
