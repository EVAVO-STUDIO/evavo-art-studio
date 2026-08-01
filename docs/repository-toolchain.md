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

`pnpm install --no-frozen-lockfile` creates an untracked working lockfile. The pre-install toolchain guard rejects any lockfile in the checked-out source. The installed-state guard accepts only this generated, untracked review-first file while the profile still declares `lockfilePresent: false`. The validation workflow deletes it after validation and requires a clean tracked and untracked source tree.

Neither installed-state validation nor a generated lockfile authorises committing it. A tracked lockfile still fails until the separately reviewed transition updates the profile, schema, guard, workflow and evidence.

## Automatic exact-main operating model

Art Studio validates every push to `main`. It does not allocate hosted runners for pull requests, work branches, schedules, workflow chains or repository dispatches.

```text
develop and validate locally
→ commit the coherent change
→ merge or push it to main
→ automatically validate the exact triggered main SHA
→ cancel any superseded older mainline run
→ re-prove the candidate is still origin/main after the full check
→ retain a bounded exact-SHA receipt
→ perform provider execution, promotion or deployment through separate authority
```

The same workflow remains available for a deliberate manual replay. A manual dispatch must use:

```text
request_source = evavo-development-studio
expected_sha   = the exact dispatched current main SHA
runner         = ubuntu-24.04
```

Automatic pushes use the fixed internal source `github-main-push`. Both trigger paths require `refs/heads/main`, bind the expected SHA to `GITHUB_SHA`, use the same read-only job, and reject any other event or dispatcher identity.

## Validation order

```text
governed main trigger and exact-SHA proof
→ exact current origin/main proof
→ strict pre-install repository toolchain guard
→ adversarial drift fixtures
→ review-first dependency installation
→ installed-state toolchain guard
→ adversarial drift fixtures
→ domain dependency build
→ workspace typecheck
→ workspace tests
→ every package and application build
→ generated-lockfile removal
→ clean-source verification
→ refresh origin/main and reject a superseded candidate
→ bounded validation receipt
```

The existing Art Studio domain, typecheck, test and build chain remains the complete source gate. Strict toolchain validation runs before installation. The normal `pnpm check` command uses installed-state validation so the generated untracked lockfile can exist only for the duration of the validated install.

## Workflow safety

The exact-main workflow uses:

- automatic `main` push validation plus guarded manual exact-SHA replay;
- one fixed mainline concurrency group with superseded-run cancellation;
- read-only repository permissions;
- immutable full-SHA action references;
- checkout with persisted credentials disabled;
- full history and an exact `origin/main` equality check;
- exact Node.js and pnpm versions;
- dependency-free toolchain checks before installation;
- generated-lockfile removal and clean-source proof after validation;
- a second `origin/main` equality check immediately before receipt creation;
- fourteen-day bounded receipt retention; and
- no secret, provider, promotion, publication, release or deployment authority.

The repository-owned guard rejects non-main push scope, pull requests, schedules, workflow chains, repository dispatch, floating action tags, latest runners, write permissions, secrets, forceful installation, publication, release and deployment commands. Its adversarial fixtures prove that trigger, branch scope, dispatcher, action, cancellation, current-main proof, lockfile and capability drift fail closed.

The workflow may compile provider jobs and validate real media, artifact, selection, repair, atlas, Godot and production-build contracts. It does not make live provider requests, promote artifacts, update named references, deploy production, mutate credentials or communicate externally.

## Bounded receipt

A successful run retains one receipt containing:

```text
repository
candidate SHA
trigger event
request source
currentMainAtReceipt = true
Node.js and pnpm versions
review-first lockfile policy
installedWithoutCommittedLockfile = true
validation = passed
liveProviderRequest = false
artifactPromotion = false
deployment = disabled
```

A receipt is never written for a candidate that has been superseded before the final mainline proof. The receipt proves only the exact candidate and dependency resolution used by that run. It is not a frozen dependency graph and does not authorise a live provider or production action.

## Future lockfile transition

A lockfile activation change must:

1. generate `pnpm-lock.yaml` from the exact reviewed workspace;
2. review every importer and resolved dependency change;
3. run the complete `pnpm check` chain from a clean install;
4. update `evavo.reliability.json` and the repository-owned schema;
5. update the toolchain guard and adversarial fixtures;
6. replace `--no-frozen-lockfile` with frozen installation; and
7. retain exact-head hosted or approved local evidence.

The lockfile transition must not be bundled into unrelated art-domain, provider, promotion or deployment work.
