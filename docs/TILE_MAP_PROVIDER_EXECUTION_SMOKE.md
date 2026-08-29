# Tile Map provider execution smoke

This is the focused local validation path for Tile Map Studio art generation inside Art Studio. It is designed to prove the actual provider runtime, authorization, artifact and review plumbing without spending provider credits or implying creative approval.

## Static / authorization gate

```powershell
Set-Location C:\GitRepos\evavo-art-studio
.\scripts\Validate-TileMapArtPipeline.ps1
```

This builds the Art Studio domain packages, typechecks/tests the CLI surface, tests the provider package, builds the provider worker and runs the Tile Map authorization test. It does not execute an external image provider.

## Full zero-cost fixture-provider smoke

Use a real Tile Map Studio art handoff:

```powershell
Set-Location C:\GitRepos\evavo-art-studio

.\scripts\Test-TileMapArtFixturePipeline.ps1 `
  -Handoff C:\TileMapEvidence\consumer-art-handoffs-003\epochbound-verdant.json
```

The script temporarily enables only Art Studio's deterministic local `fixture-image` provider and then executes the same governed path used by a real provider:

```text
Tile Map handoff
  -> Art Studio production plan
  -> governed source package
  -> deterministic candidate batch
  -> canonical provider-runtime batch
  -> explicit expiring authorization
  -> isolated one-attempt runtime queue
  -> authorized provider worker
  -> immutable intermediate provider artifacts
  -> execution receipt verification
  -> artifact materialization at exact planned paths
  -> provider-results evidence
  -> candidate review intake
```

The fixture provider emits a deterministic PNG at the exact requested canvas. Different candidate request identities produce different fixture bytes, which lets multi-candidate review plumbing run without defeating the duplicate-byte guard.

Fixture output is deliberately test evidence only. The resulting review manifest must still report every candidate as:

```text
structural_review = pending
visual_review = pending
creative_review = pending
promotion_eligible = false
```

Do not approve or package fixture candidates as production art.

## Authorization-only first, execute later

Create and validate an authorization without making a provider call:

```powershell
.\scripts\Invoke-TileMapArtProviderPipeline.ps1 `
  -Handoff C:\TileMapEvidence\epochbound-verdant.handoff.json `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001 `
  -RuntimeRoot C:\ArtRuntime\epochbound-run-001 `
  -ArtifactRoot C:\ArtArtifacts\epochbound-run-001 `
  -AllowedAdapters @('fixture-image') `
  -AuthorizedBy 'EVAVO creative production'
```

The evidence/runtime/artifact roots are create-only and intentionally cannot be reused to create a second authorization.

If the authorization is still active, execute that exact authorization with:

```powershell
.\scripts\Resume-TileMapAuthorizedProvider.ps1 `
  -Authorization C:\ArtEvidence\epochbound-run-001\05-provider-authorization.json `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001 `
  -Concurrency 1
```

The resume workflow revalidates the active authorization before making a provider call, runs only the isolated queue, verifies retained execution evidence, materializes candidates, and creates the pending review manifest.

## Retained execution verification

A successful provider execution can be independently rechecked later:

```powershell
node .\scripts\verify-tile-map-provider-execution.mjs `
  C:\ArtEvidence\epochbound-run-001\06-provider-execution.receipt.json
```

This re-verifies the execution receipt self hash, exact authorization bytes, provider batch binding, runtime job specs/states, immutable artifact descriptors/content and the unapproved provider-candidate boundary.

## Production provider execution

For a real provider, replace `fixture-image` with an explicitly configured allowed adapter such as the governed OpenAI image adapter or an approved ComfyUI adapter. Provider credentials/configuration remain environment-owned and are never written into Tile Map evidence.

Even after successful provider execution, candidate output has no approval authority. It must still pass Art Studio structural review, visual review and explicit creative approval before Sprite Studio can receive it.
