# Council identity candidate campaign V4.4

The V4.4 Council identity candidate campaign is the compile-only bridge between the approved Veyra and Moro Pell identity briefs and the existing governed character-identity provider runtime.

It does **not** generate images, authorize a provider, approve a character, publish media or activate Avatar Runtime. It compiles the exact work graph that later human-authorized provider admissions must follow.

## Exact scope

The campaign contains two characters:

- `council-critic` — Veyra
- `council-open-reviewer` — Moro Pell

Each character has four candidate sets and three continuity views per set:

- `full-body-right`
- `full-body-left`
- `neutral-bust`

The resulting matrix is:

```text
2 characters × 4 candidate sets × 3 views = 24 jobs
```

Nymm, EVA and Top Hat Man are not campaign characters.

## Two-phase ordering

The campaign enforces a global anchor barrier.

### Phase 1: anchor generation

Eight `full-body-right` jobs are placed first:

```text
Veyra candidate sets 01–04
Moro Pell candidate sets 01–04
```

Every anchor remains an unapproved identity candidate. Provider admission, authorization and execution are not included in the campaign compiler.

### Phase 2: dependent continuity views

Only after all eight successful anchor execution receipts exist may the sixteen dependent jobs be admitted:

```text
full-body-left
neutral-bust
```

Each dependent job binds the exact `full-body-right` receipt from the same character and candidate set. Cross-set and cross-character anchor reuse are forbidden.

## Exact provider selection

The repository-bound selection file is:

```text
config/council-avatar-identities/council-identity-provider-selection.v1.json
```

It binds:

```text
adapter: openai-gpt-image
model: gpt-image-1
allowed adapters: openai-gpt-image only
fallback: false
seed required: false
seed: null
```

The provider path does not expose a deterministic seed, so the campaign records that fact rather than inventing one. Determinism comes from immutable request text, exact provider/model selection, exact source hashes, ordered job identities, one-call limits and same-set continuity anchors.

## Job limits

Every future separately authorized job is limited to:

- one candidate;
- one provider call;
- one Runtime attempt;
- no provider fallback;
- no automatic retry;
- no automatic authorization;
- no approval by generation.

The complete campaign therefore permits at most 24 provider calls only after 24 separate valid admissions and time-bounded named-human authorizations exist.

## Compile and validate

```bash
node scripts/compile-project-art-council-identity-candidate-campaign.mjs summary
node scripts/compile-project-art-council-identity-candidate-campaign.mjs capabilities
node scripts/compile-project-art-council-identity-candidate-campaign.mjs compile \
  --output /trusted/create-only/council-identity-candidate-campaign-v44.json
node scripts/compile-project-art-council-identity-candidate-campaign.mjs validate \
  --input /trusted/create-only/council-identity-candidate-campaign-v44.json
```

Compilation is create-only. Validation checks the campaign self-hash and requires an exact match to the current repository-bound identity requests, bootstrap admissions, provider selection and job graph.

## MCP

The existing Council MCP server exposes:

- `evavo_art_council_identity_candidate_campaign_capabilities`
- `evavo_art_council_identity_candidate_campaign`

```bash
node tools/project_art_council_avatar_production_mcp.mjs
```

The MCP server remains version `1.1.0`; the new tools are backward-compatible read/compute-only additions.

## Validation

```bash
node --test scripts/test-project-art-council-identity-candidate-campaign.mjs
node --test scripts/test-project-art-council-identity-candidate-campaign-mcp.mjs
node --test scripts/test-ci-media-tool-council-identity-candidate-campaign.mjs
```

The established media-tool CI runs the focused campaign and MCP suites. It proves the exact 24-job matrix, global anchor barrier, same-set dependencies, immutable source bindings, create-only CLI, adapter lock and denied authority surface.

## Authority boundary

The V4.4 campaign grants no authority for:

- provider admission;
- provider authorization;
- provider execution;
- candidate materialization;
- deterministic or creative approval;
- identity approval;
- animation production;
- candidate promotion;
- publication;
- repository mutation;
- Avatar Runtime activation;
- website activation;
- deployment or force push.

The next governed gate is to review the compiled campaign, then separately admit and authorize the eight anchor jobs. Dependent admissions remain blocked until all eight valid same-set anchor execution receipts exist.
