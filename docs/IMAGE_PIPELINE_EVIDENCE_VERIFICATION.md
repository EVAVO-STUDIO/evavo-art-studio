# Image pipeline evidence verification

Art Studio now provides native Python verifiers for the complete deterministic image evidence chain. These verifiers use the same canonical JSON and visual-feature implementations that produced the evidence, avoiding cross-language number-serialization drift.

## Verify an approved style bank

```powershell
py -3 tools/verify_image_style_reference_bank.py `
  --bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --source-root C:\GitRepos\Brass_Brine `
  --verify-source-bytes
```

The verifier checks:

- the current `evavo.executable-image-pipeline.v1` contract;
- the bank self-hash and content-derived run ID;
- the exact immutable effect boundary;
- unique source paths and unique source bytes;
- exact review hashes, approval authorities and approved traits;
- governed feature records for every reference;
- role profiles recomputed from the admitted references;
- optional current source bytes and decodability.

A style bank whose JSON was changed after compilation, whose source bytes changed, or whose aggregate profile no longer matches its references fails closed.

## Verify one processed candidate

```powershell
py -3 tools/verify_image_pipeline_evidence.py `
  --source-root C:\GitRepos\Brass_Brine `
  --candidate-root C:\EVAVO-Evidence\Brass_Brine\candidates `
  --work-order C:\EVAVO-Evidence\Brass_Brine\work-orders\london_keeper.json `
  --style-bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --processing-receipt C:\EVAVO-Evidence\Brass_Brine\receipts\london_keeper.json `
  --evaluation C:\EVAVO-Evidence\Brass_Brine\evaluations\london_keeper.json `
  --verify-source-bytes `
  --verify-pixels
```

The verifier binds and checks:

```text
exact work-order file bytes
exact style-bank file bytes
exact processing-receipt file bytes
exact candidate-evaluation file bytes
exact source path, hash and byte length
exact candidate path, hash and byte length
processing-receipt self hash
candidate-evaluation self hash
source and candidate pixel-feature evidence
immutable no-provider/no-publication authority boundary
```

A passed evaluation must contain no blockers. For a technically valid but intentionally blocked candidate, add `--allow-blocked`; this verifies the evidence chain without treating the candidate as admissible.

## Why the verifier is Python-native

Style banks and candidate evidence contain floating-point measurements. Python and JavaScript can serialize numerically equal values differently, such as `0.0` versus `0`. A JavaScript process must bind the exact evidence file SHA-256 and invoke these Python verifiers instead of attempting to reproduce the Python canonical hash.

## Permanent regression

```powershell
py -3 tools/verify_image_pipeline_evidence_contract.py
```

The fixture builds a real style bank, processes a real PNG, evaluates it, verifies every exact binding and pixel feature, then confirms that a tampered processing receipt is rejected.

## Authority boundary

Passing these checks proves technical evidence integrity only. It does not grant historical approval, creative approval, Godot runtime acceptance, source deletion, target-repository mutation or publication authority.
