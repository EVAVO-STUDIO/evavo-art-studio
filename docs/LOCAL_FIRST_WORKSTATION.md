# Local-first Art Studio workstation

EVAVO Art Studio is designed to build, validate, review and run from the governed Windows workstation without requiring GitHub Actions or Vercel. GitHub remains source history. Vercel is optional only for an intentionally published web surface and is not a build farm, test runner, queue, worker or evidence store.

## First-time checkout setup

Run these commands from the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
node scripts/setup-local-hooks.mjs
node scripts/setup-local-hooks.mjs --check
```

The hook installer sets the checkout-local Git configuration `core.hooksPath=.githooks`. It does not change global Git settings. The governed pre-push hook runs the `push` validation profile and selects the clean `release` profile whenever `main` is being updated.

Use the dry-run form to inspect the intended hook configuration without changing the checkout:

```powershell
node scripts/setup-local-hooks.mjs --plan
```

## Validation profiles

```powershell
# Small, deterministic contract and quality checks
node scripts/local-quality-gate.mjs fast

# Validate changed workspaces plus their internal dependencies and dependants
node scripts/local-quality-gate.mjs changed

# Read Git pre-push updates from standard input and choose changed or release validation
node scripts/local-quality-gate.mjs push

# Run the complete local repository check
node scripts/local-quality-gate.mjs full

# Require a clean starting worktree, run the complete check and prove validation did not mutate source
node scripts/local-quality-gate.mjs release
```

Legacy `quick` and `prepush` names remain aliases for `fast` and `push` so older local checkout commands fail safely into the current profiles.

Every executed gate has a bounded per-command timeout. The default is 30 minutes and can be changed from one second to four hours:

```powershell
$env:EVAVO_ART_LOCAL_GATE_TIMEOUT_MS = "2700000"
node scripts/local-quality-gate.mjs full
```

Successful, failed, timed-out and cancelled executions write atomic JSON receipts beneath:

```text
.art-studio/local-validation/
```

The latest receipt is `latest.json`; versioned receipts retain the exact profile, command results, worktree evidence, repository HEAD and environment fingerprint. This directory is ignored by Git.

The local validation cache is deliberately off by default. It may be enabled for non-release profiles only when an exact fingerprint match is acceptable:

```powershell
$env:EVAVO_ART_LOCAL_GATE_CACHE = "1"
node scripts/local-quality-gate.mjs changed
```

Release and push validation never trust the cache.

## Run the complete local stack

Inspect the exact build and service plan first:

```powershell
node scripts/run-local-studio.mjs --plan
```

Start web, API and worker together:

```powershell
node scripts/run-local-studio.mjs
```

Start only selected services:

```powershell
node scripts/run-local-studio.mjs --services web,api
node scripts/run-local-studio.mjs --services worker
```

Skip the supervisor's build phase only when the required outputs were already built and reviewed in the same checkout:

```powershell
node scripts/run-local-studio.mjs --no-build
```

The supervisor builds shared domain packages once, then builds only the selected compiled services. It checks port availability before launch, confirms the web endpoint on port 4200, verifies the API health identity on port 4100, supervises the worker, and shuts down the complete child-process tree if a service fails or the operator stops the stack.

A PID-owned lock prevents two supervisors from controlling the same checkout. Session evidence and bounded service logs are stored under:

```text
.art-studio/local-stack/
```

A stale lock is replaced only after its owning process is no longer active. Symbolic-link lock files are rejected.

## Worker and storage safety

Check storage headroom before starting production:

```powershell
node scripts/check-local-storage-headroom.mjs
```

Run the governed worker wrapper:

```powershell
node scripts/run-local-worker.mjs once
node scripts/run-local-worker.mjs until-idle
node scripts/run-local-worker.mjs daemon
```

The default minimum for both the runtime and artifact volumes is 2 GiB free and 5 percent free. Both conditions must pass. Configure different governed roots or thresholds as needed:

```powershell
$env:EVAVO_ART_RUNTIME_ROOT = "C:\GitRepos\evavo-art-studio\.art-studio\runtime"
$env:EVAVO_ART_ARTIFACT_ROOT = "E:\EVAVO\ArtStudio"
$env:EVAVO_ART_MIN_FREE_BYTES = "4294967296"
$env:EVAVO_ART_MIN_FREE_PERCENT = "8"
$env:EVAVO_ART_STORAGE_CHECK_INTERVAL_MS = "30000"
node scripts/run-local-worker.mjs daemon
```

The daemon wrapper rechecks headroom periodically and terminates the worker process tree if either governed volume falls below the threshold. Storage inspection does not create the requested directories and does not mutate EVAVO Storage.

## Hosted automation boundary

The active `.github/workflows` directory contains policy documentation only. Workflow YAML is forbidden there on the zero-cost operating path. Historical definitions remain inert under `ops/github-actions-reference/workflows` and do not execute from that location.

Prove this boundary locally:

```powershell
node scripts/check-github-workflow-contexts.mjs
node --test scripts/test-github-workflow-contexts.mjs
```

Do not restore automatic push, pull-request, schedule or workflow-run triggers to bypass a local failure. Do not move validation, provider execution, media processing, durable queues or workers into Vercel. Fix the local command, dependency, source or environment problem and rerun the authoritative local profile.

## Recovery

When a gate fails, open `.art-studio/local-validation/latest.json` and rerun the failed command directly after correcting the root cause. When a service fails, inspect its session log under `.art-studio/local-stack/sessions`.

When a lock remains after an abnormal shutdown, first verify that its recorded PID is not active. The supervisor will remove a genuinely stale ordinary lock itself; do not delete a lock owned by a running process.

Before pushing `main`, the expected sequence is:

```powershell
node scripts/setup-local-hooks.mjs --check
node scripts/local-quality-gate.mjs release
git status --short
git push origin main
```

The release profile must finish with the same repository status snapshot it started with. It has no authority to call image providers, deploy, publish, promote artifacts, write to another repository, force-push, or mutate EVAVO Storage.
