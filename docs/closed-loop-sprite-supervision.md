# Closed-loop sprite production supervision

Status: implemented runtime foundation

Protocol: `2026-08-01.2`

EVAVO Art Studio has a durable supervisor that turns one verified sprite-production plan into a recoverable sequence of bounded child jobs. It coordinates existing provider, mastering, quality, repair, selection, atlas and Godot workers without inheriting their credentials or weakening their gates.

## Production flow

```text
compiled art direction
→ complete sprite-production plan
→ bounded child jobs
→ immutable output bindings
→ deterministic QA and family evidence
→ bounded redrive or targeted repair
→ exact-state human review when required
→ sheets, atlases and Godot packaging
→ verified release evidence
```

A complete family can contain hundreds or thousands of authored frames, derived runtime facings, retained layers, variants and engine resources. The supervisor prevents successful work from being regenerated after interruption and prevents one bad frame from replacing an otherwise approved family.

## Durable root job

```json
{
  "queue": "control",
  "kind": "art.sprite-production.supervise",
  "requiredCapabilities": [
    "sprite.supervisor.run",
    "runtime.jobs",
    "artifacts.store",
    "evidence.bundle"
  ]
}
```

The root job schedules only existing, capability-scoped Art Studio work:

```text
art.candidate.generate
art.candidate.edit
art.candidate.inpaint
art.candidate.master-alpha
art.candidate.select
art.candidate.promote
art.repair.plan
art.repair.execute-provider-canvas
art.repair.revise-family
art.repair.prepare-revision-selection
art.repair.rank-revisions
art.repair.promote-revision
sprite.family.verify
sprite.atlas.build
```

Arbitrary shell, HTTP and deployment jobs are rejected.

## Plan authority

A workflow accepts exactly one of:

```text
spritePlan
spritePlanRequest
```

A source request is compiled through `@evavo/art-sprite-planner`. A supplied plan is rehashed and must match `planSha256`. The supervisor therefore cannot quietly change direction coverage, clips, frame counts, timing, layer ownership, variant strategy, sheet/atlas policy, Godot requirements or the art-direction binding.

## Bounded task contract

Every task declares:

- stage, title, canonical queue and job kind;
- JSON payload template;
- required capabilities and immutable input roles;
- task dependencies;
- output selectors and cardinality;
- retry, lease and timeout policy;
- repair route and repair-cycle budget;
- whether it is required or activated only by another task's failure.

Payloads support only explicit JSON placeholders:

```json
{ "$artifact": "canonical-identity" }
{ "$artifacts": "direction-candidates" }
{ "$plan": "/asset/dimensions/width" }
{ "$run": "taskCycle" }
```

No JavaScript evaluation, shell substitution or arbitrary string interpolation is supported.

## Immutable state and concurrency

Every supervisor tick stores a new immutable state artifact. A compare-and-swap reference points to the newest state:

```text
sprite-supervisor/<project-id>/<run-id>
```

State records:

- workflow and sprite-plan hashes;
- tick and run status;
- each task cycle, child job and attempt;
- redrive and repair counts;
- failure evidence;
- immutable artifact-role bindings;
- applied review-resolution IDs and hashes;
- release approval;
- every scheduling, repair, review and completion decision.

Two concurrent ticks cannot overwrite one another. `SPRITE_SUPERVISOR_STATE_CONFLICT` remains transient so the durable runtime retries against the newest state.

Dormant failure-triggered repair tasks begin as `waiting`, but they do not count as active until a child job ID is actually assigned. Real waiting, submitted and running child jobs block completion.

## Failure handling

The supervisor applies policy in this order:

1. explicit abort-code rule;
2. bounded transient, lease-expired or timeout redrive;
3. configured targeted repair;
4. exact-state human review;
5. fail-closed abort.

Typical routing:

| Evidence | Action |
|---|---|
| temporary provider/network failure or expired lease | bounded redrive |
| matte, alpha, halo or crop failure | alpha or masked-pixel repair |
| pivot, baseline or registration drift | metadata or layer-transform repair |
| identity, costume, equipment or palette drift | canonical-reference repair |
| layer occlusion or source-parity failure | layer repair and recomposition |
| loop or adjacent-frame discontinuity | affected-frame repair |
| missing model evidence or ambiguous ranking | named-human review |
| invalid hash, lineage or unsupported job kind | abort |

A successful repair advances only the failed source task to a new cycle. Completed dependencies and unaffected artifacts remain intact.

## No threshold weakening

Supervisor input recursively rejects secrets and quality-bypass controls, including attempts to declare:

```text
bypassQuality
disableGate
ignoreQuality
allowRejected
acceptFailed
relaxThresholds
skipValidation
skipVerification
```

The supervisor can retry, repair, pause, review, skip an optional task or abort. It cannot lower identity similarity, widen crop tolerance, accept fake transparency, ignore missing directions, remove required clips or promote a hard-gate failure.

## State-bound human review

Review decisions are separate submissions rather than mutable workflow configuration. The workflow SHA-256 remains stable, while each review-bearing request receives a new request SHA-256 and durable root-job idempotency key.

Every resolution requires:

```json
{
  "resolutionId": "release-review-001",
  "expectedStateTick": 42,
  "taskId": "$release",
  "action": "approve-release",
  "approver": "Greg Parker",
  "reason": "Reviewed the complete immutable release evidence."
}
```

Rules:

- `resolutionId` is one-time and replay-safe;
- an identical replay has no second effect;
- the same ID with different content is rejected;
- `expectedStateTick` must equal the current immutable state tick;
- task actions are accepted only while that task is `review-required`;
- required tasks cannot be skipped;
- final approval is accepted only after all required tasks pass and no child remains active.

See `docs/state-bound-supervisor-reviews.md` for the complete command, replay, retry and release semantics.

## Release evidence

The supervisor succeeds only when:

- every required task succeeded;
- no required task is failed or cancelled;
- no child job remains active;
- every required release role is bound;
- every release artifact passes descriptor and content verification;
- no release artifact is labelled `qualityState=rejected`;
- required final approval is present;
- release evidence is stored;
- the final state reference advances successfully.

Release evidence records all hashes, role bindings, task attempts, repair/redrive history, human approval and explicit declarations that thresholds were not relaxed, the supervisor did not call a provider directly and no deployment occurred.

## Interfaces

### CLI

```powershell
pnpm art -- sprite-supervisor-protocol
pnpm art -- sprite-supervisor-validate --input .\sprite-supervisor.json
pnpm art -- sprite-supervisor-compile --input .\sprite-supervisor.json
pnpm art -- sprite-supervisor-start `
  --input .\sprite-supervisor.json `
  --runtime-root .\.art-studio\runtime `
  --actor "Greg Parker"
```

`start` submits only the root durable job.

### REST

```text
GET  /v1/sprite-supervisor-protocol
POST /v1/sprite-supervisors/validate
POST /v1/sprite-supervisors/compile
```

### MCP

```text
sprite_production_supervisor_protocol
validate_sprite_production_supervisor
compile_sprite_production_supervisor
```

REST and MCP compile only. They do not submit jobs, inspect artifacts, call providers, promote candidates, execute a shell or deploy a project.

## Operational requirements

A real run needs workers for the selected task capabilities. Provider credentials remain on provider workers. Guarded filesystem roots remain mandatory for atlas and Godot work. Native Godot resource creation remains a separate engine-worker smoke boundary.

When a capability is unavailable, the child remains queued. The supervisor reaches review rather than fabricating completion.

## Current boundary

The supervisor executes a declared bounded task graph. The next extension is a trusted workflow compiler that expands a complete sprite plan into the standard identity, direction, clip, frame, layer, verification, repair and packaging matrix automatically while retaining this runtime and evidence contract.
