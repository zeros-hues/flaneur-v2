# Trajectory proposal — approval required

Implementation follow-up, 2026-10-19: the user approved proceeding from this proposal and the directed trajectory slice is now [implemented and validated](TRAJECTORY.md). The proposal and its approval gate below are retained as historical design context. Explicit claims and opt-in dated-input candidates use existing Observations/reviews; no automatic trajectory generation, generic timeline or permanent schema change was introduced.

Design only, 2026-10-18. No trajectory code, migration, stored transition or backfill is implemented. The completed education/employment slice is described in [its report](EDUCATION_EMPLOYMENT.md).

Target question: **“Who have I saved who moved from mechanical engineering into AI?”**

## Existing support

V2 can independently establish a reviewed education field at a saved Organisation, reviewed employment, and a direct reviewed Person Concept association. Each has inspectable User evidence and withdrawal history. Existing Source/Extracted Observations can retain immutable captured-text locators and identity derivation dependencies. Artifact/profile relationships explain where material was encountered; they do not automatically establish Person facts.

Legacy education and role rows retain start/end dates with day/month/year/absent precision. Roles also have titles, current flags and enriched domains. Those are retained inputs, not automatically reviewed chronology. Inferred role domains are not equivalent to source-stated disciplines. Their existence alone cannot support a transition.

The existing relationship table has `valid_from`/`valid_to`, but the career writer leaves them unset. One edge per Person/Organisation/predicate cannot represent several separate education or employment episodes accurately. Guessing dates on that edge would collapse distinct episodes.

Encounter and Observation timestamps can order attention or recording, not career events. A profile saved today may describe a change from years ago. Today's supported result is therefore “reviewed education in A and a reviewed association with B,” with separate citations. It cannot become “moved from A to B.”

## Missing semantics

Full chronology needs stable career episode identities, their education/employment context, reviewed disciplinary meanings, supported date bounds and precision, and independent evidence for each assertion. Unknown, ongoing, overlapping and conflicting periods need explicit treatment. A year must remain a coarse interval, not an invented exact day.

Direction needs evidence for the transition itself. Two different disciplines, even in sequence, do not prove that one replaced the other. A Person may work in both. Motivation, exclusivity, abandonment and causation are separate claims. General AI interest or a Concept association is not necessarily employment in AI. Mapping source terms or role descriptions to Concepts requires reviewed/source-supported meaning rather than automatic synonym merging.

## Recommended hybrid model

Store authoritative inputs as immutable typed Observations on a canonical Person. A future episode has its own stable identity, kind, optional Organisation, discipline attribution, supported period/precision and independent supporting Observation IDs. Existing role/education rows may become linked projections when their support and episode identity are established; mutable legacy rows must not become the sole evidence source.

Store an explicit transition claim as an Observation with structured A→B meaning, links to supporting Observations/episodes when known, and optional supported temporal bounds. Preserve trust:

- **User:** the owner explicitly asserts/reviews the move and supplies an exact reason. This is not independent source verification.
- **Source/Extracted:** captured material explicitly states the move. Retain the Source quote; the structured parse is Extracted and requires exact locator, correct Person identity proof and current derivation support.
- **Inferred:** a later rule/model proposes a transition. Retain rule/version and dependencies; do not let an inferred proposal satisfy strict “moved” Recall as a confirmed transition.

Derive current retrieval indexes/views from eligible claims and support. Cached inferred candidates may be recomputed and withdrawn. Avoid another static `moved_into` edge as the source of truth: it hides episode identity, uncertainty and direction evidence. Existing `similar_trajectory` also does not establish an individual's transition.

The first implementation should not infer moves from episode ordering. The hybrid model leaves room for that later without presenting it as an explicit transition.

## Matching rules

| Question | Required evidence | Safe interpretation |
| --- | --- | --- |
| Has A and B experience/associations | Independent current predicates on the same Person, with their actual meanings | Coexistence; no ordering |
| Was in A before B | Supported episode meanings and date bounds establishing order | Temporal order; no abandonment or career change |
| Moved from A into B | Current explicit transition assertion supporting the Person and direction | Qualified User/Source/Extracted claim of a move |

For coarse dates, establish strict order only if A's latest possible end precedes B's earliest possible start. Otherwise order is unknown or periods overlap. Missing end dates do not mean “ongoing” or “ended before B.” An explicit transition statement can establish direction with an unknown date; the answer must retain that uncertainty. A+B membership alone, or a proposed inference, must not satisfy a strict transition query.

## Objects and provenance

**Person** is the identity anchor and result. **Education/employment episodes** supply context, without automatically implying a transition. **Concepts** identify reviewed disciplinary meanings but acquire no global temporal ordering; the same Concept may appear in several episodes.

**Observation** remains the evidence/review unit. Preserve exact User reasons, Source quotes and locators, and actual supporting identity/episode/field Observations. Reuse stable request receipts, dedicated review routing and dependency invalidation. Rejection, correction, supersession, archive/alias changes or changed supporting meanings must withdraw dependent transition support. A Source/Extracted claim cannot survive withdrawal of its required source or identity evidence. Independent User assertions remain visibly User assertions.

**Encounter** records when and why material caught the user's attention. Link it only when actual provenance exists; never substitute its capture date for event time or invent an Encounter for a manual claim. **Artifact** authorship/profile links cannot transfer a transition to a Person without explicit Person-bound evidence. Organisation or Artifact Concept relationships cannot fill missing transition endpoints.

Results should show direction, trust layer, known/unknown period, exact evidence and review history. Inferred candidates belong in a separate uncertain presentation, not the confirmed result set.

## Smallest safe next slice

1. Review a strict explicit-transition Observation contract: Person ID, exact A/B disciplinary meanings, optional episode references, owner reason or validated source support, optional date bounds/precision, and stable request ID. Select existing Concepts only when their identities are explicitly reviewed. Do not require invented dates, schools or chronology.
2. Implement owner confirmation/withdrawal and scoped history for that explicit claim, freezing both meanings and reusing existing review/dependency primitives. No automatic claims from current career predicates, legacy role rows or general Concept associations.
3. Extend the existing Person retrieval path with a directed transition constraint. Exact identities, clarification, current support and trust qualification remain mandatory. An A+B conjunction cannot satisfy it. Keep event time separate from Encounter time.
4. Validate direction/reverse-direction, coexistence-only exclusion, ambiguous meanings, withdrawn/superseded/missing support, identity withdrawal, no Artifact propagation, exact provenance and history with rollback-only SQL and browser checks.
5. Propose episode/date review and derived ordering separately after that explicit-claim slice is useful. Assess repeated episodes, integrity rules and any schema/backfill changes before implementation or migration approval.

The first cut can leave event dates unknown and reuse existing Observation/review storage. It provides bounded, explicitly supported transition Recall rather than automatic trajectory reconstruction. Full episode chronology may require additional storage; this proposal authorizes no permanent schema change.

**Approval gate:** trajectory remains unimplemented. Review and approve this proposal before any trajectory implementation.
