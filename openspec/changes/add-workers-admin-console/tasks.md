## 1. Specification

- [x] 1.1 Create design spec at `docs/superpowers/specs/2026-05-20-workers-admin-console-design.md`.
- [x] 1.2 Create OpenSpec proposal, design, tasks, and admin-console spec delta.
- [ ] 1.3 Validate with `openspec validate add-workers-admin-console --strict` when the CLI is available. Current environment: `openspec` and `pnpm exec openspec` return command not found.

## 2. Admin Auth

- [x] 2.1 Add failing tests for `POST /api/admin/session`, `GET /api/admin/session`, and `POST /api/admin/logout`.
- [x] 2.2 Implement `ADMIN_TOKEN` validation and 30-day signed HttpOnly session cookie.
- [x] 2.3 Reject all admin APIs without a valid session.

## 3. Admin Data Layer

- [x] 3.1 Add repository tests for templates, models, configs, groups, notifications, and runtime status.
- [x] 3.2 Implement D1 repositories with explicit SQL and no plaintext provider key reads.
- [x] 3.3 Add Worker-safe `encryptProviderKey()` and tests.

## 4. Admin API

- [x] 4.1 Add contract tests for `/api/admin/*` CRUD routes.
- [x] 4.2 Implement templates, models, configs, groups, notifications, and runtime routes.
- [x] 4.3 Ensure GET routes do not call provider check code or Cron job code.

## 5. Admin UI

- [x] 5.1 Add UI design brief section to the superpowers implementation plan.
- [x] 5.2 Implement Astro admin shell and React admin island.
- [ ] 5.3 Implement login, overview, configs, models, templates, groups, notifications, and runtime views.
- [ ] 5.4 Verify desktop and mobile layouts have no text overlap or horizontal overflow.

## 6. Verification

- [ ] 6.1 Run focused admin tests.
- [ ] 6.2 Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm wrangler:types`, and `pnpm deploy:dry-run`.
- [ ] 6.3 Document local test steps for `/admin`.
- [ ] 6.4 Commit the verified implementation.
