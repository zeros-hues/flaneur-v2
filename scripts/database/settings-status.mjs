import { existsSync, readFileSync } from "node:fs";
import { safeFailure } from "../phase0/environment.mjs";

// Configuration presence only. Never print settings, hosts, file content or credentials.
try {
  const present = existsSync(".env");
  const configured = present && /^\s*(?:export\s+)?DIRECT_URL\s*=/m.test(readFileSync(".env", "utf8"));
  if (present) process.loadEnvFile(".env");
  console.log(JSON.stringify({ env_file_present: present, direct_url_key_present: configured,
    direct_url_loaded_nonempty: Boolean(process.env.DIRECT_URL?.trim()) }));
} catch (error) { safeFailure(error); process.exitCode = 1; }
