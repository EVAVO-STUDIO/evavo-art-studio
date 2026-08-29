# Animation Source Contract Lock

## Purpose

Art Studio and Cel Animation Studio carry separate copies of the Animation Source Bundle contract because their Node and pnpm toolchains are intentionally independent.

The contract lock prevents the producer and consumer from silently drifting at either the schema layer or the operational file-verification layer.

It pins the exact bytes of:

```text
contracts/animation-source-bundle-v1.schema.json
contracts/fixtures/animation-source-bundle-v1.json
scripts/lib/animation-source-bundle.mjs
scripts/lib/animation-source-file-observer.mjs
scripts/lib/animation-source-image-probes.mjs
scripts/lib/animation-source-observation-common.mjs
scripts/lib/animation-source-stable-observation.mjs
```

The lock is:

```text
contracts/animation-source-bundle-v1.lock.json
```

The current contract-set identity is:

```text
sha256:e8ea163a56364cf8fe40c61e9428f6861c891944f7e31f4ccb793f1a447b9314
```

## Why the runtime modules are locked

Matching JSON Schema bytes are not enough. The studios must also agree on how local media is observed and verified.

The operational lock now covers:

- portable path validation;
- real-root containment;
- leaf-symlink rejection;
- same-handle SHA-256 hashing and image probing;
- stable file-identity checks;
- before-and-after source-set observation;
- PNG, JPEG, GIF and WebP dimension probing;
- bounded concurrency and cancellation behaviour.

A change to any of those rules is therefore an explicit cross-studio compatibility revision rather than an unnoticed implementation difference.

## Local verification

Run from Art Studio:

```powershell
Set-Location "C:\GitRepos\evavo-art-studio"
node scripts/check-animation-source-contract-lock.mjs
```

The checker reconstructs Git blob identities directly from stable local reads. Each lock and contract file is rejected when it is a symlink, escapes the real repository root, changes during the read, or is replaced before verification completes.

The check does not use GitHub, a network service, Vercel, a provider or a writable automation bot.

## Cross-studio verification

When the repositories are siblings under `C:\GitRepos`, the checker automatically detects Cel Animation Studio and verifies both copies.

Require the peer explicitly when the parity result is release evidence:

```powershell
node scripts/check-animation-source-contract-lock.mjs --require-peer
```

An explicit location can also be supplied:

```powershell
node scripts/check-animation-source-contract-lock.mjs `
  --peer "C:\GitRepos\cel-animation-studio" `
  --require-peer
```

The environment equivalent is:

```powershell
$env:EVAVO_ANIMATION_SOURCE_PEER_ROOT = "C:\GitRepos\cel-animation-studio"
node scripts/check-animation-source-contract-lock.mjs --require-peer
```

## Failure behaviour

The command fails when:

- a locked local file changes without a reviewed lock revision;
- the schema digest differs from the executable runtime constant;
- a lock contains unknown fields, missing files or duplicate paths;
- the aggregate contract-set digest is wrong;
- a lock or locked file is a symlink;
- a locked file escapes the real repository root;
- a locked file changes while it is being read;
- a locked path is replaced before verification completes;
- a required peer repository is absent;
- the peer lock differs;
- any peer schema, fixture, canonical runtime or stable-verifier byte differs.

It never repairs, copies or rewrites either repository. A contract change must be made deliberately in both studios, validated in both toolchains and committed as an explicit compatibility revision.

## Automated coverage

Art Studio runs:

```text
scripts/test-ci-media-tool-animation-source-contract-lock.mjs
```

through the existing `scripts/test-ci-media-tool-*.mjs` validation lane. The regression creates a temporary peer repository, proves all seven locked files match, mutates the peer file observer, rejects symlink substitution and confirms that a required missing peer fails closed.
