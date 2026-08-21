# Council identity anchor Runtime adapters V4.7

V4.7 is the deterministic Runtime-adapter compilation stage for the eight `full-body-right` identity anchors belonging to Veyra and Moro Pell.

It consumes one exact validated V4.6 authorization bundle and compiles eight separate character-identity Runtime adapters while every authorization is still active.

V4.7 does **not** execute an image provider, consume an authorization, reserve a Runtime job, create candidate bytes, approve an identity, publish media or activate Avatar Runtime or the website.

## Ordered scope

The V4.6 source bundle must contain exactly these eight authorizations in order:

```text
Veyra      candidate-set-01 full-body-right
Veyra      candidate-set-02 full-body-right
Veyra      candidate-set-03 full-body-right
Veyra      candidate-set-04 full-body-right
Moro Pell  candidate-set-01 full-body-right
Moro Pell  candidate-set-02 full-body-right
Moro Pell  candidate-set-03 full-body-right
Moro Pell  candidate-set-04 full-body-right
```

The sixteen `full-body-left` and `neutral-bust` jobs remain excluded. They can only proceed after all eight anchors have successful provider execution receipts and each dependent admission is bound to its own same-character, same-set anchor evidence.

## Exact source and authorization binding

The compiler validates the complete V4.6 authorization graph, including:

- the V4.6 bundle SHA-256;
- the V4.5 admission bundle SHA-256;
- the V4.6 named-human review SHA-256;
- the source V4.4 campaign SHA-256;
- all eight ordered campaign job IDs;
- all eight admission-entry SHA-256 values;
- all eight authorization-entry SHA-256 values;
- all eight provider-admission SHA-256 values;
- all eight provider-authorization SHA-256 values;
- one-shot and one-provider-call limits;
- no fallback and no automatic retry;
- zero existing Runtime adapters, execution receipts or authorization-consumption receipts;
- false approval, publication and activation authority.

For every target, V4.7 also reads the exact repository identity request through its canonical relative path and verifies its file SHA-256 against the V4.5 admission entry before compiling the Runtime adapter.

A modified request, reordered authorization, substituted candidate set, altered provider selection or escalated authority is rejected.

## Authorization window

Runtime-adapter compilation must occur while the complete V4.6 authorization window is active:

```text
compiledAt >= occurredAt
compiledAt < expiresAt
```

All eight authorization records must carry the same declared window from the enclosing V4.6 bundle.

This check is only a compilation-time gate. The existing provider executor revalidates the authorization again immediately before and during execution. An adapter compiled while active cannot be executed after its authorization expires.

## Compiled Runtime adapters

A valid V4.7 bundle contains exactly eight distinct adapters produced through Art Studio's existing canonical compiler:

```text
compileCharacterIdentityProviderRuntimeAdapter
```

Every adapter binds:

- the exact identity request;
- the exact provider admission;
- the exact named-human authorization;
- the exact character, candidate set, continuity key and full-body-right job;
- the exact OpenAI image adapter/model selection from V4.4;
- one candidate only;
- one provider call maximum;
- one Runtime attempt maximum;
- no provider fallback;
- generation never equals approval;
- a self-hashed generic Runtime dispatch;
- all downstream authority false.

The enclosing bundle reports:

```text
provider admissions bound            8
provider authorizations bound         8
Runtime adapters compiled             8
durable Runtime reservations          0
provider executions                    0
dependent admissions                   0
candidate artifacts                    0
identity approvals                     0
```

## Execution boundary

V4.7 does not package or execute the embedded adapters.

Before any provider call, the next gate must:

1. materialize each adapter into a separate create-only JSON file;
2. calculate and bind the exact adapter-file SHA-256;
3. revalidate that the authorization remains active;
4. execute through the existing provider runner using a dedicated Runtime and artifact root;
5. rely on the existing one-shot Runtime job reservation and idempotency key;
6. preserve unapproved candidate and provider-evidence artifacts only;
7. stop without automatic retry if a provider call fails.

The existing provider executor already rejects a previously reserved Runtime job, restricts execution to the one allowed adapter, sets `maximumAttempts: 1`, and keeps candidate approval, identity approval, publication and activation false.

## CLI

Read the deterministic plan and capabilities:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs summary
node scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs capabilities
```

Compile the eight Runtime adapters while the authorization is active:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs compile \
  --authorization-bundle /trusted/v4.6-anchor-authorization-bundle.json \
  --compiled-at <iso-8601-inside-authorization-window> \
  --output /trusted/create-only/v4.7-anchor-runtime-adapter-bundle.json
```

Validate an existing V4.7 bundle:

```bash
node scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs validate \
  --input /trusted/v4.7-anchor-runtime-adapter-bundle.json
```

Every output is create-only. The CLI exposes no provider-execution command.

## MCP

The dedicated read-only server is:

```bash
node tools/project_art_council_identity_anchor_runtime_adapters_mcp.mjs
```

It exposes only:

- `evavo_art_council_identity_anchor_runtime_adapter_capabilities`
- `evavo_art_council_identity_anchor_runtime_adapter_plan`

The unified Council MCP exposes the same two read-only contracts while retaining server version `1.1.0`.

Neither MCP accepts an authorization bundle, compiles adapters, packages files, consumes authorizations or executes providers.

## Validation

Focused validation:

```bash
node --check scripts/project-art/council-identity-anchor-runtime-adapters.mjs
node --check scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs
node --check tools/project_art_council_identity_anchor_runtime_adapters_mcp.mjs
node --test \
  scripts/test-project-art-council-identity-anchor-runtime-adapters.mjs \
  scripts/test-project-art-council-identity-anchor-runtime-adapters-mcp.mjs
```

The focused suites cover:

- exact ordered target coverage;
- eight distinct canonical adapters;
- exact source-file hashing;
- active-window enforcement;
- deterministic full-bundle recompilation;
- authorization and adapter mutation;
- execution-receipt injection;
- resigned job reordering;
- ninth-adapter injection;
- create-only CLI output;
- read-only MCP parity;
- rejection of compilation, packaging and execution-shaped MCP calls.

The established `test-ci-media-tool-*` suite also executes the complete V4.7 proof during normal Art Studio validation.
