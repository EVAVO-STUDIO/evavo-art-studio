# Local-first, zero-cost Art Studio operation

Art Studio treats the governed Windows workstation as the authoritative validation and production environment. GitHub stores source history and Vercel may publish a deliberately reviewed web surface, but neither hosted service is required to prove that a change is correct.

## Operating boundary

- Local validation is authoritative before a push to `main`.
- There are no active GitHub Actions workflow YAML files under `.github/workflows`.
- The former workflow definitions are preserved as inert reference material under `ops/github-actions-reference/workflows`; GitHub does not execute them from that location.
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

# Prove that hosted automation is inactive and archived safely
node scripts/check-github-workflow-contexts.mjs
```

Commands are spawned with argument arrays rather than a shell. Changed repository paths are normalised, traversal is rejected, Python bytecode is directed outside the checkout, and a failed command stops the gate.

## GitHub Actions policy

`.github/workflows` contains only a policy README. Any `.yml` or `.yaml` file in that active directory is a blocking policy violation. This makes ordinary pushes, pull requests, schedules and external events incapable of starting Art Studio Actions jobs.

The previous workflow definitions remain versioned beneath `ops/github-actions-reference/workflows` for historical review and portability. They are not current operating authority and they do not consume hosted execution from that location. Restoring one requires an explicit budget decision, a security review and an intentional policy change; copying YAML back into `.github/workflows` without that decision is rejected by the local gate.

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
