# Persistent Artist Workspace jobs

Persistent Artist Workspace jobs let ChatGPT, Claude and trusted EVAVO agents continue multi-step art production without restarting from memory after an interruption. The journal is deliberately crash-resumable.

The job layer is deliberately a **checkpoint authority**, not a creative or provider authority. It records what the next bounded step is, who currently holds the short-lived execution lease, what exact input bytes the step was compiled against, and what exact output evidence was produced when the step succeeded.

## Why this exists

Persistent workspaces already provide immutable sources, editable working copies, append-only snapshots, content-addressed catalogs and governed handoffs. A long production session can still be interrupted between those operations. Without durable job state, the next agent has to infer whether a step was attempted, completed, failed, or left half-finished.

The job journal closes that gap.

```text
job request
→ exact input fingerprint compilation
→ create-only job plan
→ exclusive publication under journals/jobs/<job-id>/
→ create-only job commit marker published last
→ bounded agent claim
→ exact next-step inspection
→ existing Art Studio tool execution
→ append-only success/failure checkpoint
→ output evidence verification
→ safe resume by the same or a later agent
```

## Durable structure

Every job is stored inside the persistent workspace:

```text
journals/
  jobs/
    <job-id>/
      job-plan.json
      job-commit.json
      events/
        000001.json
        000002.json
        000003.json
        ...
```

`job-plan.json` is create-only and self-hashed. Event files are create-only, contiguous, self-hashed, and chained through `previousEventSha256`. `job-commit.json` is written last and binds the exact plan hash plus the first event hash; inspection rejects an incomplete directory with no valid commit marker.

There is no mutable `current.json` pointer. Current state is derived from immutable evidence each time the job is inspected.

## Post-creation path confinement

Creation-time checks are not treated as permanent trust. Every later inspection re-walks the complete `journals/jobs/<job-id>/...` chain under the exact workspace root before reading the plan, commit marker, events directory, or an individual event. Every new checkpoint also revalidates the events directory and its create-only target before append.

If a job directory or later path component is replaced with a symbolic link or junction after job creation, inspection and mutation fail closed with `ARTIST_WORKSPACE_JOB_PATH_INVALID`. A stale path cannot redirect the resumable-job journal outside the configured workspace root.

## Job request

Schema:

```text
evavo.persistent-artist-workspace-job-request.v1
```

A request declares:

- workspace and project identity;
- a bounded job title;
- 1–512 ordered steps;
- step dependencies;
- exact workspace-relative input paths;
- expected workspace-relative output paths;
- a bounded step kind;
- an optional existing Art Studio tool name for operator guidance.

Supported step kinds are:

```text
external-ingest
workspace-operation
workspace-catalog
sprite-atlas
workspace-snapshot
visual-review
storage-handoff
repository-handoff
manual-checkpoint
```

A job step never contains shell text.

## Exact input authority

During compilation, every declared input is opened through a non-symbolic, singly-linked file boundary and recorded as:

```json
{
  "path": "working/king/front.png",
  "bytes": 123456,
  "sha256": "..."
}
```

Immediately before a step begins, those fingerprints are revalidated. If an input moved, changed bytes, became symbolic, became multiply linked, or disappeared, the step does not start.

This prevents a resumed agent from executing a plan against different source art merely because the path still has the same name.

## Claims and stale-lease recovery

A mutating agent first claims the job for a bounded lease of 30 seconds to 24 hours.

The lease is itself an immutable event. If an agent crashes or disconnects, the lease naturally expires. A later agent can then claim the same job and inspect the exact next step.

There is no permanent lock file to strand a workspace.

An active lease does not authorize provider calls, creative approval, Storage writes, repository mutation, Git publication or deployment. It only serializes job-journal checkpoints.

## Step checkpoints

The compact MCP checkpoint tool accepts these actions:

```text
claim
release
start-step
complete-step
fail-step
pause
resume
cancel
```

`start-step` revalidates exact compiled inputs and dependency readiness.

`complete-step` fingerprints every declared output and records exact evidence in the append-only event chain.

`fail-step` records the bounded failure message but leaves the same step resumable. A retry increments its attempt count rather than silently skipping it.

## Output drift verification

Succeeded output evidence is revalidated whenever the job is inspected.

If a completed or intermediate output later changes, the state reports `evidenceDrift` and blocks the next step. This includes byte-length changes, SHA-256 changes, missing files, symbolic substitution and other path-boundary failures.

The job layer does not silently bless the new bytes.

## Dependency and resume semantics

Dependencies form a validated acyclic graph. Unknown dependencies, self-dependencies and cycles are rejected before publication.

Inspection returns one exact `nextStepId`:

- the currently in-progress step, if one exists;
- otherwise the first unsucceeded step whose dependencies succeeded;
- otherwise `null` when completed or blocked.

A failed step remains the next step and can be started again after the failure is understood.

## MCP server

Entrypoint:

```text
tools/project_art_workspace_jobs_mcp.mjs
```

Canonical tools:

```text
evavo_art_workspace_job_capabilities
evavo_art_compile_workspace_job
evavo_art_create_workspace_job
evavo_art_inspect_workspace_job
evavo_art_checkpoint_workspace_job
```

Workspace and evidence paths are limited by:

```text
EVAVO_ART_WORKSPACE_JOB_ROOTS
```

Mutating operations require:

```text
EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE=true
```

The canonical Windows example keeps the write gate disabled.

## CLI

```powershell
node scripts/persistent-artist-workspace-jobs.mjs capabilities

node scripts/persistent-artist-workspace-jobs.mjs compile `
  --workspace C:\EVAVO\ArtWorkspaces\chess-lord `
  --request C:\EVAVO\Evidence\king-job-request.json `
  --output C:\EVAVO\Evidence\king-job-plan.json

node scripts/persistent-artist-workspace-jobs.mjs create `
  --workspace C:\EVAVO\ArtWorkspaces\chess-lord `
  --plan C:\EVAVO\Evidence\king-job-plan.json

node scripts/persistent-artist-workspace-jobs.mjs inspect `
  --workspace C:\EVAVO\ArtWorkspaces\chess-lord `
  --job-id king-turnaround

node scripts/persistent-artist-workspace-jobs.mjs checkpoint `
  --workspace C:\EVAVO\ArtWorkspaces\chess-lord `
  --job-id king-turnaround `
  --actor claude-worker-1 `
  --action claim `
  --lease-seconds 900
```

## Authority boundary

The job layer performs no automatic:

```text
arbitrary shell execution
provider execution
source mutation or deletion
creative approval
candidate promotion
EVAVO Storage write
target-repository mutation
Git commit or push
deployment
publication
force push
```

It also does not move image bytes through MCP. MCP carries bounded paths, hashes, state, lease metadata and receipts.

The actual art operation remains an existing, separately governed Art Studio tool. The job journal only decides whether that step is ready and records the result afterward.
