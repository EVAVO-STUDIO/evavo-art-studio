# Animation Source Bundle

## Purpose

Art Studio compiles a real set of approved local media into a deterministic, byte-verifiable handoff for Cel Animation Studio.

The bundle closes the gap between a valid animation brief and the exact files used downstream. It records every portable relative path, byte length, SHA-256 digest, frame slot, canvas property, timebase, continuity digest and approval attestation.

The shared contract is:

```text
contracts/animation-source-bundle-v1.schema.json
```

The canonical manifest implementation is:

```text
scripts/lib/animation-source-bundle.mjs
```

The stable local file-observation boundary is:

```text
scripts/lib/animation-source-stable-observation.mjs
```

The public CLI always uses the stable boundary rather than calling the lower-level compiler or verifier directly.

## Authority boundary

An Animation Source Bundle is source evidence. It does not grant provider, render, publication or repository authority.

The manifest always carries these fixed restrictions:

```json
{
  "candidateOnly": true,
  "providerExecution": false,
  "renderExecution": false,
  "xSheetAuthority": "cel-animation-studio",
  "publication": false,
  "repositoryMutation": false
}
```

Cel Animation Studio still owns X-sheet timing, exposure choices, drawing roles, render approval and final promotion.

## Stable source observation

A path check alone is not enough for production evidence because another process can replace or modify a file between checking it and reading it. Art Studio therefore observes every source before and after compile or verify work.

For each asset, the stable boundary:

1. validates the portable relative path;
2. resolves it beneath the real source root;
3. rejects a symlinked source file;
4. records filesystem identity and timestamps;
5. opens the file once;
6. reads SHA-256 bytes and image geometry through that one opened file handle;
7. rechecks the opened handle after reading;
8. closes the handle and proves the original path still names the same file identity;
9. repeats the complete observation after delegated compilation or verification;
10. rejects any changed bytes, geometry, path identity, file identity or source-set membership.

The delegated compiler and verifier results are also compared with the stable observation. A temporary swap followed by restoration cannot silently produce a bundle or receipt for different bytes.

This protection does not duplicate source media. It reads source files in bounded chunks and stores only compact evidence. That keeps it suitable for the governed Windows workstation and EVAVO Storage without creating a second copy of every art file on `C:`.

## Supported image evidence

Image declarations fail closed. The stable boundary independently checks dimensions and signatures for:

- PNG through its signature and IHDR;
- JPEG through a valid start marker and SOF frame header;
- GIF through its version signature and logical screen descriptor;
- WebP through RIFF/WEBP and VP8, VP8L or VP8X canvas metadata.

PNG, JPEG, GIF and WebP are the supported image media types for this handoff. Other `image/*` declarations are rejected instead of trusting unverified dimensions. Non-image media remains byte-length and SHA-256 bound.

When compiling a supported non-PNG image, Art Studio supplies the measured dimensions to the canonical compiler. The request does not need to duplicate dimensions that can be read from the source bytes.

## Compile a bundle

Create a request JSON that identifies the project and source files without supplying byte lengths or content digests. Art Studio measures those values from disk.

```json
{
  "bundleId": "hero-walk-right-source-v1",
  "createdAt": "2026-08-28T00:00:00.000Z",
  "producer": {
    "version": "0.1.0",
    "sourceRevision": "0123456789abcdef0123456789abcdef01234567"
  },
  "project": {
    "projectId": "game-project",
    "sceneId": "scene-001",
    "shotId": "shot-010"
  },
  "timeline": {
    "framesPerSecond": {
      "numerator": 24,
      "denominator": 1
    },
    "startFrame": 1,
    "endFrame": 2,
    "frameCount": 2,
    "cadence": "twos",
    "loopMode": "seamless"
  },
  "canvas": {
    "width": 1920,
    "height": 1080,
    "pixelAspectRatio": {
      "numerator": 1,
      "denominator": 1
    },
    "colourSpace": "sRGB",
    "alphaMode": "straight"
  },
  "creativeIntentSha256": "sha256:<64 lowercase hex>",
  "continuitySha256": "sha256:<64 lowercase hex>",
  "assets": [
    {
      "assetId": "hero-key-0001",
      "role": "key-pose",
      "relativePath": "frames/hero-key-0001.png",
      "mediaType": "image/png",
      "frameNumber": 1,
      "layerId": "hero",
      "sourceArtifactId": "artifact_<64 lowercase hex>"
    }
  ],
  "creativeApprovalIncluded": true,
  "approval": {
    "state": "approved",
    "approvedBy": "animation-director",
    "approvedAt": "2026-08-28T00:05:00.000Z",
    "decisionReason": "Approved source drawings for governed cel production."
  }
}
```

Run:

```powershell
node scripts/animation-source-bundle.mjs compile `
  .\workfiles\animation-source-request.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-bundle.json
```

Compilation:

1. performs a stable pre-operation observation;
2. measures exact bytes and supported image geometry;
3. compiles the canonical manifest;
4. performs a stable post-operation observation;
5. proves the compiler used the same source evidence;
6. sorts assets into canonical frame order;
7. binds approval to the exact bundle digest;
8. writes the manifest through a temporary sibling followed by atomic rename.

Control bounded local parallelism when working with slower storage:

```powershell
node scripts/animation-source-bundle.mjs compile `
  .\workfiles\animation-source-request.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-bundle.json `
  --concurrency 2
```

Concurrency is bounded from 1 to 16. The default is 4.

## Verify a bundle

Art Studio independently verifies its emitted bundle before handoff:

```powershell
node scripts/animation-source-bundle.mjs verify `
  .\artifacts\animation-source-bundle.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-verification.json
```

Verification performs the same before-and-after observation and proves that both the immutable bundle and the delegated receipt describe the observed bytes. The receipt remains candidate-only and does not approve downstream work.

Inspect the machine-readable local capability manifest with:

```powershell
node scripts/animation-source-bundle.mjs manifest
```

## Library cancellation and progress

The stable library accepts an `AbortSignal`, an async `onProgress` callback and an async `onPhase` callback. These hooks allow a local worker, MCP boundary or desktop interface to cancel long reads and report progress without adding network or hosted-job dependencies.

```js
const bundle = await compileAnimationSourceBundleStable(request, sourceRoot, {
  concurrency: 4,
  chunkBytes: 1024 * 1024,
  signal: controller.signal,
  onProgress: ({ relativePath, bytesRead, totalBytes }) => {
    console.log(relativePath, bytesRead, totalBytes);
  },
});
```

Read chunks are bounded from 64 KiB to 8 MiB. The default is 1 MiB.

## Path policy

Manifest paths use forward-slash relative paths only. The runtime rejects:

- absolute paths;
- drive-letter and UNC paths;
- backslashes;
- empty, `.` or `..` segments;
- duplicate separators;
- control characters;
- non-NFC text;
- Windows device aliases;
- trailing spaces or dots;
- symlink and realpath escapes;
- replacement of a checked path;
- duplicate asset IDs or normalized paths.

## Approval integrity

`bundleDigest` identifies the immutable source body. Approval is a separate attestation with its own `approvalDigest`.

An approved attestation must name the same `bundleDigest`. Changing the timeline, asset metadata, continuity identity or source digest invalidates the approval instead of silently carrying it forward.

Stable observation does not create, broaden or infer approval. It only proves which bytes were observed.

## Local-first operation

The source-bundle path requires no GitHub Actions, scheduled workflows, Vercel functions, hosted queues or cloud workers. Compilation, verification, image probing, digest calculation and tests run on the local workstation.

The implementation has no provider-execution, render, deployment, publication, Git mutation or force-push authority.

## Local validation

```powershell
node scripts/check-animation-source-bundle.mjs
node --test scripts/test-ci-media-tool-animation-source-bundle.mjs
node --test scripts/test-ci-media-tool-animation-source-stable-observation.mjs
```

The broader local media contract includes both suites automatically:

```powershell
pnpm ci:media-tools:test
```

These checks validate the schema fingerprint, canonical fixture, runtime boundaries, stable file identity, source replacement rejection, common image probes, cancellation and regression behavior without GitHub Actions, Vercel or an external provider.
