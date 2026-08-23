# Governed Local AI Execution

Art Studio participates in the EVAVO Local AI Estate as the visual-art specialist authority. Model governance belongs to Model Lab, model bytes and hydration to Local Storage, physical execution to Local Compute, and durable evidence to Storage.

## Admitted workloads

- `text`: private local reasoning for art direction, prompt refinement, critique, composition planning, reference analysis and production decisions.
- `image`: governed local image generation/editing, segmentation, matting, restoration and related visual-model work.
- `video`: supporting motion/animation candidate generation where Art Studio is an admitted consumer.
- `training`: reviewed visual/media training through the shared Model Lab + Local Compute boundary.

The source contracts are `config/local-ai-client-v1.json` and `config/local-ai-execution-v1.json`.

## Execution paths

- Text: `evavo-local-compute-consumer-infer` -> `evavo-local-compute-model-infer` using the text/Ollama Model Lab consumer admission.
- Image: `evavo-local-compute-image-ai` v2 -> resource-admitted `evavo-local-compute ai-submit`.
- Video: `evavo-local-compute-video-campaign` with digest-bound repository/workflow execution and technical acceptance.
- Training: governed Local Compute AI/training jobs after explicit Model Lab and resource admission.

Image v2 does not accept a caller-asserted model size or model identity. Submission readiness requires a byte-pinned `evavo-creative-model-consumer-admission-v1` issued by Model Lab 0.20+, a matching reviewed Art Studio/image route, and a physically present model artifact under a governed Local Storage hotset, configured EVAVO model root, or mounted BeeStation model root. Single-file artifacts are SHA-256 verified directly; multi-file models use a self-hashed bundle manifest whose constituent files, byte lengths and SHA-256 values are all rechecked. The actual verified bytes determine the resource-admission model size.

Image workers are Python argv only, must be an existing repository-relative `.py` file in the canonical `evavo-art-studio` repository, cannot use inline/module Python, and cannot supply proxy or credential-like environment values. Local Compute SHA-binds the worker at planning and rechecks both the worker and creative model admission/artifact after acquiring the accelerator lease immediately before launch. The physical receipt records those verified identities.

## Strict-local policy

Creative local-AI workloads declare `privacyMode=strict-local` and `networkPolicy=loopback-and-local-files-only`. Model bytes must already be local before execution; provider-native network access, telemetry egress, execution-time model pulls and remote fallback are prohibited. Local Compute injects offline/telemetry-disabled process flags into generic AI child jobs.

This is process- and contract-level defense in depth, not a claim that the host OS firewall or a network namespace was observed. Source readiness proves contracts, routing and governance metadata; it does not prove model hydration, worker availability or execution. Only a fresh Local Compute execution receipt proves that a run occurred.

Local Compute does not grant creative approval, publication or client-release authority. Generated imagery remains candidate material until Art Studio review and finishing gates pass.
