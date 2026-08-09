# RAW_ART provider execution authorisation

This boundary permits exact, already admitted RAW_ART provider jobs to make provider calls. It is deliberately separate from request compilation, selection, durable admission, candidate review, mastering, approval, promotion, target-repository mutation, and publication.

A configured API key is not sufficient authority. Admitted RAW_ART jobs use an isolated queue and require `raw-art.execution-authorized`, which the generic Art Studio worker does not advertise. The dedicated execution command will not start until it validates an active self-hashed authorisation against the exact runtime batch, selection, admission receipt, durable runtime state, adapter allowlist, runtime root, and artifact root.

## Authority sequence

1. Compile the campaign-v3 provider request batch.
2. Compile the canonical provider runtime batch.
3. Select exact ready work orders.
4. Admit them into the durable runtime and retain the v2 admission receipt.
5. Compile a short-lived execution authorisation.
6. Run the dedicated authorised worker.
7. Compile the exact candidate review and repair plan from the execution receipt and immutable artifacts.
8. Continue through mastering, evaluation, independent approval, promotion, game integration, and publication as separate governed stages.

## Compile an authorisation

Build the domain and worker packages first:

```powershell
Set-Location C:\GitRepos\evavo-art-studio
pnpm install --frozen-lockfile
pnpm run build:domain
pnpm --filter @evavo/art-studio-worker build
```

Then authorise exact adapters, storage roots, jobs, and a bounded UTC window:

```powershell
pnpm run raw-art:provider-authorize -- `
  --runtime-batch C:\EVAVO\staging\raw-art-provider-runtime-batch.json `
  --selection C:\EVAVO\staging\raw-art-provider-runtime-selection.json `
  --admission-receipt C:\EVAVO\staging\raw-art-provider-runtime-admission-receipt.json `
  --runtime-root C:\EVAVO\runtime\art-studio `
  --artifact-root C:\EVAVO\artifacts\art-studio `
  --authorized-at 2026-08-09T01:00:00.000Z `
  --expires-at 2026-08-09T03:00:00.000Z `
  --authorized-by greg `
  --reason "Permit this exact reviewed RAW_ART batch to create unapproved provider candidates and evidence." `
  --allowed-adapters openai-gpt-image `
  --output C:\EVAVO\staging\raw-art-provider-execution-authorization.json
```

The authorisation window must be positive and no longer than 24 hours. Adapter IDs are exact and duplicate-free. The compiler refuses jobs that have started, failed, succeeded, been redriven, changed state, changed specification, lost their one-attempt policy, or drifted from the exact admission receipt.

The resulting `evavo.raw-art-provider-runtime-execution-authorization.v1` document binds:

- exact runtime-batch, selection, and admission-receipt file bytes;
- exact campaign, technical-admission, style-bank, and artifact-binding identities;
- exact runtime and artifact roots;
- each work order, campaign item, provider request, request SHA-256, canonical provider job, isolated admitted job, runtime job ID, specification SHA-256, kind, and queue;
- one or more exact allowed provider adapter IDs;
- the authoriser, reason, start, expiry, self-hash, and run ID;
- an authority record that permits only provider execution, worker claim, candidate/evidence creation, and runtime completion.

## Run the dedicated worker

Configure only the provider credentials needed by an allowed adapter, then run:

```powershell
$env:OPENAI_API_KEY = "..."
$env:EVAVO_ART_OPENAI_IMAGE_MODEL = "gpt-image-2"

pnpm run raw-art:provider-execute -- `
  --authorization C:\EVAVO\staging\raw-art-provider-execution-authorization.json `
  --worker-id raw-art-authorized-production `
  --command until-idle `
  --concurrency 1 `
  --receipt C:\EVAVO\staging\raw-art-provider-execution-receipt.json
```

The command loads the source files named by the authorisation and verifies their exact file hashes and self-hashed document identities. Before claiming anything, it requires:

- an active authorisation window;
- exact unstarted queued runtime records;
- no prior attempt or redrive;
- the isolated authorisation queue and capability;
- the exact one-attempt policy;
- every allowed adapter to be installed;
- at least one allowed adapter to satisfy each request’s complete capability profile.

The worker descriptor contains only the authorisation’s queues, the permitted provider capabilities, and `raw-art.execution-authorized`. Provider routing is filtered to the explicit adapter allowlist before the provider orchestrator sees it. The provider handler independently rechecks the active authorisation, job ID, specification SHA-256, request SHA-256, campaign item, campaign SHA-256, queue, kind, attempt count, redrive count, and capability immediately before `executeProviderCandidateRequest(...)`.

## Execution receipt

The create-only `evavo.raw-art-provider-runtime-execution-receipt.v1` receipt records:

- the exact authorisation file identity;
- the worker and completion time;
- the runtime and artifact roots;
- the installed and authorised adapter descriptors;
- each runtime job’s final state, attempts, failure evidence, and immutable output artifacts;
- verified artifact content hashes, media types, storage classes, roles, and approval states;
- an execution self-hash and run ID.

Provider candidates must remain `intermediate`, `unapproved`, and `finalDeliverable: false`. The receipt fails closed if candidate artifacts cross that boundary or if any output artifact fails immutable verification.

Continue with [RAW_ART provider candidate review and repair planning](./RAW_ART_PROVIDER_REVIEW_AND_REPAIR.md) to bind every review decision to the exact runtime state, candidate bytes, provider evidence, and any compiled repair request.

## Authority retained outside execution

Execution may create unapproved candidate images and immutable evidence. It may not:

- submit additional runtime jobs;
- redrive a provider job;
- publish broker delivery messages;
- approve or promote candidates;
- update named artifact references;
- mutate or delete source art;
- mutate the target game repository;
- deploy or publish game content;
- force-push Git history.

A failed execution consumes the job’s one authorised attempt. Recovery requires a separately reviewed replacement request and new admission; automatic paid retries are intentionally disabled.

## Validation

```powershell
pnpm run raw-art:provider-admission:check
pnpm run raw-art:provider-execution:check
pnpm run raw-art:provider-review:check
pnpm check
```

The permanent execution regression uses only the deterministic fixture adapter. It proves that generic workers cannot claim isolated jobs, and that expired, unavailable-adapter, freshly re-fingerprinted forged, repeated, and already-started executions fail before a second provider call. It also verifies immutable unapproved candidates, provider evidence, create-only authorisations and receipts, and the retained false approval, promotion, repository-mutation, and publication authority.

The review regression reconstructs candidate order from each immutable artifact descriptor’s `candidateIndex` label rather than trusting provider or receipt array order.
