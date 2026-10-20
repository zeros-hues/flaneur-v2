# Milestone D - deliberate duplicate acceptance

Follow-up: the post and real pending-job restart case are now verified.
The worker is running normally again. See
[post/recovery acceptance](POST_CAPTURE_ACCEPTANCE.md); the worker-stop
description below records the deliberate setup preceding that test.

Verified 2026-10-20 using read-only Neon dev queries through DIRECT_URL.
The owner saved the same LinkedIn profile once more and supplied the exact
second reason `duplicate test`. The baseline had seven capture receipts.
There are now eight, with exactly one added request. All seven previous
request/Snapshot/Encounter/reason mappings remain unchanged.

Source: https://www.linkedin.com/in/dhilipkumarsomesh/

| Object | Previous latest receipt | Deliberate duplicate |
| --- | --- | --- |
| Request | f507f34e-cb9b-4d16-978f-6432c98e9c37 | 5c30e58e-f96d-46a8-aa18-75ce6ae81640 |
| Artifact | c302ff15-e501-4ece-ae73-a8f0cefdbddb | c302ff15-e501-4ece-ae73-a8f0cefdbddb |
| Snapshot | 2f840c49-d478-47b6-9ef7-65d1b66fc871 | 8683d23b-3a2d-448f-842b-75e150899c10 |
| Encounter | 7e56a3ef-eb23-47f2-ae27-31329f1f8b8d | e61f05a8-964b-484e-8ee1-cd2ace927796 |
| User Observation | d8c0c613-791c-4ccd-a607-c1f1f8cd1456 | d3220ca0-ebf0-4732-aff7-169bd6361bed |
| Exact owner reason | Interesting person and career path worth remembering. | duplicate test |

The new reason is truth_layer=user, semantic_role=reason_for_noticing,
subject=the new Encounter, with origin
capture:5c30e58e-f96d-46a8-aa18-75ce6ae81640:user-reason. It is not an
inferred or reviewed Person fact.

Representation: dc56040e-75dd-879b-98c0-af73001f18aa,
linkedin-captured-text-v1:profile_page, 12,451 characters.
Normalized text SHA-256:
c5df38331c870bd85a6597719990de24624593e52857ebf6a9c2dcc2459e437b.
Original content SHA-256:
237b999f057473dd89d7cc6621c5979cd10881755de9b96ae6c119e3cee973f9.

## Processing

| Stage | Job ID | Outcome | Attempts / runs |
| --- | --- | --- | --- |
| Parse | 94f832d5-6eb1-4778-a34f-be626ece6e63 | succeeded, current | 1 / 1 |
| Index | 46ac291c-1d40-473f-af2b-fba7fcc9dfb7 | succeeded, current | 1 / 1 |
| Enrich | 68c91eea-45a1-4ef0-8054-3698698caf20 | succeeded, current | 1 / 1 |

The shared Artifact has a 768-dimensional Gemini embedding
(gemini-embedding-001@768). Current Groq openai/gpt-oss-120b inferences are
industrial design, light and sound, and ai filmmaking. Each is an
Artifact-level partial-support classification with Snapshot, representation,
parse fingerprint, semantic input fingerprint and capture-semantic-v1 prompt
provenance. No reviewed relationships were created. Person identity is still
unresolved.

All 24 jobs across the eight saves have one successful run and attempts=1.
The deliberate Save intentionally receives new semantic jobs because its
immutable Snapshot and owner reason changed. No completed job was replayed
in the audited history; only the newest semantic heads are current.

Exact Recall for Dhilip still returns one shared Artifact at rank 1.
Its evidence retains all seven original reasons plus the one exact
`duplicate test` reason, each with a distinct Observation ID.
The test note is stored as supplied and is not claimed to establish a
meaningful Pattern or independent-person support.

**Duplicate acceptance: PASS.** One Artifact, separate capture history,
separate exact owner note, successful bounded processing and no repeated
completed-job execution. No cleanup or historical mutation was performed.

## Next controlled step: real post plus pending-job recovery

After this verification, only the verified child capture worker was stopped.
HTTPS intake remains up with health 200 and normal Windows certificate
validation. The activation timestamp and allowed hosts are unchanged.
This is intentional preparation for the requested durable-queue recovery
test, not a worker outage claimed as already recovered.

The owner should save only the selected LinkedIn post, using their own
reason. Inspect its exact durable receipt and queued parse job before
restarting the local runtime. Compare the recorded 24 completed-job attempts
and run histories afterward to verify they did not rerun. Existing
historical processing jobs outside the eight profile Snapshots: zero at
this checkpoint. Scope enforcement remains required; do not claim a live
unrelated historical-queue exclusion test if no such job exists.

No post or web capture, pending-job restart/recovery result, or approved 3D
Resurface result is claimed yet. Milestone D remains PARTIALLY READY.
