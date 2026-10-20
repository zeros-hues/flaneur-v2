# Milestone D - real post and queued-job restart acceptance

Verified 2026-10-20. The owner saved the approved LinkedIn post once with
the exact User reason `procedural materials`. This report records actual
Neon dev storage, live provider processing and the approved contextual
Resurface query. Milestone D remains PARTIALLY READY until the selected
generic web source is captured and inspected.

## Saved graph

| Item | Actual value |
| --- | --- |
| Request UUID | 5603b948-9033-43a0-9658-807aa0639e62 |
| Post URN | urn:li:activity:7517049371402870784 |
| Artifact | 99a85389-db35-45c0-9fde-5276c1bc29fd, newly created social_post |
| Snapshot | 1f09a464-7a6a-4d82-bf01-2e121a0f80d1 |
| Encounter | c1b2d71e-22b9-4403-a154-92c3b3c2b35b |
| User Observation | e2fe6834-0f80-4bac-9b36-ccb322aba679 |
| Exact owner reason | procedural materials |
| Server receipt | 2026-10-20T06:30:52.013Z |
| Client-reported capture time | 2026-10-20T06:30:38.662Z, explicitly unverified clock |
| Source identity basis | post_urn, capture-source-v1 |
| Representation | 354c1cc5-32f7-8f12-b7b5-ea0c90a1a393 |
| Normalizer | linkedin-captured-text-v1:social_post |
| Representation length | 1,048 characters |

Canonical source:
https://www.linkedin.com/feed/update/urn:li:activity:7517049371402870784/

Original byte SHA-256:
ac4ae80e3008066bc19254d7b5258f2d6dc71b5b45149095cd7d7dbd3e586ffd.
Normalized text SHA-256:
6a0e78f3081c413adf47f1f460ad0d05b85ae325e0394edc42fd24cb91c3834d.

The Encounter is independent of the Artifact and has a source link to it.
The reason is a User Observation on the Encounter, not a source quotation
or inferred classification. Its origin is
capture:5603b948-9033-43a0-9658-807aa0639e62:user-reason.
Read-only source inspection succeeds in text state with the selected exact
representation. The original compressed bytes are preserved separately.

## Identity and authorship safety

The captured source displays the name Mohamed Basil and text about
procedural texturing for Blender and Cinema4D/Redshift. This is source
content, not a reviewed Person identity or authorship assertion.

The Artifact's person_id is null; there is no noticed-Person or author link,
no authored_by relationship, no authorship assertion/candidate, and no new
Person. The authorship review reader reports supported=true and
available=true with assertions=[]; no owner review was performed.
There are no extracted Person fields, relationship candidates, or
automatically created reviewed facts.

## Live processing and inference

| Stage | Job | Outcome / attempts / runs |
| --- | --- | --- |
| Parse | fe64761c-8882-4eac-8866-1f5cd7be669b | succeeded / 1 / 1 |
| Index | aed79714-2f6d-461e-a6ce-5104a7a5fbba | succeeded / 1 / 1 |
| Enrich | e7f834b1-9fd0-44a4-9144-0bdb77226061 | succeeded / 1 / 1 |

Artifact embedding exists: 768 dimensions, gemini-embedding-001@768.
Groq openai/gpt-oss-120b inferred these three Artifact-level Concepts:

- procedural texturing: 20adb1b4-ce32-8d82-977b-0342df43d4d3
- blender: e61f5b03-aea3-8b6a-89c5-da446c975abb
- pbr texturing: 6931d390-5ae6-8d3f-a384-b9a8d5a923ac

All three classifications are inferred with partial support. Their proof
contains this Snapshot and representation, the parse fingerprint, model,
prompt capture-semantic-v1 and semantic input fingerprint. Their inferred
Concept links are attached to the Artifact; none is promoted to a Person.
No synthetic provider/scorer was used for these live jobs.

Parse fingerprint:
8ae5286854839bf2a427523ef6e8283fbc0748307e38a69e071b0abbd987ee5b.
Index fingerprint:
1535d377d47746361b59c10f1d6ee74676f3625b6b1ecc47e97f57a69fe9618f.
Enrich fingerprint:
cc1ba6fcc985930994b7a5ee16d06f47c0e86386e6815ed318d8a1b07309ca3a.

Quarantined records for this Snapshot: zero. Normalization succeeded on
the real LinkedIn DOM. The representation retains video-player controls
and reaction UI alongside meaningful text; it does not decode the video
or establish a transcript, complete hidden-page coverage or factual truth
of the post's performance claims.

## Real pending-job restart test

Before restart, the exact receipt and graph above existed durably:
parse job fe64761c-8882-4eac-8866-1f5cd7be669b was queued, attempts=0,
with no runs, representation, embedding or inferred Concepts. The worker
was deliberately stopped while HTTPS accepted this real Save.

The controlled launcher was then stopped and restarted using the same
persisted activation (2026-10-19T16:55:41.321Z), same database target and
same exact allowed hosts. The queued job retained its ID and fingerprint.
The fresh worker claimed it, parsed it, scheduled the two semantic stages
and completed all three successfully. Its parse run began at
2026-10-20T06:32:31.354Z; index at 06:32:37.812Z; enrich at 06:32:40.087Z.

All 24 previously completed profile jobs retained state=succeeded,
attempts=1 and runs=1 across restart. Subsequent worker sweeps attempted
zero more jobs. The complete window now has 27 jobs and 27 successful
runs, each job with attempts=1. No attempt history was reset and no
completed current job was replayed.

**Real queued-work persistence and restart: PASS.**
This tested a queued, unleased job; it does not claim a real provider crash
or expired-lease takeover. Those code paths were previously covered by the
rollback/synthetic checks. There were zero unrelated historical processing
jobs available in this corpus; the live run therefore cannot prove
exclusion against an actually populated unrelated queue. Activation and
Snapshot claim scoping remain in force, and no historical rows changed.

## Recall and approved 3D Resurface test

Exact Recall for procedural materials returns this Artifact at rank 1.
Its candidate has no Person facts, contains the exact User reason, and
contains source provenance pinned to the Snapshot and representation with
code-point range 0-1048. Source inspection is available independently of
the search result.

The exact approved contextual question was run through the real application
planner, Gemini embeddings, pgvector candidate generation, existing hybrid
ranking and diversity:

> I'm working on a performant 3D interaction website. What have I encountered before that might help?

The actual submitted question used its original typographic apostrophe.
The planner selected resurface with terms performant, 3D, interaction,
website and no constraints. It generated seven surfaced matches.

**This new post appears at rank 5**, composite score 0.5755518221556087.
The recorded reason has semantic score approximately 0.61, lexical coverage
0.25, owner salience=true, and no qualifying Concept bridge. Actual score
components:

| Signal | Weighted contribution |
| --- | --- |
| Semantic | 0.3630518221556087 |
| Lexical | 0.0625 |
| Owner salience | 0.15 |
| Concept | 0 |

Its source discusses procedural/PBR texturing, 3D tools and render speed;
the reason is a relevance judgment, not a validated technical recommendation.
No ranking weights, source text, filters or scores were adjusted to make
the post appear. No semantic relevance was written as a graph fact.

An earlier audit invocation reached retrieval but failed while formatting
an optional score diagnostic because its argument shape was wrong. The
diagnostic was corrected in the audit invocation and the reported run
above was stored completely. This did not change application ranking,
saved captures, providers, or the processing jobs.

## Notebook writes and remaining work

Post additions: one each of Artifact, Snapshot, Encounter, User reason,
capture receipt, source identity, normalized representation and source link;
three each of inferred classification, evidence, Concept, Concept link,
processing job, run and head; nine registry rows. The seven-day certificate
trust change and earlier owner-password reset are separate setup changes.

Across all nine capture requests so far, comparison against all 41 public
tables finds every original baseline row unchanged. There are two new
Artifacts (profile and post), nine new Snapshots and Encounters, nine User
reasons, and 27 inferred classifications. No original Person or Concept
metadata, historical Artifact, reviewed relationship or old job was altered.

The post remains source/Artifact evidence for Reflect. There is no
legitimate Person identity support from these new captures yet, and no new
Pattern is claimed. The Milestone C independent-person rules are unchanged.

The worker and HTTPS are running normally again. The selected web URL
https://www.gianlucaboccia.me/ returns HTTP 200 without a redirect in the
preflight, remaining inside its approved host. The next manual step is
one generic-web toolbar Save, with an optional genuine owner reason.
No web capture, final Milestone D READY classification, deployment or
historical backfill is claimed.
