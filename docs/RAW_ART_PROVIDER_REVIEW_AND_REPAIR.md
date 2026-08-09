# RAW_ART provider candidate review and repair planning

This boundary closes the gap between authorised provider execution and the existing mastering, quality, selection, targeted-repair, promotion, game-integration, and publication systems.

Provider execution still ends with immutable `intermediate`, `unapproved` candidates and provider evidence. This review boundary re-verifies that exact execution, requires an explicit disposition for every candidate, and compiles valid provider requests for candidates that need editing, bounded inpainting, recreation, or a controlled variation.

It does **not** submit those requests, call a provider, approve a candidate, promote an artifact, mutate a game repository, update a named artifact reference, deploy, or publish anything.

## Why this boundary exists

The Art Studio already has strong components for:

- art-direction and style-reference contracts;
- provider capability routing;
- durable runtime jobs and isolated RAW_ART execution;
- immutable content-addressed artifacts;
- technical review and image mastering;
- candidate selection and promotion;
- sprite-family consistency and targeted repair;
- Godot delivery and runtime validation.

The missing connection was a durable answer to: **what did the reviewer find, which exact candidate did it inspect, what must be preserved, what must change, and what exact request should be admitted next?**

Without this boundary, a human or agent could write useful feedback, but later repair execution would have to trust loosely copied candidate IDs, prompts, or descriptions. The review plan now binds those decisions to exact runtime state, candidate bytes, descriptors, provider evidence, campaign identity, and the original normalized provider request.

## Inputs

The compiler consumes:

1. The exact RAW_ART provider execution authorisation.
2. The exact successful execution receipt.
3. One review-decisions JSON file covering every candidate exactly once.

The authorisation points back to the exact runtime batch, selection, and durable-admission receipt, so the compiler can revalidate the complete chain before it reads review decisions.

## Review decision schema

The review file uses:

```text
evavo.raw-art-provider-candidate-review-decisions.v1
```

Top-level fields:

```json
{
  "schema": "evavo.raw-art-provider-candidate-review-decisions.v1",
  "status": "reviewed",
  "reviewedAt": "2026-08-09T02:00:00.000Z",
  "reviewedBy": "greg-and-art-review-agent",
  "reviewMode": "agent-assisted",
  "sourceExecutionReceipt": {
    "path": "C:\\EVAVO\\staging\\raw-art-provider-execution-receipt.json",
    "fileSha256": "<exact file SHA-256>",
    "documentSha256": "<execution receipt self hash>",
    "runId": "<execution run id>"
  },
  "candidates": [],
  "authority": {
    "reviewCompilation": false,
    "providerExecution": false,
    "runtimeSubmission": false,
    "candidateApproval": false,
    "candidatePromotion": false,
    "targetRepositoryMutation": false,
    "publication": false
  }
}
```

`reviewMode` is one of:

```text
human
agent-assisted
automated-technical
hybrid
```

Automated technical review can contribute evidence, but it cannot claim visual, historical, identity, or creative approval it did not perform. Unreviewed gates remain explicit.

## Candidate dispositions

Every execution candidate must receive exactly one disposition:

```text
keep
edit
recreate
generate-variation
reference-only
reject
```

Meaning:

- `keep`: retain this exact candidate for mastering and blocking evaluation. It is still unapproved.
- `edit`: compile an edit request using this exact candidate as the required base image. Supplying a mask compiles an inpaint request instead.
- `recreate`: compile a fresh generate request from the original art direction and references, augmented by the review findings.
- `generate-variation`: compile a controlled edit request from this exact candidate.
- `reference-only`: retain the bytes as useful reference evidence, never as a runtime candidate.
- `reject`: end this candidate’s production path without deleting its immutable evidence.

A repair disposition requires at least one failed gate, one structured defect, and one explicit change. A keep decision cannot carry failed gates, defects, masks, adapter choices, or repair instructions.

## Required review gates

Each candidate records every exact gate:

```text
technical
styleConsistency
identityContinuity
animationContinuity
historicalAccuracy
composition
gameplayReadability
runtimeReadiness
```

Each gate is one of:

```text
pass
fail
not-reviewed
not-applicable
```

This prevents a technical alpha or crop check from being silently presented as historical, identity, animation, gameplay, or creative approval.

## Candidate example

```json
{
  "jobId": "raw-art:<selection>:<provider-request>",
  "providerRequestId": "provider_...",
  "artifactId": "artifact_...",
  "contentHash": "sha256:...",
  "candidateIndex": 2,
  "decision": "edit",
  "reason": "The geometry and staging are correct, but the line treatment drifted from the approved engraving reference.",
  "confidence": 0.94,
  "gates": {
    "technical": "pass",
    "styleConsistency": "fail",
    "identityContinuity": "not-applicable",
    "animationContinuity": "not-applicable",
    "historicalAccuracy": "pass",
    "composition": "pass",
    "gameplayReadability": "pass",
    "runtimeReadiness": "fail"
  },
  "defects": [
    {
      "id": "line-treatment-drift",
      "severity": "major",
      "summary": "Edges are soft and painterly rather than controlled engraved hatching.",
      "evidenceArtifactIds": []
    }
  ],
  "strengths": [
    "broad horizontal gameplay lane",
    "correct dock geometry"
  ],
  "preserve": [
    "camera and staging",
    "period dock geometry"
  ],
  "change": [
    "restore the exact approved engraved line treatment"
  ],
  "avoid": [
    "soft painterly edges",
    "pseudo-text"
  ],
  "evidenceArtifactIds": [],
  "candidateCount": 2,
  "allowedAdapterIds": [
    "openai-gpt-image"
  ]
}
```

For localized repair, add an exact immutable image artifact as `maskArtifactId`. The compiler changes the request operation from `edit` to `inpaint` and requires both the reviewed candidate and mask as exact references.

## Compile the plan

Build the domain packages first:

```powershell
Set-Location C:\Gitrepos\evavo-art-studio
pnpm install --frozen-lockfile
pnpm run build:domain
```

Then run:

```powershell
pnpm run raw-art:provider-review -- `
  --authorization C:\EVAVO\staging\raw-art-provider-execution-authorization.json `
  --execution-receipt C:\EVAVO\staging\raw-art-provider-execution-receipt.json `
  --review-decisions C:\EVAVO\staging\raw-art-provider-review-decisions.json `
  --output C:\EVAVO\staging\raw-art-provider-review-plan.json
```

`--compiled-at` may be supplied as a canonical UTC timestamp for deterministic fixture and audit use.

The output uses:

```text
evavo.raw-art-provider-candidate-review-plan.v1
```

It records:

- exact source file identities;
- exact campaign, technical-admission, style-bank, and artifact-binding identities;
- exact runtime job and original provider-request identities;
- verified candidate content hashes and descriptor hashes;
- the provider adapter, model, candidate index, gates, defects, rationale, and evidence for every decision;
- deterministic normalized edit, inpaint, recreate, and variation requests;
- canonical provider contracts and request, contract, and runtime-job SHA-256 values;
- an explicit requirement for fresh selection, admission, and short-lived execution authorisation;
- a self-hash and run ID;
- a fully false production-effect authority record.

## Exact evidence checks

Before a plan is written, the compiler rechecks:

- execution receipt self-hash and exact authorisation source;
- successful counts and one runtime attempt with no redrive;
- durable runtime job state, specification, and output order;
- every artifact descriptor and content byte hash;
- candidate `intermediate`, `unapproved`, and non-final state;
- candidate request SHA-256, adapter, model, family, asset, and candidate index;
- provider evidence JSON and its complete candidate set;
- all review evidence artifacts and optional mask artifacts;
- complete one-to-one decision coverage;
- adapter allowlist intersection across original request, execution authorisation, and review narrowing;
- normalized provider-request and compiled runtime-contract identity.

Freshly re-fingerprinting a forged execution receipt is not sufficient. Durable runtime state and immutable artifact descriptors and bytes remain authoritative.

## Closed-loop agent operation

The intended agent-assisted loop is:

1. Compile, select, admit, and authorise an exact provider batch.
2. Run the dedicated authorised worker.
3. Use the read-only review MCP and specialist visual, historical, identity, animation, and gameplay reviewers to produce evidence.
4. Record one exact disposition per candidate.
5. Compile this review plan.
6. Admit only the chosen repair requests through a new bounded admission and execution authorisation.
7. Execute, review, and compare again.
8. Stop when candidates are retained for mastering and independent approval, or when bounded iteration policy is exhausted.

The loop should enforce project policy such as maximum generations per asset, maximum paid attempts, review confidence thresholds, human escalation for ambiguous identity or historical questions, and no automatic promotion.

## Provider expansion research

The current permanent provider layer includes the deterministic fixture adapter and the governed OpenAI image adapter. The next provider expansion should be a **separate governed ComfyUI adapter**, not shell access to an arbitrary local graph.

ComfyUI is a strong fit because its official project supports local/offline operation, API-format workflows, ControlNet and T2I-Adapter workflows, LoRAs, inpainting, upscaling, video, 3D, and audio workflows. Its official API examples use exported API workflow JSON together with `/prompt`, `/history/{prompt_id}`, `/view`, and `/ws`.

A production EVAVO adapter should require:

- allowlisted workflow-profile IDs and exact workflow JSON hashes;
- exact node and model inventory declarations;
- explicit mapping from Art Studio capabilities to workflow inputs, including pose, edge, depth, identity, temporal, mask, seed, and native-alpha support;
- bounded upload and output byte limits;
- a dedicated or exclusive ComfyUI instance when cancellation can interrupt unrelated work;
- exact prompt ID, workflow hash, model fingerprints, seed, node versions, and output-byte provenance in provider evidence;
- no arbitrary custom-node installation or arbitrary filesystem path supplied by a request;
- health, capability, and model preflight before execution authorisation;
- immutable candidate and evidence storage through the same Art Studio artifact boundary;
- fixture-only CI, with live GPU execution kept behind explicit operator authorisation.

That provider work is intentionally not claimed by this release. This release supplies the review and repair contract that both cloud and local providers can share.

## Validation

```powershell
pnpm run raw-art:provider-review:check
pnpm check
```

The permanent fixture regression executes a seven-candidate batch and proves all six dispositions, edit, inpaint, recreate, and variation compilation, create-only output, exact adapter narrowing, immutable byte verification, complete review coverage, and retained false execution, approval, promotion, repository-mutation, and publication authority.
