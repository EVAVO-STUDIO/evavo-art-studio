# Automatic sprite finalization

Status: implemented governed foundation

Protocol: `2026-08-01.1`

Automatic sprite finalization extends the complete sprite-workflow compiler with background selection, decoded transparency proof, exact-size delivery optimization, optional 3D reference provenance, and family-level release evidence.

## Complete path

```text
verified art direction
→ complete clip / direction / frame / layer plan
→ bounded candidates
→ governed background strategy
→ alpha extraction or preservation
→ exact runtime dimensions
→ delivery optimization
→ decoded frame QA
→ deterministic candidate selection
→ compare-and-swap selected masters
→ complete layered family verification
→ finalization-ready lineage proof
→ sprite-family finalization evidence
```

A generated image is never considered finished merely because a provider returned bytes. It must pass the declared background, geometry, transparency, family, provenance, and delivery gates.

## Background policy

Supported modes:

```text
auto
native-alpha
green-matte
magenta-matte
black-additive
opaque-preserve
```

### Auto

`auto` uses the compiled art-direction target and provider allow-list.

- Opaque assets preserve an opaque source.
- Native alpha is used only when the exact preferred adapter is explicitly allow-listed after decoded-alpha verification.
- Other transparency-required assets compare the approved palette against green and magenta and choose the lower-collision matte.

The current OpenAI GPT Image adapter remains chroma-first unless a future adapter version is explicitly allow-listed for native alpha. Model names or marketing claims never bypass decoded output proof.

### Green and magenta mattes

A matte is not removed by deleting every matching colour. The mastering worker flood-fills only matte-like pixels connected to the image border, estimates antialiased edge alpha, removes colour spill, retains enclosed matching foreground colours, and preserves bounded RGB bleed beneath nearby transparent pixels.

If the border does not contain enough confident matte evidence, mastering fails rather than guessing.

### Black additive

Black is a valid authored background for additive particles, emission, glows, fire, smoke, muzzle flashes, and similar effect-owned assets. It is not a universal transparency key.

Black-additive mastering requires:

- an effect, particle, decal, or emission-owned art contract;
- a predominantly black border;
- measurable non-black effect content;
- opaque delivery and explicit additive runtime treatment.

Ordinary characters, costumes, props, and dialogue portraits cannot silently enter black-additive mode.

### Opaque preserve

Opaque preserve retains authored scene or plate colour. It does not flatten a transparent candidate against black to make the file appear complete. A supposedly opaque provider result must prove that it is already opaque.

## Fake transparency rejection

Every transparent candidate is decoded and checked for:

- a real source alpha channel;
- meaningful transparent or partially transparent pixels;
- baked checkerboards or transparency grids;
- uniform flat matte remnants;
- cropped visible bounds;
- matte-colour halos;
- unrelated RGB beneath fully transparent pixels;
- exact dimensions and PNG format.

The proof backgrounds are black, white, grey, green, and magenta by default. They are retained in evidence so review interfaces can render hostile-matte previews without changing the mastered pixels.

A checkerboard pattern, painted transparency grid, or solid fake-alpha background is always a blocking failure.

## Delivery optimization

Candidate finalization uses `@evavo/art-delivery-optimizer` after background mastering and exact-size resize.

The optimizer:

- starts from the mastered source, never from a previously compressed derivative;
- applies the selected runtime profile;
- tests deterministic encoding candidates;
- decodes every candidate again;
- measures colour and alpha error;
- selects the smallest candidate that passes the profile;
- retains immutable optimization evidence.

Supported automatic sprite profiles are:

```text
retro-standing-character-576
retro-ui-icon-256
retro-overlay-720p
godot-sprite-lossless
```

## EVAVO 3D Studio bridge

Art Studio does not depend on mutable filesystem paths or unfinished 3D Studio internals. The bridge is an immutable contract:

```text
repository
exact revision hash
render-rig artifact
camera-manifest artifact
material-reference artifact
direction render artifacts
depth render artifacts
normal render artifacts
turntable artifacts
```

The default source repository is:

```text
EVAVO-STUDIO/evavo-3d-studio
```

Direction renders become `pose-control` references. Depth renders become `depth-control` references. Materials remain `material-reference` inputs. Rig and camera artifacts remain mandatory provenance for pre-rendered 2.5D work even when they are not themselves image inputs.

Pre-rendered 2.5D production requires:

- exact repository revision;
- immutable render-rig artifact;
- immutable camera manifest;
- full authored direction coverage;
- fixed model scale, skeleton, camera, materials, lights, render settings, and reduction process.

## Family release evidence

After selected masters are reconstructed and verified as one family, the worker emits:

```text
sprite-family-finalization-evidence
```

This evidence proves:

- every selected source descends from a finalization-ready candidate;
- every declared 3D artifact still passes descriptor and content verification;
- every frame and retained layer passed family verification;
- no blocking family, frame, layer, transparency, or provenance gate failed;
- no quality threshold was relaxed;
- release-ready evidence points to the exact manifest, kernel evidence, family evidence, and generated composites.

The evidence does not deploy a project and does not replace Godot packaging or human visual acceptance when those are required.

## Interfaces

### CLI

```powershell
pnpm art -- automatic-sprite-finalization-protocol
pnpm art -- automatic-sprite-finalization-validate --input examples/automatic-sprite-finalization.json
pnpm art -- automatic-sprite-finalization-compile --input examples/automatic-sprite-finalization.json
pnpm art -- automatic-sprite-finalization-start --input examples/automatic-sprite-finalization.json
```

### REST

```text
GET  /v1/automatic-sprite-finalization-protocol
POST /v1/automatic-sprite-finalizations/validate
POST /v1/automatic-sprite-finalizations/compile
```

### MCP

```text
automatic_sprite_finalization_protocol
validate_automatic_sprite_finalization
compile_automatic_sprite_finalization
```

REST and MCP are compile-only. Provider credentials remain in the worker environment. Explicit CLI or authenticated runtime submission starts the durable root job.
