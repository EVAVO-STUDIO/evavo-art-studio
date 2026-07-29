# Candidate selection and promotion

Status: implemented deterministic selection, immutable evidence and compare-and-swap promotion

## Purpose

Provider generation, editing and inpainting produce candidates. Alpha mastering and decoded-pixel QA can prove that a candidate is technically usable, but neither step proves that it is the best member of a candidate family or that it should replace an approved project asset.

Art Studio therefore separates the final decision into two durable transactions:

1. **Selection** compares a candidate family against an immutable reference, writes a complete ranking and makes no approved-reference mutation.
2. **Promotion** re-verifies that ranking, the selected candidate and the current named-reference state before creating a traceable master and performing one compare-and-swap reference update.

A high score is evidence, not authority. A model-assisted identity score is also evidence, not authority.

## Selection input boundary

A selection request declares:

- two to 32 immutable candidate artifact ids;
- one immutable reference artifact id;
- the semantic reference role;
- optional external model-evidence artifact ids;
- one named selection profile or a complete custom policy;
- automatic-selection posture;
- deterministic metric weights and blocking thresholds;
- required external-evidence kinds and thresholds;
- maximum translation and edge-distance search limits;
- minimum overall score and winner margin.

The default candidate role is `provider-candidate-alpha-master`. A candidate must remain:

- `storageClass=intermediate`;
- `approvalState=unapproved`;
- `qualityState=passed` when the policy requires technical QA;
- outside any final-delivery role;
- traceable through immutable source lineage to the declared reference when lineage locking is enabled.

Missing lineage, invalid artifact state, hash failure, dimension mismatch and a failed blocking threshold are hard failures. They are not compensated by a high score elsewhere.

## Deterministic image evidence

Every candidate and reference is decoded through Sharp with bounded input bytes, decoded pixels and page count. Selection records encoded-content and decoded-RGBA hashes before measuring:

- **Silhouette IoU** after a bounded translation search.
- **Silhouette Dice** for a second overlap view.
- **Symmetric edge similarity** using candidate-to-reference and reference-to-candidate distance transforms.
- **Visible-area similarity** to catch proportion or scale drift.
- **Alpha-weighted centroid similarity** to catch anchor and ground-position drift.
- **Visible-bounds aspect similarity** to catch compressed or stretched silhouettes.
- **Palette similarity** using a normalised three-dimensional RGB histogram.
- **Luminance similarity** using normalised value-group distributions.
- **Edge-orientation similarity** using Sobel-gradient orientation bins.
- **Overlap-colour similarity** over aligned visible pixels.

The translation search is bounded by policy. It corrects small registration differences before scoring but cannot excuse a substantially displaced or redesigned asset.

The rank order is deterministic:

1. candidates passing every hard gate;
2. total weighted score, descending;
3. immutable artifact id, ascending, as the final tie-break.

## Selection profiles

Built-in profiles supply initial metric and model-evidence policies:

- `sprite-identity` prioritises silhouette, palette, edge structure and identity evidence;
- `sprite-motion` permits pose change while retaining scale, palette, anchors and identity evidence;
- `environment` emphasises palette, luminance, edge structure, style and perceptual evidence;
- `ui` uses strict silhouette, bounds, anchor, palette and edge thresholds;
- `custom` requires every metric and external-evidence rule to be declared explicitly.

Projects may tune thresholds from real approved fixture families. Threshold changes belong in the selection request and therefore alter the request SHA-256 and resulting evidence.

## Model-assisted evidence

External evidence can cover:

- identity similarity;
- costume similarity;
- equipment similarity;
- pose similarity;
- style similarity;
- perceptual similarity.

Each record is a separate immutable `selection-model-evidence` JSON artifact bound to:

- one candidate artifact id;
- one reference artifact id;
- one evidence kind;
- a score from zero to one;
- model name and version;
- model-file SHA-256;
- preprocessing-contract SHA-256;
- generation timestamp;
- optional runtime and diagnostic details.

Only one record of a given evidence kind may target one candidate in a selection. The candidate and reference bindings must match the selection exactly.

A policy can make evidence:

- required for every decision;
- blocking when present but below threshold;
- required only for automatic selection;
- weighted but non-blocking.

This permits deterministic review today while leaving identity, pose or perceptual workers as explicit versioned extensions. Missing automatic-only evidence produces `review-required`; it does not silently score as a pass.

## Decisions

Selection produces one of three outcomes:

### `selected`

The recommended candidate:

- passes every hard gate;
- meets the minimum total score;
- beats the next eligible candidate by at least the required margin;
- has every automatic-only model-evidence condition satisfied;
- was evaluated under a policy that explicitly permits automatic selection.

### `review-required`

At least one candidate is hard-gate eligible, but automatic selection is not justified. Common causes include:

- a tied or narrow winner margin;
- absent automatic-only identity or style evidence;
- automatic selection disabled by policy;
- a total score below the automatic threshold while hard gates still pass.

### `rejected`

No candidate passes every hard gate. Human approval cannot override this outcome.

## Selection evidence artifact

The selector writes one immutable `candidate-selection-evidence` artifact containing:

- normalised policy and request SHA-256;
- reference descriptor and content hashes;
- complete candidate ranking;
- alignment offsets;
- every deterministic metric reading and threshold;
- every model-evidence reading and model provenance;
- all hard-gate violations;
- overall scores;
- winner margin;
- decision and recommended candidate;
- promotion eligibility;
- source-artifact lineage.

Selection does not create a master and does not update a named reference.

## Promotion boundary

Promotion requires:

- the exact selection-evidence artifact id;
- the exact recommended candidate artifact id;
- a target reference namespace and name;
- the expected current reference generation;
- the expected current artifact id when the generation is greater than zero;
- automatic or named-human approval;
- an actor label.

The promoter re-verifies:

- selection-evidence descriptor and content hashes;
- selection-evidence body and descriptor binding;
- candidate inclusion in selection source lineage;
- reference inclusion in selection source lineage;
- top-ranked-candidate equality;
- every hard gate and violation list;
- candidate descriptor and content hashes against the ranking;
- candidate role, unapproved state and QA state;
- current named-reference generation and artifact id.

### Automatic approval

Automatic promotion requires a `selected` decision, `promotionEligible=true`, exact selected-candidate equality and complete automatic evidence.

### Human approval

A named human may resolve `review-required` only for the recommended hard-gate-eligible candidate. The approval record requires an approver and reason. Human approval cannot:

- promote a `rejected` selection;
- choose a lower-ranked candidate;
- waive a blocking failure;
- replace a stale named reference.

## Promotion transaction

A successful promoter:

1. creates a `selected-art-master` descriptor over the verified candidate bytes;
2. links the master to candidate, selection evidence and selection reference;
3. writes immutable `candidate-promotion-authorization` evidence;
4. performs one compare-and-swap named-reference update;
5. verifies that the returned reference exactly matches the authorised generation, artifact, timestamp and actor.

The named reference is the authoritative approved pointer. The selected master retains `finalDeliverable=false`; later packaging and release gates remain separate.

If compare-and-swap fails, the selected master and authorization evidence remain immutable diagnostic records, but the stale transaction does not become approved.

## Runtime jobs

Selection job:

```text
queue: selection
kind: art.candidate.select
capabilities:
  selection.compare
  evidence.bundle
```

Promotion job:

```text
queue: selection
kind: art.candidate.promote
capabilities:
  selection.promote
  artifacts.store
  evidence.bundle
```

Every candidate, reference and model-evidence artifact must be declared in the selection job `inputArtifacts`. Selection evidence and the selected candidate must be declared in promotion `inputArtifacts`.

Every successful runtime job also writes the standard runtime-result evidence artifact, so selection normally produces two job outputs and promotion normally produces three.

## CLI

```powershell
pnpm art -- selection-protocol
pnpm art -- selection-validate --input .\selection.json
pnpm art -- selection-compile --input .\selection.json --output .\selection-job.json
pnpm art -- selection-run --input .\selection.json --artifact-root .\.art-studio\artifacts

pnpm art -- promotion-validate --input .\promotion.json
pnpm art -- promotion-compile --input .\promotion.json --output .\promotion-job.json
pnpm art -- promotion-run --input .\promotion.json --artifact-root .\.art-studio\artifacts
```

`selection-run` and `promotion-run` are deliberate local commands. REST and MCP compile the same durable jobs but do not decode candidate pixels or mutate an approved reference inside the request handler.

## API and MCP

REST contract routes:

```text
GET  /v1/selection-protocol
POST /v1/selections/validate
POST /v1/selections/compile
POST /v1/promotions/validate
POST /v1/promotions/compile
```

MCP tools:

```text
candidate_selection_protocol
validate_candidate_selection
compile_candidate_selection_job
validate_candidate_promotion
compile_candidate_promotion_job
```

The selection REST extension is documented in `apps/api/openapi.selection.yaml`. Runtime submission and job inspection continue through the authenticated runtime API.

## Remaining model-assisted work

The deterministic selector is operational. Additional worker slices remain for:

- versioned DINO or equivalent identity and style embeddings;
- independently validated perceptual models;
- pose and equipment-specific evidence;
- family and sequence-level drift evidence;
- browser visual comparison and named-human approval UX;
- production threshold calibration against approved project fixtures.

Those workers must emit the immutable external-evidence contract. They do not receive direct promotion authority.
