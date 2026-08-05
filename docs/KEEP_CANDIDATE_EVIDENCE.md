# Immutable keep-candidate evidence

A `keep` decision means the exact reviewed source bytes already satisfy the intended role. It does **not** mean the image can bypass a production work order, style comparison or runtime validation.

The correct route is:

```text
exact source review with decision keep
→ exact image-reference work order
→ independent candidate evaluation using the source as the candidate
→ native keep-evidence verification
→ Godot Test Lab and browser review where required
→ sealed publication
```

No processing receipt is produced because no processing occurred. Inventing one would corrupt provenance.

## Evaluate the unchanged source

```powershell
py -3 tools/evaluate_image_candidate.py `
  --source-root C:\GitRepos\Brass_Brine `
  --candidate-root C:\GitRepos\Brass_Brine `
  --candidate RAW_ART\characters\london_keeper.png `
  --work-order C:\EVAVO-Evidence\Brass_Brine\work-orders\london_keeper.json `
  --style-bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --output C:\EVAVO-Evidence\Brass_Brine\evaluations\london_keeper.json
```

## Verify the keep evidence

```powershell
py -3 tools/verify_image_pipeline_evidence_v2.py `
  --source-root C:\GitRepos\Brass_Brine `
  --candidate-root C:\GitRepos\Brass_Brine `
  --work-order C:\EVAVO-Evidence\Brass_Brine\work-orders\london_keeper.json `
  --style-bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --evaluation C:\EVAVO-Evidence\Brass_Brine\evaluations\london_keeper.json `
  --verify-source-bytes `
  --verify-pixels
```

The verifier requires:

- `decision = keep`;
- candidate path and SHA-256 equal the exact source path and SHA-256;
- source and candidate resolve to the same immutable file;
- no processing receipt;
- exact work-order and style-bank file bindings;
- valid evaluation self hash;
- current source bytes and optional current pixel features;
- no blockers for admission.

Edited candidates continue to use the same v2 verifier with `--processing-receipt`. The older verifier remains compatible with processed candidates, while v2 is the canonical coordinator-facing verifier because it supports both routes.

Passing this verifier is not creative approval, historical approval, runtime acceptance or publication authority.
