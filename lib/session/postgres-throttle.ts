import type postgres from "postgres";
import { validateThrottleAttempt, type LoginThrottleStore } from "./throttle";

/** Atomic shared fixed window; database clock is sampled after acquiring the bucket lock. */
export function postgresLoginThrottleStore(connection: ReturnType<typeof postgres>): LoginThrottleStore {
  return { async consume(input) {
    const attempt = validateThrottleAttempt(input);
    const result = await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '10s'`; await sql`set local lock_timeout = '3s'`;
      await sql`insert into auth.login_throttle (bucket_key, window_started_at, attempts, max_attempts, window_seconds)
        values (${attempt.bucketKey}, clock_timestamp(), 0, ${attempt.maxAttempts}, ${attempt.windowSeconds})
        on conflict (bucket_key) do nothing`;
      const [row] = await sql`select max_attempts, window_seconds from auth.login_throttle
        where bucket_key = ${attempt.bucketKey} for update`;
      if (row!.max_attempts !== attempt.maxAttempts || row!.window_seconds !== attempt.windowSeconds)
        throw new Error("LOGIN_THROTTLE_POLICY_MISMATCH");
      const rows = await sql`with tick as (select clock_timestamp() as now)
        update auth.login_throttle set
          attempts = case when window_started_at + (window_seconds * interval '1 second') <= tick.now then 1 else attempts + 1 end,
          window_started_at = case when window_started_at + (window_seconds * interval '1 second') <= tick.now then tick.now else window_started_at end
        from tick where bucket_key = ${attempt.bucketKey} and
          (attempts < max_attempts or window_started_at + (window_seconds * interval '1 second') <= tick.now)
        returning bucket_key`;
      return { allowed: rows.length === 1 };
    });
    return result.allowed;
  } };
}
