// Applies a walk answer to an item's spaced-repetition schedule.
import { eq } from "drizzle-orm";
import { artifact, schedule } from "@/db/schema";
import { db } from "@/lib/db";

export const WALK_ACTIONS = ["say_hello", "keep_walking", "street_closed", "just_passing"] as const;
export type WalkAction = (typeof WALK_ACTIONS)[number];

// Column defaults, used when an item is answered for the first time (no schedule row yet).
const DEFAULT_EASE = 2.5;
const DEFAULT_INTERVAL = 1;
const MIN_EASE = 1.3;

interface State {
  ease: number;
  intervalDays: number;
}

/** say hello (5) and keep walking (3) grow the interval; just passing (2) shrinks it; street's closed (0) resets. */
function next(action: WalkAction, { ease, intervalDays }: State): State {
  switch (action) {
    case "say_hello":
    case "keep_walking":
      return { ease, intervalDays: intervalDays * ease };
    case "street_closed":
      return { ease: Math.max(MIN_EASE, ease - 0.2), intervalDays: 1 };
    case "just_passing":
      return { ease, intervalDays: Math.max(1, intervalDays * 0.8) };
  }
}

/** Returns false when the artifact does not exist. */
export async function answerWalkItem(artifactId: string, action: WalkAction): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ type: artifact.type })
      .from(artifact)
      .where(eq(artifact.id, artifactId))
      .for("update");
    if (!item) return false;

    const [current] = await tx
      .select({ ease: schedule.ease, intervalDays: schedule.intervalDays })
      .from(schedule)
      .where(eq(schedule.artifactId, artifactId));
    const state = next(action, current ?? { ease: DEFAULT_EASE, intervalDays: DEFAULT_INTERVAL });
    const values = { ...state, lastSurfacedAt: new Date(), lastAction: action };

    await tx
      .insert(schedule)
      .values({ artifactId, ...values })
      .onConflictDoUpdate({ target: schedule.artifactId, set: values });

    if (action === "say_hello" && item.type === "connection_request") {
      await tx.update(artifact).set({ status: "messaged" }).where(eq(artifact.id, artifactId));
    }
    return true;
  });
}
