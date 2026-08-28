# Animation Source Bundle

## Purpose

Art Studio can now compile a real set of approved local media into a deterministic, byte-verifiable handoff for Cel Animation Studio.

The bundle closes the gap between a valid animation brief and the exact files used by the downstream production. It records every relative path, byte length, SHA-256 digest, frame slot, canvas property, timebase, continuity digest and approval attestation.

The contract is:

```text
contracts/animation-source-bundle-v1.schema.json
```

The executable implementation is:

```text
scripts/lib/animation-source-bundle.mjs
```

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

1. rejects unsafe or non-portable paths;
2. resolves every source under the declared root;
3. rejects symlinked files and realpath escapes;
4. streams SHA-256 instead of buffering whole media;
5. checks exact byte lengths;
6. probes PNG signatures and IHDR dimensions;
7. sorts assets into canonical frame order;
8. binds approval to the exact bundle digest;
9. writes the manifest through a temporary sibling followed by atomic rename.

## Verify a bundle

Art Studio can independently verify its own emitted bundle before handoff:

```powershell
node scripts/animation-source-bundle.mjs verify `
  .\artifacts\animation-source-bundle.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-verification.json
```

The verification receipt is deterministic for the same bundle and source bytes. It remains candidate-only and does not approve downstream work.

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
- duplicate asset IDs or normalized paths.

## Approval integrity

`bundleDigest` identifies the immutable source body. Approval is a separate attestation with its own `approvalDigest`.

An approved attestation must name the same `bundleDigest`. Changing the timeline, asset metadata, continuity identity or source digest invalidates the approval instead of silently carrying it forward.

## Local validation

```powershell
node scripts/check-animation-source-bundle.mjs
node --test scripts/test-ci-media-tool-animation-source-bundle.mjs
```

The check validates the schema fingerprint, canonical fixture, runtime boundaries and regression suite without GitHub Actions, Vercel or any external provider.
