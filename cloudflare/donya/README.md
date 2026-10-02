# Donya Nail Art — Cloudflare Foundation

This directory is the isolated Cloudflare migration target for Donya Nail Art.

Current phase: Foundation only.

It intentionally does not contain migrated production application logic, D1 schema, R2 media, authentication, or production-domain routing yet.

## Cloudflare Workers Builds

Project root/path:

`cloudflare/donya`

Build command:

leave blank

Deploy command:

`npx wrangler deploy`

Preview command:

`npx wrangler preview`

Production traffic must not be routed here until later migration phases pass validation.


Build trigger: Cloudflare production branch configured for the migration branch.


Schema apply trigger: D1 migration deploy command configured in Cloudflare Builds.
