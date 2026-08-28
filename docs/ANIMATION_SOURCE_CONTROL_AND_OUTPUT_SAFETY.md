# Animation Source Control and Output Safety

## Purpose

Animation Source Bundle compilation and verification operate on two different trust boundaries:

1. control documents such as compile requests and bundle manifests;
2. generated JSON such as manifests and verification receipts.

Both boundaries are local-first. They do not require GitHub Actions, Vercel, a hosted worker, or an external provider.

## Stable control-document reads

The CLI no longer treats a request or manifest as ordinary unbounded text. It reads the document through:

```text
scripts/lib/animation-source-control-document.mjs
```

The reader requires:

- an ordinary file with ordinary path components;
- no symbolic-link component;
- a single filesystem link for the document;
- a bounded byte length;
- two identical reads from the same open file handle;
- unchanged device, inode, mode, link count, size, modification time and change time;
- strict UTF-8;
- no embedded NUL byte;
- valid JSON.

The default limit is 8 MiB. The hard maximum is 64 MiB.

```powershell
node scripts/animation-source-bundle.mjs compile `
  .\workfiles\animation-source-request.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-bundle.json `
  --max-control-bytes 8388608
```

A UTF-8 byte-order mark is accepted and recorded in the observation evidence. Invalid or changing documents fail before media inspection and before output creation.

## Collision-safe JSON output

Generated JSON is written through:

```text
scripts/lib/animation-source-output.mjs
```

Output is create-only by default. An existing destination is preserved and the command fails.

```powershell
node scripts/animation-source-bundle.mjs verify `
  .\artifacts\animation-source-bundle.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-verification.json
```

Replacement must be explicit:

```powershell
node scripts/animation-source-bundle.mjs verify `
  .\artifacts\animation-source-bundle.json `
  --root .\workfiles\animation-source `
  --output .\artifacts\animation-source-verification.json `
  --replace-output
```

The writer:

- resolves and pins the ordinary parent-directory identity before writing;
- rechecks that parent identity before and after publication;
- rejects symbolic-link parents and destinations;
- rejects hard-linked destinations;
- refuses to target the request, manifest, or any declared source asset;
- serializes through an exclusive sibling lock;
- writes and synchronizes a private sibling temporary file;
- publishes a new file without overwriting an existing path;
- uses atomic rename only for an explicitly requested replacement;
- never performs delete-first replacement;
- opens the published destination without following links where supported;
- verifies the published handle and path retain one identity;
- verifies the published bytes and length;
- removes temporary and lock files only when their filesystem identity still matches the writer's own file.

The default generated JSON limit is 32 MiB. The hard maximum is 128 MiB.

```powershell
--max-output-bytes 33554432
```

## Evidence

A successful compile summary includes:

- `controlDocumentEvidence`;
- `outputEvidence`;
- the source bundle digest;
- the approval state;
- the exact asset count.

A successful verify command with `--output` prints the same control and output evidence while storing the verification receipt at the requested path.

The control observation records the full path, byte length, SHA-256 digest, BOM state, stable double-read result, ordinary-file result, and single-link result.

The output receipt records the full path, byte length, SHA-256 digest, whether a previous destination was replaced, whether the operation was create-only, and whether atomic publication was used.

## Authority boundary

These controls do not grant:

- image-provider execution;
- render execution;
- publication;
- repository mutation;
- deployment;
- GitHub Actions execution;
- Vercel execution.

They only prove that the local control document and emitted JSON were handled through the governed filesystem boundary.

## Local verification

```powershell
node --check scripts/lib/animation-source-control-document.mjs
node --check scripts/lib/animation-source-output.mjs
node --check scripts/animation-source-bundle.mjs
node --test scripts/test-ci-media-tool-animation-source-control-boundary.mjs
node scripts/check-animation-source-bundle.mjs
pnpm run animation-source:check
```
