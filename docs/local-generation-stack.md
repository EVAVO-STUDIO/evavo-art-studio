# Local image and animation generation stack

Art Studio keeps its existing governed art-production and review surfaces authoritative. Local models produce candidates and edit passes; project/style profiles, exact dimensions, references and review gates determine whether anything is admitted.

## 2D foundation

FLUX.2 Klein 4B is the default local generation/editing engine because its official stack targets consumer GPUs at roughly the 8 GiB class and supports text-to-image, single-reference and multi-reference editing. Use the 4B Base variant for authorised LoRA/customisation; use the distilled variant for fast production inference.

## 1990s cel workflow

The `cel-1990s-cyberpunk` profile uses production-language traits rather than copying a named film frame-by-frame: hard ink linework, restrained cel shading, painted backgrounds, deliberate period colour design, optical/analog composite texture and controlled grain. Consistency comes from canonical character sheets, multi-reference editing, pose/layout guides, project palette locks, repeatable seeds/configuration and authorised project LoRAs.

For animation on the local GPU, prefer keyframe-first production: generate/approve key poses, create controlled inbetweens, run line/palette consistency checks and assemble with deterministic media tooling. Flagship long-video models whose documented minimum VRAM exceeds the detected machine are burst routes, not local-safe routes.

## DOS / arcade sprites

Generate source art at a workable scale, then pass it through deterministic sprite production: fixed canvas, indexed palette, no antialiasing, nearest-neighbour resampling, hard pixel-cluster cleanup, silhouette checks and sprite-sheet bounds. `dos-vga-sprite` and `arcade-1990s-fighter` are production profiles, not licence to train on unlicensed game assets.

## Training and storage

Fine-tuning uses owned/licensed/public-domain or otherwise authorised images. Preserve the base model revision, dataset manifest, captions/tags, crop policy, training environment and evaluation grid. Hot weights/cache stay on local SSD; canonical weights/datasets/outputs live on BeeStation; accepted LoRAs, workflows, evaluations and final assets are promoted to `evavo-storage`. Cold BeeStation data becomes online-only after remote attestation unless it is in the current hot set.
