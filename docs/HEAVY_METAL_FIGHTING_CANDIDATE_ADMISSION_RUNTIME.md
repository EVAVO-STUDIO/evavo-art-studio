# HEAVY METAL FIGHTING — candidate admission runtime

Status: explicit write-enabled persistent-workspace boundary  
Provider execution: external and already completed  
Deterministic QA: not performed here  
Candidate approval or promotion: prohibited  
Game-repository mutation: prohibited

## Purpose

The provider runtime dispatch layer can prove that one authorised provider call produced exactly one candidate artifact and one provider-evidence artifact. It intentionally stops before writing those bytes into the persistent Artist Workspace.

This runtime closes that one boundary:

```text
provider runtime outcome
        ↓
read-only candidate-admission plan
        ↓
explicit write-enabled materializer
        ↓
one governed candidate PNG
one provider-evidence sidecar
one immutable admission record
receipt chain advanced to candidates-admitted
        ↓
STOP — deterministic QA is the next separate authority
```

No image provider is called by this runtime.

## Required evidence

A plan requires all of the following to agree:

- named-human-authorised provider submission manifest;
- provider runtime dispatch;
- validated generic provider-runtime binding;
- successful provider runtime outcome;
- receipt chain whose head is the exact `generation-authorized` receipt used by the submission manifest;
- candidate artifact descriptor;
- provider-evidence artifact descriptor;
- persistent Artist Workspace root.

The artifact descriptors are closed records:

```json
{
  "artifactId": "artifact_<sha256>",
  "sourcePath": "<local regular non-symlink file>",
  "mediaType": "image/png"
}
```

Provider evidence uses `application/json`.

The `artifact_<sha256>` suffix must equal the actual file-byte SHA-256. Merely repeating an artifact ID returned by a provider is not enough.

## Candidate image checks

The candidate must be:

```text
PNG
160 × 160
8-bit RGBA
non-interlaced
native alpha already present
transparent at all four cell corners
16 MiB or smaller
```

The runtime decodes PNG scanline filters with Node's built-in zlib implementation. It does not rely on filename extensions or provider metadata for image geometry.

Candidates marked `requiresAlphaExtraction` are rejected. Alpha extraction is a different governed operation and cannot be silently folded into final Frame-body admission.

## Runtime actor mapping

The provider outcome describes its next receipt producer semantically as:

```text
actorClass = runtime
```

The established production receipt state machine accepts:

```text
system
agent
human
```

The admission runtime resolves that mismatch explicitly:

```text
provider semantic actor: runtime
persisted receipt actor: system
persisted actor id:       hmf-provider-runtime
```

This is recorded in every admission record. Human remains reserved for explicit generation, selection, and final approval gates.

## Workspace outputs

For one candidate path such as:

```text
scratch/provider/hmf-b0123/<unit>-cand-01.png
```

the materializer creates or exactly reuses:

```text
<unit>-cand-01.png
<unit>-cand-01.provider-evidence.json
<unit>-cand-01.candidate-admission.json
```

It also advances the governed receipt-chain file at the immutable work order's declared `manifests/receipts/...` path.

The admission record binds:

- work-order hash;
- submission-manifest hash;
- runtime dispatch, binding, and outcome hashes;
- submission idempotency key;
- adapter and model;
- candidate and evidence artifact IDs;
- candidate and evidence byte hashes and sizes;
- decoded PNG facts;
- exact output paths;
- generated `candidates-admitted` receipt;
- next legal action `run-deterministic-qa`.

## Safety and idempotency

The materializer:

- rejects symlinked workspace roots and path components;
- rejects traversal or absolute output paths;
- creates only governed parent directories;
- refuses to overwrite different candidate, evidence, admission, or receipt data;
- reuses byte-identical existing outputs;
- can recover after a partial pre-receipt write;
- advances the receipt last;
- returns `already-admitted` when the exact operation was previously completed.

It never writes outside the persistent Artist Workspace.

## CLI

### Verify the static boundary

```powershell
node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs verify
```

### Compile a read-only plan

```powershell
node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs plan `
  --submission-manifest-json <manifest.json> `
  --dispatch-json <dispatch.json> `
  --binding-json <binding.json> `
  --outcome-json <outcome.json> `
  --receipts-json <receipts.json> `
  --workspace-root <persistent-workspace> `
  --candidate-artifact-json <candidate-artifact.json> `
  --evidence-artifact-json <evidence-artifact.json> `
  --occurred-at <canonical-UTC>
```

### Execute the explicit write-enabled admission

```powershell
node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs materialize `
  --plan-json <candidate-admission-plan.json>
```

## Authority boundary

This runtime may:

```text
read one successful provider artifact pair
validate one 160×160 RGBA candidate
write one candidate and its evidence to scratch
write one admission record
advance one receipt chain to candidates-admitted
```

It may not:

```text
call or retry the provider
extract or invent alpha
run deterministic QA
run creative review
select the candidate
request or execute repair
master or promote the candidate
build the final atlas
write steel-dominion
commit or push
publish or deploy
```
