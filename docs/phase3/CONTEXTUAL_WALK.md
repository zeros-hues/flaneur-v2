# Contextual Walk preparation and truthful draft outcomes

Local status, 2026-10-13. This is the first contextual Walk implementation slice, not a completed Phase 5 cutover.

The authoritative updated PRD calls for finite rediscovery using age, salience and diversity, with no review obligations. The earlier live Walk instead selects due artifacts, uses SM-2 intervals and overdue emphasis, and has no persisted session boundary. Its automatic `messaged` update after draft intent also incorrectly implied contact.

Live changes completed:

- The temporary legacy action adapter no longer updates Artifact contact status for `say_hello`. Copying or opening a profile cannot establish contact. Historical statuses are preserved, not rewritten as confirmed contact.
- WalkCard checks actual clipboard fulfillment. Draft failure, copy failure, and action-save failure have distinct feedback. A failed copy leaves the draft visible and the stop available. A successful draft is cached for retries. The action is recorded only after successful copying; preparing a draft alone performs no schedule write. A copy-success/save-failure message reports both outcomes.

Prepared modules:

- `lib/walk/contextual.ts` composes at most three deterministic People/Artifact stops from supplied candidates. Profile-only People need no Artifact or schedule row. It uses bounded age, User-text presence, repeated recorded encounters, explicit context token overlap, and text diversity. Each selected stop includes a supported reason and exact evidence. It does not infer source changes, relationships, contact, or correspondences.
- Feedback lowers rank through `1 / (1 + dismissals)`. Three dismissals suppress an object indefinitely; recent exposure rests for seven days. Low-salience material can fall below the selection threshold rather than becoming due. These constants are an initial evaluation policy, not calibrated product decisions. Feedback must come from trusted persisted attention events in the next slice; it is currently only an injected contract.
- `lib/walk/postgres-contextual.ts` reads active canonical People and Artifacts through the existing observation/dependency reader in a checked repeatable-read read-only transaction. Current immutable notes and unmapped earlier User notes retain their provenance. Revised/inactive text is withdrawn, independent Artifacts are retained, and archived/aliased People are excluded. Candidate dates represent stored capture/encounter timestamps, not verified historical encounter dates. The adapter imports no configured pool, credentials, or provider.

The contextual selector is intentionally not imported by the live Walk page. The live selector and schedule behavior remain legacy, including overdue presentation and nonpersistent navigation behavior. Removing the false-contact mutation and misleading copy-success feedback does not make that scheduler compliant with the new PRD. The draft generator still uses earlier note/synthesis context and needs evidence/provider-control migration.

Validation:

- All 251 synthetic tests pass; eight new cases cover profile-only finite selection, determinism, salience, context, diversity, negative feedback, invalid inputs and truthful draft outcomes.
- TypeScript and production build pass.
- `node scripts/database/validate.mjs --contextual-walk-only` passes 15 focused checks through `DIRECT_URL`. Actual read-only candidate queries and the actual supplied-connection legacy action adapter are exercised. SQL checks verify immutable-note revisions, profile-only eligibility, independent Artifact retention, archive exclusion, unchanged contact status after draft intent, and rejection of actions on an archived author. Synthetic fixtures roll back and aggregate counts remain unchanged. The full SQL suite was not rerun.
- Eight built-app HTTP checks verify protected Walk routes and page redirection. No owner login, provider request, or real Walk action was submitted. Interactive clipboard/browser behavior remains unverified.

No migration, real contact change, application backfill, or deployment occurred. Restoration verification remains deferred.

Next implementation slice: prepare persistent `walk_session`, ordered `walk_stop`, and idempotent `attention_event` storage and supplied-connection services. Enforce the explicit owner/local-day/timezone boundary, atomic creation of zero to three stops, frozen membership, completed-session replay, and no refill after navigation or context edits. Record actual visibility separately from selection, and derive negative feedback from explicit events. Archived stops must be omitted without replacements. Validate the proposed schema with rollback-only SQL before requesting authorization for any permanent migration. Then connect the new page/actions and retire legacy interval scheduling. Contact confirmation remains a separate explicit User assertion.
