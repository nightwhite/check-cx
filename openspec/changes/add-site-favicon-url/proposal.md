# Change: Add configurable site favicon URL

## Why
The status page favicon should be configurable from the single-site admin settings instead of being fixed to a static asset.

## What Changes
- Add `faviconUrl` to site settings.
- Allow admins to edit `Favicon URL` separately from `Logo URL`.
- Serve `/favicon.ico` from the configured URL when present while preserving existing static icon behavior when it is not configured.

## Impact
- Affected specs: site-settings
- Affected code: site settings DB schema, admin API, admin UI, Worker fetch handler
