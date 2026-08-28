# Root Validation Coverage

Art Studio's authoritative repository gate is the local `pnpm check` command. The root validation coverage contract verifies that the gate cannot silently lose a named root `*:check` script or a `test-ci-media-tool-*` regression.

The executable inventory is:

```text
scripts/lib/root-validation-coverage.mjs
```

The regression is automatically included by the existing media-tool test glob:

```text
scripts/test-ci-media-tool-root-validation-coverage.mjs
```

## What is enforced

The compiler expands root package scripts recursively from `check`, preserving shell command boundaries and refusing script cycles. A root check is accepted when it is directly reachable or when every leaf command is already subsumed by the reachable graph. Package-filtered `build`, `test`, and `typecheck` commands are also recognised as covered when the corresponding recursive root lifecycle is reachable.

Every `scripts/test-ci-media-tool-*` regression must be matched by the root check graph. This prevents a regression from looking present in the repository while never running in the authoritative local gate.

## What is inventoried

Other `check-*`, `check_*`, `test-*`, `test_*`, `.test.*`, and `.spec.*` files are classified as:

- `root-check`: reachable from `pnpm check`;
- `script-only`: exposed through another root package command but not the complete gate;
- `unreferenced`: not exposed through a root package command.

Those categories remain visible in the report without automatically turning every operator utility, migration helper, smoke command, or expensive production tool into a mandatory gate. A later review can deliberately promote a useful script rather than relying on filename guesses.

## Authority

The audit reads repository files and package scripts only. It does not execute providers, renders, deployments, GitHub Actions, Vercel, or repository mutation.

## Local verification

```powershell
node --check scripts/lib/root-validation-coverage.mjs
node --test scripts/test-ci-media-tool-root-validation-coverage.mjs
pnpm run ci:media-tools:test
pnpm check
```

The governed Windows workstation remains authoritative before `main` is updated.
