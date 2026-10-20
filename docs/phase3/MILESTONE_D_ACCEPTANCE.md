# Milestone D - final controlled real-source acceptance

Date: 2026-10-20 (Asia/Calcutta).

**Classification: READY for the controlled local new-save workflow.** The three owner-selected real sources were saved, processed with live providers, inspected and retrieved. Deliberate duplicate and real queued-work restart acceptance passed. This does not classify all Flaneur V2 milestones complete or authorize unrestricted hosted Capture, deployment or historical backfill.

## Acceptance results

| Case | Actual result |
| --- | --- |
| LinkedIn profile | PASS: one Artifact reused by eight distinct Save requests; preserved source and exact reasons; embedding and Concept inference; identity unresolved safely |
| Different-reason duplicate | PASS: same Artifact, new Snapshot/Encounter/User Observation; exact second note; earlier records intact |
| LinkedIn post | PASS: canonical post-URN identity, exact User reason, no invented author, live processing and retrieval |
| Generic web project | PASS: exact web URL identity, source text and owner note, live processing/retrieval, no invented Person |
| Durable queued-work restart | PASS: exact queued post job survived a full runtime restart and completed; 24 prior jobs were not replayed |
| Approved live 3D Resurface | PASS: new post appeared at rank 5 in the stored post-stage result; no score injection or tuning |
| Reflect safety | PASS: 17-person population unchanged; zero new capture reasons admitted as unsupported Person support; no new Pattern claimed |
| Regression suite | 436 tests pass; application and extension TypeScript pass |

## Exact requests and saved object graph

There were ten actual Save gestures: seven profile saves made while troubleshooting delivery, one deliberate different-note duplicate, one post and one web page. Network delivery retried those identities; the database has one receipt per UUID. The seven troubleshooting captures were preserved and were not silently deleted or combined.

| Source | Request UUID | Artifact | Snapshot | Encounter | Exact User Observation |
| --- | --- | --- | --- | --- | --- |
| LinkedIn profile | f656886d-8559-4365-a503-f53c1d150f72 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | 783fadc2-6ee6-4902-9f42-b876e7ba3313 | cce25ef8-65e3-4b60-a762-48320b7e662d | cdbfc844-fcab-4f43-ad88-27f768f279a2 |
| LinkedIn profile | 5ef9adf0-f5bc-4e49-a34e-3f783b6dfb52 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | ca408c4d-cd10-4bce-a76c-806cf08a72e4 | 109a25d1-92e6-4558-8572-d75b32f4a878 | 72527992-b211-4bbc-9cd4-8f3811aef490 |
| LinkedIn profile | 13b30139-2722-4aec-8124-1c144b3b1b61 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | ce65fc0d-4165-4233-ab43-ad36b73cea37 | ffcf7bf7-9f3f-4d9d-b845-892d375962d6 | 7fcd67c1-716a-44e5-a292-31526f77dd84 |
| LinkedIn profile | a3ed0756-1a62-4d82-b294-5633614cb57b | c302ff15-e501-4ece-ae73-a8f0cefdbddb | ef9003ed-433c-4b5b-a9d5-466f99e9010d | a2a31063-ffb5-4538-8cea-e891be92bc41 | 1b6ce69c-b564-4602-adef-897add4efd27 |
| LinkedIn profile | f60ad8dd-1949-4eaf-80c4-1b3bdb0995ad | c302ff15-e501-4ece-ae73-a8f0cefdbddb | 11da1bf6-4170-4edf-9f00-35246f5b3caa | ed890202-0a2c-4aab-9a03-d70c42506f65 | 8d5b6a07-1b92-4280-8e77-9b2b52dc4029 |
| LinkedIn profile | b18c42ad-0716-49ed-932d-93fdd8054b65 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | f81834f3-f6eb-492f-8fde-6b8de47d5710 | 30907687-7064-4f3d-a56b-eb97093c16f2 | 1cd16f35-ae3e-40cc-b83d-c3f873982486 |
| LinkedIn profile | f507f34e-cb9b-4d16-978f-6432c98e9c37 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | 2f840c49-d478-47b6-9ef7-65d1b66fc871 | 7e56a3ef-eb23-47f2-ae27-31329f1f8b8d | d8c0c613-791c-4ccd-a607-c1f1f8cd1456 |
| LinkedIn profile | 5c30e58e-f96d-46a8-aa18-75ce6ae81640 | c302ff15-e501-4ece-ae73-a8f0cefdbddb | 8683d23b-3a2d-448f-842b-75e150899c10 | e61f05a8-964b-484e-8ee1-cd2ace927796 | d3220ca0-ebf0-4732-aff7-169bd6361bed |
| LinkedIn post | 5603b948-9033-43a0-9658-807aa0639e62 | 99a85389-db35-45c0-9fde-5276c1bc29fd | 1f09a464-7a6a-4d82-bf01-2e121a0f80d1 | c1b2d71e-22b9-4403-a154-92c3b3c2b35b | e2fe6834-0f80-4bac-9b36-ccb322aba679 |
| Web project | d546af0e-ff3d-4794-90fb-243b29c0591f | 758a3f6a-be5a-467d-a7c2-09dce73cfc6e | c73140dc-f881-45ca-8001-172703122ea3 | 33dea99e-8f2f-456f-b04d-5647df89b23d | 1a273fc0-a68d-4017-88fa-65d88c251f67 |

| Source | Identity basis | Created/reused |
| --- | --- | --- |
| https://www.linkedin.com/in/dhilipkumarsomesh/ | exact_profile_url | First server-received save created one Artifact; seven later saves matched it |
| https://www.linkedin.com/feed/update/urn:li:activity:7517049371402870784/ | post_urn | Created social_post Artifact; recorded URN urn:li:activity:7517049371402870784 |
| https://www.gianlucaboccia.me/ | exact_web_url | Created article Artifact through adapter web |

The generic web Snapshot uses the existing capture_type=post storage bucket, distinguished by adapter_id=web and Artifact type article. Its normalizer and UI treat it as a web page, not a LinkedIn post or authorship assertion. No schema migration was needed.

Owner reasons remain exact User Observations on independent Encounters:

- Seven original profile notes: Interesting person and career path worth remembering.
- Deliberate duplicate: duplicate test
- Post: procedural materials
- Web: Interesting hero interaction

Each reason has origin capture:REQUEST_UUID:user-reason, its own Observation ID and a subject pointing to its Encounter. The receipt, source-context metadata and Encounter source link make its capture provenance inspectable. Verified support for an owner-authored reason does not mean that a source or inferred factual assertion was independently verified.

## Processing, representation and inference

All 30 durable jobs succeeded with attempts=1 and one successful run each: ten parse, ten index, ten enrich. There are ten immutable normalized representations, ten Snapshots, ten Encounters and three source Artifacts. Repeated sweeps attempted zero completed jobs. Older profile semantic jobs are historical; only the latest profile index/enrich heads are current.

All three current Artifacts have actual 768-dimensional gemini-embedding-001@768 vectors. Concept inference used Groq openai/gpt-oss-120b and prompt capture-semantic-v1; Concept-label vectors also used the live embedding provider. No synthetic provider or injected semantic scorer was used in these real source checks.

| Source | Current representation | Characters | Current inferred Artifact labels |
| --- | --- | --- | --- |
| Profile (current deliberate duplicate) | dc56040e-75dd-879b-98c0-af73001f18aa, linkedin-captured-text-v1:profile_page | 12451 | industrial design, light and sound, ai filmmaking |
| Post | 354c1cc5-32f7-8f12-b7b5-ea0c90a1a393, linkedin-captured-text-v1:social_post | 1048 | procedural texturing, blender, pbr texturing |
| Web | a4e2f48e-54dc-87ff-92ca-56ba46d0dddd, web-captured-text-v1:article | 198 | design systems, ui design, interfaces |

All classifications have inferred truth layer and partial support. Their structured provenance pins Snapshot, representation, parse fingerprint, semantic input fingerprint, model, prompt and Concept ID. Evidence rows retain source support. Concept links are Artifact-level, not reviewed relationships or Person assertions. Historical profile labels also include vehicle design and watch design; they are retained as history, while the reader gates current inference to successful current heads.

### Web capture details

Request: d546af0e-ff3d-4794-90fb-243b29c0591f.
Original content SHA-256: 82141ae505c8c49a11b0d180a554bdea10d5dfee895faabcd8cf19745940126c.
Normalized text SHA-256: 0efc06648143e93cb635635027f612d79995ec0392ab0502b8e3a7d71350b048.

The 198-character text records the portfolio title/name and short UI-design/design-systems description. The exact hero-interaction reason is separate owner-authored evidence. The capture has person_id=null, only an Artifact source link, no noticed/author Person links, no relationship candidates and no Person facts. The name and Candid role text in the source were not promoted into a Person or employment fact.

| Web stage | Job UUID | Run UUID | Outcome |
| --- | --- | --- | --- |
| enrich | b401130b-6a4c-4e10-868e-3105b21be8ad | a4fd412a-b9a0-4c1a-813f-61d94850739c | succeeded, attempt 1 |
| index | e0fe3856-3b1a-41f1-9721-8ebf0a2da92d | 97ffec78-f5e4-424b-85af-bba63feacf2d | succeeded, attempt 1 |
| parse | dddd4c44-42c5-42a5-8f8f-25e2fe0e1638 | 87dfb502-477a-4480-a973-959d8d6197ee | succeeded, attempt 1 |

No source was quarantined. Real LinkedIn normalization worked, although post text retains video-player/reaction UI. Generic web normalization is text capture: it does not record the animated hero, screenshots, interaction timing, canvas frames, implementation code or a replay. The LinkedIn video also has no captured transcript/visual understanding. These limits must remain visible when interpreting retrieval results.

## Identity, authorship and reviewed facts

Profile identity remains unresolved. The existing owner-review search for Dhilip returned no candidate; owner-reviewed Person creation is available but was not invoked. Post source text displays Mohamed Basil, but person_id is null and the authorship review reader has no assertions or candidates. The web portfolio also has no Person attribution.

No Person was created, no explicit identity was confirmed, no reviewed relationship was created automatically, and no education/employment/trajectory fact was extracted onto a guessed subject. There are no automatic Person Concept associations or A+B-to-transition inferences.

## Retrieval results and actual reasons

| Capture | Exact Recall | Relevant live Resurface |
| --- | --- | --- |
| Profile | Dhilip: rank 1, one shared Artifact with all reasons | Industrial design/AI filmmaking query: rank 1 in the stored profile-stage run |
| Post | procedural materials: rank 1 | Approved 3D question: rank 5, score 0.5755518221556087 |
| Web | Gianluca Boccia: rank 1; hero interaction: rank 1 | Hero-interaction context: rank 1, score 0.7234721048840672 |

The post-stage approved question used the original typographic apostrophe:

> I’m working on a performant 3D interaction website. What have I encountered before that might help?

The real planner selected resurface with terms performant, 3D, interaction, website and no constraints. The post ranked fifth among seven surfaced matches at that time. Its recorded semantic score was approximately 0.61, lexical coverage 0.25, owner-salience boost true, and no qualifying Concept bridge. Source discussion of procedural/PBR texturing, 3D tools and render speed provides context; the result is relevance, not a validated technical recommendation.

Web query: I am exploring hero interactions for a website. What have I encountered that might help?

The web Artifact ranked first, with semantic score approximately 0.68, lexical coverage 0.33, owner salience and a ui design Concept bridge. The hero connection is supported by the owner note. Nothing claims the model watched or understood the animation. The site was not forced into the unrelated 3D query. All query ranks are observations of the stored run/corpus, not guarantees for future queries or corpus changes.

No weights, qualification floors, filters, source text, Concept labels or graph records were adjusted to force these results. Semantic retrieval used real Gemini query vectors and pgvector. All three source viewers return normalized text with exact representation/Snapshot/code-point provenance, and each exact owner reason is retrievable. Relevance was not persisted as graph truth.

## Duplicate and restart evidence

[The deliberate duplicate report](DUPLICATE_CAPTURE_ACCEPTANCE.md) records the full before/after IDs. The Artifact stayed c302ff15-e501-4ece-ae73-a8f0cefdbddb; new request 5c30e58e-f96d-46a8-aa18-75ce6ae81640 created Snapshot 8683d23b-3a2d-448f-842b-75e150899c10, Encounter e61f05a8-964b-484e-8ee1-cd2ace927796 and User Observation d3220ca0-ebf0-4732-aff7-169bd6361bed. The seven earlier records and notes remain intact.

Each distinct Save intentionally triggered one parse/index/enrichment sequence. Across different Save gestures, that meant extra provider work; it is not claimed that content-identical snapshots are globally deduplicated. The same request identity did not create uncontrolled duplicate graphs or rerun completed jobs.

[The post/recovery report](POST_CAPTURE_ACCEPTANCE.md) records the actual queued parse job fe64761c-8882-4eac-8866-1f5cd7be669b before and after restart. It existed in the database with attempts=0 before restart, retained its ID/fingerprint and was processed once afterward. The original activation window and database fingerprint were unchanged. All 24 previous completed jobs retained their original attempts=1 and runs=1. All 27 jobs existing before the web save remain unchanged after that save, too.

This proves durable queued-work persistence and normal re-claim after restart. It does not claim a live crash during a provider call or takeover of an already expired lease. Those paths have prior synthetic/rollback coverage. No unrelated historical processing jobs existed at the recovery checkpoint, so historical exclusion against a populated unrelated queue was not demonstrated live. The exact activation/host/Snapshot claim restrictions remain in force, and the public baseline audit found no changed historical rows.

## Reflect safety

Actual read-only Reflect input remains 17 indexed People out of 17. New capture reasons admitted as Person notes: 0. New noticed/author Encounter links: 0. Semantic Person associations: 0. The Person table is unchanged.

No new Pattern is claimed. Current reasons can be retrieved as User attention on their source/Encounter. Person-level participation later requires legitimate explicit identity support under existing Milestone C rules and the independent-person threshold. Artifact semantics do not supply that identity or reviewed Person support.

## All permanent notebook writes from the intentional captures

The original read-only baseline covers all 41 public tables. Every original row checksum remains present unchanged. Only the following row-count additions were observed:

| Table | Before | After | Added |
| --- | --- | --- | --- |
| artifact | 22 | 25 | 3 |
| capture_request | 0 | 10 | 10 |
| concept | 68 | 79 | 11 |
| concept_link | 54 | 65 | 11 |
| encounter | 0 | 10 | 10 |
| encounter_object | 0 | 10 | 10 |
| object_ref | 157 | 221 | 64 |
| observation | 0 | 40 | 40 |
| observation_evidence | 0 | 30 | 30 |
| processing_head | 0 | 16 | 16 |
| processing_job | 0 | 30 | 30 |
| processing_run | 0 | 30 | 30 |
| snapshot | 36 | 46 | 10 |
| snapshot_representation | 0 | 10 | 10 |
| source_identity | 0 | 3 | 3 |

The 40 Observations consist of ten exact User reasons and thirty inferred classifications. Eleven Concepts and eleven inferred Concept links reflect labels across the input histories of the three Artifacts. There were no Person, reviewed relationship, original historical Artifact/Concept metadata or migration changes. Authentication session/throttle writes use the separate auth schema and are not notebook capture writes. All provider query/Recall/inspection audit transactions were read-only.

## Setup corrections and ordinary local-use limits

- The forgotten owner password was explicitly reset locally while retaining the principal ID. Only its hash was cleared/re-enrolled; the plaintext was never sent through chat or logs. This was a separately authorized .env change. Capture activation remains disabled in the saved .env; only child runtime settings enable the controlled local window.
- The launcher was corrected to use Next-compatible environment loading for escaped password hashes and dollar-containing settings. Synthetic round-trip regression tests cover the real installed loader.
- The owner approved a current-Windows-user trust change for the name-constrained Flaneur Localhost Development authority. The server now uses its separate localhost certificate. Normal Windows TLS validation returns health 200; the owner extension delivered all queued captures. [Exact certificate fingerprint and removal command](LOCAL_CAPTURE_TLS.md). The authority expires 2026-10-27; renewal creates a new trust decision that requires review/approval. No global certificate bypass was installed.
- Local HTTPS and the bounded worker must stay running. Closing the session/process can stop them; queued originals remain on the device or durable database jobs remain pending until restart. Use the launcher below; preserve the ignored activation state while work is pending.
- Keep older production-directed Flaneur capture extensions disabled during this controlled test/use. Reload an unpacked dev extension after rebuilding; do not remove it or clear storage to troubleshoot pending captures.
- Profile/author review is still an explicit owner action. Successful source capture does not create the Person or turn source claims into reviewed facts. No automatic cleanup of the seven troubleshooting saves was performed.
- Ordinary local use is bounded to the two chosen hosts and a 1,000-receipt activation window. No hosted/always-on operation, unrestricted hosts, full visual capture, exhaustive website snapshot or cross-platform certificate setup is promised by this acceptance.

```powershell
npm run capture:dev -- --run --hosts=www.linkedin.com,www.gianlucaboccia.me
```

Validation: all 436 automated tests pass; application and extension TypeScript pass; current source/safe-certificate checks pass. The earlier production build and installed-extension synthetic/rollback suites remain documented in LIVE_WITH_IT.md; they are not relabeled as newly rerun in this final audit. No migration, restoration test, historical backfill, deployment or Vercel configuration change was performed.

**Milestone D: READY for this controlled local workflow. Stop here; do not start historical backfill from this report.**
