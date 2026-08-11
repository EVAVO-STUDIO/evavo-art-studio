# Project Art loop-closure review

The Project Art loop-closure review is the dedicated final-to-first continuity gate for sprite and avatar animation loops. The ordinary `sequence-review` task measures each adjacent transition in source order. This companion contract measures the separate seam from the final frame back to frame zero, which is the transition a looping runtime actually displays.

Use it for idle, breathing, talking, listening, thinking, sleeping, dancing, ambient effect and other repeating clips where an otherwise clean sequence can still snap when playback wraps.

## What it proves

The compiler binds an ordered set of exact PNG source files to:

- canonical workspace-relative paths;
- stable file byte counts and SHA-256 identities;
- PNG header dimensions and format details;
- one exact final-frame to frame-zero seam;
- explicit continuity thresholds;
- bounded preview surfaces;
- a canonical plan SHA-256;
- a fully false mutation and publication authority boundary.

The Python/Pillow runtime then independently:

1. validates the canonical plan hash;
2. resolves every path inside the same non-symbolic workspace root;
3. revalidates every source hash and byte count before decoding;
4. decodes only the first and final seam frames for measurement;
5. checks expected dimensions and meaningful transparency when requested;
6. calculates final-to-first pixel, channel, alpha and centroid metrics;
7. writes create-only review evidence and optional visual previews into a staging directory;
8. revalidates every source identity after processing;
9. atomically publishes the completed evidence directory.

No source file is renamed, edited, deleted, replaced or promoted by this operation.

## Exact identical endpoints are valid

Exact identical endpoints are valid for a deliberate closed loop. A sequence may intentionally return to the same neutral pose on its final frame. The loop-closure gate records that equality and accepts it instead of treating it as an adjacent duplicate error.

This is different from ordinary adjacent-frame review, where repeated neighbouring frames can indicate wasted timing or a missing in-between. The seam policy is therefore maximum-only: a perfectly identical closure is allowed, while excessive discontinuity is blocked.

## Request contract

Create a request such as:

```json
{
  "schema": "evavo.project-art-loop-closure-request.v1",
  "reviewId": "eva-idle-natural-loop-v1",
  "projectId": "evavo-avatar-runtime",
  "purpose": "Prove the final-to-first seam of the reviewed natural idle clip.",
  "frames": [
    "assets/eva-female/idle-natural/0000.png",
    "assets/eva-female/idle-natural/0001.png",
    "assets/eva-female/idle-natural/0002.png",
    "assets/eva-female/idle-natural/0003.png"
  ],
  "expected": {
    "width": 1024,
    "height": 1024,
    "requireAlpha": true
  },
  "thresholds": {
    "maximumChangedFraction": 0.08,
    "maximumMeanChannelDelta": 18,
    "maximumAlphaChangedFraction": 0.03,
    "maximumCentroidShiftPixels": 8
  },
  "preview": {
    "difference": true,
    "overlay": true,
    "onionSkin": true
  }
}
```

A frame may also be expressed as an object with an owner-supplied expected hash:

```json
{
  "path": "assets/eva-female/idle-natural/0000.png",
  "expectedSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

The compiler rejects duplicate paths, single-frame requests, non-PNG masters, symbolic path components, hard-linked files, source changes during hashing, dimension drift, invalid expected hashes and false authority claims.

## Exact request-byte admission

The compiler does not trust an in-memory request object and a separate request byte stream as interchangeable inputs. It decodes the supplied request bytes as strict UTF-8 JSON, canonicalises that decoded document and compares it with the supplied request object before a plan may be emitted.

The plan’s `requestSha256` is therefore the SHA-256 of the exact admitted request bytes whose decoded meaning matches the compiled request. A module caller cannot supply one request object while recording the hash of another document. Valid JSON with different semantic content fails with:

```text
PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH
```

Invalid UTF-8 or invalid JSON fails before any plan is published. Formatting and JSON object-key order may differ because admission compares canonical semantic content, while the receipt still preserves the exact admitted byte hash.

## Compile the exact plan

```bash
pnpm run project-art:loop:compile -- \
  --workspace-root C:/GitRepos/evavo-avatar-runtime \
  --request C:/GitRepos/evavo-avatar-runtime/.evavo/eva-idle-loop-request.json \
  --output C:/GitRepos/evavo-avatar-runtime/.evavo/eva-idle-loop-plan.json
```

The plan uses `evavo.project-art-loop-closure-plan.v1`. It records the exact seam as:

```json
{
  "fromFrameIndex": 3,
  "toFrameIndex": 0,
  "identicalClosureAccepted": true
}
```

Compilation performs no image mutation and does not execute Pillow.

## Execute the bounded review

The output directory must not exist:

```bash
pnpm run project-art:loop:run -- \
  --workspace-root C:/GitRepos/evavo-avatar-runtime \
  --plan C:/GitRepos/evavo-avatar-runtime/.evavo/eva-idle-loop-plan.json \
  --output-root C:/GitRepos/evavo-avatar-runtime/.evavo/eva-idle-loop-review
```

The runtime publishes:

- `loop-closure.json` — canonical review status, source identities, metrics, thresholds and issues;
- `difference.png` — exact per-channel final-to-first difference evidence;
- `overlay.png` — a 50/50 final/first overlay;
- `onion-skin.png` — final-frame alpha in red and frame-zero alpha in cyan;
- `receipt.json` — processor identity, plan/review hashes, output hashes, source revalidation and authority state.

Preview files are optional in the request. Review and receipt JSON are always written.

## Continuity metrics

### `maximumChangedFraction`

The maximum proportion of pixels where any RGBA channel differs between the final frame and frame zero. This catches broad pose, camera, canvas, costume or background jumps.

### `maximumMeanChannelDelta`

The maximum mean absolute RGBA channel difference across the complete canvas. This catches widespread tonal or colour shifts even when individual pixel changes are moderate.

### `maximumAlphaChangedFraction`

The maximum proportion of pixels whose alpha value changes. This catches silhouette popping, edge halos, transparency loss and unexpected canvas occupancy changes.

### `maximumCentroidShiftPixels`

The maximum Euclidean movement of the alpha-weighted visual centroid. This catches whole-character drift, pivot changes and sudden body displacement.

A blocked review may contain these stable issue codes:

```text
loop-closure-excessive-frame-change
loop-closure-mean-channel-delta-exceeded
loop-closure-alpha-change-exceeded
loop-closure-centroid-shift-exceeded
```

The metrics are evidence, not universal creative values. Each animation family should set thresholds suitable for its canvas, scale and intended movement.

## Relationship to sequence review

Use both boundaries:

1. `sequence-review` checks every ordinary adjacent pair: `0→1`, `1→2`, `2→3`.
2. loop-closure review checks the runtime wrap: `3→0`.
3. creative review confirms identity, hands, face, costume, camera, expression and movement quality.
4. runtime review confirms timing, clip ownership, fallback behaviour and release integration.

Passing the seam gate does not imply that the middle frames are good. Passing the ordinary sequence review does not imply that the loop wraps cleanly. Both pieces of evidence are required for a convincing repeating animation.

## Mandatory checks

```bash
pnpm run project-art:loop:check
```

This runs the source guard and executable adversary. It proves that:

- an exact identical closure passes;
- an excessive final-to-first jump is blocked;
- request bytes cannot claim the identity of a different request object;
- difference, overlay and onion-skin outputs are produced atomically;
- source tampering after compilation fails before publication;
- single-frame requests, bad hashes, symlinks and false authority fail closed;
- no provider or repository mutation is introduced.

The loop-closure guard is also part of `pnpm run project-art:check`. Every loop compiler, runtime, test and operator-contract file is an explicit pull-request and `main`-push path trigger for the permanent Project Art workflow.

## Authority boundary

No creative approval is performed by this tool. A `passed` status means only that the exact measured seam remained inside the owner-selected numeric thresholds.

No source, provider, repository, Git, deployment or publication authority is connected. In particular, the tool cannot:

- generate or regenerate art;
- overwrite or delete frames;
- rename source files;
- approve or promote a candidate;
- write into another repository;
- commit, push or force push;
- upload to EVAVO Storage or Cloudinary;
- deploy or publish a runtime.

Those remain explicit, separately governed steps after the continuity evidence has been reviewed.
