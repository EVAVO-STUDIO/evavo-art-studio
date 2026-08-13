# Project Art avatar final-pass provider runtime bridge

This boundary advances a sealed avatar provider batch from **submit-ready JSON** to the exact durable provider-runtime contract and then back to a governed candidate or failure record.

It closes the missing link between:

```text
evavo.project-art-avatar-final-pass-provider-batch.v1
→ @evavo/art-providers compileProviderCandidateRuntimeContract
→ durable provider runtime job
→ candidate-run-result | provider-failure
→ governed candidate materialization or failure record
```

The bridge does not execute a provider. It does not enqueue a runtime job, materialize image bytes, approve or promote a candidate, write the reviewed target, mutate a repository, push Git, deploy, publish or activate the avatar runtime.

## Why this is separate

The final-pass provider compiler already proves that a redraw or generated in-between has:

- a sealed source plan;
- exact source and target identities;
- one deterministic candidate path;
- exact human-admitted reference artifacts;
- named-human `run-provider-once` authorization;
- one candidate;
- provider fallback disabled;
- transparent PNG output;
- final endpoint hashes for generated in-betweens.

Those guarantees must not be lost when a generic provider runtime normalizes the request, selects an adapter, creates a durable job or returns a candidate. This bridge independently checks each boundary and emits a new self-hashed record rather than mutating the provider batch.

## Dispatch

Compile one exact ready job:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\avatar-final-pass-provider-runtime-cli.mjs dispatch `
  --batch C:\EVAVO\ArtWorkspaces\eva\provider-batch.json `
  --job-id redraw:talk-a `
  --output C:\EVAVO\Evidence\eva\talk-a.runtime-dispatch.json `
  --compiled-at 2026-08-13T03:00:00.000Z
```

The dispatch binds:

```text
package  @evavo/art-providers
export   compileProviderCandidateRuntimeContract
```

and requires the exact generic runtime policy:

```text
schema version       1.0
execution mode       submit-runtime-job
queue                provider
kind                 art.candidate.edit | art.candidate.generate
maximum attempts     3 runtime retries of the same idempotent request
lease                300000 ms
timeout              1800000 ms
provider calls       one creative submission
candidate count      one
fallback             disabled
```

The dispatch is still compilation-only. A write-enabled provider worker must separately call the generic compiler and separately enqueue the returned job.

## Generic runtime binding

After the generic compiler returns its normalized contract, bind it:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\avatar-final-pass-provider-runtime-cli.mjs bind `
  --dispatch C:\EVAVO\Evidence\eva\talk-a.runtime-dispatch.json `
  --compiled-runtime-contract C:\EVAVO\Evidence\eva\talk-a.compiled-provider-runtime.json `
  --output C:\EVAVO\Evidence\eva\talk-a.runtime-binding.json
```

The binding revalidates:

- deterministic `provider_<sha>` request identity;
- exact operation, asset, continuity phase and creative intent;
- exact normalized request SHA-256;
- exact compiled prompt SHA-256;
- canonical request and runtime payload parity;
- `provider` queue and `art.candidate.edit` or `art.candidate.generate` kind;
- runtime idempotency key;
- maximum attempts, lease and timeout;
- required runtime capabilities;
- required adapter capability profile;
- one-candidate scope;
- transparent PNG target;
- disabled fallback;
- exact candidate output path.

The binding does not enqueue or execute the job.

## Runtime outcome

Only two outcomes are legal.

### Candidate result

A successful candidate result must contain:

```text
one provider call
one successful attempt
one candidate artifact
one evidence artifact
matching request and prompt hashes
eligible routing inspection
no provider call during routing inspection
fallback disabled
```

Normalize it:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\avatar-final-pass-provider-runtime-cli.mjs outcome `
  --dispatch C:\EVAVO\Evidence\eva\talk-a.runtime-dispatch.json `
  --binding C:\EVAVO\Evidence\eva\talk-a.runtime-binding.json `
  --runtime-outcome C:\EVAVO\Evidence\eva\talk-a.provider-result.json `
  --output C:\EVAVO\Evidence\eva\talk-a.normalized-outcome.json
```

The normalized record prepares a create-only materialization request for the governed scratch path. It does not write the artifact. It requires the following next steps:

```text
materialize candidate create-only
→ perform governed alpha extraction when required
→ rerun the avatar frame finisher
→ independent art, anatomy, identity and continuity review
→ bind the final SHA-256
→ only then use the corrected key frame for an in-between or sequence
```

The candidate must not be copied directly into the reviewed target or runtime pack.

### Provider failure

A failure must record:

```text
one attempted provider call
zero candidates
bounded failure code and message
classification: transient | permanent | incompatible | cancelled
```

The normalized failure record keeps the original provider batch immutable. Any retry requires a fresh named-human run-once authorization and a new candidate output path. It cannot silently retry as a new creative variation or fall through to another provider.

## MCP

Start the path-only server:

```powershell
$env:EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS = "C:\EVAVO\ArtWorkspaces;C:\EVAVO\Evidence"
$env:EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE = "false"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_final_pass_provider_runtime_mcp.mjs
```

Tools:

```text
evavo_art_avatar_final_pass_provider_runtime_capabilities
evavo_art_compile_avatar_final_pass_provider_runtime_dispatch
evavo_art_bind_avatar_final_pass_provider_runtime_contract
evavo_art_compile_avatar_final_pass_provider_runtime_outcome
```

Set the write gate to `true` only while creating the JSON records on a trusted local workstation. The MCP server uses no shell and image bytes never pass through MCP JSON.

## Complete avatar finishing order

```text
canonical frame review
→ explicit redraw and in-between selection
→ exact reference-artifact admission
→ named-human run-once authorization
→ one-candidate provider-batch compilation
→ runtime dispatch compilation
→ generic provider-runtime contract compilation
→ runtime contract binding
→ separately authorized durable runtime enqueue and execution
→ runtime outcome normalization
→ create-only candidate materialization
→ rerun frame finisher and registration checks
→ independent hands, anatomy, identity and continuity review
→ generate dependent in-betweens only from final endpoint hashes
→ rerun loop closure
→ approve timing
→ seal sequence release
→ activate reviewed runtime pack
```

## Validation

Run:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\check-project-art-avatar-final-pass-provider-runtime-suite.mjs
```

The suite covers redraw and in-between dispatches, generic runtime binding, success and failure outcomes, tampered hashes, fallback, multiple attempts, multiple candidates, create-only publication, MCP roots and write gating.

## Authority boundary

Every compiler and MCP record keeps these actions separate:

```text
runtime enqueue
provider execution
candidate materialization
receipt persistence
deterministic QA
creative review
candidate approval
candidate promotion
target-repository mutation
Git mutation
deployment
publication
runtime activation
force push
```

A valid runtime outcome is evidence about one provider call. It is not evidence that the frame is visually correct, that hands or anatomy are approved, that animation timing is final or that the avatar is production-ready.

It does not approve or promote a candidate.
