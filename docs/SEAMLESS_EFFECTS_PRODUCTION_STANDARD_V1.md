# EVAVO Seamless Effects Production Standard v1

Art Studio participates in the shared EVAVO seamless-effects pipeline. The machine-readable authority is `config/seamless-fx-capabilities-v1.json`.

## Art Studio responsibility

Art Studio owns source-art preparation and image-sequence finishing for effects: clean RGBA frames, masks, authored paintover, alpha repair, sprite slicing, atlas packing, palette control and proof outputs. It must preserve exact frame order and timing supplied by the source authority.

## Loop-aware sequence work

A loop must be inspected as a sequence, not as independent good-looking frames. Frame cleanup may not introduce changing trim, baseline, alpha halo, colour drift, centroid jumps or a boundary pop. First-to-last transition review is mandatory for loop candidates.

## Style support

FX art may be realistic, stylized, cel, pixel/retro, engraved/dither or hand-painted game VFX. Style may change edge treatment, palette, noise and frame economy, but not provenance, alpha correctness or loop QA.

## Alpha and packing

Lossless individual frames are the master. Sprite sheets and atlases are derivatives. Painted checkerboards, fake transparency, unstable matte spill and inconsistent canvas geometry are blocking. Packed outputs must retain source identities and exact frame mapping.

## Handoffs

Particle Studio supplies procedural raster sources; Cel Animation Studio supplies authored effect drawings; Texture Studio supplies masks/material fields; Atmosphere Studio consumes overlays; Video Studio consumes mastered frame sequences. Art Studio does not silently retime or regenerate neighbouring frames.
