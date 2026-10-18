import { workOne, type JobStore, type Lease, type ProcessingOutcome } from "./worker";

export interface BatchOptions { maxJobs: number; maxRuntimeMs: number; leaseDurationMs: number; signal?: AbortSignal }
export function validateBatchOptions(options: BatchOptions) {
  if (!Number.isInteger(options.maxJobs) || options.maxJobs<1 || options.maxJobs>100 ||
      !Number.isInteger(options.maxRuntimeMs) || options.maxRuntimeMs<1 || options.maxRuntimeMs>300_000 ||
      !Number.isInteger(options.leaseDurationMs) || options.leaseDurationMs<1_000 || options.leaseDurationMs>300_000)
    throw Object.assign(new Error("INVALID_WORKER_OPTIONS"),{code:"INVALID_WORKER_OPTIONS"});
}

/** Finite drain, no timers or detached work. Deadline/shutdown stop new claims; in-flight work keeps its lease fencing. */
export async function runProcessingBatch<Result>(store: JobStore<Result>,
  process: (lease:Lease,renew:()=>Promise<boolean>)=>Promise<{result:Result;outcome:ProcessingOutcome}>,
  options: BatchOptions, elapsedClock:()=>number=()=>performance.now()) {
  validateBatchOptions(options);
  const started=elapsedClock(),counts={succeeded:0,quarantined:0,stale:0,retry_or_failed:0};
  let attempted=0;
  while(attempted<options.maxJobs) {
    if(options.signal?.aborted)return {attempted,counts,stopped:"shutdown" as const};
    if(elapsedClock()-started>=options.maxRuntimeMs)return {attempted,counts,stopped:"deadline" as const};
    const outcome=await workOne(store,process,Date.now,options.leaseDurationMs);
    if(outcome==="idle")return {attempted,counts,stopped:"idle" as const};
    attempted++;counts[outcome]++;
  }
  return {attempted,counts,stopped:"job_limit" as const};
}
