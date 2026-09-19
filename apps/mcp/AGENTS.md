# Art Studio MCP continuity rules

Read the root `AGENTS.md` and `docs/VISUAL_CONTINUITY_AGENT_PLAYBOOK.md` before changing continuity tools.

## Tool authority

- MCP tools compile, verify, evaluate caller-supplied evidence and persist governed state. They do not call providers, inspect image bytes unless their contract explicitly says so, make creative decisions, mutate canon, modify target repositories, run Git, activate runtime assets or publish.
- Keep execution boundaries explicit in every tool response and description.
- The compatibility tool `compile_visual_continuity_handoff` must remain visibly non-release-grade. Release delivery uses the approval-bound handoff tools.

## Durable state

- The server operator fixes storage through `EVAVO_ART_ARTIFACT_ROOT`; never accept a caller-supplied replacement root.
- Writes require `EVAVO_ART_ALLOW_WRITES=true`.
- Use `LocalArtifactStore` immutable objects, source lineage and generation-checked named references. Do not add direct `writeFile`, `rename` or ad hoc JSON state beside it.
- Persist in bible, session, approval, approved-handoff order and verify current persisted lineage before each dependent write.
- On reference conflict, fail closed. Do not force an overwrite.
- Keep physical namespace and reference segments bounded and digest-backed while retaining exact IDs in labels and content.

## Registration and discovery

- Register every new tool in `src/index.ts`.
- Add the capability to the standard `art_studio_capabilities` catalogue when it is a user-visible workflow rather than an internal helper.
- Add static MCP contract tests and, for storage or state transitions, executable integration tests.

## Receiver truth

- Do not imply that compiling a handoff executed the receiver.
- The current 3D receiver consumes the governed Asset Fabricator multi-view handoff, so the generic continuity envelope must route through that adapter first.
- Other studio routes remain receiver-validation-required until their exact adapter and validator exist.
