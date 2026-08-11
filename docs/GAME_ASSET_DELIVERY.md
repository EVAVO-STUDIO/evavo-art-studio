# Exact game-asset delivery

This boundary turns already-produced, retained Art Studio files into one exact delivery bundle for Storage admission, game installation and independent Godot validation.

It does not generate artwork and it does not bypass Art Studio's existing provider, repair, alpha, selection, atlas, sprite-family, campaign or Pixel Font Studio capabilities. It joins their final bytes to one game revision, approved style profile and named-human delivery decision.

## Contracts

```text
evavo.game-asset-delivery-request.v2
evavo.game-asset-delivery-approval.v1
evavo.game-asset-delivery-bundle.v2
```

The bundle supports sprites, animation frames, sheets, atlases, pixel-font atlases and descriptors, Godot resources, metadata, editable source, shaders and audio. Every item binds an exact source path, SHA-256, byte length, semantic role and canonical game-relative target path.

## Prepare, compile and validate

```powershell
node scripts/compile-game-asset-delivery.mjs prepare `
  --draft D:\EVAVO\evidence\delivery.draft.json `
  --output D:\EVAVO\evidence\delivery.request.json

node scripts/compile-game-asset-delivery.mjs compile `
  --request D:\EVAVO\evidence\delivery.request.json `
  --output D:\EVAVO\evidence\delivery.bundle.json

node scripts/compile-game-asset-delivery.mjs validate `
  --bundle D:\EVAVO\evidence\delivery.bundle.json
```

Without a valid named-human approval, compilation succeeds as `review-required` and exits with code 3. An approved bundle requires exact creative, historical and provenance approval bound to the complete item set. Native Godot composition and publication remain separate authorities.

## Technical checks

The compiler reopens every source byte sequence and checks:

- allowed source-root confinement;
- source SHA-256 and byte length;
- unique IDs and target paths;
- complete animation frame ranges and consistent timing;
- PNG signature, CRC, dimensions and alpha policy;
- BMFont `smooth=0`, `aa=1`, one unpacked page and unique codepoints;
- safe Godot `res://` references;
- exact campaign and approved-style-profile self-hashes;
- approval equality against every item binding;
- create-only output and all-false mutation/publication authority.

The delivery bundle is evidence. It does not mutate a game checkout, write Storage, call a provider, commit, push or publish.
