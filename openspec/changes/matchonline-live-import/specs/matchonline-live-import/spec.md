## ADDED Requirements

### Requirement: Initialize a live import once per direct match
The matchOnline extension SHALL support Firefox Nightly on Android and provide a mobile-usable import form integrated immediately above the live scoreboard on Basquet Catala direct-match URLs with paths `/directe/<id>` or `/estadistica/directe/<id>`. The form SHALL load the existing federation catalog options and allow the user to enter season, category, competition, and matchday metadata using touch controls. It SHALL retain metadata and import status by tab and numeric direct-match ID, and SHALL NOT start importing until the user explicitly starts it. While importing is active, all metadata fields SHALL be disabled; canceling the import SHALL re-enable them.

#### Scenario: Start importing a direct match on Firefox Nightly Android
- **WHEN** the user opens a direct-match URL in Firefox Nightly on Android and starts an import from the form above the live scoreboard
- **THEN** the extension stores the selected metadata for that direct-match ID and begins submitting live snapshots

#### Scenario: Use the interface on a mobile screen
- **WHEN** the integrated form is displayed in Firefox Nightly on an Android phone
- **THEN** its fields, status, and start/stop controls fit the mobile viewport and can be operated with touch

#### Scenario: Reopen the interface for the same match
- **WHEN** the direct-match page is reopened in the same tab and has stored import metadata
- **THEN** it restores that match's metadata, interval, and active status without requiring the user to enter the metadata again

#### Scenario: Lock fields during an active import
- **WHEN** the user starts importing a direct match
- **THEN** the metadata and interval fields become read-only until the user cancels the import

#### Scenario: Edit fields after canceling
- **WHEN** the user cancels an active import
- **THEN** the extension stops future submissions and re-enables the metadata and interval fields

#### Scenario: Show compact import status while active
- **WHEN** the user starts importing
- **THEN** the editable form is hidden and replaced by a compact two-line metadata summary, current status, recent import logs, and a cancel action

#### Scenario: Restore the editable form after canceling
- **WHEN** the user cancels from the compact active view
- **THEN** the complete metadata form is shown again with its previously entered values so the user can edit them

#### Scenario: Open a page outside a direct match
- **WHEN** a tab is not on a supported direct-match URL
- **THEN** it does not start an import and explains that a live direct-match page is required

### Requirement: Follow the page's native live-data refresh
The extension SHALL load its page hook as a Firefox `MAIN`-world content script at `document_start`, register its observer for the custom live-match event through `EventSource.prototype.addEventListener` before the page's matching listener, and SHALL NOT open or periodically reconnect a second EventSource for the same match. The extension SHALL observe page-owned XHR/fetch requests for the direct match on `streaming.optimalwayconsulting.com`, record request start and response capture times, and use the resulting complete statistics/play-by-play snapshot for the API submission. It SHALL NOT issue a duplicate credentialed request for the same snapshot. A changed SSE state SHALL update the extension scoreboard immediately; a page response whose request began before a newer SSE state SHALL NOT overwrite that newer scoreboard state or be submitted as current. The extension SHALL submit each changed complete snapshot to the federation import endpoint with the statistics payload, play-by-play payload, metadata, source URL, and numeric `liveMatchId`. A snapshot lacking required data SHALL NOT be represented as a successful or fabricated import. Import failures SHALL NOT stop the existing live scoreboard.

#### Scenario: Submit a new snapshot
- **WHEN** an active direct match receives a new complete snapshot
- **THEN** the extension submits that snapshot and the stored metadata and direct-match ID to the API

#### Scenario: Submit the page's native refresh response
- **WHEN** the page completes its own XHR/fetch refresh with a complete direct-match snapshot during an active import
- **THEN** the extension submits that response without issuing a duplicate snapshot request

#### Scenario: Render the live scoreboard before the first SSE event
- **WHEN** a complete federation snapshot is captured before any SSE event arrives
- **THEN** the extension renders its scoreboard and player statistics below the import form, then continues to apply subsequent SSE updates

#### Scenario: Reuse the page's live SSE connection
- **WHEN** the page receives its custom live-match SSE event
- **THEN** the extension receives the same event without creating or periodically reconnecting another EventSource

#### Scenario: Capture the stream before page subscriptions
- **WHEN** a direct-match page initializes its EventSource after document start
- **THEN** the main-world hook observes the custom event listener before the page registers it

#### Scenario: Match the observed SSE registration route
- **WHEN** the page connects to `/streaming/register/fcbq-<id>/<nonce>` on `streaming.optimalwayconsulting.com`
- **THEN** the hook forwards the matching `fcbq-<id>` event, while continuing to support `/register/fcbq-<id>/<nonce>`

#### Scenario: Forward the event before the page listener
- **WHEN** the page's custom-event listener stops immediate propagation
- **THEN** the extension has already received the event and updates its scoreboard

#### Scenario: Update the extension scoreboard immediately
- **WHEN** a changed live-match SSE event reaches the page
- **THEN** the extension scoreboard updates from that event without waiting for the API request to finish

#### Scenario: Do not roll back a newer live scoreboard
- **WHEN** a full snapshot captured before a newer SSE event arrives afterward
- **THEN** the extension keeps the scoreboard state from the newer SSE event

#### Scenario: Log the live event that triggers an import snapshot
- **WHEN** an active import receives a changed SSE scoreboard event
- **THEN** the activity log records its score without initiating a second network request

#### Scenario: Trace the page's refresh
- **WHEN** the page starts and completes a matching XHR/fetch request
- **THEN** the activity log records the request path and when its response was captured

#### Scenario: Wait for an SSE update instead of polling
- **WHEN** no new live-match SSE event arrives
- **THEN** the extension does not open a second stream or issue a duplicate snapshot request

#### Scenario: Prevent overlapping submissions
- **WHEN** a new snapshot arrives while an API request for the same direct-match ID is still pending
- **THEN** the extension does not start a concurrent import for that match and queues the changed snapshot for submission after the pending request

### Requirement: Stop sending when the import stops or the URL changes
The extension SHALL provide an explicit cancel action that prevents subsequent snapshots from that tab being submitted without disabling the scoreboard. It SHALL automatically stop importing when a tab navigates away from its direct-match URL, including a redirect to a statistics URL, and SHALL retain the last successful import result for that tab.

### Requirement: Support concurrent imports in multiple tabs
The extension SHALL maintain an independent active import session for every direct-match tab. Snapshots from distinct matches MAY be submitted concurrently. Snapshots for the same numeric direct-match ID SHALL be serialized across tabs, and stopping or navigating one tab SHALL discard only that tab's queued snapshots.

#### Scenario: Import different matches in multiple tabs
- **WHEN** two tabs are importing different direct matches at the same time
- **THEN** each tab retains its own metadata, status, interval, and snapshots without stopping or overwriting the other tab's import

#### Scenario: Serialize the same match across tabs
- **WHEN** two tabs submit snapshots for the same direct-match ID
- **THEN** the API requests for that match are processed sequentially and retain the metadata of each originating tab

#### Scenario: Stop one tab without affecting another
- **WHEN** the user cancels an import or navigates away in one tab
- **THEN** only that tab's pending snapshots are discarded and other tab imports continue

#### Scenario: Stop importing manually
- **WHEN** the user stops an active import
- **THEN** the extension submits no later snapshots until the user starts importing again

#### Scenario: Direct URL redirects at the end of the game
- **WHEN** the active tab navigates from a direct-match URL to a statistics URL
- **THEN** the extension stops importing for that direct-match ID, sends no data from the new URL, and keeps the last successful import result

### Requirement: Show the import lifecycle and errors
The integrated form SHALL display inactive, active, sending, and failed states. It SHALL show catalog, capture, validation, and API errors and SHALL NOT show a failed request as saved.

#### Scenario: API request fails
- **WHEN** the API rejects a snapshot or cannot be reached
- **THEN** the mobile interface displays the failure and preserves the previous successful import status
