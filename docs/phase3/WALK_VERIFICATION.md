# Walk contention and local browser verification

Completed local slice, 2026-10-13. These checks introduce no production behavior changes, migrations, provider requests or real Walk sessions.

`node scripts/database/validate.mjs --walk-contention-only` passes 11 assertions through `DIRECT_URL` using two actual PostgreSQL connections. One transaction holds a synthetic owner's empty session open; a competing same-owner request times out at the real owner lock, while a different owner proceeds. A second case confirms that Walk creation waits on the memory graph lock used by archive/review writers. After rollback, both locks are available and a retry can create a consistent empty session. All synthetic session rows roll back and Walk/notebook aggregate counts remain unchanged. No notebook candidates or real owner identities are used.

This verifies actual lock contention/release and independent-owner progress. It does not commit a fixture to prove a peer's successful resume after another connection commits. Committed-session replay semantics remain covered by the separate 70-check store/presentation fixture, whose own enclosing transaction also rolls back.

`node scripts/browser/validate-walk.mjs` passes 15 assertions in installed headless Chromium using the real React Walk component and its CSS. An isolated browser profile and a synthetic localhost API are used; the harness never loads `.env`, authenticates, connects to Neon, or reads the real notebook. The fake API deliberately fails the first appearance write and loses the first useful-action acknowledgement after accepting it.

The browser checks verify:

- Loading the component sends no Start request; explicit start preserves Unicode/whitespace context.
- Real viewport intersection enables actions after exposure acknowledgement.
- Failed appearance requests and lost action acknowledgements retry with the same event UUID; a failed acknowledgement does not falsely remove a stop.
- Three resolved stops produce an ending; navigation resumes that ending without another Start request.
- A 390-pixel mobile viewport has no horizontal overflow, with reduced-motion media enabled.
- Native Enter-key input submits the start form; the stop is keyboard-focusable.
- Activating another browser tab makes the Walk document hidden and cancels pending exposure. Returning to the Walk restarts the uninterrupted one-second wait.

The first harness run exposed a Node 20 WebSocket availability issue. It now uses the WebSocket client already bundled with installed Next.js, requiring no new dependency. Keyboard simulation also needed native Enter text in addition to key down/up. These were harness issues, not app regressions. The failed isolated profile was cleaned; subsequent runs close the browser/server and remove only their own verified private profile path. A synthetic mobile screenshot is available in ignored `node_modules/.cache/flaneur/walk-mobile-fixture.png`; it is not a screenshot of the deployed application or real notebook.

All 266 synthetic tests and TypeScript pass. The previous production build, 70 rollback-only installed-store/presentation checks and ten built-route authorization checks remain their separate baselines; production code was unchanged for this slice. The full SQL suite was not rerun.

Remaining verification: deployed HTTPS owner login/cookies, the actual Next route with authenticated owner requests, visibility/retry behavior with the real session-backed API, screen-reader/manual accessibility, and selector quality/calibration on representative reviewed data. The local component fixture does not establish those end-to-end behaviors. No deployment, backfill, restoration test or private export file occurred. The next local migration gap is Artifact/Encounter inspection and source continuity from query/Walk results; saved-query and capture cutovers also remain open.
