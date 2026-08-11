# Project Art avatar-sequence mastering

This boundary turns **explicit owner assignments over existing PNG frames** into a deterministic mastering plan for `@evavo/avatar-runtime` sequence-pack v2.

It does not generate an image, infer an animation from a filename, treat timestamp order as meaning, approve a candidate, mutate a repository, or activate a runtime release.

## Why this exists

The wider Art Studio already provides:

- mounted ChatGPT and Claude file intake;
- deterministic image repair and optimization;
- copy, move, rename, replace, reversible trash and exact restore;
- sprite-sheet and atlas construction;
- visual sequence review;
- final-frame-to-frame-zero loop review;
- path-only EVAVO Storage and repository handoffs.

The missing boundary was the exact handoff between reviewed frame files and the avatar runtime's clip model. A chronological source folder is not an animation contract. A generated filename is not an idle, talking, listening or gesture assignment.

The avatar-sequence compiler therefore accepts only `assignmentMode: "owner-declared-only"` and requires:

```text
semanticInferencePerformed: false
timestampOrderingUsedAsSemantics: false
```

## Contracts

```text
evavo.project-art-avatar-sequence-request.v1
evavo.project-art-avatar-sequence-mastering-plan.v1
evavo_avatar_sequence_pack_v2
evavo.project-art-loop-closure-request.v1
evavo_avatar_sequence_loop_closure_evidence_v1
```

The mastering plan is not a production release. Its runtime draft deliberately contains:

```text
review: null
loopClosures: []
runtimeActivationAllowed: false
```

Independent art, animation and runtime review, exact loop evidence and a separate release seal remain mandatory.

## Existing-frame request

Every frame binds one exact source identity to one reviewed runtime path:

```json
{
  "id": "idle-a",
  "sourcePath": "assets/eva-female/ChatGPT Image Aug 9, 2026, 01_50_47 PM (1).png",
  "targetPath": "assets/eva-female/reviewed/idle-a.png",
  "expectedSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

A source may retain its original timestamp name as immutable evidence. The runtime target may not. Targets must use the exact frame identity under one of these reviewed roots:

```text
assets/<character-id>/reviewed/<frame-id>.png
characters/<character-id>/sequences/<frame-id>.png
```

The compiler verifies each source as a bounded, single-link, non-symbolic, non-animated, non-interlaced 8-bit alpha PNG. It binds the exact SHA-256, byte count and canvas before any plan is returned.

Exact duplicate frame bytes must use one frame identity and be reused by ID inside clips. They may not be copied into multiple apparently distinct runtime frames.

## Explicit clip semantics

A clip declares its kind, loop mode, exact ordered frame IDs, per-frame durations, neutral frame and optional emotion:

```json
{
  "id": "talk-main",
  "kind": "talk-loop",
  "loopMode": "loop",
  "frames": [
    { "frameId": "talk-a", "durationMs": 80 },
    { "frameId": "talk-b", "durationMs": 80 }
  ],
  "neutralFrameId": "talk-a",
  "emotion": null,
  "loopThresholds": {
    "maximumChangedFraction": 0.2,
    "maximumMeanChannelDelta": 32,
    "maximumAlphaChangedFraction": 0.15,
    "maximumCentroidShiftPixels": 20
  }
}
```

Every true `loop` clip must contain at least two distinct frame identities and one explicit threshold set. The compiler emits one exact downstream loop-closure request for each such clip.

`once` and `ping-pong` clips must set `loopThresholds` to `null`. They never receive a false final-to-first requirement.

The default idle and talk rail must retain the avatar runtime contract:

```text
idle:      kind idle, loop mode loop
talk in:   kind talk-in, loop mode once
talk loop: kind talk-loop, loop mode loop
talk out:  kind talk-out, loop mode once
```

Presence, event and emotion maps are explicit clip-ID maps. The compiler does not invent missing mappings.

## Compile from the command line

```powershell
node scripts/compile-project-art-avatar-sequence.mjs `
  --workspace-root C:\GitRepos\evavo-avatar-runtime `
  --request C:\EVAVO\staging\eva-sequence-assignment.json `
  --output C:\EVAVO\staging\eva-sequence-mastering-plan.json `
  --compiled-at 2026-08-11T06:30:00.000Z
```

The output is create-only and written with private file permissions. Replaying into an existing path fails closed.

## Callable ChatGPT or Claude boundary

Start the dedicated MCP server:

```powershell
$env:EVAVO_ART_AVATAR_SEQUENCE_ROOTS = "C:\GitRepos\evavo-avatar-runtime;C:\EVAVO\staging"
$env:EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE = "true"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_sequence_mcp.mjs
```

It exposes:

```text
evavo_art_avatar_sequence_capabilities
evavo_art_compile_avatar_sequence
```

The write gate authorizes only creation of the JSON mastering plan. Source image bytes do not flow through MCP. The subprocess receives a credential-redacted environment, uses `shell: false`, and returns a bounded JSON summary rather than raw command output.

See `config/mcp.project-art-avatar-sequence.windows.example.json` for a connection example.

## Output handoffs

The plan contains four separate, non-authoritative handoffs.

### 1. Workspace file-plan request

`workspaceFilePlanRequest` is ready for the existing workspace writer. It uses path-only `copy` operations with `expectedSourceSha256`. It never overwrites a target and does not perform the copy by itself.

When source and reviewed target are already the same exact path, no copy operation is emitted.

### 2. Runtime draft

`runtimeDraft` binds the reviewed target paths, frame hashes, byte counts, canvas, ordered clips, derived durations and defaults for target schema `evavo_avatar_sequence_pack_v2`.

It is intentionally incomplete. It has no sealed review and no loop receipts.

### 3. Loop-closure requests

`loopClosureRequests` contains one `evavo.project-art-loop-closure-request.v1` document per true loop. Each request binds the reviewed paths, exact source SHA-256 values, canvas and owner-selected thresholds.

After the workspace copy plan is applied, compile and run each request through the existing loop-review boundary:

```powershell
node scripts/compile-project-art-loop-closure.mjs `
  --workspace-root C:\GitRepos\evavo-avatar-runtime `
  --request C:\EVAVO\staging\eva-idle-loop-request.json `
  --output C:\EVAVO\staging\eva-idle-loop-plan.json

python tools/run_project_art_loop_closure.py `
  --workspace-root C:\GitRepos\evavo-avatar-runtime `
  --plan C:\EVAVO\staging\eva-idle-loop-plan.json `
  --output-root C:\GitRepos\evavo-avatar-runtime\.evavo\reviews\eva-idle-loop-v1
```

### 4. Finalization requirements

A final runtime pack still requires:

- the path-only workspace file plan to be applied where needed;
- one passed loop receipt for every true loop;
- independent art, animation and runtime review;
- a sealed candidate review;
- exact sequence-pack canonical SHA-256;
- an independently approved sequence release.

## Fail-closed behavior

The compiler rejects:

- request-object and request-byte mismatch;
- inferred semantics or timestamp-derived ordering;
- absolute, escaping, non-canonical or symbolic paths;
- hard-linked source files;
- missing, animated, interlaced, non-alpha or non-PNG masters;
- stale source SHA-256 values;
- canvas drift;
- duplicate frame IDs, paths, targets or exact bytes;
- raw or timestamp-named runtime target paths;
- invalid clip kinds, loop modes, durations or neutral frames;
- duplicate ordered frame identities in a true loop;
- final-to-first thresholds on `once` or `ping-pong` clips;
- missing idle or talk runtime defaults;
- any provider, source, approval, repository, Git, deployment, publication or force-push authority;
- an existing output plan or reviewed target.

## Authority boundary

The compiler and MCP server perform no image generation and no source editing.

They do not execute a provider, apply workspace file operations, run loop review, approve a candidate, create a runtime release, mutate EVAVO Storage, change a target repository, create a Git commit, push, force push, deploy or publish.

No source, provider, repository, Git, deployment or publication authority is granted by this mastering boundary.
