# Animation Character Family Campaign Adapter Preflight V1

Protocol: `2026-09-01.1`

This read-only gate runs before a complete-character campaign spends an attempt or cycle. It verifies that Art Studio production and repair work and Cel Animation Studio whole-family review are backed by locally usable adapters.

The gate verifies task ownership, duplicate IDs, contained roots, non-symlink entrypoints, optional implementation SHA-256 locks, executable discovery without execution, command arrays, shell-wrapper rejection, environment-variable **names** without serialising values, and complete task coverage.

It returns `ready`, `partial`, or `blocked` with exact next actions. A missing adapter is unavailable capability, not a failed render or failed review.

```powershell
node .\tools\animation_character_family_campaign_preflight_v1.mjs describe
node .\tools\animation_character_family_campaign_preflight_v1.mjs inspect .\preflight-input.json
node .\tools\animation_character_family_campaign_preflight_v1.mjs verify .\preflight-report.json
```

The MCP server is read-only. Local filesystem inspection is hidden unless:

```text
EVAVO_ANIMATION_CHARACTER_FAMILY_PREFLIGHT_READ_ENABLED=enabled
```

It never executes adapters, calls providers, approves artwork, promotes artifacts, mutates repositories, activates runtimes, publishes media, or deploys builds.
