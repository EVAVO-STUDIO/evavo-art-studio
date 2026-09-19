import {
  VISUAL_CONTINUITY_HANDOFF_KIND,
  VISUAL_CONTINUITY_PROTOCOL_VERSION,
  VISUAL_STUDIO_TARGETS,
} from "./visual-continuity-types.js";
import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityHandoffInput,
  VisualContinuityStudioHandoff,
  VisualStudioTarget,
} from "./visual-continuity-types.js";
import {
  arrayValue,
  assertKnownIds,
  enumValue,
  exactKeys,
  fail,
  freeze,
  hash,
  identifier,
  identifierArray,
  optionalTextArray,
  record,
  text,
  textArray,
} from "./visual-continuity-internal.js";
import { verifyVisualContinuitySession } from "./visual-continuity-session.js";

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function receivingChecks(target: VisualStudioTarget): readonly string[] {
  const common = [
    "Verify every source SHA-256 before use.",
    "Load the exact continuity bible and source context hashes; do not infer canon from filenames or chat history.",
    "Preserve canonical identity, approved exceptions, colour tokens, camera and project-specific motifs.",
    "Do not average incompatible references into generic generated styling.",
    "Return derivative provenance and measured continuity evidence before promotion.",
  ];
  const targetChecks: Record<VisualStudioTarget, readonly string[]> = {
    "art-studio": [
      "Retain immutable sources and generate or repair one bounded work item at a time.",
      "Run full-resolution, actual-scale and hostile-background review where alpha applies.",
    ],
    "video-studio": [
      "Bind lens, framing, aspect ratio, lighting direction and colour pipeline to the supplied shot templates.",
      "Check character, prop and environment identity at every cut and transition.",
      "Treat storyboard and keyframe sources as continuity evidence, not as permission to hallucinate missing details.",
    ],
    "animation-studio": [
      "Preserve canvas, pivot, baseline, ground contact, proportions and construction landmarks across every frame.",
      "Compare each frame with immediate neighbours and perform final-to-first closure for loops.",
      "Keep body, face, equipment, shadow and effects separable until the reviewed export boundary.",
    ],
    "3d-studio": [
      "Bind scale, proportions, silhouette, handedness, asymmetry and material assignments before modelling or rigging.",
      "Use model sheets and orthographic views as exact reference evidence, not independent redesign prompts.",
      "Validate turntable silhouettes and material response against the approved 2D masters before handoff.",
    ],
    "texture-studio": [
      "Preserve material identity, texel density, palette relationships and authored wear patterns.",
      "Do not bake lighting or generic procedural noise unless explicitly required by a lock or output profile.",
    ],
    "godot-runtime": [
      "Verify dimensions, alpha, filtering, pivots, frame timing, collision and import metadata against the accepted sources.",
      "Do not activate runtime assets until source, package and import evidence all match.",
    ],
    "web-runtime": [
      "Preserve exact crop, aspect ratio, alpha, colour space and responsive safe areas across derivatives.",
      "Do not substitute lossy or resized assets for canonical source evidence.",
    ],
    print: [
      "Preserve print dimensions, bleed, colour intent, typography and source-resolution evidence.",
      "Do not promote a screen preview as the print master.",
    ],
  };
  return [...common, ...targetChecks[target]];
}

export function compileVisualContinuityStudioHandoff(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  value: unknown,
): VisualContinuityStudioHandoff {
  verifyVisualContinuitySession(bible, session);
  const input = record(value, "handoff");
  exactKeys(input, "handoff", [
    "schemaVersion",
    "targetStudio",
    "receiverProjectId",
    "purpose",
    "workItemIds",
    "requestedOutputs",
    "notes",
  ]);
  if (input.schemaVersion !== "1.0") {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "handoff.schemaVersion must be 1.0.");
  }
  const targetStudio = enumValue(
    input.targetStudio,
    "handoff.targetStudio",
    VISUAL_STUDIO_TARGETS,
  );
  const workItemIds = identifierArray(input.workItemIds, "handoff.workItemIds", 1, 10_000);
  const itemIds = new Set(session.workItems.map((item) => item.id));
  assertKnownIds(workItemIds, itemIds, "handoff.workItemIds");
  const selectedItems = session.workItems.filter((item) => workItemIds.includes(item.id));
  const stateById = new Map(session.states.map((state) => [state.id, state]));
  for (const item of selectedItems) {
    const state = stateById.get(item.id);
    if (state?.status !== "accepted" || !state.acceptedCandidate) {
      fail(
        "VISUAL_CONTINUITY_HANDOFF_NOT_READY",
        `Work item ${item.id} must be accepted before cross-studio handoff.`,
      );
    }
  }

  const entityIds = uniqueSorted(selectedItems.flatMap((item) => item.entityIds));
  const locationIds = uniqueSorted(selectedItems.flatMap((item) => item.locationIds));
  const mapProfileIds = uniqueSorted(selectedItems.flatMap((item) => item.mapProfileIds));
  const shotTemplateIds = uniqueSorted(
    selectedItems.flatMap((item) => item.shotTemplateId === undefined ? [] : [item.shotTemplateId]),
  );
  const lockIds = uniqueSorted(selectedItems.flatMap((item) => item.lockIds));
  const referenceIds = uniqueSorted(selectedItems.flatMap((item) => item.referenceIds));
  const entities = bible.entities.filter((entity) => entityIds.includes(entity.id));
  const locations = bible.locations.filter((location) => locationIds.includes(location.id));
  const mapProfiles = bible.mapProfiles.filter((profile) => mapProfileIds.includes(profile.id));
  const shotTemplates = bible.shotTemplates.filter((shot) => shotTemplateIds.includes(shot.id));
  const locks = bible.locks.filter((lock) => lockIds.includes(lock.id));
  const references = bible.references.filter((reference) => referenceIds.includes(reference.id));
  const colourTokenIds = uniqueSorted([
    ...entities.flatMap((entity) => entity.colourTokenIds),
    ...locations.flatMap((location) => location.colourTokenIds),
    ...mapProfiles.flatMap((profile) => profile.colourTokenIds),
  ]);
  const colourTokens = colourTokenIds.length === 0
    ? bible.colourTokens
    : bible.colourTokens.filter((token) => colourTokenIds.includes(token.id));
  const sources = selectedItems.map((item) => {
    const accepted = stateById.get(item.id)?.acceptedCandidate;
    if (!accepted) fail("VISUAL_CONTINUITY_HANDOFF_NOT_READY", `Missing accepted source ${item.id}.`);
    return {
      workItemId: item.id,
      assetType: item.assetType,
      artifactId: accepted.artifactId,
      uri: accepted.uri,
      sha256: accepted.sha256,
      contextSha256: item.contextSha256,
    };
  });
  const notes = optionalTextArray(input.notes, "handoff.notes");
  const normalized: VisualContinuityHandoffInput = {
    schemaVersion: "1.0",
    targetStudio,
    receiverProjectId: identifier(input.receiverProjectId, "handoff.receiverProjectId"),
    purpose: text(input.purpose, "handoff.purpose", 6000),
    workItemIds,
    requestedOutputs: textArray(input.requestedOutputs, "handoff.requestedOutputs", 1, 256),
    ...(notes.length === 0 ? {} : { notes }),
  };
  const unsigned = {
    schemaVersion: "1.0" as const,
    kind: VISUAL_CONTINUITY_HANDOFF_KIND,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    targetStudio,
    receiverProjectId: normalized.receiverProjectId,
    purpose: normalized.purpose,
    bibleSha256: bible.bibleSha256,
    sessionSha256: session.sessionSha256,
    sources,
    continuity: {
      style: bible.style,
      colourTokens,
      references,
      locks,
      entities,
      locations,
      mapProfiles,
      shotTemplates,
    },
    requestedOutputs: normalized.requestedOutputs,
    receivingChecks: receivingChecks(targetStudio),
    notes,
    authority: {
      sourceMutation: false as const,
      canonMutation: false as const,
      automaticCreativeApproval: false as const,
      targetRepositoryMutation: false as const,
      runtimeActivation: false as const,
      publication: false as const,
    },
  };
  return freeze({ ...unsigned, handoffSha256: hash(unsigned) });
}

export function visualContinuityProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    purpose:
      "Give ChatGPT, Claude and Codex a deterministic, resumable project-wide visual memory for consistent art, maps, sprite animation, storyboards, video, 3D, textures and runtime delivery without relying on hidden chat context or generic prompt-only styling.",
    supportedStudios: VISUAL_STUDIO_TARGETS,
    workflow: [
      "compile and hash the project visual continuity bible",
      "bind named full-resolution references, colour tokens, entities, locations, maps, shots and immutable locks",
      "compile a dependency-safe long-running session with one bounded output per work item",
      "emit self-contained work packets that restate every required rule and source hash",
      "evaluate measured continuity evidence and produce bounded repair directives without weakening gates",
      "accept only evidence-backed candidates",
      "compile exact cross-studio handoffs for video, animation, 3D, textures, Godot, web or print",
    ] as const,
    mapSupport: [
      "world",
      "regional",
      "local",
      "tactical",
      "minimap",
      "projection",
      "coordinate-space",
      "terrain-layer",
      "route",
      "symbol",
      "label",
      "safe-area",
      "multi-resolution output",
    ] as const,
    continuityDomains: [
      "identity",
      "silhouette",
      "proportions",
      "asymmetry",
      "costume",
      "equipment",
      "palette",
      "camera",
      "lighting",
      "materials",
      "geography",
      "architecture",
      "map grammar",
      "pivot and ground contact",
      "frame neighbors",
      "motion arc",
      "loop closure",
      "anti-generic project signature",
    ] as const,
    agentContract: {
      compatibleClients: ["chatgpt", "claude", "codex"] as const,
      explicitContextEveryPacket: true as const,
      deterministicResume: true as const,
      noRelianceOnConversationMemory: true as const,
      promptIsNotAuthority: true as const,
      seedIsNotAuthority: true as const,
    },
    boundaries: {
      providerExecution: false as const,
      imageMutation: false as const,
      creativeApproval: false as const,
      canonMutation: false as const,
      targetRepositoryMutation: false as const,
      runtimeActivation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    },
  });
}
