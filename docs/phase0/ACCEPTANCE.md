# Target acceptance cases

These are new-PRD contracts, not snapshots of existing behavior. Use only synthetic records for automated fixtures. Cases without a runnable harness remain pending; they are not passing tests.

| Case | Fixture/action | Required result | Phase |
| --- | --- | --- | --- |
| First capture | One person; source contains material research | Recall returns that person with support, regardless of population size | 3 |
| User reason | Source lacks ceramics; user reason says ceramic experimentation | Recall finds the person through the reason and labels it user-authored | 3 |
| School plus topic | A: EPFL/materials; B: EPFL/cooking; C: other school/materials | EPFL plus materials returns A; no unconstrained semantic additions | 3 |
| Missing evidence | Corpus contains no marine biology | Abstain without presenting nearest unrelated people as supported matches | 3 |
| Citation integrity | Valid author but unsupported date; unknown evidence ID | No source promoted through fallback; unsupported claim rejected or marked unsupported | 3 |
| Inference boundary | Generated profile synthesis and captured post | Clearly distinguish inference from source; inspection opens original evidence | 3–4 |
| Mixed query | Ask a question and request relevant people | Answer and object list use one constrained evidence population | 3 |
| Delivery retry | Save request R, disconnect, reload, retry R | One durable snapshot/encounter; queued/saved/failed states are accurate | 2 |
| Repeated attention | Save the same post with new request S and a new reason | One deduplicated artifact, two distinct encounters/reasons | 2 |
| Extraction failure | Valid capture whose adapter fails | Snapshot and encounter remain accessible; retry/quarantine state is inspectable | 2 |
| Richer recapture | Existing short artifact receives longer supported content | Affected derived records invalidate; originals and identity remain | 2 |
| Historical backfill | 13 profile-only snapshots and four missing-URN artifacts | Every original resolves or is explicitly unresolved; no invented identity/context | 1 |
| Replay safety | Run backfill twice; resume after interruption | Stable mappings, no duplicated history, authoritative aggregate reconciliation | 1 |
| Uncertain chronology | Year-only role date and missing past action dates | Precision preserved; no fabricated transition/contact timestamp | 1–4 |
| Contextual Walk | Profile-only candidate plus diverse artifacts and context | Useful candidates, up to three stops, explained selection, resumable session | 5 |
| Dismissal | Dismiss a stop, close, reopen | Persist suppression; no increased due pressure or forced review backlog | 5 |
| Honest interaction | Clipboard fails or source open fails | No false copied/contact event | 5 |
| Deletion closure | Delete an object with observations/jobs/search/support links | Declared deletion policy reaches all derivatives; unrelated objects survive | 6 |
| Full export | Export then restore isolated data | All originals, user text, references, truth layers, and history accounted for | 6 |
| Private metadata | Unauthenticated request to a private detail route | No identity/source information leaks through metadata or loaders | 6 |
| Accessible utility | Keyboard, small-screen submit, reduced motion | Equivalent completion and visible provenance without color-only meaning | 4 |

Start with deterministic exact-match/absent-topic cases. Tune semantic thresholds only after expected candidates and explicit distractors are fixed. Report recall, constraint violations, unsupported claims, and evidence validity separately; an average score cannot conceal a privacy or citation failure.
