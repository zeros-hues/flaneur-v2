import { reviewHandler, type ReviewDependencies } from "./handler";

interface OwnerRuntime { authorize(request: Request, required: "read" | "write"): Promise<boolean> }
/** Only an owner runtime is supplied by the server; the caller cannot choose its principal or permission. */
export function ownerReviewHandler(dependencies: ReviewDependencies, owner: OwnerRuntime, origin: string) {
  return reviewHandler(dependencies, { origin, authorize: request => owner.authorize(request, "write") });
}
