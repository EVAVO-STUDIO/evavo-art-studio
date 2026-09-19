import type { CapabilityDefinition } from "@evavo/art-contracts";

export const VISUAL_CONTINUITY_CAPABILITIES: readonly CapabilityDefinition[] =
  Object.freeze([
    {
      id: "continuity.bible.compile",
      label: "Project visual bible",
      description:
        "Compile a deterministic project-wide visual authority covering exact references, colour tokens, identity, materials, locations, map grammar, camera, lighting, typography, anti-generic rules and QA thresholds for all downstream studios.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.session.compile",
      label: "Resumable visual production session",
      description:
        "Compile a dependency-safe long-running art programme whose work items carry exact continuity context hashes, references, locks, sequence neighbours, metrics and bounded retry policy without relying on chat memory.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.packet.compile",
      label: "Self-contained continuity packet",
      description:
        "Compile the next repair-first work packet with complete style, colour, identity, material, location, map-symbol, shot, animation-neighbour and output context for ChatGPT, Claude, Codex or a governed worker.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.batch.evaluate",
      label: "Atomic continuity batch review",
      description:
        "Evaluate one evidence result for every job in a multi-job packet against the same original session, then apply all accepted, repair-required or blocked transitions atomically so unfinished jobs cannot become stale.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.approval.receipt",
      label: "Candidate-bound creative approval",
      description:
        "Compile and verify a named-human creative decision receipt bound to the exact technically accepted artifact, review attempt, work-item context and independent decision evidence without making the decision automatically.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.workspace.persist",
      label: "Durable continuity memory",
      description:
        "Persist verified bibles, sessions, approvals and approved handoffs as immutable content-addressed artifacts with lineage, bounded digest-backed reference keys, idempotency and compare-and-swap generations for safe multi-agent resume.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.handoff.approved",
      label: "Approved cross-studio handoff",
      description:
        "Package accepted source hashes, canon, palette, references, locks, entities, locations, map profiles, shot grammar, receiving checks and matching approval receipts for Art, Animation, Video, 3D, Texture, Godot, web or print receiver validation.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.map-grammar",
      label: "Map and symbol continuity",
      description:
        "Bind world, regional, local, tactical and minimap projection, coordinates, geography, routes, labels, safe areas, symbol geometry, scale, colour and exact symbol-master references into each relevant work packet.",
      deterministic: true,
      workerClass: "control",
    },
    {
      id: "continuity.sequence-grammar",
      label: "Sprite and storyboard continuity",
      description:
        "Preserve identity, construction, canvas, pivot, ground contact, timing, action arc, immediate neighbours and final-to-first loop closure across sprite animation, storyboard and video-keyframe families.",
      deterministic: true,
      workerClass: "control",
    },
  ]);
