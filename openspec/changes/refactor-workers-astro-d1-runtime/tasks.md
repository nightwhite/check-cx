## 1. OpenSpec and Planning

- [ ] 1.1 Create proposal, design, tasks, and spec deltas for the Workers/Astro/D1 runtime migration.
- [ ] 1.2 Create `docs/superpowers/plans/2026-05-02-workers-astro-d1-migration.md`.
- [ ] 1.3 Validate with `openspec validate refactor-workers-astro-d1-runtime --strict` when the CLI is available.

## 2. Worker Skeleton

- [x] 2.1 Add Astro, Hono, Wrangler, Workers types, Vitest, D1 and Drizzle dependencies.
- [x] 2.2 Add `astro.config.mjs`, `wrangler.jsonc`, `src/worker/index.ts`, and `/api/health`.
- [x] 2.3 Add a minimal Astro single-page shell.
- [x] 2.4 Verify `pnpm build`, `wrangler types`, and `wrangler deploy --dry-run`.

## 3. D1 Data Layer

- [x] 3.1 Define Drizzle schema for templates, models, configs, history, latest, rollups, snapshots, groups, notifications, official status, locks, and job runs.
- [x] 3.2 Add D1 migrations and required indexes.
- [x] 3.3 Add repository smoke tests for insert, select, upsert, and prune.
- [ ] 3.4 Verify local and remote D1 migrations.

## 4. Provider Runtime

- [x] 4.1 Port provider check logic into Worker-safe modules.
- [x] 4.2 Preserve OpenAI, Gemini, Anthropic, OpenAI-compatible, Chat Completions, Responses, endpoint ping, challenge validation, and latency measurement.
- [x] 4.3 Add mock tests for success, provider error, timeout, invalid challenge, and maintenance mode.

## 5. Cron Health Check

- [x] 5.1 Implement job lock acquisition and expiry.
- [x] 5.2 Implement scheduled health check flow.
- [x] 5.3 Write `check_history`, `check_latest`, `availability_rollups`, `dashboard_snapshots`, and `job_runs`.
- [ ] 5.4 Verify scheduled smoke test and overlapping job behavior.

## 6. Hono API Compatibility

- [x] 6.1 Implement dashboard, group, status, notifications, and internal routes.
- [x] 6.2 Validate `trendPeriod` as `7d`, `15d`, or `30d`.
- [x] 6.3 Add ETag and cache headers for dashboard and group APIs.
- [ ] 6.4 Verify contract compatibility with old API samples.

## 7. Astro Single Page UI

- [x] 7.1 Create a UI design brief for the single-page status dashboard.
- [x] 7.2 Migrate Dashboard UI into React islands.
- [ ] 7.3 Fold group pages into group tabs/filter/query/detail panel.
- [ ] 7.4 Verify desktop and mobile layout, loading, empty, error, and retry states.

## 8. Data Migration

- [ ] 8.1 Add Supabase export, D1 import, and provider key encryption scripts.
- [ ] 8.2 Convert UUID, JSONB, timestamptz, enum, and API key fields.
- [ ] 8.3 Migrate the latest state and the last 30 days of history.
- [ ] 8.4 Verify counts, relationships, and absence of plaintext API keys.

## 9. Verification and Cutover

- [ ] 9.1 Add API contract verification script and Workers migration checklist.
- [ ] 9.2 Verify no request-triggered health checks, business `setInterval`, floating promises, or hardcoded secrets.
- [ ] 9.3 Add cutover runbook with D1 creation, secrets, migrations, data import, Cron, route switch, and rollback.
- [ ] 9.4 Run final build, lint, types, D1 local migration, and dry-run deploy.
