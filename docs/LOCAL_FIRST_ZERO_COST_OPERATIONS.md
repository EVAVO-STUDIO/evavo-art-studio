# Local-first, zero-cost Art Studio operation

Art Studio treats the Windows workstation as the authoritative validation and production environment. GitHub stores source history and Vercel may publish a reviewed web surface, but neither hosted service is required to prove that a change is correct.

## Operating boundary

- Local validation is authoritative before a push to `main`.
- GitHub Actions are optional remote observations. A skipped or unavailable hosted workflow never blocks local work.
- Vercel is not a build farm, test runner, artifact store or background worker for Art Studio.
- Provider execution, media processing, durable jobs and repository writes remain on governed local infrastructure unless a task explicitly opts into another reviewed runtime.
- No local gate makes a provider call, deploys a site, promotes an artifact or mutates EVAVO Storage.

## One-time workstation setup

From the repository root, install the frozen dependencies once and then register the checkout-local hook:

```powershell
pnpm install --frozen-lockfile
node scripts/setup-local-hooks.mjs
node scripts/setup-local-hooks.mjs --check
```

This writes only the checkout-local `core.hooksPath=.githooks` setting. The committed hook is forced to LF line endings so Git for Windows can execute it reliably. It does not change global Git configuration. The pre-push hook consumes Git's exact ref update records. A push to `main` runs the complete local `pnpm check`; other pushes select bounded checks from the changed workspaces and files.

## Explicit local checks

```powershell
# Fast bounded smoke and regression gate
node scripts/local-quality-gate.mjs quick

# Inspect the changed-file plan without executing it
node scripts/local-quality-gate.mjs changed --plan

# Execute checks selected from the branch diff
node scripts/local-quality-gate.mjs changed

# Run the complete repository validation locally
node scripts/local-quality-gate.mjs full

# Validate workflow expression contexts without running Actions
node scripts/check-github-workflow-contexts.mjs
```

Commands are spawned with argument arrays rather than a shell. Changed repository paths are normalised, traversal is rejected, Python bytecode is directed outside the checkout, and a failed command stops the gate.

## GitHub Actions policy

Workflow files remain useful as portable documentation and an optional second environment. The three broad hosted mirrors (`ci.yml`, `game-art-workstations.yml` and `council-avatar-production.yml`) are manual-dispatch only: pushes and pull requests do not start them. The default operating model does not assume Actions capacity, artifacts, caches, secrets or availability.

The local workflow validator rejects automatic triggers on those broad mirrors and catches expressions that GitHub would reject before creating a job, including `runner.*` references in workflow-level or job-level `env` blocks. Narrow specialist workflows may remain as optional observations, but no local build, test, provider, mastering, review or publication path waits for them.

## Vercel policy

Art Studio currently has no linked Vercel project and requires none. If a control-plane deployment is linked later:

1. configure the Vercel project root as `apps/web`;
2. keep workspace package names and dependencies explicit so Vercel can skip unaffected monorepo projects;
3. prefer Vercel's unaffected-project skipping over an ignored-build command because ignored builds can still count as deployments and occupy build capacity;
4. deploy only the web control plane, never workers, provider execution, source assets or production artifacts;
5. keep preview deployments optional and production promotion explicit.

## Recovery

To temporarily remove the repository hook without changing global Git settings:

```powershell
node scripts/setup-local-hooks.mjs --disable
```

Reinstall it with the normal setup command. Do not bypass a failing gate by moving validation into a hosted workflow; fix the failing local contract or deliberately narrow the affected check with reviewed evidence.
