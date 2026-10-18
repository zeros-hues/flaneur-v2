import type postgres from "postgres";
import { ownerSessionRuntime, type OwnerSessionConfiguration } from "./owner-runtime";
import { postgresSessionStore } from "./postgres";
import { postgresLoginThrottleStore } from "./postgres-throttle";

/** Server-only supplied pool. Runtime uses DATABASE_URL; administrative tools alone use DIRECT_URL. */
export function postgresOwnerSessionRuntime(connection: ReturnType<typeof postgres>, config: OwnerSessionConfiguration) {
  return ownerSessionRuntime({ sessions: postgresSessionStore(connection), throttle: postgresLoginThrottleStore(connection) }, config);
}
