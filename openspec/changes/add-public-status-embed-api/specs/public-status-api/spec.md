## ADDED Requirements

### Requirement: Public Status JSON API

The system SHALL expose `GET /api/public/status` as a public, unauthenticated JSON API for third-party sites to display Check CX status.

#### Scenario: Snapshot exists

- **GIVEN** a `dashboard_snapshots` row exists for `snapshot_key = "dashboard"` and the requested period
- **WHEN** a client requests `GET /api/public/status?period=7d`
- **THEN** the response status is `200`
- **AND** the response body includes `version`, `generatedAt`, `period`, `overallStatus`, `summary`, and `providers`
- **AND** provider entries do not include endpoint URLs, API keys, raw request headers, or internal stack traces
- **AND** the response includes `Access-Control-Allow-Origin: *`, `ETag`, and cache headers

#### Scenario: Snapshot is absent

- **GIVEN** no matching `dashboard_snapshots` row exists
- **WHEN** a client requests `GET /api/public/status`
- **THEN** the response status is `200`
- **AND** the body reports `overallStatus = "unknown"`
- **AND** the summary total is `0`
- **AND** the request does not scan `check_history` or trigger provider checks

#### Scenario: Invalid period

- **WHEN** a client requests `GET /api/public/status?period=90d`
- **THEN** the response status is `400`
- **AND** the response body lists the allowed periods: `7d`, `15d`, and `30d`

### Requirement: Public Status PNG Screenshot API

The system SHALL expose `GET /api/public/status-card.png` as a public, unauthenticated PNG image API for embedding the current Check CX status page.

#### Scenario: PNG screenshot is requested

- **GIVEN** a dashboard snapshot exists
- **WHEN** a client requests `GET /api/public/status-card.png?period=7d`
- **THEN** the response status is `200`
- **AND** `Content-Type` is `image/png`
- **AND** the image is rendered from the real public Dashboard page
- **AND** the screenshot captures the full page beyond the initial viewport
- **AND** the response includes `Access-Control-Allow-Origin: *`, `ETag`, and cache headers

#### Scenario: PNG screenshot cache validator matches

- **GIVEN** the client sends `If-None-Match` matching the screenshot ETag
- **WHEN** the client requests `GET /api/public/status-card.png`
- **THEN** the response status is `304`
- **AND** the response does not include a body
- **AND** the request does not launch a Browser Rendering session

### Requirement: Public API Worker Safety

The public status APIs SHALL be read-only request handlers suitable for Cloudflare Workers request lifecycles.

#### Scenario: Public APIs read status

- **WHEN** either public endpoint is requested
- **THEN** it reads from `dashboard_snapshots`
- **AND** it does not call provider check code
- **AND** it does not run the Cron health check job
- **AND** the PNG screenshot endpoint does not accept arbitrary external URLs
