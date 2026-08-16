# EVAVO AI integration

Art Studio consumes the shared EVAVO creative-AI platform; it does not own a second ML stack. `evavo-model-lab` plans datasets, training and evaluation, `evavo-local-compute` executes bounded GPU work, and `evavo-local-storage` owns model, dataset and output placement.

The shared `image-finishing` environment adds governed background removal, segmentation, high-resolution matting, resize/crop/convert/optimise, restoration/upscale, ICC-aware conversion, metadata cleaning and compositing. BiRefNet Dynamic/HR Matting, SAM 2.1 and Real-ESRGAN remain exact manifest-bound model assets on BeeStation; package installation does not download weights. Deterministic work uses ImageMagick/ExifTool/Pillow. JPEG flattening requires an explicit background and every matte still needs 100-percent/destination-size halo, spill, hair, fur, glass, hole and semi-transparent-material review.

## Local image and video lanes

Use `evavo-model-lab studio-plan --studio art-studio --vram-gib 12` before choosing a trainer or model route. The governed local video lane supports realistic, cinematic, stylized and cel-oriented image-to-video work, plus first/last-frame and control-guided generation for loops. A 12 GB machine should use the platform's reviewed ComfyUI/offload routes where the direct upstream runtime requires more memory; a planner result is a capability and preflight decision, never a claim that weights are installed.

Reference animation should normally use restrained motion: keep the camera, composition, silhouette, perspective and static geometry locked while animating only explicitly selected regions such as fog, rain, water, reflections, smoke, cloth or light. Every reference is identified by a reviewed content digest. RAW_ART remains immutable and is never silently replaced or rewritten by generated output.

Seamless loops use first/last-frame conditioning when the selected source supports it. Reject a loop that merely duplicates its terminal frame. Review at least three repeated cycles and run boundary optical-flow, flicker, geometry-drift and reference-adherence checks before accepting it.

## Training and fine-tuning

The practical local still-image lane is SDXL DreamBooth/LoRA with memory preflight. Video fine-tuning is source-specific: LTX-2 LoRA/IC-LoRA and the documented VideoX-Fun Wan 2.1 LoRA route are supported planning lanes; Wan 2.2 and FramePack adapter routes through `musubi-tuner` remain explicitly unofficial until pinned and validated. Larger-GPU routes stay queued rather than being presented as safe laptop jobs. Foundation-model training from scratch is not a local-laptop workflow.

Datasets must carry rights and provenance manifests, use semantic split-leakage checks, and remain in canonical storage. Model weights, datasets, checkpoints and generated media never belong in this repository, and source audit/provisioning does not silently download them.

## Acceptance boundary

A generated image, mask, control map, adapter or video remains a candidate asset until the existing Art Studio style, transparency, composition, temporal and delivery QA passes. AI video augments the governed asset workflow; it is not an independent frame-sequence replacement path and cannot bypass the existing RAW_ART workshop or human approval boundary.
