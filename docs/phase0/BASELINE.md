# Phase 0 baseline and decisions

Measured 2026-10-11. Phase 0 is in progress; the recovery gate is pending. No application behavior, schema, or production data was changed. The updated PRD remains authoritative; structural integrity does not establish product correctness.

## Database evidence

The inspection used a repeatable-read, read-only transaction with a 15-second statement timeout. PostgreSQL reports 18.6 and pgvector 0.8.6. All 17 expected public tables exist. All six repository migration timestamps and SQL hashes match the migration ledger; no unrecognized ledger entries were found. This is not a complete schema-diff proof.

| Table | Rows |
| --- | ---: |
| person | 17 |
| organisation | 50 |
| role | 63 |
| education | 17 |
| skill | 22 |
| headline_history | 12 |
| section_coverage | 43 |
| artifact | 22 |
| note | 36 |
| snapshot | 36 |
| schedule | 3 |
| concept | 68 |
| concept_link | 54 |
| concept_edge | 100 |
| quarantine | 0 |
| parser_health | 0 |
| saved_query | 1 |

There are 13 profile snapshots without an artifact and four artifacts without a URN. These are historical mapping cases, not grounds for discarding data. No snapshotless/unresolved notes, unresolved snapshots, invalid authorship, missing profile embeddings, unclassified roles, dangling saved-query references, invalid concept edges, frequency mismatches, or non-topic co-occurrence mismatches were found. Role date precision/order and confidence checks returned zero anomalies.

Three recent payloads were decompressed in memory: two profiles and one post. All three passed gzip validation. Profiles cover top card, about, experience, education, and skills. This sample does not prove every snapshot is recoverable or that extracted facts are correct. No private payloads or identities are included here.

Reproduce aggregate inspection: `node scripts/phase0/inspect.mjs`. Add `--schema` for schema metadata. The script loads the existing local environment; it never prints the database URL or captured text. It fails with a sanitized error code.

## Consumers and disposition

| Boundary | Consumers | Decision and target requirement |
| --- | --- | --- |
| Legacy entities and source identities | `db/schema/*`, `lib/merge*.ts`, parsers | Restructure: stable references, source-neutral identity, deduplicated objects distinct from save history |
| Snapshot and note capture | `app/api/capture/route.ts`, `lib/capture/*`, extension | Retain originals; replace synchronous completion and repeat suppression with durable encounters and retry identity |
| Derived classifications and embeddings | `lib/enrich/*`, concept links/edges | Revalidate inputs and support; legacy generated data remains attributed inference |
| Search and answers | `lib/search/*`, `lib/ask/*`, `lib/query/*`, query API | Replace population gate and permissive citation fallback; unify constraints and evidence population |
| Person/artifact/concept views | `lib/views/*`, corresponding app routes | Restructure around why noticed, encounter history, complete work, and source inspection |
| Scheduling | schedule consumers and Walk | Replace due obligations with contextual finite sessions and dismissal history |
| Saved queries | query persistence and result references | Preserve identities/text; version routing and resolve aliases |
| Export and replay | `lib/export.ts`, `scripts/reparse.ts`, `scripts/reenrich.ts` | Replace incomplete export; prohibit destructive replay as migration tooling |
| Privacy | authentication, route metadata/loaders, provider calls | Audit independent authorization for private reads, revocation, deletion, and disclosure |
| Design/navigation | `design-reference/DESIGN.md`, `docs/micro-interactions.md`, Atlas/City | Superseded references cannot prescribe product behavior; apply updated brief during Phase 4, remove unsupported navigation |

This is a migration-boundary inventory, not a claim that every consumer has been converted. Before each schema change, search all imports and SQL references for its specific affected tables and columns.

## Decisions for the first implementation slice

- Keep the proposed shared object-reference registry, with enforced subtype consistency; source identities and aliases must survive correction/merging.
- Create profile-page artifacts for historical profile snapshots while preserving existing person/snapshot UUIDs. Missing URNs require source-supported identities or explicit unresolved state, never invented URNs.
- Backfill one encounter per historical snapshot using a unique migration key. Link current note text without claiming it is original capture-time wording.
- Use a new client request UUID for each intentional save and reuse it only for delivery retries.
- Preserve source/user data; mark unsupported generated derivations as legacy inference. Recompute active aggregates from authoritative assertions.
- Durable processing needs persisted jobs and leases. Hosting-specific worker choice remains open until actual platform limits are confirmed.

## Deployment limits and open gates

`vercel.json` specifies Next.js but no duration override. Provider retry/timeout configuration can exceed a short request lifetime. Next.js `after` runs within the platform lifetime and is not a durable queue. The repository does not establish the deployed plan, effective duration, worker support, or observed capture latency. Confirm these operational values before Phase 2; do not invent them from framework defaults.

The user explicitly deferred the unverified isolated restore gate in [RECOVERY.md](RECOVERY.md) and authorized local Phase 1 implementation. No PostgreSQL CLI or Docker was discovered in the current command path. No database creation, migration application, or backfill execution is authorized; the existing database stays read-only.

The targeted evidence baseline suite uses synthetic data and no providers: `node --test scripts/phase0/acceptance.test.mjs`. Measured result: one passing positive control and two failing target assertions marked TODO (unsupported citation date and missing inference labeling). Its zero exit code reflects TODO status, not migration acceptance. The remaining behavior cases are defined in [ACCEPTANCE.md](ACCEPTANCE.md).

Updated design guidance still needs a concrete token/component specification against the new brief before UI implementation. Historical semantic correctness and entity merge quality require evidence review beyond these aggregate checks. Phase 0 does not claim these reviews or operational capture measurements are complete.
