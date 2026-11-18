## 1. Add Firefox Android extension surfaces

- [ ] 1.1 Verify Firefox Nightly Android supports the current Manifest V2 extension and the required content-script, storage, tab, and host-permission APIs.
- [x] 1.2 Replace the popup with a mobile-usable import form integrated above the live scoreboard, and support both direct URL path forms.
- [x] 1.3 Persist per-tab/per-match metadata and import state; disable fields while importing and re-enable them after cancellation.
- [x] 1.4 Support simultaneous imports in multiple tabs and serialize API submissions for the same match ID without cross-stopping sessions.

## 2. Capture and submit live snapshots

- [x] 2.1 Load the page hook in the Firefox MAIN world at document_start and capture the page's custom SSE event without opening another EventSource.
- [x] 2.2 Capture the page-owned XHR/fetch response for each live refresh and submit complete snapshots without a duplicate credentialed fetch.
- [x] 2.3 Serialize requests per match across tabs, queue changed snapshots in order while a request is pending, and display capture/API errors.
- [x] 2.4 Stop future submissions when the user stops the import or the active tab leaves the direct-match URL; allow an in-flight request to finish.
- [x] 2.5 Add regression tests for fresh uncached snapshot capture and explicit errors when the refreshed response is incomplete.
- [x] 2.6 Render the extension scoreboard from the complete captured snapshot when no SSE event has arrived yet.
- [x] 2.7 Collapse the active import form to a compact two-line summary with status/recent logs and restore editable fields on cancel.
- [x] 2.8 Attach the form field container before registering named-input listeners so the import panel can be constructed without runtime errors.
- [x] 2.9 Ensure active-state styling hides and locks metadata fields, and cancellation restores them for editing.
- [x] 2.10 Add regression coverage for EventSource instances created before the hook and verify the extension scoreboard updates directly from SSE.
- [x] 2.11 Trace the page-owned request and response, and remove the duplicate snapshot fetch that fails CORS.
- [x] 2.12 Remove the stale snapshot-processing guard and test that a complete captured payload is enqueued during an active import.
- [x] 2.13 Register the extension's SSE observer before page listeners so page propagation handling cannot delay scoreboard updates.
- [x] 2.14 Prevent an older full snapshot from overwriting scoreboard data received from a newer SSE event.
- [x] 2.15 Log the page-native request start/response alongside SSE and API activity.
- [x] 2.16 Match the SSE registration route observed in Firefox network traces, including its `/streaming/` prefix, with regression coverage.

## 3. Verify and package

- [ ] 3.1 Test installation and interface access, touch operation, storage restoration, native SSE capture, manual stop, redirect stop, and failure states in Firefox Nightly on Android.
- [ ] 3.2 Verify on an Android device that the packaged extension retains scoreboard updates and sends no snapshots after navigating to a statistics URL.
- [x] 3.3 Document the integrated form and explain that snapshots follow the page's SSE updates without a configurable reconnect timer.
- [x] 3.4 Add regression tests that verify matching page SSE events are forwarded and no extension-owned timed SSE reconnect remains.
- [x] 3.5 Bump the extension version and build a clean XPI containing only runtime files after the snapshot-timeout fix.
- [x] 3.6 Bump the extension version and build a clean XPI containing the snapshot-processing regression fix.
- [x] 3.7 Build a clean XPI containing the SSE listener-order fix.
- [x] 3.8 Build a clean XPI containing the stale-snapshot scoreboard fix.
- [x] 3.9 Build a clean XPI containing native page-refresh timing diagnostics.
- [x] 3.10 Build a clean XPI matching the SSE registration route from the Firefox traces.
- [x] 3.11 Use the dedicated `/api/federation/live-import` route and preserve the original federation import endpoint for the Scraper extension.
