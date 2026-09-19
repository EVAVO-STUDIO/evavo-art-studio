# Visual Continuity Workspace

The visual continuity workspace is the project-wide memory layer for Art Studio. It binds exact references, colour tokens, character and object identity, locations, maps, camera grammar, sequence continuity and cross-studio delivery into deterministic contracts that can be resumed by ChatGPT, Claude or Codex without relying on conversation history.

## Why it exists

Prompt text, seeds and filenames are not visual authority. Long jobs drift when each message reconstructs the project from memory, when animation frames are generated as independent pictures, or when Art Studio, Video Studio, Animation Studio, 3D Studio and Texture Studio each interpret a brief differently.

The workspace makes the stable parts explicit and hash-bound:

- canonical identity, silhouettes, proportions, asymmetry, costume and equipment;
- named project colours with exact hex values, usage rules, prohibitions, pairings and tolerances;
- approved full-resolution references with roles, rights and SHA-256 identity;
- locations, geography, architecture, materials, landmarks, weather and time-of-day constraints;
- world, regional, local, tactical and minimap projection, coordinates, symbols, routes, labels and safe areas;
- shot templates, camera, lens or orthographic scale, lighting and composition;
- sprite pivots, ground contact, neighbour frames, motion arcs, timing and loop closure;
- project-specific motifs and explicit generic or modern treatments that must not appear.

## Contract flow

1. `compile_visual_continuity_bible` validates and hashes the project bible.
2. `compile_visual_continuity_session` creates a resumable dependency graph. Every work item inherits its relevant references and locks and receives a context hash.
3. `compile_next_visual_continuity_packet` emits only ready work. Repair jobs are prioritised before new work. Every packet is self-contained and repeats the exact context required by an agent.
4. External generation or editing produces one bounded candidate per work item. `candidateCountPerAttempt` is currently required to remain `1`; multi-candidate selection will not be claimed until candidate-set admission, comparison and selection have exact evidence receipts.
5. `evaluate_visual_continuity_candidate` evaluates a one-job packet. A packet containing multiple jobs must use `evaluate_visual_continuity_packet_batch`, which requires one result for every listed job and applies all state transitions atomically. This prevents the first result from invalidating the rest of the packet.
6. Technical review consumes measured evidence for every required metric and every detected failure. The outcome is accepted, repair-required or blocked. Retry exhaustion blocks; gates are never weakened.
7. Technical acceptance is not creative approval. `compile_visual_continuity_approval_receipt` records an explicit named-human decision bound to the exact candidate, technical-review attempt, work-item context and independent decision evidence.
8. `compile_visual_continuity_handoff` remains a technical metadata handoff for compatibility. Release-grade delivery uses `compile_approved_visual_continuity_handoff`, which requires one valid approved receipt for every selected source.
9. The receiving studio must independently validate the handoff and emit its own receiver evidence before execution or promotion.

## Atomic batches

A visual packet may contain several dependency-ready jobs so independent work can be generated in parallel. The results are not committed one by one against a changing session. The atomic evaluator first verifies the original packet, requires an exact result for every job, evaluates each result against the same original session, and then creates one new deterministic session containing all attempts and state transitions.

A missing result, duplicate work-item result, stale packet, reused candidate, incomplete metric set or failed detection blocks the transaction. It never silently drops unfinished jobs.

## Map production

A map profile is not merely an image prompt. It records projection, orientation, coordinate space, scale policy, terrain layers, route grammar, label grammar, safe areas, symbols, colour tokens, references and allowed output sizes. Each relevant packet also expands the exact map-symbol meaning, shape, scale and colour rules and includes the symbol-master reference bytes, even when the profile itself uses a different general map reference.

This prevents coastlines, port positions, labels, routes and icon language from drifting between world maps, regional maps, minimaps, video shots and 3D world references.

## Sprite, storyboard and sequence production

Each sequence frame is its own bounded source item, with explicit previous and next work-item IDs. Once neighbours are accepted, their exact SHA-256 values enter the next packet. The reviewer must measure identity, silhouette, proportions, palette, camera, anchors, temporal progression, neighbour continuity and loop closure where relevant.

Contact sheets, GIFs, onion skins and storyboards remain review or planning views unless separately admitted as authoritative sources. The provider must not redesign each frame independently.

## Technical acceptance and creative approval

Technical review proves that a candidate satisfies the declared measurements and contains no blocking detection. It does not decide whether the work is creatively right.

A creative approval receipt contains:

- the current bible identity;
- session ID and revision;
- work-item context SHA-256;
- accepted artifact ID and SHA-256;
- exact technical-review attempt SHA-256;
- named reviewer and ISO review time;
- approved or rejected decision;
- independent decision-evidence SHA-256;
- deterministic receipt SHA-256.

Verification recompiles and compares the entire canonical receipt. A caller cannot alter derived fields such as the artifact ID, context hash or authority flags while retaining a previously valid receipt.

## Cross-studio handoff

An approved handoff contains accepted artifact hashes, each work item's continuity context hash, selected colours, references, locks, entities, locations, map profiles, shot templates, receiving checks and the matching human approval receipts. Verification deterministically rebuilds the complete package from the current bible and session.

Examples:

- Animation Studio receives canvas, pivot, ground contact, neighbour and loop checks.
- Video Studio receives exact lens, framing, aspect, lighting and cut-to-cut identity checks.
- 3D Studio receives scale, proportions, silhouette, asymmetry, handedness and material checks.
- Texture Studio receives material identity, texel-density, palette and authored-wear checks.

### Receiver truth

The generic visual-continuity envelope is not automatically compatible with every downstream command.

The live 3D Studio receiver is `evavo-3d-art-reference-brief`, with durable worker task `creative-media-3d-art-reference-brief`. It accepts the governed Asset Fabricator multi-view handoff, not the generic continuity handoff. Therefore the 3D route is marked `adapter-required`: approved continuity sources must first be converted into the multi-view schema with front, back, left, right and three-quarter views, plus top view where required, exact source-byte evidence, dimensions, anchors, rights and 3D production intent.

Video Studio, Animation Studio, Texture Studio, Godot, web and print routes are marked `receiver-validation-required` until a matching receiver contract and validator are implemented. Art Studio does not claim that a target executed merely because it compiled a handoff.

## Agent behaviour

Agents must use bible, session, packet, attempt, approval and handoff hashes as state. They must not rely on an earlier chat thumbnail, remembered prompt, filename or seed as authority. Every resumed run must read the current contracts, act only on the listed work packet, return evidence, evaluate it, and request the next packet only after the current transaction has completed.

The protocol deliberately grants no provider execution, image mutation, automatic creative approval, canon mutation, target-repository mutation, runtime activation, Git, deployment or publication authority. Those actions remain separate, explicit and evidence-gated.
