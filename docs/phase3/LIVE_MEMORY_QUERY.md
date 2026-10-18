# Live v2 memory query integration

Local implementation status, 2026-10-13. The interrupted query integration is complete for this slice. Phase 3 remains incomplete.

`POST /api/query` now uses the prepared v2 planner and read-only observation reader instead of the earlier classifier/search/answer pipeline. The response contains a typed memory block with finite object matches, literal evidence, truth-layer labels, uncertainty, and available source links. New immutable Person notes participate immediately. Correction withdraws the prior revision from current matches; archived or aliased objects and inactive dependencies remain excluded.

The existing planner provider receives only the user's question and server reference instant. Stored notebook evidence is displayed locally and is not submitted for answer synthesis. Ambiguous plans ask for clarification before retrieval. Provider, reader, and label failures return a private unavailable state; there is no legacy answer fallback. This does not establish planner accuracy or semantic recall quality.

Unmapped earlier notes remain exact User text with distinct `legacyNoteId` provenance and explicitly unverified historical support. They do not acquire fabricated observation IDs or typed facts. Rows already represented by an observation are excluded, including when that observation is inactive. Snapshot notes use a known active Encounter before Artifact or Person association; notes with archived or aliased recorded Encounters cannot fall back to a Person. This compatibility read creates no observations or backfill.

Evidence excerpts contain at most 2,000 Unicode code points and retain matching words near the end of long notes. Source links are exposed only from checked matching snapshot/text locators with HTTP(S) URLs and no embedded credentials. Source verification establishes quotation integrity, not semantic entailment. People link to their inspection page; earlier Person notes have stable page anchors. Artifact and Encounter detail pages remain pending.

The query route uses owner-session write authorization and exact configured HTTPS Origin checks. Its strict envelope accepts only `{query}` with 1–500 characters after trimming. It checks actual streamed bytes against an 8,192-byte maximum, rejects malformed UTF-8 and non-JSON input, and returns private, uncached responses with stable failure codes. Caller-supplied plans are rejected.

Validation completed:

- All 243 synthetic tests pass, including six memory composition and four request-handler tests.
- TypeScript and the production build pass.
- `node scripts/database/validate.mjs --memory-query-only` passes 15 checks through `DIRECT_URL`. The actual reader, label queries, authoring, correction, and Person archival stores are exercised with synthetic fixtures. Tests also cover a snapshot note before and after Encounter archival. Fixtures roll back and aggregate counts remain unchanged.
- Nine built-app HTTP assertions verify unauthenticated and foreign-origin rejection, private responses, and unsupported methods. No valid owner login or provider request was performed.

No permanent schema change, real note/review/query submission, private export, application backfill, or deployment occurred. Restoration verification remains deferred.

Remaining work: provider planning evaluation and semantic recall calibration; reviewed historical backfill and v2 capture cutover; v2 saved-query storage/replay; Artifact/Encounter inspection; optional supported answer/reflection generation; and contextual finite Walk selection, persistent session boundaries, and dismissal semantics. The existing Walk and saved-search endpoints still use earlier implementations and must be migrated against the new PRD. Live HTTPS login and interactive query/browser verification remain unconfirmed.
