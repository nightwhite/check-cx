## ADDED Requirements

### Requirement: Astro single-page dashboard

The system SHALL serve the public dashboard as an Astro static single page on Cloudflare Workers Static Assets.

#### Scenario: User opens the dashboard

- **WHEN** a user requests `/`
- **THEN** the Worker serves the Astro static shell
- **AND** the interactive dashboard loads data from Worker API endpoints

### Requirement: Single-page group experience

The system SHALL preserve group browsing and group details inside the single dashboard page instead of requiring a separate primary group page.

#### Scenario: User selects a group

- **WHEN** a user selects a group filter, tab, query state, or detail panel
- **THEN** the dashboard displays the group's providers, tags, website metadata, timelines, and availability data
- **AND** the user remains in the single-page dashboard experience

### Requirement: Dashboard request safety

The dashboard SHALL NOT trigger provider health checks from user requests.

#### Scenario: Dashboard refreshes data

- **WHEN** the dashboard fetches `/api/dashboard`
- **THEN** the API reads D1 latest, rollup, or snapshot data
- **AND** no provider API request is started from that user request
