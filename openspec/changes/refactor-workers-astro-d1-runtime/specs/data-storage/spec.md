## ADDED Requirements

### Requirement: D1-backed storage model

The system SHALL store runtime configuration, health history, latest state, rollups, snapshots, notifications, official status, locks, and job runs in D1.

#### Scenario: Health check results are written

- **WHEN** a health check job completes a provider check
- **THEN** the system inserts a row into `check_history`
- **AND** upserts the corresponding `check_latest` row
- **AND** updates rollups and dashboard snapshots needed by read APIs

### Requirement: Drizzle-managed schema

The system SHALL define D1 schema with Drizzle and version it through migrations.

#### Scenario: A new environment is initialized

- **WHEN** migrations are applied to a D1 database
- **THEN** all required Check CX tables and indexes exist
- **AND** Worker repository code can read and write using the generated schema

### Requirement: Encrypted provider credentials

The system SHALL NOT store provider API keys in plaintext in D1.

#### Scenario: Provider configuration is migrated

- **WHEN** a Supabase `check_configs.api_key` value is migrated
- **THEN** D1 stores ciphertext, nonce, and key version fields
- **AND** API responses never include plaintext or ciphertext provider credentials
