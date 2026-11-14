## 1. Add Firefox Android extension surfaces

- [ ] 1.1 Verify Firefox Nightly Android supports the current Manifest V2 extension, the action/popup entry point, and the required storage, tab, and host-permission APIs.
- [x] 1.2 Add a mobile-usable extension action/popup and background script, declare required permissions, and support both direct URL path forms.
- [x] 1.3 Implement per-direct-match catalog loading, metadata/interval persistence, and touch-accessible start/stop/status controls in the mobile interface.

## 2. Capture and submit live snapshots

- [x] 2.1 Make the SSE refresh interval configurable per match, defaulting to 5 seconds and validating values from 5 through 60 seconds without changing scoreboard rendering.
- [x] 2.2 Keep SSE for scoreboard rendering; capture complete changed stats/PBP responses from the page's `/streaming/match-id/<id>` endpoint and submit them with metadata, source URL, and numeric `liveMatchId`.
- [x] 2.3 Serialize requests per match, queue changed snapshots in order while a request is pending, and display capture/API errors.
- [x] 2.4 Stop future submissions when the user stops the import or the active tab leaves the direct-match URL; allow an in-flight request to finish.

## 3. Verify and package

- [ ] 3.1 Test installation and interface access, touch operation, storage restoration, interval changes, manual stop, redirect stop, and failure states in Firefox Nightly on Android.
- [ ] 3.2 Verify on an Android device that the packaged extension retains scoreboard updates and sends no snapshots after navigating to a statistics URL.
- [x] 3.3 Document the API endpoint and the user workflow for starting and stopping live imports.
