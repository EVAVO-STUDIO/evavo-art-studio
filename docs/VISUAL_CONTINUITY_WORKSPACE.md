# Visual Continuity Workspace

The visual continuity workspace is the project-wide memory layer for Art Studio. It binds exact references, colour tokens, character and object identity, locations, maps, camera grammar, sequence continuity and cross-studio delivery into deterministic contracts that can be resumed by ChatGPT, Claude or Codex without relying on conversation history.

## Why it exists

Prompt text, seeds and filenames are not visual authority. Long jobs drift when each message reconstructs the project from memory, when animation frames are generated as independent pictures, or when Art Studio, Video Studio, Animation Studio and 3D Studio each interpret a brief differently.

The workspace makes the stable parts explicit and hash-bound:

- canonical identity, silhouettes, proportions, asymmetry, costume and equipment;
- named project colours with exact hex values, usage rules, prohibitions and tolerances;
- approved full-resolution references with roles, rights and SHA-256 identity;
- locations, geography, architecture, landmarks, weather and time-of-day constraints;
- world, regional, local, tactical and minimap projection, coordinates, symbols, routes, labels and safe areas;
- shot templates, camera, lens or orthographic scale, lighting and composition;
- sprite pivots, ground contact, neighbour frames, motion arcs, timing and loop closure;
- project-specific motifs and explicit generic or modern treatments that must not appear.

## Contract flow

1. `compile_visual_continuity_bible` validates and hashes the project bible.
2. `compile_visual_continuity_session` creates a resumable dependency graph. Every work item inherits its relevant references and locks and receives a context hash.
3. `compile_next_visual_continuity_packet` emits only ready work. Repair jobs are prioritised before new work. Every packet is self-contained and repeats the exact context required by an agent.
4. External generation or editing produces one bounded candidate. The provider response is not automatically canonical.
5. `evaluate_visual_continuity_candidate` consumes measured evidence for every required metric and every detected failure. The outcome is accepted, repair-required or blocked. Retry exhaustion blocks; gates are never weakened.
6. `compile_visual_continuity_handoff` packages accepted source hashes and the exact selected continuity context for Art Studio, Video Studio, Animation Studio, 3D Studio, Texture Studio, Godot, web or print.

## Map production

A map profile is not merely an image prompt. It records projection, orientation, coordinate space, scale policy, terrain layers, route grammar, label grammar, safe areas, symbols, colour tokens, references and allowed output sizes. This prevents coastlines, port positions, labels, routes and icon language from drifting between world maps, regional maps, minimaps, video shots and 3D world references.

## Sprite and storyboard production

Each sequence frame is its own bounded source item, with explicit previous and next work-item IDs. Once neighbours are accepted, their exact SHA-256 values enter the next packet. The reviewer must measure identity, silhouette, proportions, palette, camera, anchors, temporal progression, neighbour continuity and loop closure where relevant. Contact sheets and storyboards remain review or planning views unless separately admitted as runtime sources.

## Cross-studio handoff

A handoff contains accepted artifact hashes, each work item's continuity context hash, selected colours, references, locks, entities, locations, map profiles, shot templates and receiving checks tailored to the destination. The receiver cannot silently mutate canon or claim approval merely by accepting the handoff.

Examples:

- Animation Studio receives canvas, pivot, ground contact, neighbour and loop checks.
- Video Studio receives exact lens, framing, aspect, lighting and cut-to-cut identity checks.
- 3D Studio receives scale, proportions, silhouette, asymmetry, handedness and material checks.
- Texture Studio receives material identity, texel-density, palette and authored-wear checks.

## Agent behaviour

Agents must use the bible and session hashes as state. They must not rely on an earlier chat thumbnail, a remembered prompt or a seed as authority. Every resumed run must read the current contract, act only on the listed work packet, return evidence, and evaluate before requesting more work.

The protocol deliberately grants no provider execution, image mutation, creative approval, canon mutation, target-repository mutation, runtime activation, Git, deployment or publication authority. Those actions remain separate, explicit and evidence-gated.
