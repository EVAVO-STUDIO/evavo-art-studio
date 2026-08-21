# Council identity anchor authorization V4.6

V4.6 is the authorization-compilation stage for the eight `full-body-right` identity anchors belonging to Veyra and Moro Pell.

It consumes the exact validated V4.5 provider-admission bundle and, only after a named human reviews that bundle, compiles eight separate time-bounded one-shot provider authorizations.

V4.6 does **not** compile Runtime adapters, execute an image provider, create candidate bytes, approve an identity, publish media or activate Avatar Runtime or the website.

## Ordered scope

The source V4.5 bundle must contain exactly these eight admissions, in this order:

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

The sixteen `full-body-left` and `neutral-bust` jobs remain excluded. No dependent view can be admitted until all eight anchors later execute successfully and each dependent job is bound to the successful anchor receipt from its own character and candidate set.

## Admission-bundle binding

The V4.6 compiler validates and binds the complete V4.5 bundle, including:

- the V4.5 bundle SHA-256;
- the source campaign SHA-256;
- the V4.5 named-human admission-review SHA-256;
- all eight ordered campaign job IDs;
- all eight admission-entry SHA-256 values;
- all eight provider-admission SHA-256 values;
- the exact one-candidate, one-call, one-Runtime-attempt and no-fallback limits;
- zero existing authorizations or execution receipts;
- false provider, approval, publication and activation authority.

A modified, reordered or partially replaced admission graph is rejected before any V4.6 review or authorization can be compiled.

## Named-human authorization review

V4.6 requires a separate named-human review that explicitly authorizes one provider call for each of the exact eight admissions.

The review binds:

- the deterministic V4.6 plan SHA-256;
- the complete source V4.5 bundle identity;
- all eight campaign job IDs;
- all eight admission-entry SHA-256 values;
- all eight provider-admission SHA-256 values;
- a named actor ID;
- an ISO-8601 occurrence time;
- an expiry no more than 24 hours later;
- an external evidence SHA-256;
- a clear authorization statement;
- an exact review self-hash.

The review grants authorization compilation for those exact targets only. It does not perform provider execution and it does not authorize automatic execution, fallback, retry, candidate approval, identity approval, publication or activation.

## Compiled authorization bundle

A valid V4.6 compilation produces exactly eight generic character-identity provider authorization documents.

Every authorization has:

- `action: run-character-identity-provider-once`;
- `actorClass: human`;
- the exact reviewed actor ID and time window;
- one provider-admission SHA-256 binding;
- one authorization-specific evidence SHA-256;
- `maximumProviderCalls: 1`;
- `oneShot: true`;
- every downstream authority field false.

The enclosing bundle records:

```text
provider admissions bound       8
provider authorizations          8
Runtime adapters                 0
provider executions              0
dependent admissions             0
candidate artifacts              0
identity approvals               0
```

## Durable consumption boundary

A one-shot declaration is not, by itself, a durable replay-prevention mechanism.

V4.6 therefore reports the following truth explicitly:

- no durable authorization-consumption ledger exists yet;
- no authorization has been consumed;
- no consumption receipt exists;
- a Runtime adapter is still required for every authorization;
- a durable one-shot ledger is required before any provider execution;
- implicit resume is not allowed;
- execution cannot approve candidates or identities.

The next separate stage must compile exact Runtime adapters and establish durable one-shot consumption controls before any real or paid provider call is possible.

## CLI

Read the deterministic plan and capabilities:

```bash
node scripts/compile-project-art-council-identity-anchor-authorization.mjs summary
node scripts/compile-project-art-council-identity-anchor-authorization.mjs capabilities
```

Create a review template bound to one exact V4.5 admission bundle:

```bash
node scripts/compile-project-art-council-identity-anchor-authorization.mjs template \
  --admission-bundle /trusted/v4.5-anchor-admission-bundle.json \
  --output /trusted/create-only/v4.6-authorization-review-template.json
```

Compile the named-human review document:

```bash
node scripts/compile-project-art-council-identity-anchor-authorization.mjs review \
  --admission-bundle /trusted/v4.5-anchor-admission-bundle.json \
  --actor-id <named-human-actor-id> \
  --occurred-at <iso-8601> \
  --expires-at <iso-8601-within-24-hours> \
  --evidence-sha256 <sha256> \
  --statement-file /trusted/authorization-statement.txt \
  --output /trusted/create-only/v4.6-authorization-review.json
```

Compile the eight authorization documents while the review is active:

```bash
node scripts/compile-project-art-council-identity-anchor-authorization.mjs compile \
  --admission-bundle /trusted/v4.5-anchor-admission-bundle.json \
  --review /trusted/v4.6-authorization-review.json \
  --compiled-at <iso-8601-inside-review-window> \
  --output /trusted/create-only/v4.6-anchor-authorization-bundle.json
```

Validate an existing bundle:

```bash
node scripts/compile-project-art-council-identity-anchor-authorization.mjs validate \
  --input /trusted/v4.6-anchor-authorization-bundle.json
```

Every written output is create-only. The CLI exposes no provider-execution command.

## MCP

The dedicated read-only server is:

```bash
node tools/project_art_council_identity_anchor_authorization_mcp.mjs
```

It exposes only:

- `evavo_art_council_identity_anchor_authorization_capabilities`
- `evavo_art_council_identity_anchor_authorization_plan`

The unified Council MCP exposes the same two read-only contracts while retaining its existing server version. Neither MCP exposes review mutation, authorization compilation or provider execution.

## Validation

Focused validation:

```bash
node --check scripts/project-art/council-identity-anchor-authorization.mjs
node --check scripts/compile-project-art-council-identity-anchor-authorization.mjs
node --check tools/project_art_council_identity_anchor_authorization_mcp.mjs
node --test \
  scripts/test-project-art-council-identity-anchor-authorization.mjs \
  scripts/test-project-art-council-identity-anchor-authorization-mcp.mjs
```

The established `test-ci-media-tool-*` suite also executes the complete V4.6 contract and MCP proof during normal Art Studio validation.
