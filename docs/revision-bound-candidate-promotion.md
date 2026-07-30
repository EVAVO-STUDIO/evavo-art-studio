# Revision-bound candidate promotion

Revision-bound promotion is the only approval path for repaired-family candidates. It requires immutable `revision-bound-candidate-selection-evidence` and delegates final authorization to the existing candidate promotion transaction.

## Input

A promotion request contains:

- one ranking evidence artifact ID;
- the exact target reference namespace and name;
- the expected current reference generation;
- the expected current approved source-layer artifact ID;
- either automatic approval or a named human approver and reason;
- an explicit runtime actor.

The request does not accept a candidate ID or ordinary selection evidence ID. Those values are derived from immutable ranking evidence.

## Verification

Before any reference mutation, the worker proves:

- ranking descriptor and content hashes are valid;
- ranking evidence is passed, evidence-only and non-final;
- labels agree with the ranking JSON body;
- bridge, selection evidence, source reference, revisions and candidates remain in ranking lineage;
- the target's expected artifact equals the approved source layer declared by ranking;
- the original candidate-selection evidence exactly matches the copy embedded in ranking evidence;
- automatic approval targets an automatically selected, promotion-eligible candidate;
- human approval targets only the highest-ranked hard-gate-eligible recommendation;
- the candidate remains a passed, unapproved, non-final repaired-family candidate.

## Lineage envelope

Before calling the existing promotion kernel, Art Studio stores a new `candidate-selection-evidence` envelope whose sources include:

- revision-bound ranking evidence;
- original candidate-selection evidence;
- revision selection bridge evidence;
- approved source-layer reference;
- every repaired family revision;
- every ranked candidate.

The selected master therefore directly references the bound selection envelope, and its transitive lineage contains the complete repair, revision and ranking history.

## Compare-and-swap update

The existing `promoteSelectedCandidate()` transaction still performs:

- hard-gate and highest-ranked-candidate enforcement;
- automatic versus named-human authorization;
- descriptor and content hash checks;
- current reference generation and artifact checks;
- selected-master creation;
- immutable authorization evidence;
- compare-and-swap reference mutation.

A stale generation or changed current artifact fails without replacing the reference.

## Durable job

```json
{
  "queue": "selection",
  "kind": "art.repair.promote-revision",
  "requiredCapabilities": [
    "repair.revision-promote",
    "selection.promote",
    "artifacts.store",
    "evidence.bundle"
  ]
}
```

## Outputs

A successful job returns:

- revision-bound candidate-selection evidence;
- selected art master;
- standard promotion authorization evidence;
- revision-bound promotion evidence;
- the updated artifact reference.

The selected master remains `finalDeliverable=false`; atlas packaging and release validation remain later gates.
