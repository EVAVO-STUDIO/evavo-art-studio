# Workspace Package Surfaces

Art Studio packages must expose portable, built entry points. A package must not point consumers directly at mutable TypeScript source, escape its package directory, or advertise a `dist` target without a real local build lifecycle.

The executable audit is:

```text
scripts/lib/workspace-package-surface.mjs
```

## Governed metadata

The audit inspects each workspace package's:

- `main`;
- `module`;
- `types` and `typings`;
- `exports` conditions and subpaths;
- `build`, `typecheck`, and `test` lifecycle commands.

Every file target must:

- be a relative `./` package target;
- use portable forward slashes;
- avoid control characters, `.` segments, and `..` traversal;
- avoid direct `./src` exports;
- have a real local `build` lifecycle when it targets `./dist`;
- use a declaration-file suffix for a `types` condition or field.

Lifecycle commands may not invoke Vercel, GitHub workflow execution, hosted tokens, or `workflow_dispatch`.

## Local-first authority

The surface audit reads package metadata only. It does not build, publish, deploy, call a provider, mutate a repository, invoke GitHub Actions, or use Vercel.

The workspace lifecycle coverage contract separately proves that TypeScript and test-bearing packages expose the necessary scripts. This surface contract proves that their consumer-facing targets remain portable and build-backed.

## Local verification

```powershell
node --check scripts/lib/workspace-package-surface.mjs
node --test scripts/test-ci-media-tool-workspace-package-surface.mjs
node --test scripts/test-ci-media-tool-workspace-package-surface-docs.mjs
pnpm run ci:media-tools:test
pnpm check
```

The governed Windows workstation remains authoritative before `main` is updated.
