# Project Art avatar final-pass provider submissions

This boundary advances the EVA frame-finishing workflow from an exact repair queue to **one-candidate provider submissions** without pretending that a generated or edited image is already approved.

It consumes the sealed:

```text
evavo.project-art-avatar-final-pass-plan.v1
```

and compiles an explicit:

```text
evavo.project-art-avatar-final-pass-provider-request.v1
→ evavo.project-art-avatar-final-pass-provider-batch.v1
```

The compiler is for frame-specific hand, finger, anatomy, identity and continuity corrections, plus deliberate provider-generated in-between frames. It does not infer animation meaning from filenames, timestamps or generation order.

## Why this is the next boundary

The final-pass plan already separates:

- clean accepted frames;
- deterministic edge and canvas repairs;
- provider redraws for hands, fingers, anatomy and identity;
- provider-generated in-betweens;
- non-production deterministic morph previews.

A provider call must not be assembled from loose prompts or unfinished frame endpoints. This compiler binds every selected job to the exact final-pass plan, exact source and target identities, exact human authorization, exact admitted reference artifacts, exact target canvas and one deterministic candidate path.

## Correct production order

The compiler enforces the correct animation-finishing order:

```text
review source frame
→ repair or redraw key frame
→ bind final reviewed key-frame SHA-256
→ generate in-between only from final endpoint hashes
→ review the new candidate at native scale
→ rerun frame finishing and registration checks
→ rerun final-to-first loop closure
→ approve final timing
→ seal the reviewed sequence release
```

An in-between is blocked when either endpoint still has `pendingOutput: true` or has no final SHA-256. This prevents a malformed or unfinished repaired key frame from propagating through the animation.

## Exact selected jobs

Only two upstream job kinds can enter this boundary:

```text
provider-redraw
provider-generated in-between
```

Deterministic repairs and deterministic morph previews are rejected as provider jobs. The request must explicitly name each selected job:

```text
redraw:<frameId>
inbetween:<frameId>
```

The compiler never promotes every repair in the queue automatically.

## Human run-once authorization

Every submit-ready job requires an external record with:

```json
{
  "action": "run-provider-once",
  "actorClass": "human",
  "actorId": "named-human-reviewer",
  "occurredAt": "2026-08-13T02:00:00.000Z",
  "evidenceSha256": "<sha256>"
}
```

Agent, service or implicit authorization is rejected. The compiler verifies the record but does not persist it and does not execute the provider.

## Reference artifact admission

A redraw requires:

```text
canonical-identity
base-image
```

A generated in-between requires:

```text
canonical-identity
previous-key-pose
next-key-pose
```

Every binding must retain the exact immutable materialized source path and SHA-256 from the sealed plan and must have been admitted by a named human:

```json
{
  "bindingKey": "base-image",
  "sourcePath": "frames/talk-a.png",
  "sourceSha256": "<sha256>",
  "artifactId": "artifact_<sha256>",
  "evidenceSha256": "<sha256>",
  "actorClass": "human",
  "actorId": "named-human-reviewer",
  "occurredAt": "2026-08-13T02:00:00.000Z"
}
```

Substituted paths, hashes, artifact IDs or admission actors fail closed.

## One-candidate rule

Every ready provider request is fixed to:

```text
candidateCount = 1
quality = high
output = PNG
transparency = required
background = native alpha
fallback = false
```

The candidate destination is deterministic and cannot overwrite the reviewed target:

```text
scratch/avatar-final-pass/<sessionId>/<frameId>/candidate-01.png
```

The compiler does not create a contact sheet, alternate set, multi-frame image or uncontrolled candidate fan-out.

## Redraw direction

A redraw uses the exact immutable source as `base-image` and the selected clean frame as `canonical-identity`.

The generated request requires:

- the original pose to remain intact;
- only declared defects to be corrected;
- hands, fingers, wrists, arms, anatomy and face identity to remain coherent;
- clothing, palette, lighting, camera, silhouette and registration to remain stable;
- transparent edges to remain clean;
- one image only.

## In-between direction

An in-between uses final reviewed previous and next key poses, plus the canonical identity.

The request explicitly rejects:

- cross-fades;
- double exposure;
- averaged or duplicated hands;
- face drift;
- anatomy drift;
- style drift;
- canvas or registration drift.

The output is still only a candidate. It must be visually reviewed and passed back through the frame finisher before it can enter a sequence.

## CLI

```powershell
node C:\GitRepos\evavo-art-studio\scripts\compile-project-art-avatar-final-pass-provider.mjs `
  --plan C:\EVAVO\workspaces\eva-avatar-review\<commit>\final-pass-plan.json `
  --request C:\EVAVO\workspaces\eva-avatar-review\<commit>\provider-request.json `
  --output C:\EVAVO\workspaces\eva-avatar-review\<commit>\provider-batch.json `
  --compiled-at 2026-08-13T02:00:00.000Z
```

The output is private and create-only. Replaying into the same path fails.

## MCP

Start the bounded compiler:

```powershell
$env:EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS = "C:\EVAVO\workspaces"
$env:EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE = "true"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_final_pass_provider_mcp.mjs
```

Tools:

```text
evavo_art_avatar_final_pass_provider_capabilities
evavo_art_compile_avatar_final_pass_provider_batch
```

Image bytes do not pass through MCP JSON. The server uses no shell and cannot call a provider.

## Result states

A job is either:

```text
blocked
ready-for-explicit-provider-submission
```

A blocked job has no `providerRequestInput` object. It records exact blockers such as:

```text
human-provider-authorization-required
identity-frame-final-output-required
before-frame-final-output-required
after-frame-final-output-required
reference-artifact-required:<bindingKey>
```

A ready job contains one canonical provider request and its SHA-256, but actual submission remains a separate write-enabled provider runtime action.

## Validation

Run the complete focused suite without installing or invoking a provider:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\check-project-art-avatar-final-pass-provider-suite.mjs
```

The suite performs JavaScript syntax checks, the permanent static guard, provider compiler regressions and MCP regressions. It creates no GitHub Actions workflow and consumes no hosted runner by itself.

## Authority boundary

The compiler and MCP server retain all of these as false:

```text
source mutation
automatic generation authorization
provider execution
candidate approval
candidate promotion
repository mutation
Git commit
Git push
deployment
publication
runtime activation
force push
```

A provider result must still pass independent visual review, anatomy and identity review, continuity review, frame finishing, loop closure, sequence release sealing and runtime admission.
