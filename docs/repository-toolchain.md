# Art Studio repository toolchain

`EVAVO-STUDIO/evavo-art-studio` is a governed pnpm creative-production workspace. It contains reusable art contracts and processing packages, durable workers, CLI, MCP and API surfaces, a Next.js operator application, real media fixtures, Godot-oriented delivery support and artifact/evidence workflows.

## Exact authority

```text
Node.js: 22.14.0
pnpm:    10.13.1
Stack:   node-pnpm-creative-workspace
Roots:   apps/* and packages/*
```

The exact Node.js runtime is declared by `.nvmrc`, `package.json`, `evavo.reliability.json` and CI. The exact pnpm version is declared by `packageManager`, `engines.pnpm`, the repository-owned profile and CI.

## Lockfile state

No `pnpm-lock.yaml` is currently committed. That is recorded as a `review-first` transition rather than hidden.

The successful source baseline used:

```text
pnpm install --no-frozen-lockfile
pnpm check
```

GitHub Actions run `30544861146` completed both commands successfully at exact head `52b6f0707f52a8c04e707cb521456f342d881d62`.

That evidence proves the complete source validation chain at one dependency-resolution point. It does not prove a frozen dependency graph. A lockfile must be generated, reviewed, committed and validated in a separate change before CI may switch to frozen installation.

## Validation order

```text
repository toolchain guard
→ adversarial drift fixtures
→ review-first dependency installation
→ domain dependency build
→ workspace typecheck
→ workspace tests
→ every package and application build
```

The existing `pnpm check` chain remains the complete source gate. Toolchain validation is added before it and also runs at the beginning of the normal check command.

## Workflow safety

CI uses:

- read-only repository permissions;
- immutable full-SHA action references;
- checkout with persisted credentials disabled;
- exact Node.js and pnpm versions;
- dependency-free toolchain checks before installation; and
- no deployment or provider credential.

The workflow may compile provider jobs and validate real media, artifact, selection, repair, atlas, Godot and production-build contracts. It does not make live provider requests, promote artifacts, update named references, deploy production, mutate credentials or communicate externally.

## Future lockfile transition

A lockfile activation change must:

1. generate `pnpm-lock.yaml` from the exact reviewed workspace;
2. review all importers and resolved dependency changes;
3. run the complete `pnpm check` chain from a clean install;
4. update `evavo.reliability.json` and the repository-owned schema;
5. update the toolchain guard and adversarial fixtures;
6. replace `--no-frozen-lockfile` with frozen installation; and
7. retain exact-head hosted or approved local evidence.

The lockfile transition must not be bundled into unrelated art-domain, provider, promotion or deployment work.
