# Public-source release review

Reviewed on November 2, 2026, before publishing this repository.

## Scope and result

The release contains a fresh snapshot of the application source, tests, dependency lockfile, setup documentation, and an AI-generated project thumbnail. Its source was exported from development commit `1898c097a7d508b5d0a2eb2c73f556417b987a33`. Development Git history and local runtime files were not copied.

No production credentials or sensitive local game data were found in the release snapshot during the review. The repository is suitable for public source publication based on those checks.

## Checks performed

- Reviewed tracked-file inventory and credential-related code and documentation.
- Scanned release text files for private keys, common provider credential formats, literal JWTs, secret assignments, authenticated URLs, and embedded URL passwords.
- Checked the lockfile for nonstandard dependency download sources.
- Excluded `.dev.vars`, `.env` files, `.wrangler`, local SQLite state, `node_modules`, build directories, logs, and private authentication links.
- Confirmed the included `.dev.vars.example` contains placeholders only.
- Confirmed test signing keys and session values are clearly marked synthetic test fixtures.
- Retained public Twitch Extension client and channel IDs and the hosted app URL. These identify the deployment and do not authorize access.
- Used a fresh Git history so previous development objects and local configuration are not published.

The real `EXTENSION_SECRET` and `SESSION_SECRET` remain in Cloudflare's secret store. They are required to authenticate production votes and broadcaster sessions and are not included here.

## Limits

This is a source-disclosure review, not a penetration test, dependency vulnerability certification, or guarantee that the application has no security defects. The hosted application remains a hackathon prototype; rate limiting for public demo creation and Twitch public-release review are still pending.

Do not put secrets, session cookies, JWTs, or private OBS/control links in GitHub issues. If you deploy your own copy, configure your own credentials through Wrangler's secret store.

## Release validation

The public snapshot updates the development test runner to Vitest 4.1.12 to resolve the dependency alerts reported during clean installation. All 50 tests passed with that version. The latest npm dependency audit reported zero known vulnerabilities. This is a point-in-time registry result, not a guarantee about future advisories.
