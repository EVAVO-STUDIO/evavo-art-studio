# Animation Source Control and Output Safety

## Purpose

Animation Source Bundle compilation and verification operate on separate local trust boundaries:

1. control documents such as compile requests and bundle manifests;
2. exact source-media observations;
3. generated JSON such as manifests and verification receipts;
4. repository code that could attempt to regain the retired compatibility helpers.

These boundaries are local-first. They do not require GitHub Actions, Vercel, a hosted worker, or an external provider.

## Stable control-document reads

The CLI reads request and manifest documents through:

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

- rejects symbolic-link parents and destinations;
- rejects hard-linked destinations;
- refuses to target the request, manifest, or any declared source asset;
- pins parent-directory realpath and filesystem identity across the operation;
- serializes cooperating writers through an exclusive sibling lock;
- writes and synchronizes a private sibling temporary file;
- publishes a new file without overwriting an existing path;
- uses atomic rename only for an explicitly requested replacement;
- never performs delete-first replacement;
- opens the published path without following links where supported;
- binds the published path and opened handle to one filesystem identity;
- verifies the published bytes and length before and after observation;
- removes temporary and lock files only when their filesystem identity still matches the writer's own file.

The default generated JSON limit is 32 MiB. The hard maximum is 128 MiB.

```powershell
--max-output-bytes 33554432
```

## Legacy compatibility confinement

The canonical bundle library still exposes `readJson` and `writeJsonAtomic` only for historical regression compatibility. New production code must not import, re-export, namespace-load, dynamically load, or otherwise regain those helpers.

The local scanner reads only Git-tracked code and covers Astro, JavaScript, JSX, MDX, Svelte, TypeScript, TSX and Vue files. It applies strict UTF-8, NFC and portable-path checks, rejects linked code files, and reads each tracked file twice through one stable open handle.

The syntax-aware resolver follows only safe immutable provenance:

- `const` declarations with an initializer;
- declarations visible in the same lexical scope or a parent scope;
- declarations that occur before the governed use;
- statically concatenated strings and templates;
- `new URL(...)`, `.href`, `String(...)`, `pathToFileURL(...)` and `fileURLToPath(...)` when their constructors or helpers are the recognised globals or Node imports;
- named and namespace imports of `createRequire` from `node:module` or `module`;
- immutable aliases of a recognised `createRequire` factory and the loader it returns;
- a direct CommonJS `require("node:module")` namespace.

Mutable bindings, function parameters, local shadows, declarations in their temporal dead zone, user-defined `URL`, user-defined `createRequire`, prose, comments, string examples and fenced MDX examples do not inherit authority from an unrelated outer declaration. Explicit test surfaces remain exempt, but a production file cannot evade the scan merely by beginning its basename with `test-`.

The scanner does not execute code, providers, package scripts, GitHub Actions or Vercel. It deterministically reports a violation and makes the local gate fail.

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

The legacy-usage report records tracked and scanned file counts, bounded bytes, violations, stable double-read evidence, portable-path collision evidence, and a fixed no-provider/no-hosted-automation authority block.

## Authority boundary

These controls do not grant:

- image-provider execution;
- render execution;
- publication;
- repository mutation;
- deployment;
- GitHub Actions execution;
- Vercel execution.

They only prove that local control documents, source media, emitted JSON, and repository helper access were handled through the governed boundaries.

## Local verification

```powershell
node --check scripts/lib/animation-source-control-document.mjs
node --check scripts/lib/animation-source-output.mjs
node --check scripts/lib/animation-source-legacy-access-v2.mjs
node --test scripts/test-ci-media-tool-animation-source-legacy-v2-*.mjs
node --test scripts/test-ci-media-tool-animation-source-*.mjs
node scripts/check-animation-source-bundle.mjs
pnpm run animation-source:check
pnpm check
```

The complete repository check remains authoritative on the governed Windows workstation before `main` is updated.
