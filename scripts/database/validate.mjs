import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { databaseUrl, safeFailure } from "../phase0/environment.mjs";

// No credentials are bundled; only the administrative process reads DIRECT_URL.
let client;
let validation;
try {
  const outfile = resolve("node_modules/.cache/flaneur/sql-validation.mjs");
  await build({ entryPoints: ["scripts/database/validate.ts"], outfile, bundle: true, platform: "node", format: "esm",
    packages: "external", logLevel: "silent" });
  validation = await import(pathToFileURL(outfile).href);
  client = postgres(databaseUrl("DIRECT_URL"), { max: 2, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  const mode = process.argv.slice(2);
  if (mode.length > 1 || (mode.length && !["--sessions-only", "--throttle-only", "--export-only", "--reviews-only", "--inspection-only", "--identity-inspection-only", "--archive-compatibility-only", "--notes-only", "--memory-query-only", "--contextual-walk-only", "--walk-sessions-only", "--walk-contention-only", "--memory-inspection-only", "--memory-trail-only", "--capture-runtime-only", "--source-resolution-only", "--person-creation-only", "--identity-reassignment-only", "--profile-relationships-only", "--authorship-only", "--relationship-retrieval-only", "--concept-associations-only", "--concept-retrieval-only", "--career-only", "--trajectory-only"].includes(mode[0])))
    throw Object.assign(new Error("Invalid validation mode"), { code: "INVALID_VALIDATION_MODE" });
  const run = mode[0] === "--trajectory-only" ? validation.validateTrajectoryOnly : mode[0] === "--career-only" ? validation.validateCareerOnly : mode[0] === "--sessions-only" ? validation.validateSessionsOnly :
    mode[0] === "--throttle-only" ? validation.validateThrottleOnly :
    mode[0] === "--export-only" ? validation.validateExportOnly :
    mode[0] === "--reviews-only" ? validation.validateReviewsOnly :
    mode[0] === "--inspection-only" ? validation.validateInspectionOnly :
    mode[0] === "--identity-inspection-only" ? validation.validateIdentityInspectionOnly :
    mode[0] === "--archive-compatibility-only" ? validation.validateArchiveCompatibilityOnly :
    mode[0] === "--notes-only" ? validation.validateNotesOnly :
    mode[0] === "--memory-query-only" ? validation.validateMemoryQueryOnly :
    mode[0] === "--contextual-walk-only" ? validation.validateContextualWalkOnly :
    mode[0] === "--walk-sessions-only" ? validation.validateWalkSessionsOnly :
    mode[0] === "--walk-contention-only" ? validation.validateWalkContentionOnly :
    mode[0] === "--memory-inspection-only" ? validation.validateMemoryInspectionOnly :
    mode[0] === "--memory-trail-only" ? validation.validateMemoryTrailOnly :
    mode[0] === "--capture-runtime-only" ? validation.validateCaptureRuntimeOnly :
    mode[0] === "--source-resolution-only" ? validation.validateSourceResolutionOnly :
    mode[0] === "--person-creation-only" ? validation.validatePersonCreationOnly :
    mode[0] === "--identity-reassignment-only" ? validation.validateIdentityReassignmentOnly :
    mode[0] === "--profile-relationships-only" ? validation.validateProfileRelationshipsOnly :
    mode[0] === "--authorship-only" ? validation.validateAuthorshipOnly :
    mode[0] === "--relationship-retrieval-only" ? validation.validateRelationshipRetrievalOnly :
    mode[0] === "--concept-associations-only" ? validation.validateConceptAssociationsOnly :
    mode[0] === "--concept-retrieval-only" ? validation.validateConceptRetrievalOnly : validation.validate;
  console.log(JSON.stringify(await run(client)));
} catch (error) {
  console.error(JSON.stringify({ stage: validation?.validationStage() ?? "setup" }));
  safeFailure(error); process.exitCode = 1;
}
finally { await client?.end({ timeout: 2 }); }
