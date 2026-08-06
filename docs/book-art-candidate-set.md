# Book Art Candidate-Set Production

The production contract is:

`evavo_book_art_candidate_set_production_v1`

The provider runtime contract is:

`evavo_book_art_candidate_set_provider_runtime_v1`

## Why this exists

The original Book Art wrapper intentionally generated one governed candidate at a time. Docs Suite's creative-quality gate now requires a real set of alternatives so generic stock imagery, template compositions and near-duplicate variations cannot pass merely because a provider returned a technically valid file.

This additive path preserves the original one-candidate work order as immutable source evidence and derives a candidate-set work order from it. It does not weaken or silently reinterpret the earlier contract.

## Production boundary

A candidate-set work order requests 3 to 8 alternatives, defaulting to 4. The provider worker receives one standard `art.candidate.generate` job with `candidateCount` set to the exact required number. The existing provider orchestrator already rejects partial output counts, so a provider returning three files for a four-file request fails the job rather than creating an incomplete review set.

The entire set uses one provider attempt, one allow-listed adapter and no fallback. An ambiguous result is not automatically retried. Every output remains an unapproved intermediate artifact. The provider prompt explicitly requires separate non-template alternatives with materially different concepts, compositions, silhouettes, focal hierarchies and negative-space strategies; palette swaps, crop changes, camera nudges, prop substitutions and seed-only variations are prohibited.

The consensus request carries the exact governed candidate count. Reviewing only a convenient subset is a blocking error even when the submitted subset is otherwise technically valid.

## Quality boundary

Before Docs Suite can run its independent creative-quality gate:

1. Every candidate must pass technical and print-craft QA.
2. Every candidate must reach independent visual consensus.
3. Every candidate must retain at least two manuscript-specific evidence anchors.
4. Concept, composition and silhouette decisions must be distinct.
5. Every unordered candidate pair must have one canonical comparison.
6. Overall, concept, composition and silhouette similarity must each remain below 9,200 basis points.
7. The set reviewer must be human or human with machine assistance and cannot be a candidate producer.
8. Machine-only approval is prohibited.

The set-level operation returns only `ready_for_docs_quality_gate`. It cannot select a candidate, promote Art, create a Book-use binding or publish anything. Downstream validation replays the complete semantic gate from the retained candidate and pairwise evidence, so a modified result cannot become valid merely by recomputing its SHA-256 fingerprint.

## Runtime use

Compile the governed base work order with `compileBookArtProductionWorkOrder`, then call `compileBookArtCandidateSetWorkOrder`. Submit the resulting work order through `compileBookArtCandidateSetProviderJob` or `submitBookArtCandidateSetProviderJob` from `@evavo/art-book-runtime/candidate-set`.

The worker continues to use the existing provider request protocol and `art.candidate.generate` execution kind, so no second image backend or untested queue is introduced.
