# RAW art production orchestrator

The RAW art production orchestrator turns the complete Brass & Brine source corpus into a resumable, exact-source production queue. It joins technical inventory, image-reference decisions, the game-owned Art Studio bridge and prior processing receipts without mutating source art or the game checkout.

## Inputs

- exact RAW art inventory with source path, SHA-256, byte length and decoded dimensions;
- exact image-reference decisions or versioned image-reference work orders;
- `Brass_Brine/config/art/brass_art_studio_bridge.v1.json`;
- optional prior Sharp or Pillow processing receipts.

A receipt cannot make an unreviewed source ready. Every source still requires an explicit keep, edit, recreate, variation, reference-only or reject decision.

## Compile the queue

```powershell
node scripts/compile-raw-art-production-queue.mjs `
  --inventory C:\evidence\raw-art\inventory.jsonl `
  --decisions C:\evidence\raw-art\decisions.jsonl `
  --bridge C:\GitRepos\Brass_Brine\config\art\brass_art_studio_bridge.v1.json `
  --receipts C:\evidence\raw-art\processing-receipts.jsonl `
  --source-root Brass_Brine `
  --output C:\evidence\raw-art\production-queue.json
```

The queue states are:

```text
blocked-missing-decision
blocked-role-unmapped
blocked-target-unresolved
blocked-source-evidence
blocked-receipt-mismatch
ready-deterministic
provider-required
reference-only
held-rejected
completed
```

`ready-deterministic` items are grouped by semantic role into stable batches. Target-path collisions fail the whole compile.

## Approved style-reference metadata

```powershell
node scripts/build-approved-style-profile.mjs `
  --reviews C:\evidence\raw-art\decisions.jsonl `
  --output C:\evidence\raw-art\approved-style-profiles.json
```

The style profile retains exact exemplar hashes, approved traits, known defects, negative constraints and port, culture, role and medium scopes. It is metadata-only. It does not train a model or grant provider, creative or publication authority.

## Compile the governed execution job

```powershell
node scripts/compile-raw-art-workspace-job.mjs `
  --queue C:\evidence\raw-art\production-queue.json `
  --workspace-root C:\GitRepos `
  --evidence-root C:\EVAVO-Evidence\Brass_Brine `
  --art-studio-repo evavo-art-studio `
  --source-root Brass_Brine `
  --staging-root .evavo-art-staging `
  --output C:\evidence\raw-art\workspace-job.json
```

The job uses the existing Sharp delivery optimizer whenever one processor can preserve the complete requested semantics. It falls back to the repository-owned Pillow processor for exact-canvas normalization and other supported deterministic work. It never chains lossy intermediate processors.

The Development Studio governed workspace executor then performs a dry run, validates all declared create-only outputs and applies the job with leases, receipts and rollback:

```powershell
node C:\GitRepos\evavo-development-studio\scripts\governed-workspace-executor.mjs `
  C:\evidence\raw-art\workspace-job.json

node C:\GitRepos\evavo-development-studio\scripts\governed-workspace-executor.mjs `
  C:\evidence\raw-art\workspace-job.json `
  --apply
```

Finished derivatives remain staging evidence until exact output receipts, Godot import, native and browser captures, provenance, historical review and creative approval are admitted by Development Studio.

## Canonical checks

```powershell
pnpm run reference-intelligence:check
pnpm run image-processing-recipes:check
pnpm run governed-workspace-handoff:check
pnpm run raw-art:production:check
pnpm run raw-art:production:test
```

These checks are included in the repository-level `pnpm check` command.
