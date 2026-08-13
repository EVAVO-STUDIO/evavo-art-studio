# Avatar provider frame finisher and final-frame review

This boundary consumes the exact unapproved PNG, materialization receipt and frame-finisher request produced by the avatar provider candidate materializer. It performs deterministic pixel finishing and then requires a separate named-human decision before a final frame SHA-256 can feed a dependent in-between or an avatar sequence draft.

It does not call an image provider and it does not claim that hands, anatomy, facial identity, animation meaning or timing are correct merely because a file is technically valid.

## Deterministic finishing

The finisher accepts only a stable, ordinary, single-link PNG bound to the exact materialization and finisher-request hashes. It parses the actual PNG byte stream and requires:

- a valid PNG signature, chunk order and CRC for every chunk;
- one non-animated, non-interlaced, 8-bit RGBA image;
- the exact governed canvas dimensions;
- both visible and transparent pixels;
- a complete and correctly sized decompressed pixel stream.

The only automatic pixel edit is clearing hidden RGB beneath fully transparent pixels. All visible pixels and visible RGB values, every alpha value, the canvas, visible bounds and registration must remain unchanged. The output is canonically re-encoded as PNG and inspected again before publication.

A successful finish publishes one create-only bundle:

```text
candidate-01.finished.png
candidate-01.frame-finisher.json
candidate-01.frame-review-request.json
```

The status is:

```text
frame-finished-awaiting-human-review
```

It is not an approval or promotion state.

## Named-human review

The review decision must bind the exact frame-finisher report and review request and must identify a human reviewer. An approval requires passing evidence for:

- technical integrity;
- hands and anatomy;
- face identity;
- silhouette and registration;
- adjacent-frame continuity;
- final-to-first loop closure when applicable.

The decision also binds native-scale, contact-sheet, canonical-identity and adjacent-frame evidence hashes. Loop evidence is mandatory unless the loop gate is explicitly not applicable.

The three possible outcomes are:

```text
final-frame-admitted
frame-repair-required
frame-rejected
```

Only `final-frame-admitted` records the exact finished PNG SHA-256 as eligible for use as a dependent in-between endpoint or in a sequence draft. A repair or rejection cannot feed either path.

Even an admitted frame does not grant sequence release, candidate promotion, repository mutation, Git publication, deployment or runtime activation. Those remain separate governed boundaries after sequence timing and loop closure are reviewed.

## CLI

```text
node scripts/avatar-final-pass-provider-frame-finisher-cli.mjs capabilities

node scripts/avatar-final-pass-provider-frame-finisher-cli.mjs finish \
  --workspace-root C:\EVAVO\ArtWorkspaces\eva \
  --materialization C:\EVAVO\ArtWorkspaces\eva\records\candidate-01.materialization.json \
  --finisher-request C:\EVAVO\ArtWorkspaces\eva\records\candidate-01.finisher-request.json

node scripts/avatar-final-pass-provider-frame-finisher-cli.mjs review \
  --workspace-root C:\EVAVO\ArtWorkspaces\eva \
  --finisher-report C:\EVAVO\ArtWorkspaces\eva\scratch\candidate-01.frame-finisher.json \
  --review-request C:\EVAVO\ArtWorkspaces\eva\scratch\candidate-01.frame-review-request.json \
  --decision C:\EVAVO\ArtWorkspaces\eva\reviews\candidate-01.decision.json
```

## MCP

Server:

```text
evavo-project-art-avatar-final-pass-provider-frame-finisher
```

Tools:

```text
evavo_art_avatar_final_pass_provider_frame_finisher_capabilities
evavo_art_finish_avatar_final_pass_provider_candidate
evavo_art_review_avatar_final_pass_provider_frame
```

Configuration:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE
```

Writes are disabled by default. MCP carries bounded paths, hashes, status and evidence records; image bytes do not pass through the language-model context.

## Authority boundary

The finisher does not perform visible artistic retouching, anatomy repair or image generation. A frame that still has malformed hands, fingers, anatomy, identity drift, crop problems or continuity problems must receive `frame-repair-required` and return to a fresh explicitly authorized provider or artist repair pass.

No operation in this boundary authorizes sequence release or runtime activation.
