# HEAVY METAL FIGHTING — atlas-v3 game validation admission

Status: read-only cross-repository evidence admission  
Source evidence: `steel-dominion.hmf-atlas-v3-local-validation.v1`  
Target mutation: prohibited

## Purpose

The `steel-dominion` atlas-v3 runtime-cutover branch already contains a local, no-cost Godot 4.6.2 validation gate. That gate executes six focused suites and writes one machine-readable receipt outside the game repository.

This Art Studio boundary does **not** run those suites and does not treat an old GitHub red check as game-test evidence. It accepts the completed local receipt as untrusted bytes, validates its complete contract, binds it to one explicitly expected `steel-dominion` commit, and emits a deterministic self-hashed Art Studio admission record.

```text
steel-dominion local validation receipt bytes
        ↓
exact raw-byte ownership + SHA-256
        ↓
closed JSON receipt contract
        ↓
expected steel-dominion HEAD binding
        ↓
Godot 4.6.2 proof
        ↓
exact six-suite pass evidence
        ↓
clean tree before + after
        ↓
self-hashed Art Studio admission
```

No game repository access or mutation is performed by this boundary.

## Required source receipt

The source receipt schema must be exactly:

```text
steel-dominion.hmf-atlas-v3-local-validation.v1
```

It must report:

- `status = passed`;
- repository `EVAVO-STUDIO/steel-dominion`;
- public title `HEAVY METAL FIGHTING`;
- one lowercase 40-character Git HEAD exactly equal to the operator-supplied expected game HEAD;
- a Godot version beginning with `4.6.2`;
- a valid overall UTC validation window and matching duration;
- exactly six completed suite records;
- a clean source tree before and after execution;
- `github_actions_required = false`;
- `image_generation = false`;
- no retained error.

The input bytes may contain the UTF-8 BOM emitted by Windows PowerShell 5.1. The BOM is accepted for parsing but remains part of the source-byte SHA-256 identity.

## Required suites

The six suites must appear exactly once, in the execution order emitted by `run_atlas_v3_migration_validation.ps1`:

```text
atlas-v3-contract
  run_production_fighter_atlas_v3_tests.ps1

runtime-bridge
  run_production_fighter_runtime_bridge_tests.ps1

production-atlas-audit
  run_production_fighter_atlas_audit_tests.ps1

release-readiness
  run_final_asset_readiness_tests.ps1

release-preflight
  run_final_asset_preflight_tests.ps1

handoff-tooling
  run_final_asset_handoff_tooling_tests.ps1
```

Every suite must have status `passed`, no error, a chronological UTC window inside the overall validation window, and a duration matching that window.

## Input hardening

The public admission input is captured synchronously. It accepts exactly:

```text
receiptBytes
expectedGameHead
```

The input object may not be a Proxy, contain accessors, symbols, extra fields, shared-memory receipt bytes, or an oversized receipt. The receipt bytes are copied before parsing so later caller mutation cannot alter the admitted evidence.

The parsed receipt is also admitted through the existing bounded immutable JSON snapshot boundary before semantic validation.

## Output evidence

A successful call emits:

```text
evavo.heavy-metal-fighting-atlas-v3-game-validation-admission.v1
```

The admission binds:

- exact raw source-receipt byte count and SHA-256;
- canonical parsed-receipt SHA-256;
- expected and validated `steel-dominion` HEAD;
- source branch;
- Godot version;
- validation window;
- all six suite identities and windows;
- explicit successful checks;
- a closed read-only authority map;
- `admissionSha256` over the complete admission body.

The output is deterministic for the same exact receipt bytes and expected game HEAD.

## Downstream verification

A self-hash alone is not origin evidence. The exported verifier therefore does **not** accept a standalone admission object.

It requires exactly:

```text
admission
receiptBytes
expectedGameHead
```

The verifier:

1. immutably captures all three caller inputs;
2. re-admits the submitted admission through its closed self-hashed contract;
3. independently recompiles the expected admission from the exact receipt bytes and expected game HEAD;
4. requires the submitted and recomputed admission identities to match exactly.

A caller cannot alter an admission field, recompute `admissionSha256`, and have that new document verify against unchanged source bytes.

## CLI

After running the game-side local validation gate, admit its receipt from Art Studio with:

```powershell
node scripts\heavy-metal-fighting-frame-atlas-v3.mjs admit-game-validation `
  --validation-receipt C:\ValidationEvidence\hmf-atlas-v3.json `
  --expected-game-head 723b6b6954e67c08ed337fad62c5ef2e10536234
```

The command prints the self-hashed admission JSON to stdout. It does not write either repository.

## Authority boundary

The only positive capabilities are:

```text
sourceReceiptRead              true
validationEvidenceAdmission    true
```

These remain false:

```text
gameRepositoryRead
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
publication
forcePush
```

This boundary therefore cannot promote atlas files, install final-v3 art, activate the production renderer, commit to `steel-dominion`, push a branch, deploy, or publish.

A successful admission proves that the supplied receipt bytes contain the exact expected six-suite pass claim for the expected game commit. It does not authenticate who supplied the bytes and does not replace the game-side Godot execution itself.
