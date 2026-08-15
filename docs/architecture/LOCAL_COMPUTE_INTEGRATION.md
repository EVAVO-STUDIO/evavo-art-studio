# Local Compute integration

Art Studio remains the art-production authority. Shared local GPU/runtime execution is delegated to `evavo-local-compute`; training/evaluation datasets and adapters are delegated to `evavo-model-lab`.

Art Studio owns briefs, references, prompt compilation, ComfyUI workflow identities, candidate selection, alpha mastering, animation continuity, technical QA and promotion. Local Compute owns GPU admission, ComfyUI/runtime health, model-cache staging, sandboxing, process execution and worker lifecycle. Model Lab owns dataset manifests, LoRA/adapters, held-out evaluations and model promotion evidence.

Large base models and reusable datasets live canonically on BeeStation/EVAVO Local Storage and are staged to local SSD only while hot. Final LoRAs, evaluation evidence, workflow/model hashes and approved release artifacts are promoted to immutable EVAVO Storage.

A generation worker may never approve its own candidate. Every GPU-produced result returns exact runtime/model/workflow/input/output hashes and resource evidence to Art Studio for ranking and QA.
