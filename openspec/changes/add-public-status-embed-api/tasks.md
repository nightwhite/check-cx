## 1. Specification

- [x] 1.1 Create OpenSpec proposal, design, tasks, and public status API spec delta.
- [ ] 1.2 Validate `add-public-status-embed-api` with `openspec validate --strict` when the CLI is available. Current environment: `openspec` command not found.

## 2. Tests

- [x] 2.1 Add route tests for `GET /api/public/status`.
- [x] 2.2 Add route tests for `GET /api/public/status-card.svg`.
- [x] 2.3 Verify the new tests fail before implementation.

## 3. Implementation

- [x] 3.1 Add `src/worker/routes/public.ts`.
- [x] 3.2 Register `/api/public` in the Hono app.
- [x] 3.3 Transform dashboard snapshot payload into sanitized public status JSON.
- [x] 3.4 Render a cacheable SVG status card from the same public payload.

## 4. Documentation and Verification

- [x] 4.1 Document the public JSON and SVG endpoints.
- [x] 4.2 Run focused route tests.
- [x] 4.3 Run full test, typecheck, lint, build, Wrangler types, and deploy dry-run.
- [x] 4.4 Commit the verified change.
