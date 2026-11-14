## ADDED Requirements

### Requirement: Initialize a live import once per direct match
The matchOnline extension SHALL support Firefox Nightly on Android and provide a mobile-usable import interface accessible from the browser's extension action on Basquet Catala direct-match URLs with paths `/directe/<id>` or `/estadistica/directe/<id>`. The interface SHALL load the existing federation catalog options and allow the user to enter season, category, competition, and matchday metadata using touch controls. It SHALL retain metadata, interval, and import status by numeric direct-match ID, and SHALL NOT start importing until the user explicitly starts it.

#### Scenario: Start importing a direct match on Firefox Nightly Android
- **WHEN** the user opens the extension interface in Firefox Nightly on Android and starts an import on a direct-match URL
- **THEN** the extension stores the selected metadata for that direct-match ID and begins submitting live snapshots

#### Scenario: Use the interface on a mobile screen
- **WHEN** the extension interface is displayed in Firefox Nightly on an Android phone
- **THEN** its fields, status, and start/stop controls fit the mobile viewport and can be operated with touch

#### Scenario: Reopen the interface for the same match
- **WHEN** the extension interface is reopened for a direct-match ID that has stored import metadata
- **THEN** it restores that match's metadata, interval, and active status without requiring the user to enter the metadata again

#### Scenario: Open the interface outside a direct match
- **WHEN** the active tab is not on a supported direct-match URL
- **THEN** it does not start an import and explains that a live direct-match page is required

### Requirement: Send live snapshots on a configurable cadence
While an import is active, the extension SHALL submit each newly received complete match snapshot to the federation import endpoint with the statistics payload, play-by-play payload, metadata, source URL, and numeric `liveMatchId`. The refresh interval SHALL default to 5 seconds and accept integer values from 5 through 60 seconds. A snapshot lacking required data SHALL NOT be represented as a successful or fabricated import. Import failures SHALL NOT stop the existing live scoreboard.

#### Scenario: Submit a new snapshot
- **WHEN** an active direct match receives a new complete snapshot
- **THEN** the extension submits that snapshot and the stored metadata and direct-match ID to the API

#### Scenario: Apply a custom interval
- **WHEN** the user saves a valid interval in the mobile extension interface for a direct-match ID
- **THEN** the live refresh uses that interval and the setting persists when the popup is reopened

#### Scenario: Prevent overlapping submissions
- **WHEN** a new snapshot arrives while an API request for the same direct-match ID is still pending
- **THEN** the extension does not start a concurrent import for that match and queues the changed snapshot for submission after the pending request

### Requirement: Stop sending when the import stops or the URL changes
The extension SHALL provide an explicit stop action that prevents subsequent snapshots from being submitted without disabling the scoreboard. It SHALL automatically stop importing when the active tab navigates away from the direct-match URL, including a redirect to a statistics URL, and SHALL retain the last successful import result.

#### Scenario: Stop importing manually
- **WHEN** the user stops an active import
- **THEN** the extension submits no later snapshots until the user starts importing again

#### Scenario: Direct URL redirects at the end of the game
- **WHEN** the active tab navigates from a direct-match URL to a statistics URL
- **THEN** the extension stops importing for that direct-match ID, sends no data from the new URL, and keeps the last successful import result

### Requirement: Show the import lifecycle and errors
The mobile extension interface SHALL display inactive, active, sending, and failed states. It SHALL show catalog, capture, validation, and API errors and SHALL NOT show a failed request as saved.

#### Scenario: API request fails
- **WHEN** the API rejects a snapshot or cannot be reached
- **THEN** the mobile interface displays the failure and preserves the previous successful import status
