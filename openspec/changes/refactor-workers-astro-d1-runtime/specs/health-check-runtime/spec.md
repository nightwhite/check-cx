## ADDED Requirements

### Requirement: Cron-triggered health checks

The system SHALL execute provider health checks from Cloudflare Cron Trigger rather than from a long-lived process interval.

#### Scenario: Cron fires

- **WHEN** Cloudflare invokes the Worker `scheduled()` handler
- **THEN** the Worker starts the health check job through `ctx.waitUntil()`
- **AND** the job writes results to D1

### Requirement: Job overlap protection

The system SHALL prevent overlapping health check jobs from writing duplicate results.

#### Scenario: A previous job is still locked

- **WHEN** a new scheduled event starts before the existing job lock expires
- **THEN** the new job does not run provider checks
- **AND** the skipped attempt is recorded or logged as a lock miss

### Requirement: Worker-safe provider checks

The system SHALL run provider checks without Next.js, Supabase client, or Node-only request state dependencies.

#### Scenario: A provider check runs in Worker runtime

- **WHEN** the health check job invokes a provider check
- **THEN** the check uses Worker-compatible fetch, AbortController, Web Crypto, and bounded concurrency
- **AND** the check returns status, latency, endpoint ping, and error metadata
