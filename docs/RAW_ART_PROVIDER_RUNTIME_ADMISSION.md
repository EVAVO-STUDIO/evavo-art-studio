# RAW_ART durable runtime admission

This boundary moves deliberately selected, already compiled RAW_ART provider jobs into the Art Studio durable runtime repository. It is a write-enabled admission step, but it is **not** provider execution, worker startup, delivery publication, candidate approval, artifact promotion, target-repository mutation, or game publication.

## Trust sequence

1. Compile the governed campaign-v3 provider request batch.
2. Compile the canonical provider runtime batch.
3. Create an exact, self-hashed selection document for specific ready work orders.
4. Admit that selection into a local durable runtime repository and write a create-only admission receipt.
5. Compile an exact, expiring provider-execution authorisation for the isolated admitted jobs.
6. Run the dedicated authorised RAW_ART provider worker only against the queues named by that authorisation.
7. Inspect immutable provider evidence and unapproved candidate artifacts.
8. Master, evaluate, approve, bind, and publish through their independent governed boundaries.

The selection and admission steps never call a provider adapter. They do not import the runtime worker or pg-boss delivery adapter. Admission only calls `LocalRuntimeRepository.submitBatch(...)`, whose transaction and idempotency rules remain authoritative.

## Build the domain packages

```powershell
Set-Location C:\GitRepos\evavo-art-studio
pnpm install --frozen-lockfile
pnpm run build:domain
```

## Compile an explicit selection

The selection command requires exact work-order IDs from `jobs[]` in the compiled runtime batch. It refuses blocked, deferred, missing, duplicated, stale, or modified jobs.

```powershell
pnpm run raw-art:provider-select -- `
  --runtime-batch C:\EVAVO\staging\raw-art-provider-runtime-batch.json `
  --work-orders raw-art-provider-london-docks,raw-art-provider-liverpool-docks `
  --selected-at 2026-08-09T00:00:00.000Z `
  --selected-by greg `
  --reason "Admit this exact reviewed campaign batch for durable provider execution." `
  --output C:\EVAVO\staging\raw-art-provider-runtime-selection.json
```

The resulting `evavo.raw-art-provider-runtime-admission-selection.v1` document binds:

- the runtime-batch file bytes, document SHA-256, and run ID;
- every selected work-order ID;
- the campaign item and provider request identity;
- the canonical provider contract SHA-256;
- the exact runtime job SHA-256;
- the selector, reason, and canonical UTC selection time;
- a false effect-authority record.

The selection expresses admission intent, but it performs no write to the durable runtime.

## Admit the exact selection

Use a runtime root outside the game repository and a create-only receipt path:

```powershell
pnpm run raw-art:provider-admit -- `
  --runtime-batch C:\EVAVO\staging\raw-art-provider-runtime-batch.json `
  --selection C:\EVAVO\staging\raw-art-provider-runtime-selection.json `
  --runtime-root C:\EVAVO\runtime\art-studio `
  --actor raw-art-admission-agent `
  --admitted-at 2026-08-09T00:01:00.000Z `
  --receipt C:\EVAVO\staging\raw-art-provider-runtime-admission-receipt.json
```

Admission revalidates the complete runtime batch and the complete selection before creating the runtime root. It recompiles every provider contract, rechecks campaign and metadata bindings, recalculates every contract and runtime-job hash, normalizes every runtime submission, and then performs one atomic `submitBatch` transaction.

Every admitted RAW_ART provider job is transformed into a deterministic isolated execution submission. It uses the selection-specific `raw-art.provider.<selection-run-id>` queue, requires the `raw-art.execution-authorized` worker capability, and has an immutable maximum of one provider attempt. A normal credentialed worker listening to the generic `provider` queue cannot claim it.

The runtime’s canonical queue-plus-idempotency identity prevents duplicates. An exact replay returns the same durable jobs and can produce the same receipt when the same canonical admission time and paths are supplied. A reused idempotency key with different job bytes fails the entire selected batch without a partial admission.

## Receipt guarantees

The create-only `evavo.raw-art-provider-runtime-admission-receipt.v2` receipt records:

- exact runtime-batch and selection file identities;
- runtime and provider protocol versions;
- the runtime-root path and its SHA-256 identity;
- the actor and canonical admission time;
- campaign, technical-admission, style-bank, and artifact-binding identities;
- each canonical provider-job SHA-256 and its separately hashed isolated admitted submission;
- each immutable runtime job ID, normalized specification SHA-256, provider request identity, isolated queue, execution capability, one-attempt policy, and creation timestamp;
- an admission self-hash and run ID.

Its authority record is intentionally narrow:

- `durableRuntimeAdmission: true`
- `runtimeSubmission: true`
- `providerExecution: false`
- `workerClaim: false`
- `deliveryPublication: false`
- `candidateApproval: false`
- `candidatePromotion: false`
- `targetRepositoryMutation: false`
- `publication: false`

## Failure and recovery

Input validation happens before runtime-root creation. Stale selections, re-fingerprinted forged contracts, mismatched job hashes, malformed timestamps, duplicate selections, and invalid authority records fail without durable effects.

The durable submission is idempotent. If the process stops after repository admission but before receipt publication, rerun the same command with the same batch, selection, actor, admission timestamp, runtime root, and a new create-only receipt path. The repository will return the exact existing jobs rather than create duplicates.

Do not start `dev:worker`, `worker:once`, `worker:until-idle`, or any pg-boss delivery process as part of admission. Those generic worker paths intentionally lack the dedicated RAW_ART execution capability. Use the separate authorisation and dedicated execution command documented in `RAW_ART_PROVIDER_RUNTIME_EXECUTION.md`.

## Validation

```powershell
pnpm run raw-art:provider-admission:check
pnpm check
```

The permanent regression suite covers deterministic selection and receipts, exact revalidation, idempotent replay, create-only receipt publication, stale and forged inputs, atomic rollback on idempotency conflict, and the absence of worker, provider, promotion, and publication authority.
