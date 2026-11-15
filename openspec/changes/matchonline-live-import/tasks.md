## 1. Add Firefox Android extension surfaces

- [ ] 1.1 Verify Firefox Nightly Android supports the current Manifest V2 extension and the required content-script, storage, tab, and host-permission APIs.
- [x] 1.2 Replace the popup with a mobile-usable import form integrated above the live scoreboard, and support both direct URL path forms.
- [x] 1.3 Persist per-tab/per-match metadata and interval; disable fields while importing and re-enable them after cancellation.
- [x] 1.4 Support simultaneous imports in multiple tabs and serialize API submissions for the same match ID without cross-stopping sessions.

## 2. Capture and submit live snapshots

- [x] 2.1 Make the SSE refresh interval configurable per match, defaulting to 5 seconds and validating values from 5 through 60 seconds without changing scoreboard rendering.
- [x] 2.2 Keep SSE for scoreboard rendering; on each changed SSE state, request a fresh complete stats/PBP response from `/streaming/match-id/<id>` and submit changed snapshots with metadata, source URL, and numeric `liveMatchId`.
- [x] 2.3 Serialize requests per match across tabs, queue changed snapshots in order while a request is pending, and display capture/API errors.
- [x] 2.4 Stop future submissions when the user stops the import or the active tab leaves the direct-match URL; allow an in-flight request to finish.
- [x] 2.5 Add regression tests for fresh uncached snapshot capture and explicit errors when the refreshed response is incomplete.
- [x] 2.6 Render the extension scoreboard from the complete captured snapshot when no SSE event has arrived yet.
- [x] 2.7 Collapse the active import form to a compact two-line summary with status/recent logs and restore editable fields on cancel.
- [x] 2.8 Attach the form field container before registering named-input listeners so the import panel can be constructed without runtime errors.
- [x] 2.9 Ensure active-state styling hides and locks metadata fields, and cancellation restores them for editing.

## 3. Verify and package

- [ ] 3.1 Test installation and interface access, touch operation, storage restoration, interval changes, manual stop, redirect stop, and failure states in Firefox Nightly on Android.
- [ ] 3.2 Verify on an Android device that the packaged extension retains scoreboard updates and sends no snapshots after navigating to a statistics URL.
- [x] 3.3 Document the integrated form and the user workflow for starting and canceling imports.
