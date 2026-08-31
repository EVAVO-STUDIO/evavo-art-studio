<!-- EVAVO:ANIMATION_EXECUTION_SUPERVISOR_V1:START -->
## Governed animation execution supervisor

Use `tools/animation_execution_supervisor_v1.mjs` and the `evavo-animation-execution-supervisor-v1` MCP server for approved animation production profiles.

- Run exactly one bounded cycle per invocation, then inspect returned state before continuing.
- Treat `ledger.json` and `state.json` as immutable-lineage sources of truth. Never hand-edit either file.
- A generated PNG is only a staged candidate. It does not enter the frame ledger until its exact Art Studio drawing evidence is present and validated.
- Use `compile_animation_execution_review_packet_v1` before visual review. It identifies the exact candidate revision, relative image path, timing, locks and evidence destination.
- Art Studio owns per-drawing identity, style, silhouette, camera, anatomy, palette, contact and motion-readability evidence.
- Cel Animation Studio independently reviews the complete moving sequence at normal speed and frame by frame. It alone identifies sequence-level accepted and repair drawings.
- Never invent visual scores because a local model, screenshot, renderer or reviewer is unavailable. Return `provider-required` or `review-required` and preserve staged work.
- Repair only drawing IDs returned by the canonical retry queue. Preserve accepted drawings and their artifact digests.
- Independent acceptance is not creative approval. Exact owner or animation-director approval must be installed separately before delivery.
- Do not put provider credentials, absolute artifact paths, URLs or arbitrary executable commands into requests, catalogues, evidence or state.
- This subsystem has no Git commit, Git push, publication, artifact-promotion or runtime-activation authority.
<!-- EVAVO:ANIMATION_EXECUTION_SUPERVISOR_V1:END -->
