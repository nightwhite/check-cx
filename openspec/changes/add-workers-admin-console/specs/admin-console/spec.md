## ADDED Requirements

### Requirement: Admin Token Authentication

The system SHALL protect all admin APIs with an `ADMIN_TOKEN`-backed session.

#### Scenario: Login succeeds with valid token

- **GIVEN** `ADMIN_TOKEN` is configured
- **WHEN** a client posts the correct token to `POST /api/admin/session`
- **THEN** the response status is `200`
- **AND** the response sets an HttpOnly admin session cookie
- **AND** the cookie expires after 30 days by default

#### Scenario: Login fails with invalid token

- **GIVEN** `ADMIN_TOKEN` is configured
- **WHEN** a client posts an incorrect token to `POST /api/admin/session`
- **THEN** the response status is `401`
- **AND** no admin session cookie is issued

#### Scenario: Admin token is not configured

- **GIVEN** `ADMIN_TOKEN` is missing
- **WHEN** a client calls an admin session endpoint
- **THEN** the response status is `503`
- **AND** the system does not allow anonymous admin access

### Requirement: Admin API Authorization

The system SHALL require a valid admin session for every `/api/admin/*` endpoint except session creation.

#### Scenario: Unauthenticated admin API request

- **WHEN** a client requests `GET /api/admin/summary` without a valid session
- **THEN** the response status is `401`

#### Scenario: Authenticated admin API request

- **GIVEN** a client has a valid admin session cookie
- **WHEN** the client requests `GET /api/admin/summary`
- **THEN** the response status is `200`
- **AND** the response contains admin summary data from D1

### Requirement: Admin Config Management

The system SHALL let authenticated admin users manage Provider configs one row at a time.

#### Scenario: Config list is requested

- **GIVEN** the client is authenticated
- **WHEN** the client requests `GET /api/admin/configs`
- **THEN** the response includes config id, name, type, model, endpoint, enabled state, maintenance state, group, timestamps, and `hasApiKey`
- **AND** the response does not include plaintext API keys, ciphertext, or nonce

#### Scenario: Config is created

- **GIVEN** the client is authenticated
- **WHEN** the client posts a config with name, type, model id, endpoint, group, enabled state, maintenance state, and API key
- **THEN** the system stores the config in D1
- **AND** the provider key is encrypted before storage

#### Scenario: Config secret is replaced

- **GIVEN** the client is authenticated
- **WHEN** the client posts a new API key to `POST /api/admin/configs/:id/secret`
- **THEN** the system replaces only the encrypted provider key fields
- **AND** the response does not include the submitted key

### Requirement: Admin Catalog Management

The system SHALL let authenticated admin users manage request templates, models, groups, and notifications one row at a time.

#### Scenario: Template is managed

- **WHEN** an authenticated client creates or updates a request template
- **THEN** the system validates provider type and JSON fields
- **AND** stores `request_header_json` and `metadata_json` as JSON strings

#### Scenario: Model is managed

- **WHEN** an authenticated client creates or updates a model
- **THEN** the system validates provider type
- **AND** ensures the selected template belongs to the same provider type when a template is selected

#### Scenario: Group is managed

- **WHEN** an authenticated client creates or updates a group
- **THEN** the system stores group name, website URL, and tags

#### Scenario: Notification is managed

- **WHEN** an authenticated client creates or updates a notification
- **THEN** the system validates level as `info`, `warning`, or `error`
- **AND** stores active state

### Requirement: Admin Runtime Status

The system SHALL expose read-only Cron and runtime status to authenticated admins.

#### Scenario: Runtime status is requested

- **GIVEN** the client is authenticated
- **WHEN** the client requests `GET /api/admin/runtime`
- **THEN** the response includes recent `job_runs`, current `job_locks`, dashboard snapshot timestamps, latest check timestamp, and configured Cron label
- **AND** the response does not allow editing the Cron expression

### Requirement: Admin Worker Safety

The admin console SHALL be safe for Cloudflare Workers request lifecycles.

#### Scenario: Admin GET APIs read data

- **WHEN** any admin GET API is requested
- **THEN** it reads from D1 only
- **AND** it does not run provider checks
- **AND** it does not call `runHealthCheckJob`
- **AND** it does not depend on Next.js, Supabase, or Node-only request state
