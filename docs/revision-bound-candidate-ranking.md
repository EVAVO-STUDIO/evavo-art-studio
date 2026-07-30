# Revision-bound candidate ranking

Revision-bound ranking executes the existing deterministic candidate selector only after a repaired-family selection bridge has verified every candidate revision, source layer and complete family result.

## Input

The request accepts only:

```json
{
  "schemaVersion": "1.0",
  "rankingId": "hero-body-repair-ranking",
  "bridgeEvidenceArtifactId": "artifact_<sha256>"
}
```

Candidate IDs, the reference ID, policy, external evidence, revisions and manifests are not accepted from the caller. They are read from immutable `repaired-family-selection-bridge-evidence`.

## Verification

Before ranking, the worker proves:

- the bridge descriptor and content hashes are valid;
- the bridge is passed, evidence-only and non-final;
- bridge labels match its JSON body;
- every revision, candidate, family evidence, revised manifest, external evidence and reference appears in descriptor lineage;
- the embedded selection request hash is exact;
- the embedded `art.candidate.select` job contains the complete dependency closure;
- quality, candidate-role and reference-lineage requirements remain enabled;
- candidate and reference IDs agree across the bridge, selection request and selection output.

## Output

The selector still produces its normal immutable `candidate-selection-evidence`. Art Studio additionally stores `revision-bound-candidate-selection-evidence` containing:

- the bridge and revision IDs;
- source manifest and approved source-layer reference;
- candidate IDs;
- selection evidence ID;
- complete ranking entries;
- decision, winner margin and promotion eligibility;
- the original selection evidence body.

Both artifacts remain evidence-only. A selected decision does not create a master or update a reference.

## Durable job

```json
{
  "queue": "selection",
  "kind": "art.repair.rank-revisions",
  "requiredCapabilities": [
    "repair.revision-ranking",
    "selection.compare",
    "artifacts.store",
    "evidence.bundle"
  ]
}
```

Promotion remains a separate authenticated compare-and-swap transaction. A subsequent promotion guard should require this revision-bound evidence in addition to the standard candidate-selection evidence.
