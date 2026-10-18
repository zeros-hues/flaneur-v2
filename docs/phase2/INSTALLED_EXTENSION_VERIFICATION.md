# Installed-extension lifecycle and quota verification

Completed locally on 2026-10-17 using Chrome 155.0.8059.80. The real extension source entry points were compiled into an unpacked fixture and loaded into an isolated Chrome profile. Chrome runtime, service-worker scheduling and local extension storage were real; the capture server, capture secret, page contents and captures were synthetic.

This completes the interrupted installed-extension verification slice and fixes a quota problem it exposed. No live capture endpoint, application database, owner login, processing worker or provider was exercised. No migration, backfill, deployment or activation setting changed. The local v2 activation gate remains off.

## Reproducible fixture

Run `node scripts/browser/validate-installed-extension.mjs` with the installed Windows Chrome and Git OpenSSL executable paths used by the script. The harness creates a temporary profile, fixture extension and one-day test certificate inside `node_modules/.cache/flaneur`. It launches its own headless browser and local HTTPS server, using the test certificate's SPKI only in that browser process. It does not install an operating-system certificate or modify a personal browser profile.

The fixture compiles the repository's real background, content and options entry points. Only the application endpoint/host permission is changed to the ephemeral local HTTPS server. Its LinkedIn-shaped navigation is intercepted and fulfilled with synthetic HTML, allowing the production content-script match and sender checks to run without loading a real profile. No real capture secret or `.env` settings enter the browser fixture. Chrome debugger commands load the unpacked extension and stop its worker; see the official [Extensions](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/) and [ServiceWorker](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/) protocol references.

The harness closes its browser/server and removes only its own temporary workspace directory. The completed run left no `installed-extension-*` fixture directories. The certificate/key and synthetic queue are removed with that directory. The packaged production extension is not installed into any existing user profile.

## Verified behavior

The final run passed 34 assertions covering:

- Real unpacked-extension load, options-page configuration with a synthetic capture secret, and execution of the real content script.
- Honest local queuing during network failure, exact optional User reason/Unicode preservation and retained original payloads.
- Actual denial of local storage access from the extension's content-script context, including the capture secret and outbox. A content sender cannot obtain the options-only queue listing.
- Forced worker termination with the source retained, then worker wake and delivery through the existing message interface.
- A deliberately lost acknowledgement after the fixture server accepted the capture. Retry preserved the same payload/UUID and produced one server receipt rather than a second capture.
- Alarm recreation after clearing the delivery alarm and stopping the worker.
- Actual alarm-driven delivery after the source/options tabs were closed and the worker stopped. The test did not hold a worker debugger attachment open.
- Persisted queued data and capture settings across browser process restart and reloading the same unpacked fixture path.
- Rejected credentials blocking retries; replacing credentials alone and a subsequent real alarm did not resume the blocked capture. The actual options-page retry action resumed it.
- Native Chrome quota rejection of a new local capture without a false queued acknowledgement or loss of an existing pending source.
- A completely full native local-storage quota followed by successful remote acknowledgement and completed source cleanup.

The harness prints only bounded status/count/flag metadata. It does not print source text, connection strings, credentials, browser storage contents or private notebook records.

## Quota bug and fix

The first full-quota acknowledgement test failed: the server could save the original, but adding a separate local receipt required quota that was unavailable. The queue then retained an already-saved source and could not finish local cleanup.

The Chrome storage backend now atomically replaces that acknowledged source entry with a compact saved-receipt marker at the existing key. This happens only after the complete v2 remote acknowledgement is verified. The marker is a durable acknowledgement record if receipt promotion or cleanup is interrupted; unacknowledged captures are never replaced this way. The normal receipt is then stored and the marker removed. A later queue read detects and validates an interrupted marker, finishes promotion/cleanup, and does not upload that capture again. Lookup can return saved directly from the marker while cleanup is pending. Receipt identity/hash/state checks remain in place.

This reuses space held by the acknowledged original instead of requiring the full source plus a new receipt to coexist. A failure before the atomic replacement still retains the original source. A failure after replacement retains the compact proof of the acknowledged save. Receipt bookkeeping remains subject to storage availability; the tested full-quota source was approximately 9 KB of synthetic captured content. This is not a benchmark for all corpus sizes or disk-failure/power-loss scenarios.

Options rows now retain their request identity in a data attribute. The installed test waits for the matching row before retrying, so an asynchronous refresh cannot accidentally target an older visible capture. No request IDs were added to visible product copy.

Four new regression cases exercise the actual storage backend with injected failures: full-quota acknowledgement, interrupted receipt promotion followed by recovery without another upload, retention of an unacknowledged source, and rejection of an invalid marker without deleting it.

## Final checks and limitations

- All 302 synthetic tests pass.
- Application and extension TypeScript checks pass.
- The production build passes and includes a freshly packaged extension with the quota fix.
- Installed Chrome verification passes all 34 assertions. Earlier intermediate failures identified the quota bug and two fixture synchronization issues; they are not represented as passing runs. The final fixture waits for the correct options row and for asynchronous receipt cleanup to finish.
- No application SQL validation was run in this slice; the earlier Neon checks remain historical evidence. No app database data, schema or migration ledger was modified.

The debugging API loaded this unpacked fixture for the browser session. On restart its registration was absent, so the harness reloaded the same directory and checked that its existing local queue/settings remained intact. The result explicitly records `restart_fixture_reload_required: true`. It proves persistence across process restart/reload, not automatic re-registration of a normally installed or store-distributed extension. That normal installation/update path remains to be checked separately.

Alarm wake-up used a deliberately short test alarm. It proves that the extension handled a real Chrome alarm after forced worker termination, not that production delivery occurs within one minute. Natural idle termination, long sleep/device-offline periods, other Chrome/Edge versions, normal extension update/permission acceptance and broader options-page accessibility remain unverified. The earlier fourteen content-script UI checks cover keyboard/focus/mobile behavior under their synthetic runtime, not all installed-options interactions.

The next implementation slice is source/Artifact resolution and Encounter linking without guessed Person identity, followed by recurring worker-host readiness and coordinated rollout. The prepared parser can still normalize a capture while leaving identity unresolved. Capture-v2 must not be enabled based on extension verification alone. Historical backfill remains separately reviewed and unexecuted; backup restoration verification remains deferred.
