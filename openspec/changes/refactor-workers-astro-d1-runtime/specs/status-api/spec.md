## ADDED Requirements

### Requirement: Hono status API compatibility

The system SHALL expose read-only status data through Hono routes compatible with the current public API semantics.

#### Scenario: Client requests public status

- **WHEN** a client requests `GET /api/v1/status` with optional `group` or `model` filters
- **THEN** the API returns current status derived from D1 latest state and necessary history
- **AND** the API does not expose provider credentials

### Requirement: Dashboard and group API cacheability

The system SHALL return cache validators for dashboard and group API responses.

#### Scenario: Client requests dashboard data

- **WHEN** a client requests `GET /api/dashboard?trendPeriod=7d`
- **THEN** the response includes an `ETag`
- **AND** the response includes a `Cache-Control` header suitable for short-lived status data

### Requirement: Trend period validation

The system SHALL accept only `7d`, `15d`, or `30d` for dashboard and group trend periods.

#### Scenario: Client sends an invalid trend period

- **WHEN** a client requests `/api/dashboard?trendPeriod=90d`
- **THEN** the API returns a structured validation error
- **AND** no database write or provider check is performed
