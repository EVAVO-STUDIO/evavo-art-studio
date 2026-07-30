# Repaired family revision selection bridge

The revision selection bridge converts two or more fully verified repaired-family revisions into one ordinary candidate-selection request. It does not compare images, select a winner, create a master or update an approved reference.

## Required evidence

Every input must be immutable `repaired-family-revision-evidence` with:

- `qualityState=passed` and `approvalState=evidence-only`;
- a passed replacement-frame quality report;
- a quality-passed, unapproved `repaired-family-quality-candidate`;
- a manifest-bound revised family verification whose complete layered-family gates passed;
- the exact source manifest, repair packet, execution evidence, restored candidate, revised manifest, family evidence and generated composites in artifact lineage.

All revisions in one bridge must describe the same repair ID, family ID, source manifest, original source layer, layer role, source policy and impacted frame set. Candidate artifacts must be distinct.

## Output

The bridge stores immutable `repaired-family-selection-bridge-evidence` and returns a compiled `art.candidate.select` job. The compiled selection request derives:

- candidate IDs from each revision's quality-passed replacement layer;
- the reference ID from the single original source layer declared by every replacement;
- revision and full-family evidence IDs from immutable artifacts;
- `requireReferenceLineage=true`;
- `requireQualityPassed=true`;
- `allowedCandidateRoles=["repaired-family-quality-candidate"]`.

Callers may choose a selection profile, metrics, external-evidence policy and automatic-selection preference, but cannot weaken candidate state, role or reference-lineage requirements.

## Durable job

```json
{
  "queue": "selection",
  "kind": "art.repair.prepare-revision-selection",
  "requiredCapabilities": [
    "repair.revision-selection",
    "artifacts.store",
    "evidence.bundle"
  ]
}
```

The bridge worker produces evidence and a later selection job contract only. Actual ranking still requires `selection.compare`. Promotion remains a separate `art.candidate.promote` compare-and-swap transaction.

## Non-approval boundary

The bridge never:

- invokes a provider;
- decodes candidates for ranking;
- runs selection;
- marks a candidate selected;
- creates a selected master;
- updates a named artifact reference;
- marks any output final.
