# Council identity anchor Runtime package V4.8

V4.8 atomically materializes the eight exact V4.7 Runtime adapters for Veyra and Moro Pell as separate create-only JSON files.

It is a packaging and integrity stage only. It performs no provider call, consumes no authorization, reserves no Runtime job, creates no image candidate, approves no identity, publishes no media and activates neither Avatar Runtime nor the website.

## Input contract

V4.8 accepts one exact validated V4.7 bundle containing:

```text
8 provider admissions
8 active one-shot provider authorizations
8 distinct canonical Runtime adapters
0 Runtime reservations
0 provider executions
0 approvals
```

The adapters cover only the phase-one anchor jobs:

```text
Veyra      candidate-set-01 full-body-right
Veyra      candidate-set-02 full-body-right
Veyra      candidate-set-03 full-body-right
Veyra      candidate-set-04 full-body-right
Moro Pell  candidate-set-01 full-body-right
Moro Pell  candidate-set-02 full-body-right
Moro Pell  candidate-set-03 full-body-right
Moro Pell  candidate-set-04 full-body-right
```

The sixteen dependent `full-body-left` and `neutral-bust` jobs remain blocked.

## Package layout

A successful V4.8 package has exactly two root entries:

```text
package-manifest.json
adapters/
```

The adapter directory contains exactly eight files:

```text
01-council-critic-candidate-set-01-full-body-right.runtime-adapter.json
02-council-critic-candidate-set-02-full-body-right.runtime-adapter.json
03-council-critic-candidate-set-03-full-body-right.runtime-adapter.json
04-council-critic-candidate-set-04-full-body-right.runtime-adapter.json
05-council-open-reviewer-candidate-set-01-full-body-right.runtime-adapter.json
06-council-open-reviewer-candidate-set-02-full-body-right.runtime-adapter.json
07-council-open-reviewer-candidate-set-03-full-body-right.runtime-adapter.json
08-council-open-reviewer-candidate-set-04-full-body-right.runtime-adapter.json
```

No extra file, directory, symlink, hardlink or substituted path is admitted.

## Atomic create-only publication

The final package root must:

- be an absolute canonical path;
- not already exist;
- have a real, non-symlink parent directory;
- sit outside the Art Studio Git repository;
- remain on the same filesystem as its staging directory.

V4.8 writes into a deterministic sibling staging directory, validates the complete staged package and then publishes it with one same-filesystem rename. If any write or validation fails, the staging directory is removed and the final package root remains absent.

Existing output is never overwritten and implicit resume is forbidden.

## Adapter-file integrity

Each adapter file is bound to:

- the exact V4.7 adapter-entry SHA-256;
- the exact canonical adapter SHA-256;
- the exact admission-entry SHA-256;
- the exact authorization-entry SHA-256;
- the exact provider-admission SHA-256;
- the exact provider-authorization SHA-256;
- the exact character, candidate set, continuity key and full-body-right job;
- its relative package path;
- its exact file SHA-256;
- its exact byte length;
- a self-hashed package entry.

Validation reads every adapter as a stable ordinary file, verifies path containment, file identity, SHA-256 and byte length, parses it through the canonical character-identity Runtime-adapter parser and compares its exact canonical JSON content to the embedded V4.7 adapter.

Changing whitespace changes the file SHA-256 and fails validation. Replacing one adapter with another also fails because the manifest, V4.7 source entry and parsed adapter identity must all agree.

## Strict manifest validation

The public CLI routes package creation and validation through a strict wrapper that checks exact nested schemas, not merely the top-level self-hash.

It requires exact keys and values for:

- source adapter summary;
- package layout;
- authorization window;
- counts;
- all eight package entries;
- execution boundary;
- global anchor barrier;
- denied authority.

Re-signing a manifest after adding a hidden execution flag, changing an execution count, weakening fallback policy, altering root-shape claims or inserting an unexpected package-entry field remains invalid.

## Authorization window

Packaging must occur while the source V4.6 authorization window remains active:

```text
packagedAt >= occurredAt
packagedAt < expiresAt
```

Packaging does not consume the authorization. The provider executor must revalidate authorization activity immediately before execution.

## CLI

Inspect the deterministic plan:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-package.mjs summary
node scripts/compile-project-art-council-identity-anchor-runtime-package.mjs capabilities
```

Materialize an atomic package outside the repository:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-package.mjs materialize \
  --adapter-bundle /trusted/v4.7-anchor-runtime-adapter-bundle.json \
  --packaged-at <iso-8601-inside-authorization-window> \
  --package-root /trusted/create-only/v4.8-anchor-runtime-package
```

Validate an existing package:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-package.mjs validate \
  --package-root /trusted/v4.8-anchor-runtime-package
```

The CLI exposes no provider-execution command.

## MCP

The dedicated read-only server is:

```bash
node tools/project_art_council_identity_anchor_runtime_package_mcp.mjs
```

It exposes only:

- `evavo_art_council_identity_anchor_runtime_package_capabilities`
- `evavo_art_council_identity_anchor_runtime_package_plan`

The unified Council MCP exposes the same contracts and retains server version `1.1.0`.

Neither server accepts a V4.7 bundle, writes package files, validates an external package, reserves Runtime work or executes providers.

## Validation

Focused checks:

```bash
node --check scripts/project-art/council-identity-anchor-runtime-package.mjs
node --check scripts/project-art/council-identity-anchor-runtime-package-strict.mjs
node --check scripts/compile-project-art-council-identity-anchor-runtime-package.mjs
node --check tools/project_art_council_identity_anchor_runtime_package_mcp.mjs
node --test \
  scripts/test-project-art-council-identity-anchor-runtime-package.mjs \
  scripts/test-project-art-council-identity-anchor-runtime-package-mcp.mjs
```

The tests cover:

- exact eight-file package layout;
- atomic staging and create-only publication;
- inactive authorization rejection before output creation;
- existing-output rejection without mutation;
- adapter byte tampering;
- missing and unexpected files;
- re-signed nested execution, count and layout drift;
- hidden nested schema injection;
- strict CLI round trips;
- MCP read-only parity;
- rejection of materialization, validation, preflight and execution-shaped MCP tools.

The established `test-ci-media-tool-*` suite also executes the complete V4.8 proof during normal Art Studio validation.

## Next gate

V4.9 should be an execution preflight only. It must verify the exact V4.8 package, current authorization activity, adapter-file SHA-256 values, provider adapter/model availability, safe separate Runtime and artifact roots, and execution-time credential presence without exposing the secret or invoking the provider.
