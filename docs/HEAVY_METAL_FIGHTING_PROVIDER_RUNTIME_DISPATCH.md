# HEAVY METAL FIGHTING — provider runtime dispatch and outcome boundary

Status: deterministic compile/validation layer  
Provider calls performed by this layer: **zero**  
Candidate approval or promotion authority: **none**

## Purpose

The HEAVY METAL FIGHTING production chain already has:

```text
immutable one-image work order
+ hash-bound body choreography overlay
+ human-admitted reference artifacts
+ human generation authorization
+ provider execution envelope
+ second human submission authorization
+ one-call/one-candidate submission manifest
```

This layer closes the next boundary without performing generation. It binds an authorised HMF submission manifest to the generic `@evavo/art-providers` durable runtime contract and validates the eventual external runtime result.

## Dispatch

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs dispatch `
  hmf.frame-animation.bastion.slot-121 `
  --receipts-json <receipts.json> `
  --artifact-bindings-json <artifact-bindings.json> `
  --submission-authorization-json <authorization.json>
```

Dispatch compilation refuses to proceed unless both human gates are satisfied and the exact manifest reports:

```text
status                 authorized-for-explicit-runtime-submission
maximum provider calls 1
maximum candidates     1
operation              generate
asset kind             sprite-frame
target                 160 x 160 transparent PNG
fallback               disabled
next receipt state     candidates-admitted
```

The dispatch binds the generic compiler:

```text
package  @evavo/art-providers
export   compileProviderCandidateRuntimeContract
```

and expects the package’s canonical durable job:

```text
queue              provider
kind               art.candidate.generate
maximum attempts   3
lease              300000 ms
timeout            1800000 ms
```

The HMF submission remains one creative attempt. Generic runtime retries use the same provider request idempotency key and may not become fallback creative variations.

## Runtime-contract binding

A write-enabled runtime must first call the generic compiler, then pass the result back through:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs bind `
  --dispatch-json <dispatch.json> `
  --compiled-runtime-contract-json <compiled-contract.json>
```

The validator checks:

- exact HMF unit and Frame identity;
- deterministic `provider_<sha>` request ID;
- one candidate;
- 160×160 transparent PNG target;
- no provider fallback;
- `provider` queue and `art.candidate.generate` job kind;
- generic runtime idempotency;
- lease, timeout and maximum-attempt policy;
- required capability set;
- normalized request/job-payload equality;
- compiled prompt includes the exact composed HMF creative intent;
- no execution, approval, promotion or repository authority.

## Runtime outcome

After the external provider runtime completes, normalize its result with:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs outcome `
  --dispatch-json <dispatch.json> `
  --runtime-binding-json <binding.json> `
  --runtime-outcome-json <outcome.json>
```

Only two outcome kinds are accepted.

### Candidate run result

Must contain:

```text
one provider call
one successful attempt
one candidate artifact
one evidence artifact
matching request and prompt hashes
no routing-time provider call
eligible adapter routing
```

The normalized record produces a **candidate-admission plan** pointing to the governed scratch candidate path. It does not materialize the artifact or persist the `candidates-admitted` receipt.

### Provider failure

Must contain:

```text
one provider call
zero candidates
one bounded failure code
classification: transient | permanent | incompatible | cancelled
one attempted call
```

The normalized record prepares a provider-failure receipt template. It does not fabricate a candidate or silently retry with another creative request.

## Authority boundary

This layer may:

```text
validate an authorised manifest
compile an immutable dispatch record
validate the generic provider runtime contract
normalize one external candidate or failure result
prepare candidate-admission or failure receipt data
```

It may not:

```text
enqueue a runtime job
execute an image provider
materialize candidate bytes
persist receipts
run deterministic QA
perform creative review
approve or promote candidates
write steel-dominion
commit, push, deploy or publish
```

## Validation

```powershell
node --test scripts/heavy-metal-fighting-art-studio-core.test.mjs
```

The focused tests cover blocked pre-authorisation state, exact dispatch compilation, generic runtime-contract binding, one-candidate success, explicit provider failure, multiple-candidate rejection, fallback-attempt rejection, idempotency drift and retained authority separation.
