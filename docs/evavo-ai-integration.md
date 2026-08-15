# EVAVO AI integration

Art Studio consumes the shared EVAVO creative-AI platform; it does not own a second ML stack. `evavo-model-lab` plans training/evaluation, `evavo-local-compute` executes bounded GPU work and `evavo-local-storage` owns model/dataset placement.

The practical local training lane is SDXL DreamBooth/LoRA with memory preflight. FLUX.2 Klein adapters are a higher-quality larger-GPU lane unless an upstream low-memory configuration is independently proven on the current machine. Local inference/post work may use reviewed image/edit/control/segmentation/upscale/restoration providers through the existing governed Art Studio workflow.

Use `evavo-model-lab studio-plan --studio art-studio --vram-gib 12` before choosing a trainer. A generated image, mask, control map, LoRA or video remains a candidate asset until the existing Art Studio style, transparency, composition and delivery QA passes. Model weights never belong in this repository.
