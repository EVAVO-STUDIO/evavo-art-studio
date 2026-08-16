# Artist automation capability map

This map keeps the EVAVO art repositories complementary. Art Studio owns governed 2D source work, image/provider orchestration, alpha mastering, sequences and packed delivery derivatives. Model-backed background removal, segmentation, high-resolution matting, restoration and upscale execute through the shared manifest-bound `image-finishing` environment (`evavo-model-lab` plans, `evavo-local-compute` executes and `evavo-local-storage` owns model/output placement). `evavo-3d-studio` owns mesh, UV, topology, material and 3D delivery work. A target game or renderer owns live lighting, collision, tile terrain semantics and final runtime integration.

The goal is broad automation with evidence, not a claim that one unattended filter can make every creative decision a senior Photoshop, Illustrator, After Effects, Blender or engine artist would make.

## Current routing

| Need | Owning route | What is automated | What still blocks release |
|---|---|---|---|
| real transparency and fake-checker prevention | Art Studio transparency admission | decoded alpha/grid/matte classification, connected extraction, unmixing, decontamination, proofs and exact evidence | ambiguous ownership, bad edges or creative silhouette |
| natural-scene background removal | shared `image-finishing` route using governed `image-segmentation` / `image-matting` slots, then Art Studio mask/mastering | exact reviewed-model manifests, pinned soft-mask ingestion, protect/remove constraints and deterministic edge refinement; no silent model download | model uncertainty, hair/fur/glass/smoke and full-resolution review |
| crop, copy, paste and masked multi-image assembly | Project Art `image-composite.sourceRect` / `maskSourceRect` | exact source/mask rectangles, resize, sampling, opacity and blend modes | visual composition and identity correctness |
| video and animation reference context | Project Art `video-frame-extract` and persistent workspace | exact timestamps, first-video-stream decode, binary hashes, PNG identities, versions and manifests | reference choice, copyright/provenance and creative use |
| matching frames and edits | provider-neutral reference plans | up to 16 role-specific exact references; OpenAI edit/reference input fidelity is explicitly high | provider result remains unapproved; continuity review is mandatory |
| 2D finishing | Project Art image/master tasks | geometry, tonal work, curves, filters, alpha repair, outlines, shadows, glows and directional rim light | project style and runtime-scale review |
| 2D lighting textures | Project Art `normal-map-from-height` | bounded draft normal map from alpha/luminance | hand-authored normals where material planes matter; live light belongs in engine |
| sprite sheets and atlases | Project Art sheet tasks and deterministic MaxRects atlas | strict per-frame alpha admission, no rotation, trim metadata, transparent padding, extrusion, hashes and EVAVO/TexturePacker/Phaser/Godot metadata | individual frame approval, pivot/timing review and target-engine integration |
| tiles and tile atlases | Art Studio for tile artwork/atlas; target engine for terrain rules | exact grid/atlas packaging and source evidence | adjacency grammar, autotile terrain sets, collision and gameplay map design |
| keyframed 2D compositing | Project Art `motion-sequence` | layers, masks, anchors, easing, blend modes, motion blur, PNG/GIF evidence | pose redraw, cloth/anatomy changes and creative timing |
| UVs, repair and retopology | `evavo-3d-studio` | Blender-governed repair, topology/UV measurement, retopology/decimation plans and receipts | silhouette/deformation review and asset-specific UV intent |
| LOD and web/game mesh optimization | `evavo-3d-studio` | budgeted LODs, glTF/GLB validation, meshopt/gltfpack/glTF-Transform/KTX routes | camera-distance quality, rig deformation and target performance |
| 3D texture generation and baking | `evavo-3d-studio` | layered OpenPBR/MaterialX-oriented texture/bake evidence and delivery validation | material art direction, seam review and renderer parity |
| live 2D/3D lighting | game/renderer repository | engine lights, normal/specular textures, occluders, shadows and performance settings | scene-specific look, gameplay readability and device tests |

## One workspace, many exact sources

The persistent Artist Workspace is the common work area:

```text
sources/   immutable originals, reference images and source clips
working/   editable image/layer candidates
versions/  append-only exact revisions
masks/     protect, remove, selection, alpha and semantic masks
scratch/   extracted frames and experiments
review/    comparisons, contact sheets, onion skins and proofs
masters/   technically mastered candidates
exports/   reviewed delivery derivatives
```

Chat agents should exchange paths, hashes, roles and receipts, not embed the visual history in prose. An operation that uses five images binds those exact five images. An animation repair binds the canonical identity and the actual neighbouring frames. A crop/paste records the exact source rectangle and optional mask rectangle. A video extraction records the exact clip hash, timestamps and decoder binaries.

## Automation sequence

1. Admit immutable source bytes and classify provenance/media.
2. Select full-resolution role-specific references.
3. Generate one bounded candidate/layer or run one deterministic edit plan.
4. Preserve the result as an unapproved working version.
5. Run alpha, geometry, colour, continuity and hostile-background evidence.
6. Perform targeted correction with exact masks, rectangles or operations.
7. Repeat technical checks and full-resolution/actual-scale creative review.
8. Master individual frames or textures.
9. Build sheets, atlases, tile atlases, motion previews or 3D delivery derivatives only from retained masters.
10. Hand the exact package to the separately governed target-repository/runtime boundary.

Fully automatic mechanical stages may run unattended when their input contract is exact. Ambiguous segmentation, identity drift, topology deformation, UV seam placement, animation timing and final lighting remain explicit review points; the system records blockers instead of inventing confidence.

## Upstream technical references

The repository-specific shared-model contract is documented in [`evavo-ai-integration.md`](./evavo-ai-integration.md); this file does not duplicate that execution stack.

- [OpenAI image generation and editing](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI multiple image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [FFmpeg filters and media processing](https://ffmpeg.org/ffmpeg-filters.html)
- [Segment Anything 2](https://github.com/facebookresearch/sam2)
- [BiRefNet](https://github.com/zhengpeng7/birefnet)
- [Godot 2D lights and shadows](https://docs.godotengine.org/en/latest/tutorials/2d/2d_lights_and_shadows.html)
- [Godot `CanvasTexture`](https://docs.godotengine.org/en/stable/classes/class_canvastexture.html)
- [Godot `TileSetAtlasSource`](https://docs.godotengine.org/en/stable/classes/class_tilesetatlassource.html)
- [Blender Decimate modifier API](https://docs.blender.org/api/current/bpy.types.DecimateModifier.html)
- [glTF Transform](https://gltf-transform.dev/)
