# Council identity anchor admission V4.5

V4.5 converts the reviewed V4.4 candidate-campaign graph into a bounded provider-admission stage for the eight `full-body-right` identity anchors belonging to Veyra and Moro Pell.

It does **not** authorize or execute an image provider. It compiles eight exact provider-admission records only after a named human supplies a self-hashed, time-bounded review decision.

## Scope

The source campaign contains 24 jobs:

```text
2 characters × 4 candidate sets × 3 views = 24 jobs
```

V4.5 admits only the first phase:

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

The sixteen `full-body-left` and `neutral-bust` jobs remain excluded. They cannot be admitted until all eight anchors have later executed successfully and each dependent admission is bound to the exact successful receipt from its own character and candidate set.

## Human review boundary

Admission compilation requires a named-human review with:

- the exact current V4.4 campaign SHA-256;
- the exact ordered eight-anchor ID list;
- an actor ID;
- an ISO-8601 review time;
- an expiry no more than 24 hours later;
- an external evidence SHA-256;
- a clear statement approving admission compilation only;
- an exact self-hash;
- every provider, approval, publication and activation authority set to false.

The review does not grant provider authorization. It cannot execute a provider, approve a candidate, approve an identity, produce animation, publish media or activate Avatar Runtime or the website.

## CLI

Read the deterministic plan:

```bash
node scripts/compile-project-art-council-identity-anchor-admission.mjs summary
node scripts/compile-project-art-council-identity-anchor-admission.mjs capabilities
```

Create a review template:

```bash
node scripts/compile-project-art-council-identity-anchor-admission.mjs template \
  --output /trusted/create-only/council-anchor-review-template.json
```

Compile a named-human review document:

```bash
node scripts/compile-project-art-council-identity-anchor-admission.mjs review \
  --actor-id <named-human-actor-id> \
  --occurred-at <iso-8601> \
  --expires-at <iso-8601-within-24-hours> \
  --evidence-sha256 <sha256> \
  --statement-file /trusted/review-statement.txt \
  --output /trusted/create-only/council-anchor-admission-review.json
```

Compile eight provider admissions while the review is active:

```bash
node scripts/compile-project-art-council-identity-anchor-admission.mjs compile \
  --review /trusted/council-anchor-admission-review.json \
  --compiled-at <iso-8601-inside-review-window> \
  --output /trusted/create-only/council-anchor-admission-bundle.json
```

Validate an existing bundle:

```bash
node scripts/compile-project-art-council-identity-anchor-admission.mjs validate \
  --input /trusted/council-anchor-admission-bundle.json
```

Every output is create-only. The bundle contains exactly eight provider admissions and zero authorizations or execution receipts.

## MCP

```bash
node tools/project_art_council_identity_anchor_admission_mcp.mjs
```

The server exposes three read-only tools:

- `evavo_art_council_identity_anchor_admission_capabilities`
- `evavo_art_council_identity_anchor_admission_plan`
- `evavo_art_council_identity_anchor_admission_review_template`

It deliberately exposes no admission mutation, authorization or provider-execution tool.

## Replay and execution truth

The review declares one-shot use and the compiler writes one create-only bundle. That is not a durable execution ledger. V4.5 reports this limitation directly rather than claiming replay prevention it does not possess.

A later provider-authorization stage must bind each admission to a durable one-shot authorization and execution ledger before any real or paid provider call is allowed.

## Validation

```bash
node --check scripts/project-art/council-identity-anchor-admission.mjs
node --check scripts/compile-project-art-council-identity-anchor-admission.mjs
node --check tools/project_art_council_identity_anchor_admission_mcp.mjs
node --test \
  scripts/test-project-art-council-identity-anchor-admission.mjs \
  scripts/test-project-art-council-identity-anchor-admission-mcp.mjs
```

The established `test-ci-media-tool-*` suite also runs the complete V4.5 proof during normal Art Studio validation.
