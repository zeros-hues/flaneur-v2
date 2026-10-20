# Milestone D - real LinkedIn profile acceptance

Follow-up: the deliberate different-reason duplicate is now verified.
See [duplicate acceptance](DUPLICATE_CAPTURE_ACCEPTANCE.md) for all
before/after IDs and the next controlled recovery setup. The seven-capture
counts below describe the preceding troubleshooting batch.

2026-10-20. Capture delivery is working after the approved local certificate correction. This is a profile-stage report; Milestone D remains PARTIALLY READY pending the remaining real-source acceptance cases.

## What happened to the queue

Seven independently identified Save requests reached Neon dev for https://www.linkedin.com/in/dhilipkumarsomesh/. The first server-received Save created one source Artifact; all six subsequent Saves matched it through the exact-profile-URL source identity. There are no seven duplicate Artifacts or automatically created People. The extension queue emptied after server acknowledgement.

Each Save gesture had a distinct UUID and therefore legitimately preserved a separate Snapshot, Encounter and owner-authored Observation. Network retries of the same UUID do not intentionally create another graph. All seven pending UUIDs seen in the browser diagnostic are now present exactly once.

Shared Artifact: `c302ff15-e501-4ece-ae73-a8f0cefdbddb`.

| Request UUID | Snapshot | Encounter | Owner Observation |
| --- | --- | --- | --- |
| f656886d-8559-4365-a503-f53c1d150f72 | 783fadc2-6ee6-4902-9f42-b876e7ba3313 | cce25ef8-65e3-4b60-a762-48320b7e662d | cdbfc844-fcab-4f43-ad88-27f768f279a2 |
| 5ef9adf0-f5bc-4e49-a34e-3f783b6dfb52 | ca408c4d-cd10-4bce-a76c-806cf08a72e4 | 109a25d1-92e6-4558-8572-d75b32f4a878 | 72527992-b211-4bbc-9cd4-8f3811aef490 |
| 13b30139-2722-4aec-8124-1c144b3b1b61 | ce65fc0d-4165-4233-ab43-ad36b73cea37 | ffcf7bf7-9f3f-4d9d-b845-892d375962d6 | 7fcd67c1-716a-44e5-a292-31526f77dd84 |
| a3ed0756-1a62-4d82-b294-5633614cb57b | ef9003ed-433c-4b5b-a9d5-466f99e9010d | a2a31063-ffb5-4538-8cea-e891be92bc41 | 1b6ce69c-b564-4602-adef-897add4efd27 |
| f60ad8dd-1949-4eaf-80c4-1b3bdb0995ad | 11da1bf6-4170-4edf-9f00-35246f5b3caa | ed890202-0a2c-4aab-9a03-d70c42506f65 | 8d5b6a07-1b92-4280-8e77-9b2b52dc4029 |
| b18c42ad-0716-49ed-932d-93fdd8054b65 | f81834f3-f6eb-492f-8fde-6b8de47d5710 | 30907687-7064-4f3d-a56b-eb97093c16f2 | 1cd16f35-ae3e-40cc-b83d-c3f873982486 |
| f507f34e-cb9b-4d16-978f-6432c98e9c37 | 2f840c49-d478-47b6-9ef7-65d1b66fc871 | 7e56a3ef-eb23-47f2-ae27-31329f1f8b8d | d8c0c613-791c-4ccd-a607-c1f1f8cd1456 |

All seven exact User reasons are: "Interesting person and career path worth remembering." These are distinct intentional Save records, including extra saves made while troubleshooting. They are not seven independent people or seven reasons supporting a new Pattern. Nothing has been deleted, merged, archived or cleaned up.

## Identity, extraction and inferred information

All seven profile identity states remain unresolved. There are no noticed-Person links or verified Person-identity observations. The existing owner-review search for "Dhilip" returns no Person candidate. The flow permits owner-reviewed Person creation, but no Person was created during this audit.

Normalization succeeded for every Snapshot. The source starts with "Dhilip kumar" and a headline covering design leadership, industrial design, creative direction and AI-first design/product. This is preserved source text, not reviewed education, employment, identity or trajectory facts. Person field extraction requires explicit identity proof, so the captures have no extracted Person facts or relationship candidates. No reviewed relationship or fact was created automatically.

Latest Artifact embedding: 768 dimensions, gemini-embedding-001@768; present.

Current inferred Artifact classifications: ai filmmaking, vehicle design, industrial design. They are partial-support inferences from Groq openai/gpt-oss-120b with prompt capture-semantic-v1, not reviewed Person properties.

The Artifact also retains older inferred Concept links for light and sound and watch design from earlier input versions. The current reader gates inference to the current job and parse head: the verified live Recall candidate exposes only ai filmmaking, vehicle design and industrial design. Retained historical links are not additional current verified facts.

## Per-request provenance and processing

All 21 jobs succeeded: seven parse, seven index and seven enrich. Every job has attempts=1 and exactly one successful run. All original bytes and normalized representations remain separate. No parser quarantine occurred. Previous semantic jobs remain successful historical runs with current=false; only the latest delivered capture owns the current Artifact index/enrich heads.

There was provider work for each of the seven distinct Saves: seven index-stage runs and seven enrichment-stage runs. This report does not describe that as free deduplication across different Save requests. No successfully completed job was executed repeatedly in the audited history.

"Latest" here means latest server receipt. The offline queue delivered requests in a different order from the client-reported capture times. Both times are preserved, and client clocks remain explicitly unverified. The current semantic input is the final server-received request, not necessarily the most recently clicked Save.

### Request f656886d-8559-4365-a503-f53c1d150f72

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot 783fadc2-6ee6-4902-9f42-b876e7ba3313; Encounter cce25ef8-65e3-4b60-a762-48320b7e662d.
Server receipt: 2026-10-20T05:40:34.042Z.
Stored content SHA-256: 89de70c3e87ee69a6890b11845f841d7a7ecbbadfb48ad9ab69a03e877ab617f.
Representation 3bc998fc-3808-84d5-a1c1-fac2b3d9fd74; linkedin-captured-text-v1:profile_page; 12451 characters; text SHA-256 79ee49d09ea53adda09cefe8f331e18cce1dee0793a07481baae6bc8ebadca0d.
enrich: succeeded; job 0768aa0e-7735-4169-96e0-175b44666a1b; attempt 1; current=false; input fingerprint f4c2fc9c1387fcf2e87636ab0a1a0a30713d6b1b135ab1c45c31881ac27b8265.
index: succeeded; job bca11f5b-8a04-49c5-bdde-298bf85739ca; attempt 1; current=false; input fingerprint 99f8a721a0591c6f4d9aeec5e51d40e0e9c4c00de4c07075363749756aaad059.
parse: succeeded; job bf9341ee-a760-4e5c-89a0-5a2ac3d4c299; attempt 1; current=true; input fingerprint 9355df3ae00cbba7db78bd99caf54f47bd1b50416238f9fb08edc6f6fdd63bea.
Run 97da156e-ce94-4a92-8a11-0d8913a63117: succeeded; model deterministic parser; prompt not applicable.
Run 4fb6f8b1-8861-4762-ae47-2f4ca5e13aa7: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Run c5e4ce85-f63c-4e85-b64d-63af45d1f647: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Snapshot-specific inferred labels: industrial design, vehicle design, watch design.
Relationships: none.

### Request 5ef9adf0-f5bc-4e49-a34e-3f783b6dfb52

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot ca408c4d-cd10-4bce-a76c-806cf08a72e4; Encounter 109a25d1-92e6-4558-8572-d75b32f4a878.
Server receipt: 2026-10-20T05:41:32.438Z.
Stored content SHA-256: 848bbf376ab8d1086381b63756adb047ffad50a9d81c991964f26efe8c12d2c4.
Representation bdc3357e-9f8f-8ea0-98d1-0c8632e70488; linkedin-captured-text-v1:profile_page; 12451 characters; text SHA-256 2285aa41664890bf8906e1f687fc77f5eca5a2933528b42b18ef39bb29e81a9f.
enrich: succeeded; job 99a59829-1556-43bc-9db7-51f871fff804; attempt 1; current=false; input fingerprint 5e4e7c9b2a4069a0820e3f50ba038a660774eb934a83e20853716047bc0c7039.
index: succeeded; job 786b973e-3ae9-4869-9fac-8b55b399c4da; attempt 1; current=false; input fingerprint 116bed780ddb9be2fa66e7931248a58a9fb85784dda22c142377b0a5942166e7.
parse: succeeded; job 23202e52-7974-44f6-a744-750da43775de; attempt 1; current=true; input fingerprint 25c3adfb82bacedbbb244edf16d36f46247576e1033195367ed9c6e2ac2ed468.
Run 256c6c8d-5620-4f95-8188-4c560a7528f8: succeeded; model deterministic parser; prompt not applicable.
Run 19e04f28-4477-48c3-bdf4-4ffb7ccb2ff4: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Run 4b923e4b-d826-4620-bbf5-a2bb79ba2701: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Snapshot-specific inferred labels: industrial design, light and sound, ai filmmaking.
Relationships: none.

### Request 13b30139-2722-4aec-8124-1c144b3b1b61

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot ce65fc0d-4165-4233-ab43-ad36b73cea37; Encounter ffcf7bf7-9f3f-4d9d-b845-892d375962d6.
Server receipt: 2026-10-20T05:42:22.058Z.
Stored content SHA-256: a9ce6af72f366bffc9e152229b436271d793b9fca18f21a45f7f9ab5851273cb.
Representation 15eeedcd-61e2-8ece-a828-7f4948eb3048; linkedin-captured-text-v1:profile_page; 12451 characters; text SHA-256 66aa22489b1059e0119c810ed9490c46ff5192090bb685c4ef35f22817b8c76a.
enrich: succeeded; job 358cb9ee-e583-4962-9d38-d01e1848592b; attempt 1; current=false; input fingerprint 95f2dc5601112ecd44075bcd78de865c6ffdd10f8f2c162ffaacc2392eecf049.
index: succeeded; job 59c665f7-eea9-4f93-bd6f-e349275a2627; attempt 1; current=false; input fingerprint 8e080f8773488ca78e6d1d6088f9dea3312b5949ca2e4c069321c89f2adab332.
parse: succeeded; job db02c673-d818-4e95-95ce-1e09ea8005ee; attempt 1; current=true; input fingerprint c87382181266b54b57e5bd6b65981b41b90ac3f5ca860b79f4585757339e78a5.
Run b00a1aaf-61ef-4e8a-ae37-b511391c5088: succeeded; model deterministic parser; prompt not applicable.
Run 27b9f804-bd77-48f3-8dba-104d740b013f: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Run 1fb9e228-ea2a-4297-8a5e-8ff800e026b4: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Snapshot-specific inferred labels: light and sound, ai filmmaking, industrial design.
Relationships: none.

### Request a3ed0756-1a62-4d82-b294-5633614cb57b

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot ef9003ed-433c-4b5b-a9d5-466f99e9010d; Encounter a2a31063-ffb5-4538-8cea-e891be92bc41.
Server receipt: 2026-10-20T05:42:45.593Z.
Stored content SHA-256: be1c6477b0a0f2a1031e50feebdda8d05e3d2d180e0304cb073538ecdfd1abeb.
Representation e308a720-d457-827c-aa58-b0c9ea721571; linkedin-captured-text-v1:profile_page; 12383 characters; text SHA-256 d5bfd5c70aa07d0d2ffebe57348c77d06a8661b1742d7495195e5e4839541e94.
enrich: succeeded; job 6a0b1513-4ed6-4204-b2b2-23c09d1324fe; attempt 1; current=false; input fingerprint 7681c82a82d2a388391d58e604fe99500f21a4fc0d1321feeb88a29cfc59ff94.
index: succeeded; job 310431b6-d964-4f39-aadf-b21f9fa62e1d; attempt 1; current=false; input fingerprint 0a0efd7ff98344d431a0b241cf413253833f7452363ed93ad4b5526db0b3ae9e.
parse: succeeded; job c68da53f-3db4-4751-b094-21f4ba6bfa64; attempt 1; current=true; input fingerprint 353a26da51762dac2b6ef5d6fcb208b8b799c4b91c12dfa0ba73eb9406b7e4e5.
Run b213c4cb-1803-486c-acc6-ff837449b1e3: succeeded; model deterministic parser; prompt not applicable.
Run e62d592d-7821-4932-bedb-6f55e2961650: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Run 9148369f-c089-4b92-b721-15e91171ed60: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Snapshot-specific inferred labels: vehicle design, industrial design, watch design.
Relationships: none.

### Request f60ad8dd-1949-4eaf-80c4-1b3bdb0995ad

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot 11da1bf6-4170-4edf-9f00-35246f5b3caa; Encounter ed890202-0a2c-4aab-9a03-d70c42506f65.
Server receipt: 2026-10-20T05:43:16.343Z.
Stored content SHA-256: 2a2f610ad92015ade0d58da30dd85ba7d94a403b934b4b4c93305e1b6860f5d5.
Representation d7312426-0aea-83c7-929e-068707ca3a67; linkedin-captured-text-v1:profile_page; 12383 characters; text SHA-256 bb476eb6c2beafa13beef3a23bd2a105782ff7d5b094ee1d214776ea6f2354c8.
enrich: succeeded; job eedf5284-3313-43e5-8bd8-d9cd358f6a28; attempt 1; current=false; input fingerprint 90dc8a6df697aefb79040b1f020df1352cf3aab5c57c3cfe3d6a5314c2d5b278.
index: succeeded; job 817a6bad-b615-4047-b43e-f962a98183b9; attempt 1; current=false; input fingerprint d1e8a27b63a27aecbae481bd53836df9b6c316fdfa029f4ddd16eae909fd489f.
parse: succeeded; job 0e8e0869-6739-4fde-abbe-3f76096a2716; attempt 1; current=true; input fingerprint 9bfa2fc07b4223d4e46d4dacce23ca6219f7bea2e18c885df1e40826817ed5fb.
Run f87eb5b0-ceb9-44aa-98d9-cda6041d1cc7: succeeded; model deterministic parser; prompt not applicable.
Run 07177f1c-889e-4a0c-adc4-59aa05a68b4b: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Run f15a2edb-ffe2-4cf3-ae49-77b47164677e: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Snapshot-specific inferred labels: ai filmmaking, industrial design, vehicle design.
Relationships: none.

### Request b18c42ad-0716-49ed-932d-93fdd8054b65

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot f81834f3-f6eb-492f-8fde-6b8de47d5710; Encounter 30907687-7064-4f3d-a56b-eb97093c16f2.
Server receipt: 2026-10-20T05:43:39.718Z.
Stored content SHA-256: 3e19124649d25e9b9f49f8fcfc8b0706eadceb57600e08beb722cea5d62f27a9.
Representation d2ed1bf2-d79c-803c-91b3-8944499e0ecc; linkedin-captured-text-v1:profile_page; 12451 characters; text SHA-256 c5df38331c870bd85a6597719990de24624593e52857ebf6a9c2dcc2459e437b.
enrich: succeeded; job 2d5193c8-8d12-4cab-858c-c67ebd37de04; attempt 1; current=false; input fingerprint 4d1720f546457dc3a55b984a197765d89c99d0b523d31af025a8264be10c720d.
index: succeeded; job 0cb3b79d-1385-46a8-9ade-ea3934146d8c; attempt 1; current=false; input fingerprint a635c167768acb37cba44362de067acbaaa79ec8463283963d308baab46b4be9.
parse: succeeded; job b6448906-131e-4d6f-84e5-7b54a17f7bb9; attempt 1; current=true; input fingerprint 23236471d7b90e5f1783626805bda7388b2c1fd103bf8aa283c90f58594db563.
Run 00e5677c-93b2-4f87-bf9f-ad4841d6710d: succeeded; model deterministic parser; prompt not applicable.
Run 76a952b2-554d-4603-987a-069a5fa23b5c: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Run ccf705b8-ef31-4cd0-ba89-40f27441984e: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Snapshot-specific inferred labels: ai filmmaking, industrial design, light and sound.
Relationships: none.

### Request f507f34e-cb9b-4d16-978f-6432c98e9c37

Artifact c302ff15-e501-4ece-ae73-a8f0cefdbddb; Snapshot 2f840c49-d478-47b6-9ef7-65d1b66fc871; Encounter 7e56a3ef-eb23-47f2-ae27-31329f1f8b8d.
Server receipt: 2026-10-20T05:44:10.064Z.
Stored content SHA-256: 4b643260a43f783b0bf6eab5981bfc658f99f918fcb3123494acb2fb5138f09a.
Representation 333eecee-2ee1-8f5e-bc4e-1138373a486b; linkedin-captured-text-v1:profile_page; 12451 characters; text SHA-256 79ee49d09ea53adda09cefe8f331e18cce1dee0793a07481baae6bc8ebadca0d.
enrich: succeeded; job af0f469a-13d9-4afc-9dd0-5adfd5e64c57; attempt 1; current=true; input fingerprint 64264fa8303aa0e3ed63c24efb3cbdc007ecddb30fe8997ebcdee6d64fd119a5.
index: succeeded; job 4532a8e1-d4ee-4b4a-9b61-dfb341c05bbc; attempt 1; current=true; input fingerprint b92dd8aecaec1e3e99e883ae790a55893516f753d8ae86eafc808eae7115ca2d.
parse: succeeded; job 3fe9002e-6611-40a5-be9c-de133016daea; attempt 1; current=true; input fingerprint c6453411a11d5ed2c3b3e437b2adffc0f65f8f752d45b4d673eb665229249deb.
Run cd13ee72-9bac-4bc4-bda1-43a49b921416: succeeded; model deterministic parser; prompt not applicable.
Run 13197de2-2803-4256-ad6e-bacecb280843: succeeded; model gemini-embedding-001@768; prompt capture-semantic-v1.
Run 542130fe-2e37-4584-b338-5c96eb6bc66c: succeeded; model openai/gpt-oss-120b; prompt capture-semantic-v1.
Snapshot-specific inferred labels: ai filmmaking, vehicle design, industrial design.
Relationships: none.

## Retrieval and Reflect safety

Exact Recall using "Dhilip" returns this one Artifact at rank 1, with seven source-evidence items and all seven exact User reasons, each carrying its Observation ID. It has no Person facts. Each Snapshot is separately inspectable via /snapshot/SNAPSHOT_UUID; originals and immutable normalized representations are retained. The live reader does not return seven duplicate Artifact candidates.

Live relevant Resurface query: "What have I encountered about industrial design and AI filmmaking?"

The Artifact appears at rank 1 with composite score 0.9082414186065825. Gemini/pgvector supplied the real semantic candidates; no scorer injection or ranking adjustment was used. Reported reasons: semantic score 0.70, lexical score 1.00, owner-salience boost, and ai filmmaking Concept bridge. This is a profile-content participation test, not the post's pending approved 3D test. Retrieval relevance made no graph facts.

The seven reasons remain Encounter User Observations. No noticed-Person identity proof exists, so they cannot become Person Reflect support through an Artifact shortcut. No new Pattern is claimed. The existing independent-person threshold is unchanged.

## Permanent notebook writes and historical safety

The read-only audit compared all 41 public tables against the pre-capture baseline. Every baseline row checksum remains present unchanged. Added rows are:

| Table | Added rows |
| --- | --- |
| artifact | 1 |
| capture_request | 7 |
| concept | 5 |
| concept_link | 5 |
| encounter | 7 |
| encounter_object | 7 |
| object_ref | 41 |
| observation | 28 |
| observation_evidence | 21 |
| processing_head | 9 |
| processing_job | 21 |
| processing_run | 21 |
| snapshot | 7 |
| snapshot_representation | 7 |
| source_identity | 1 |

This includes 28 Observations: seven User reasons and 21 inferred classifications; five new Concepts and five inferred Artifact Concept links reflect labels across the seven input versions. No existing Person, Artifact, Concept metadata, reviewed relationship or historical job was modified. Authentication sessions/throttle use the separate auth schema and are not counted as capture notebook writes. The earlier intentional local password reset is separate from these capture writes.

## Remaining acceptance work

- A deliberate same-URL Save with a distinguishable second genuine owner reason is still pending. These seven saves prove source reuse and separate Encounters, but all reasons are identical, so they do not replace that full acceptance case.
- The real LinkedIn post and generic web source have not been captured.
- Durable database-job restart/reclaim with pending real work, preserved attempt history and no repeated provider execution remains pending. Earlier certificate troubleshooting restarted the runtime, but that alone does not prove this recovery case.
- The exact approved post-capture performant-3D Resurface query remains pending.
- No historical backfill, deployment, migration or unrelated historical cleanup is authorized by this report.

Current classification: profile delivery, storage, processing and retrieval verified; Milestone D PARTIALLY READY.
