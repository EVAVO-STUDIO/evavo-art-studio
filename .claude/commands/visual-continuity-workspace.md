---
description: Resume or start a governed project-wide visual continuity session without relying on chat memory.
argument-hint: <project-id> <bible-id> [session-id]
---

Use the EVAVO Art Studio MCP continuity workflow for `$ARGUMENTS`.

1. Read `AGENTS.md`, `docs/VISUAL_CONTINUITY_AGENT_PLAYBOOK.md`, `docs/VISUAL_CONTINUITY_WORKSPACE.md` and `docs/VISUAL_CONTINUITY_STORAGE.md`.
2. Call `art_studio_capabilities` and confirm the continuity bible, session, packet, atomic review, approval, persistence, map and sequence capabilities are present.
3. Call `load_visual_continuity_workspace` for the named project and bible, including the session when supplied.
4. Treat the loaded bible, session, artifact IDs, SHA-256 values and reference generations as authority. Do not reconstruct visual canon from this conversation.
5. Verify the bible and session, then compile the next continuity packet.
6. For every packet job, use only its explicit references, locks, dimensions, preserve rules, allowed changes, prohibited additions, map or sequence context and required metrics. Keep one bounded output per work item.
7. A one-job packet may use `evaluate_visual_continuity_candidate`. A multi-job packet must use `evaluate_visual_continuity_packet_batch` with exactly one evidence result for every job.
8. Persist the resulting session using the generation loaded before the work began. On conflict, reload and reconcile; never force overwrite or reuse the stale packet.
9. Technical acceptance is not creative approval. Record a real named-human decision with `compile_visual_continuity_approval_receipt` only after full-resolution and runtime-scale review.
10. Use `compile_approved_visual_continuity_handoff` for release delivery. The compatibility handoff is technical pre-approval metadata only.
11. Do not claim a target studio executed. The 3D route requires `asset-fabricator-reference-handoff` before `evavo-3d-art-reference-brief`; other target studios require their own receiver validation.
12. Report exact completed work, persisted generations, remaining blocked or repair-required items, approval state and receiver state. Do not replace missing evidence with confident prose.
