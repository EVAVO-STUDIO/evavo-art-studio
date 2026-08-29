# Tile Map Studio art handoff

Art Studio accepts governed source-art requirements produced by `evavo-tile-map-studio` without taking ownership of map semantics, topology, collision, navigation, placement, or gameplay meaning.

## Command

From the Art Studio workspace:

```powershell
pnpm art -- tile-map-handoff --input C:\TileMapEvidence\consumer-art-handoffs-002\epochbound-verdant.json --output C:\ArtEvidence\epochbound-verdant.plan.json
```

The router sends `tile-map-handoff` to the dedicated file-based compiler. The input must be Tile Map Studio art-handoff schema v2 and must declare Art Studio's role as `source-art-generation-and-creative-approval`.

## Authority boundary

The compiled production plan preserves Tile Map Studio semantic rules and source IDs verbatim. Art Studio may create, compare, repair, reject and creatively approve visual candidates. It may not reinterpret terrain identity, network signatures, feature placement, collision, navigation or canonical footprints.

Every task emitted by the compiler has:

- `provider_output_authority: intermediate-only`
- `creative_approval_required: true`
- `promotion_state: blocked-pending-creative-approval`

A provider success, valid image file, successful build, or technically correct atlas can therefore never imply creative approval.

## Evidence binding

The output records the SHA-256 of the exact Tile Map Studio handoff bytes, the source map fingerprint, deterministic task IDs and a canonical production-plan fingerprint. This lets later review evidence prove which semantic contract the artwork was created against.

## Downstream handoff

Approved lossless source art should be sent to Sprite Studio for deterministic mastering and atlas packaging. Tile Map Studio then verifies Sprite Studio's manifest/build receipt and the explicit visual-family mapping before trusting atlas regions. No atlas coordinate becomes semantic authority.
