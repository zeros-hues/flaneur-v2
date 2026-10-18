// The earlier rebuild deleted stable Person/Artifact identities and cannot operate on the v2 graph.
// Kept as an explicit refusal for old command invocations; no database connection or parser is imported.
console.error(JSON.stringify({status:"retired",code:"LEGACY_REPARSE_RETIRED",
 message:"The destructive legacy rebuild is retired. Use versioned parse jobs and reviewed migration services."}));
process.exitCode=1;
