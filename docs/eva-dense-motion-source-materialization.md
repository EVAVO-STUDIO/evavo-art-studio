# EVA dense-motion source materialization

This boundary connects the immutable ten-frame EVA source family in `EVAVO-STUDIO/evavo-avatar-runtime` to the v2 ten-master workspace without pretending that copying a source is review, mastering, publication, or activation.

## What the campaign does

For all ten ordinals, before the first output write, it:

1. resolves the exact source path inside the supplied Runtime checkout;
2. requires a stable ordinary file and verifies the Git blob SHA-1 bound by the ten-master program;
3. verifies the complete PNG chunk structure, every chunk CRC, IDAT decoding, scanline filters, 8-bit RGB/RGBA encoding, non-interlaced layout, and the exact 1024×1536 canvas;
4. prepares an exact-byte `candidate.png` copy, without transcoding or transforming the image;
5. prepares self-hashed source inspection and source materialization receipts bound to the program, job, source identity, candidate identity, and output paths;
6. publishes all ten candidates, twenty per-frame receipts, and the campaign receipt as one create-only bundle.

A bad tenth source blocks frame one. Any partial output without a complete verified campaign receipt is quarantined. A completed replay re-verifies the current Runtime source bytes, the candidate bytes, and every semantic receipt before returning reused state.

## What the campaign does not do

It does not create candidate assurance, author or approve alpha mattes, master alpha, perform technical or creative review, upload to Cloudinary, release a sequence, mutate Avatar Runtime, activate the website, or commit and push repository changes.

## CLI

```text
node scripts/run-project-art-eva-dense-motion-source-materialization.mjs preflight \
  --program <absolute-ten-master-program.json> \
  --runtime-root <absolute-evavo-avatar-runtime-checkout> \
  --workspace-root <absolute-existing-workspace-root> \
  --materialized-at <canonical-iso-8601-utc>

node scripts/run-project-art-eva-dense-motion-source-materialization.mjs run \
  --program <absolute-ten-master-program.json> \
  --runtime-root <absolute-evavo-avatar-runtime-checkout> \
  --workspace-root <absolute-existing-workspace-root> \
  --materialized-at <canonical-iso-8601-utc>
```

`preflight` performs the same all-ten source checks and output-state checks as `run`, but writes nothing.
