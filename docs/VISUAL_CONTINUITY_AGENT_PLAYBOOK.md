# Visual Continuity Agent Playbook

This playbook applies to ChatGPT, Claude, Codex and EVAVO workers operating on a long-running visual project. The continuity bible and persisted session are the authority. Chat history, a remembered prompt, a seed, a filename, a contact sheet or a previous model response are not authority.

## Starting or resuming work

1. Call `art_studio_capabilities` and confirm the continuity capabilities are present.
2. Load the current state with `load_visual_continuity_workspace` using the exact project ID, bible ID and, when resuming production, session ID.
3. Record the returned bible and session artifact IDs, SHA-256 values and reference generations.
4. Verify the loaded bible and session before compiling work.
5. Do not create a competing bible or session merely because the current conversation lacks context.

When no bible exists, compile one from inspected full-resolution sources and persist it at expected generation `0`. When a bible exists but the requested change alters canon, palette, identity, geography, camera or other locks, create an explicit reviewed bible revision. Do not silently edit the current canon inside a generation prompt.

## Compiling work

Use `compile_next_visual_continuity_packet` against the exact loaded bible and session.

Every job is already bounded by:

- one work item and one output;
- an exact continuity context hash;
- required references and source SHA-256 values;
- explicit preserve, may-change and must-not-introduce rules;
- colour, identity, material, location, map, shot and sequence constraints;
- required metrics and blocking detections;
- output dimensions, format and transparency policy.

Do not collapse several outputs into a contact sheet or ask a provider to invent a whole animation as unrelated panels. Contact sheets, GIFs and onion skins are review derivatives, not source masters.

## Generating or editing

Keep each provider or editing call bounded to the packet job. Supply the listed full-resolution references using their semantic roles. Preserve immutable originals and write candidates to a working area.

For sequences, use the exact previous and next accepted neighbours. Preserve canvas, pivot, ground contact, identity, construction, palette, camera, motion arc and timing. Generate or repair one bounded frame at a time even when jobs are dispatched concurrently.

For maps, use the exact projection, coordinate space, scale, coastline and border rules, route grammar, label policy, safe areas and each symbol master. Do not infer a symbol from its label when a hash-bound symbol reference exists.

## Reviewing results

A one-job packet may use `evaluate_visual_continuity_candidate`. A packet with more than one job must use `evaluate_visual_continuity_packet_batch` and provide exactly one result for every listed job.

The batch evaluator is atomic. Do not evaluate the first job, persist the new session and then attempt to reuse the original packet for the remaining jobs. That packet is stale by design.

Measured evidence must cover every required metric. Blocking detections must be reported honestly. A failed candidate becomes repair-required or blocked; do not lower thresholds, remove a detection or change canon to manufacture a pass.

Technical acceptance means only that declared continuity and quality evidence passed. It is not creative approval.

## Creative approval

After full-resolution and runtime-scale human review, record the decision with `compile_visual_continuity_approval_receipt`.

The receipt must bind:

- the exact accepted candidate SHA-256;
- its technical-review attempt SHA-256;
- the work-item context SHA-256;
- the named reviewer and review time;
- an independent decision-evidence SHA-256;
- an approved or rejected decision.

Never fabricate a human decision or reuse an approval from another candidate, attempt, work item or bible revision.

## Persisting state

Persist in this order:

1. bible;
2. current session;
3. approval receipts;
4. approved handoff.

Use the generation read before the work began as `expectedGeneration`. If the store reports a reference conflict, another worker advanced the state. Reload, compare the current work and reconcile. Never force an overwrite or continue from stale state.

Persisting identical bytes is idempotent and does not create another generation.

## Cross-studio delivery

Use `compile_approved_visual_continuity_handoff` for release-grade delivery. The compatibility tool `compile_visual_continuity_handoff` is technical pre-approval metadata only and explicitly reports `releaseGrade: false`.

A handoff does not prove the target ran. The receiver must validate the envelope, sources, approvals and continuity locks and emit its own receipt.

The current 3D route requires the governed `asset-fabricator-reference-handoff` adapter before the `evavo-3d-art-reference-brief` receiver. The generic continuity envelope is not the 3D receiver schema. Other studios remain `receiver-validation-required` until a matching adapter and validator exist.

## Completion standard

A work item is complete only when:

- its candidate passed technical continuity review;
- an explicit creative approval receipt exists when release is intended;
- the current session was persisted without a generation conflict;
- the approved handoff was verified and persisted when another studio consumes it;
- the target receiver independently admitted the handoff before mutation or promotion.

No prompt, seed, filename, model claim, tool return or attractive preview replaces those conditions.
