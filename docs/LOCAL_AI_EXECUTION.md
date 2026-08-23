# Governed Local AI Execution

Art Studio participates in the EVAVO Local AI Estate as the visual-art specialist authority. Model governance belongs to Model Lab, model bytes/hydration to Local Storage, physical execution to Local Compute, and durable evidence to Storage.

## Admitted workloads

- `text`: local Qwen reasoning for art direction, prompt refinement, critique, composition planning, reference analysis and production decisions.
- `image`: governed local image generation/editing, segmentation, matting and restoration workflows.
- `video`: supporting motion/animation candidate generation where Art Studio is an admitted consumer.
- `training`: reviewed visual/media training through the shared Model Lab + Local Compute boundary.

The source contracts are `config/local-ai-client-v1.json` and `config/local-ai-execution-v1.json`.

## Execution truth

Text reasoning uses `evavo-local-compute-consumer-infer` followed by receipt-bound `evavo-local-compute-model-infer`. Image and video workloads use the corresponding Local Compute planners and bounded execution surfaces.

Remote fallback and execution-time model pulls are forbidden. Specialist workloads require resource admission and all local inference/generation requires a physical receipt before execution may be claimed.

Local Compute does not grant creative approval, publication or client-release authority. Generated imagery remains candidate material until Art Studio review and finishing gates pass.
