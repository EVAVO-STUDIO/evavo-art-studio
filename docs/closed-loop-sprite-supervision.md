# Closed-loop sprite production supervision

Status: implemented runtime foundation

Protocol: `2026-08-01.1`

EVAVO Art Studio now has a durable supervisor that turns one verified sprite-production plan into a recoverable sequence of bounded child jobs. The supervisor does not become an unrestricted art agent. It coordinates the existing provider, mastering, quality, repair, selection, atlas and Godot workers while preserving every authority boundary those workers already enforce.

## Why the supervisor exists

A complete sprite family may contain hundreds or thousands of authored and runtime frames, multiple directions, retained layers, variants, sheets, atlases and engine resources. Running those stages manually creates predictable failure modes:

- the same failed frame is generated repeatedly;
- successful work is regenerated after interruption;
- transient provider failure is confused with permanent quality failure;
- one weak frame causes an entire family to be replaced;
- a repair is accepted without complete family reverification;
- a provider candidate is mistaken for a released master;
- stale automation overwrites newer run state;
- retries continue indefinitely;
- an agent lowers thresholds to make a run appear complete.

The supervisor replaces that behaviour with a deterministic state machine:

```text
compiled art direction
→ complete sprite-production plan
→ bounded child jobs
→ immutable output bindings
→ deterministic QA and family evidence
→ bounded redrive or targeted repair
→ named review when evidence is ambiguous
→ sheets, atlases and Godot packaging
→ verified release evidence
```

## Package

```text
packages/sprite-supervisor
```

The package provides:

- strict workflow validation;
- source sprite-plan expansion;
- compiled-plan SHA-256 verification;
- task dependency and cycle validation;
- bounded retry and repair policy;
- JSON payload placeholders;
- immutable supervisor state;
- deterministic child idempotency keys;
- review-resolution contracts;
- root runtime-job compilation;
- release-evidence rules;
- protocol documentation.

The root runtime job is:

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

## Plan input

A supervisor workflow accepts either:

```text
spritePlan
```

or:

```text
spritePlanRequest
```

A source request is compiled through `@evavo/art-sprite-planner` before the workflow is hashed. Supplying both is rejected. An embedded compiled plan is rehashed and must match its declared `planSha256`.

This ensures the supervisor cannot quietly change:

- direction coverage;
- animation inventory;
- frame counts;
- exact timing;
- layer ownership;
- variant strategy;
- sheet and atlas policy;
- Godot delivery requirements;
- art-direction binding.

## Bounded child jobs

The supervisor may submit only existing, governed Art Studio child kinds:

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

Arbitrary shell jobs, arbitrary HTTP calls and deployment jobs are rejected at validation time.

Every task declares:

- its stage and title;
- queue and job kind;
- payload template;
- required capabilities;
- task dependencies;
- required artifact roles;
- static artifact inputs;
- output selectors;
- retry policy;
- failure policy;
- lease and timeout;
- whether it is required;
- whether it is activated only by another task's failure.

## Payload placeholders

Task payloads remain JSON and support four explicit placeholder forms.

### One artifact

```json
{ "$artifact": "canonical-identity" }
```

The role must contain exactly one artifact.

### Many artifacts

```json
{ "$artifacts": "direction-candidates" }
```

At least one artifact must be bound.

### Compiled-plan value

```json
{ "$plan": "/asset/dimensions/width" }
```

The pointer uses RFC 6901 syntax and resolves against the verified compiled sprite plan.

### Run context

```json
{ "$run": "taskCycle" }
```

Supported values are:

```text
runId
tick
taskId
taskCycle
workflowSha256
```

No string interpolation, template evaluation, JavaScript execution or shell substitution is supported.

## Artifact output binding

A completed child can bind immutable outputs into named workflow roles by:

```text
output-artifact-labels
runtime-result-json
failure-details
```

Examples:

- bind every `provider-candidate` output as `idle-key-pose-candidates`;
- bind `/evidenceArtifactId` from the immutable runtime result as `selection-evidence`;
- bind `/evidenceArtifactId` from a family-verification failure as `failed-family-evidence`;
- bind the selected master as `approved-frame-master`;
- bind atlas image, manifest and Godot descriptor by artifact labels.

Selectors declare `one` or `many` cardinality and can be required or optional. Missing required output evidence moves the task to review rather than silently continuing.

## Durable state

Every supervisor tick writes a new immutable state artifact. A named reference points to the latest state:

```text
sprite-supervisor/<project-id>/<run-id>
```

The reference update uses both expected generation and expected artifact ID. Two concurrent ticks therefore cannot silently overwrite one another. A conflict becomes a transient runtime failure and is retried against the latest state.

State records:

- run status;
- tick number;
- sprite-plan ID and hash;
- workflow hash;
- each task's cycle and status;
- child job IDs;
- every terminal attempt;
- redrive count;
- repair-cycle count;
- failure classification and details;
- artifact bindings;
- human resolutions;
- release approval;
- every scheduling, retry, repair, review and completion decision.

## Scheduling and recovery

Normal tasks start only when:

- their dependencies succeeded or an optional dependency was deliberately skipped;
- every required artifact role is bound;
- the active-child limit has capacity.

Repair tasks start only when their declared source task enters `repairing`.

Every child idempotency key contains:

```text
run ID
task ID
repair or retry cycle
```

Repeated supervisor ticks therefore converge on the same child job instead of creating duplicates.

The existing runtime retains:

- leases;
- heartbeats;
- deadlines;
- timeout handling;
- cancellation;
- pause and resume;
- expired-lease recovery;
- dead-letter state;
- redrive;
- immutable runtime events.

## Failure classification

The supervisor applies failure policy in this order:

1. explicit abort-code rule;
2. bounded transient, lease-expired or timeout redrive;
3. configured targeted repair task;
4. explicit review rule or review-on-unclassified policy;
5. fail-closed abort.

This prevents a generic retry loop from treating all failures alike.

Typical routing is:

| Evidence | Action |
|---|---|
| provider rate limit, temporary network failure, expired lease | bounded redrive |
| matte, alpha, halo or crop failure | alpha or masked-pixel repair |
| pivot, baseline or registration drift | metadata or layer-transform repair |
| identity, costume, equipment or palette drift | canonical-reference repair |
| layer occlusion or source-parity failure | layer repair and recomposition |
| loop or adjacent-frame discontinuity | affected-frame repair |
| missing model evidence or ambiguous ranking | named-human review |
| invalid hash, immutable-lineage failure or unsupported job kind | abort |

A repair task succeeds only as a task. The failed source task then receives a new bounded cycle. The original successful tasks remain untouched.

## No threshold weakening

The workflow validator recursively rejects secret-like fields and quality-bypass fields, including attempts to declare:

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

The supervisor can:

- retry;
- repair;
- pause for review;
- skip an optional task through named review;
- abort.

It cannot:

- lower identity similarity;
- increase crop tolerance;
- accept fake transparency;
- ignore a missing direction;
- remove a required clip;
- promote a hard-gate failure;
- mark rejected evidence as passed.

## Human review

Review resolutions are immutable request data and require:

- task ID or `$release`;
- action;
- named approver;
- reason;
- optional artifact bindings.

Supported actions are:

```text
retry
skip
abort
approve-release
```

A required task cannot be skipped. `approve-release` may target only `$release`.

Final human approval does not replace quality evidence. It is an additional release gate when policy requires it.

## Release evidence

The supervisor succeeds only when:

- every required task succeeded;
- no required task is failed or cancelled;
- no child remains active;
- every required release artifact role is bound;
- every bound release artifact passes descriptor and content verification;
- no release artifact is labelled `qualityState=rejected`;
- required human approval exists;
- release evidence is stored successfully;
- the final state reference advances successfully.

Release evidence records:

- workflow and sprite-plan hashes;
- release artifact descriptors and content hashes;
- complete artifact-role bindings;
- every task state and attempt;
- repair and redrive history;
- human approval;
- decision count;
- explicit proof that thresholds were not relaxed;
- explicit proof that the supervisor itself did not call a provider or deploy a project.

The release evidence is evidence, not a replacement for the actual packaged artifacts.

## CLI

```powershell
pnpm art -- sprite-supervisor-protocol

pnpm art -- sprite-supervisor-validate `
  --input .\examples\sprite-supervisor-protocol.json

pnpm art -- sprite-supervisor-compile `
  --input .\examples\sprite-supervisor-protocol.json `
  --output .\sprite-supervisor.compiled.json

pnpm art -- sprite-supervisor-start `
  --input .\sprite-supervisor.json `
  --runtime-root .\.art-studio\runtime `
  --actor "Greg Parker"
```

`start` submits only the root job. A configured worker must claim the `control` queue and all downstream capability workers must be running.

## REST

```text
GET  /v1/sprite-supervisor-protocol
POST /v1/sprite-supervisors/validate
POST /v1/sprite-supervisors/compile
```

REST does not submit runtime jobs.

## MCP

```text
sprite_production_supervisor_protocol
validate_sprite_production_supervisor
compile_sprite_production_supervisor
```

MCP does not receive provider credentials, artifact-store access, runtime submission authority, shell execution or promotion authority.

## Operational requirements

A real automated run requires capability workers for the selected tasks. For example:

- provider tasks require a configured provider adapter;
- alpha mastering requires media and frame-QA capabilities;
- family verification requires immutable image artifacts and vision capabilities;
- repair execution requires a compatible inpainting provider when masked repair is selected;
- atlas and Godot packaging require guarded filesystem roots;
- native Godot resource creation still requires a separately verified Godot executable boundary.

If a required capability is unavailable, the child remains queued. The supervisor eventually reaches its tick budget and moves to review rather than fabricating completion.

## Current boundary

The supervisor is a generic durable orchestration kernel. A workflow still declares its bounded child tasks and artifact bindings explicitly. The next extension is a trusted workflow compiler that expands one complete sprite plan into the standard identity, direction, clip, frame, layer, verification, repair and packaging task matrix automatically, while retaining this same runtime and evidence contract.
