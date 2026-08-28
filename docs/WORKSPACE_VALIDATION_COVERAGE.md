# Workspace Validation Coverage

Art Studio uses recursive `pnpm` lifecycle commands, but `--if-present` must not silently hide a TypeScript workspace that forgot to expose its real validation scripts.

The executable audit is:

```text
scripts/lib/workspace-validation-coverage.mjs
```

It reads `pnpm-workspace.yaml`, expands the declared workspace patterns, and inspects each tracked workspace package locally.

## Required lifecycle contracts

A workspace with TypeScript source under `src/` and a `tsconfig.json` must expose:

- `build`;
- `typecheck`.

A workspace containing a `test`, `tests`, or `__tests__` directory, or a `.test.*` or `.spec.*` file, must expose:

- `test`.

An exposed lifecycle cannot be an empty command or a pass-through placeholder such as `echo TODO`, `exit 0`, or `true`.

## Hosted boundary

Workspace `build`, `typecheck`, and `test` lifecycles may not invoke:

- Vercel;
- GitHub workflow execution;
- `workflow_dispatch`;
- `GITHUB_TOKEN`;
- `VERCEL_TOKEN`.

The audit itself only reads workspace metadata and files. It does not run providers, renders, deployments, repository mutation, GitHub Actions, or Vercel.

## Why this complements the root graph

The root validation coverage contract proves that `pnpm check` reaches the recursive `build`, `typecheck`, and `test` lifecycles. This workspace contract proves that a package which genuinely needs one of those lifecycles has actually declared it. Together they prevent `--if-present` from becoming a silent skip.

## Local verification

```powershell
node --check scripts/lib/workspace-validation-coverage.mjs
node --test scripts/test-ci-media-tool-workspace-validation-coverage.mjs
node --test scripts/test-ci-media-tool-workspace-validation-docs.mjs
pnpm run ci:media-tools:test
pnpm check
```

The complete gate remains local-first, and the governed Windows workstation remains authoritative before `main` is updated.
