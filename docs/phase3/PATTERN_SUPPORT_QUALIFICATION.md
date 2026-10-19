# Milestone C support qualification — 2026-10-19

Status: **READY for the scoped support-quality correction**, locally validated. No deployment or database mutation occurred. This does not mark all of Phase 3 complete.

## Correction

Stored `role.domain` now selects a candidate statement; it cannot establish membership on its own. Four small statement-specific readable-text checks qualify the existing web, industrial-design, UI/UX and creative statements. Unconfigured domains and ambiguous titles abstain. No general title ontology, enrichment or new model-based decision was introduced.

The reader carries role id, title, organisation, description, stored domain, classification confidence and enrichment provenance. Displayed role support includes the exact qualifying title or description sentence and explicitly identifies earlier saved role text and inferred classification. It is not represented as V2 verified source evidence. Confidence does not substitute for readable support.

Role statements use historical wording. Web wording now says “web development or web design”: a Webdesigner title does not establish creative engineering. Portfolio and branding attention statements describe what the notes actually mention, without inventing distinctive portfolios, personal sites or studio practice.

Only statement-relevant notes attach to role patterns or contribute to their note bonus. Attention patterns show their matching notes only; unrelated primary roles are no longer presented as support. Distinct Person counts and the minimum of three are enforced after qualification. The existing maximum of three surfaced patterns is unchanged.

Reflect now uses the same constraint/date qualification helper as Recall and Resurface before aggregation. Known nonmembers are excluded and the denominator is the qualified population. Unknown membership causes abstention; topical Reflect population terms also abstain rather than being ignored. Reflect Concept support now reuses current managed owner-proof checks, deterministic relationship identity and frozen Concept meaning, and carries the actual reviewed reason and proof ids.

## Live Pattern Test

Question: **“What patterns do you see among the people I keep saving?”**

Result: `matches`, mode `reflect`, 17 evaluated People, complete 17/17 population. The existing Groq planner received only fixed planning instructions, the question and a timestamp, before corpus retrieval. No saved corpus content was sent to that planner. All SQL used `DIRECT_URL` and read-only transactions. No enrichment or embedding call was added or run by this test.

The three surfaced results below each have three independent People. Their support is the exact displayed note text; no role/fact is required or claimed as additional proof.

### 1. Recognition attention — 3 of 17

Statement: **“You repeatedly noted industry recognition (Awwwards, SOTD) when noticing people.”**

| Person | Exact displayed supporting note | Why it qualifies |
|---|---|---|
| Edoardo Lunardi | `awwwards designer.` | Explicitly mentions Awwwards. |
| Elliott Mangham | `Many SOTD awards` | Explicitly mentions SOTD awards. |
| Karthikeyan Selvan | `awwards young jury` | Explicitly mentions awards/jury attention. |

This describes repeated owner attention; it does not independently verify an award or jury appointment. No supporting People were removed from this attention group compared with the old aggregation; it was previously outside the top three.

### 2. Portfolio attention — 3 of 17

Statement: **“You repeatedly mentioned portfolios in your notes about saved people.”**

| Person | Exact displayed supporting note | Why it qualifies |
|---|---|---|
| Eduard Bodak | `good portfolio` | Explicit portfolio mention. |
| Lukas Mank | `nice portfolio` | Explicit portfolio mention. |
| Shreya Mathur | `unique portfolio` | Explicit portfolio mention. |

These notes support portfolio attention, not web engineering. No supporting People were removed from this attention group; it was previously outside the top three.

### 3. Branding attention — 3 of 17

Statement: **“You repeatedly mentioned branding in your notes about saved people.”**

| Person | Exact displayed supporting note(s) | Why it qualifies |
|---|---|---|
| Ananya Bagri | `branding agency` | Explicit branding mention. |
| Nivedha Nirmal | `architecture to branding`; `brand identity launch` | Explicit branding/brand-identity mentions. |
| Simon Dixon | `branding` | Explicit branding mention. |

Nivedha's two notes still count as one Person. “Architecture to branding” is not promoted into a reviewed trajectory or an inferred transition. No supporting People were removed from this attention group; it was previously outside the top three.

## Changes to the former top three

| Former surfaced pattern | Before | Qualified now | Removed People | Outcome |
|---|---:|---:|---|---|
| Web | 4 | 3 | Kat Kampf | Still qualifies; ranks below the three attention groups. |
| Industrial-design | 4 | 3 | Nivedha Nirmal | Still qualifies; ranks below the three attention groups. |
| UI/UX | 5 | 3 | Edoardo Lunardi; Nivedha Nirmal | Still qualifies; ranks below the three attention groups. |

**None of the former top-three patterns dropped below three in this live corpus.** Their disappearance from the displayed results is ranking under the unchanged cap, not threshold suppression. A focused regression verifies that changing a three-person group into two genuinely qualified People suppresses it.

Qualified industrial support:

- **Akshat Shah:** `CGi Generalist | Industrial Designer @ Noto`; `Industrial Design Internship @ Noto`; `Furniture Design Intern @ Tischlerei TAVOLA Küppenbender`. The explicit industrial/furniture titles qualify. `Interior Design Intern` is excluded.
- **Ananya Bagri:** `Design Intern @ AKFD`, qualified by this exact description sentence: “Working closely with craftsmen and designers, I gained hands-on experience in creating bespoke furniture while learning how tradition and innovation can coexist.” The generic title alone does not qualify. Neither `Inspiring` nor `branding agency` corroborates industrial design.
- **Lukas Mank:** `Studentische Hilfskraft @ FH Aachen University of Applied Sciences`, qualified by: “Student assistant in the field of industrial design and the model-making workshop.” Generic Noto internship/student titles alone are excluded. Neither `UMEA` nor `nice portfolio` corroborates industrial design.

Qualified web support:

- **Edoardo Lunardi:** `Creative Web Engineer @ Edoardo Lunardi`; `Senior Frontend Developer @ WILD`; `Frontend Developer @ BitBoss`; `Frontend Developer @ Hello Tomorrow • Agency`. Explicit web/frontend practice titles qualify.
- **Eduard Bodak:** `Webdesigner @ Eduard Bodak`; `Senior Webdesigner @ OPEN Digitalgruppe`; `Webdesigner @ Interlutions GmbH`; `Webdesigner @ eBou`. These qualify for web design, not an unsupported engineering claim. `Designer & Support Manager` is excluded.
- **Elliott Mangham:** `Web Developer @ Impression`; `Front-End Web Developer @ Creode`; `Front-End Web Developer @ Studio of Things`; `Creative Front-End Web Developer @ 2 Sisters Food Group`. Explicit development titles qualify. `Director @ Code Resolution®` is excluded unless its own description supplies a qualifying witness; it does not do so in this run.

Kat's `Product Manager III @ GitHub` and `Program Manager II @ Microsoft` do not establish web practice. Generic `interesting` and `test` notes cannot rescue them. No relevant notes corroborate this live web group.

Qualified UI/UX support:

- **Ananya Bagri:** `UX Analyst @ Deloitte Digital`; `UI/UX Intern @ 3 Minds Digital`.
- **Karthikeyan Selvan:** `User Experience Intern @ Lollypop Design Studio`. Generic Designer/Founding Designer/Product Designer titles do not independently establish interface work.
- **Shreya Mathur:** `UX Designer @ Tesla`; `User Experience Designer @ EY Studio+`; `User Experience Designer @ Designit`. Ambiguous Product Designer titles are excluded.

Those titles explicitly establish user-experience/interface work. Edoardo's design/dev jury title and Nivedha's generic `Design Intern @ JUSPAY` do not. No relevant notes corroborate this live UI/UX group.

## Validation

- 424/424 tests pass, including 20 focused Reflect tests and existing Recall, Resurface/3D scoring, trajectory and finite-context regressions.
- Clean TypeScript and production build/extension packaging pass.
- 164 isolated browser assertions pass using installed Edge, including actual Reflect description, historical wording and legacy-status rendering. Chrome failed to launch in this environment; Edge completed the same checks.
- 106 isolated HTTP assertions pass with synthetic configuration and no real login/database.
- Two live Pattern Test runs pass; the final run contains only the relevant note signals listed above. Read-only diagnostics separately checked qualified role groups beyond the top-three cap. No fresh live 3D provider test was run in this correction; its existing regression suite passes.
- Concept reader regressions exercise raw active edges without proof, current proof, ineligible/rejected proof, renamed/reclassified meaning, mismatched reasons and incorrect proof identity. They use a synthetic SQL adapter, not database mutations.

## Limits and deferred debt

- The legacy `artifact.person_id` path used for note-to-Person attribution remains unchanged, explicitly deferred by the task. Reconcile it against reviewed authorship/source identity in a separate task before claiming authoritative attribution for all legacy artifact notes.
- Legacy role text remains unverified historical data. This correction makes the displayed claim defensible from that readable text; it does not establish independent external truth.
- Conservative text witnesses may miss legitimate work described differently or in other languages. Rejection is preferable to inferring narrow work from a coarse domain label. This is not a general semantic entailment engine.
- No database writes, migrations, backfill, Capture activation, re-enrichment, deployment, visual-token changes or next milestone work occurred.
