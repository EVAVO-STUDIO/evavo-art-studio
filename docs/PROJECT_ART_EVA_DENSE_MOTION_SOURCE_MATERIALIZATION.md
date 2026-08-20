# Project Art EVA dense-motion source materialization

## Status

EVA’s final dense-motion programme requires ten new deterministic masters. The raw source family already exists in Avatar Runtime, but source existence is not the same as a governed production workspace.

This surface closes that gap. It copies the exact ten pinned Runtime PNGs into the per-frame Art Studio workspace, records immutable source identity and technical inspection evidence, and then stops. It does not generate art, repair a frame, approve a candidate, publish media, release a sequence or activate the website.

Real production readiness remains fail-closed.

## Exact source set

The campaign is bound to the v2 ten-master programme and requires ordinals:

`1, 2, 3, 4, 5, 6, 7, 8, 9, 10`

Ordinals `4`, `5`, and `6` are included because the current three-frame Runtime masters are only temporary fallback assets. They cannot satisfy the final ten-master gate and must be remastered from the exact source family alongside the other seven frames.

## Safety and integrity

Before the first workspace write, the campaign reads and verifies all ten sources:

1. the path must remain inside the real Avatar Runtime checkout;
2. the file must be a regular, non-symlink, single-link file;
3. Git blob SHA-1 must match the exact ten-master job;
4. SHA-256 and byte length are recorded;
5. the PNG must fully decode at exactly `1024 × 1536`;
6. header encoding and pixel statistics are recorded;
7. no source file is changed.

A failure on frame ten therefore blocks frame one from being materialized.

## Workspace outputs

For each frame the campaign creates, without overwrite:

- `<frame-root>/source.png`
- the existing `source.inspection.json` job output
- the existing `source.materialization.json` job output

After all ten frames are present, it creates:

- `<output-root>/source-materialization.campaign.json`

Every JSON record is self-hashed and bound to the ten-master programme, job, ordinal, source path, Git blob identity, SHA-256, materialized path and campaign protocol version.

## Resume and replay

Resume is allowed only at a complete frame boundary.

If a frame contains only some of its source copy, inspection or materialization evidence, the frame is quarantined and the campaign fails closed. It does not guess whether an interrupted write is trustworthy.

A completed-campaign replay re-reads all ten Runtime sources, re-verifies all ten workspace copies and re-hashes all frame receipts. Modified source bytes, modified workspace bytes or modified semantic evidence invalidate replay.

## CLI

Preflight performs the complete ten-source read and validation without writing:

```text
node scripts/run-project-art-eva-dense-motion-source-materialization.mjs preflight \
  --program <absolute-ten-master-program.json> \
  --runtime-root <absolute-evavo-avatar-runtime-checkout> \
  --workspace-root <absolute-art-studio-workspace-root> \
  --materialized-at <canonical-ISO-8601-UTC>
```

Execution uses the same exact inputs:

```text
node scripts/run-project-art-eva-dense-motion-source-materialization.mjs run \
  --program <absolute-ten-master-program.json> \
  --runtime-root <absolute-evavo-avatar-runtime-checkout> \
  --workspace-root <absolute-art-studio-workspace-root> \
  --materialized-at <canonical-ISO-8601-UTC>
```

The CLI has no provider, repair, approval, upload, publication, deployment or Runtime activation flags.

## Authority boundary

Allowed:

- read exact Avatar Runtime source files;
- create exact source copies and evidence inside the chosen workspace;
- verify completed evidence.

Not allowed:

- mutate Runtime sources;
- generate or repair candidate art;
- approve candidates;
- author alpha mattes;
- master frames;
- upload to Cloudinary;
- release sequences;
- commit or push repositories;
- deploy or activate the website.

## Next production stage

A successful real source-materialization campaign establishes only that the correct source bytes are safely staged.

The next governed stage must:

1. generate or repair a source-space dense candidate for each of the ten frames;
2. review every candidate with at least two independent inspectors at confidence `>= 0.95`;
3. repair or regenerate failed frames;
4. author and independently review the alpha matte for each accepted frame;
5. run the already-merged deterministic ten-frame mastering campaign;
6. complete technical, creative, continuity, loop-closure, immutable publication, Runtime evidence and browser verification gates.

Until those stages are complete, EVA must remain on the quality-first fallback and must not be described as having complete production animation.
