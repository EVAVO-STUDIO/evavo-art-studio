import type { BookAuthoringOperation } from "./book-studio-authoring-types";
import {
  BOOK_NARRATIVE_CRAFT_CONTRACT,
  BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION,
  type BookNarrativeCompositeDimensionV1,
  type BookNarrativeCraftContextBlockV1,
  type BookNarrativeCraftMode,
  type BookNarrativeCraftPacketV1,
  type BookNarrativeKnowledgeModuleV1,
  type BookNarrativeNormalizedArchetypeWeightV1,
} from "./book-studio-narrative-craft-types";
import { canonicalReviewCraftJson, sha256ReviewCraftText } from "./book-studio-review-craft-shared";

export function buildBookNarrativeCraftProviderInstruction(input: {
  mode: BookNarrativeCraftMode;
  craftProfileProviderInstruction: string;
  modules: BookNarrativeKnowledgeModuleV1[];
  archetypeMix: BookNarrativeNormalizedArchetypeWeightV1[];
  compositeDimensions: BookNarrativeCompositeDimensionV1[];
  sceneId: string;
  projectVoiceAnchorIds: string[];
  narrativeConstraintIds: string[];
  rejectedPatternIds: string[];
}): string {
  return [
    `EVAVO ORIGINAL NARRATIVE CRAFT: ${input.mode}`,
    "Use project-owned voice and de-identified abstract mechanisms only.",
    "Do not name or infer source creators, and do not reconstruct any creator, work, signature phrase, recognisable surface style or trade dress.",
    "A blend of mechanisms is not permission to copy. Preserve exact evidence, viewpoint, character knowledge, causality and rights boundaries.",
    input.craftProfileProviderInstruction,
    `Scene identity: ${input.sceneId}.`,
    `Project voice anchors: ${input.projectVoiceAnchorIds.join(", ")}.`,
    `Narrative constraints: ${input.narrativeConstraintIds.join(", ")}.`,
    `Rejected patterns: ${input.rejectedPatternIds.join(", ")}.`,
    "Composite craft dimensions:",
    ...input.compositeDimensions.map((item) => `- ${item.dimensionId}: ${item.value}`),
    "Required narrative knowledge:",
    ...input.modules.flatMap((module) => [
      `- ${module.moduleId}: ${module.purpose}`,
      ...module.productionRules.map((rule) => `  * ${rule}`),
    ]),
    "Production order: causal spine; character appraisal; emotion regulation; dialogue turn and common-ground logic; viewpoint; specificity and rhythm; tension and reveal; anti-genericity and rights assurance.",
    "Return a candidate only. Do not mutate canonical manuscript state, approve your own work, call another provider, promote artwork or publish.",
  ].join("\n");
}

export async function buildBookNarrativeCraftContextBlock(
  packet: Omit<BookNarrativeCraftPacketV1, "writingContextBlock" | "packetFingerprint">,
): Promise<BookNarrativeCraftContextBlockV1> {
  const text = canonicalReviewCraftJson({
    outputKind: "evavo_docs_book_narrative_craft_provider_context",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    knowledgeVersion: BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION,
    programmeId: packet.programmeId,
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    manuscriptRevisionId: packet.manuscriptRevisionId,
    mode: packet.mode,
    craftProfileFingerprint: packet.craftProfileFingerprint,
    knowledgeModules: packet.knowledgeModules,
    archetypeMix: packet.archetypeMix,
    compositeDimensions: packet.compositeDimensions,
    projectVoiceAnchorIds: packet.projectVoiceAnchorIds,
    narrativeConstraintIds: packet.narrativeConstraintIds,
    scene: packet.scene,
    characters: packet.characters,
    dialogue: packet.dialogue,
    emotionBeats: packet.emotionBeats,
    prose: packet.prose,
    acceptedPatternIds: packet.acceptedPatternIds,
    rejectedPatternIds: packet.rejectedPatternIds,
    providerInstruction: packet.providerInstruction,
    qualityRubric: packet.qualityRubric,
    revisionProtocol: packet.revisionProtocol,
    boundary: {
      namedCreatorInstructionPermitted: false,
      distinctiveSurfaceTransferPermitted: false,
      phraseLevelTransferPermitted: false,
      phraseOverlapScanRequired: true,
      automaticCanonicalAdmissionAllowed: false,
    },
  });
  const textSha256 = await sha256ReviewCraftText(text);
  const objectFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson({
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    role: "constraint",
    textSha256,
  }));
  return {
    objectId: `narrative-craft:${textSha256.slice("sha256:".length, "sha256:".length + 24)}`,
    objectFingerprint,
    role: "constraint",
    text,
    textSha256,
  };
}

export function narrativeCraftModeForBookAuthoringOperation(operation: BookAuthoringOperation): BookNarrativeCraftMode | null {
  switch (operation) {
    case "draft_candidate": return "draft_scene";
    case "revise_candidate": return "revise_scene";
    case "critique_candidate": return "full_scene_pass";
    case "evaluate_voice": return "prose_pass";
    case "continuity_review": return "full_scene_pass";
    case "line_edit_candidate": return "prose_pass";
    default: return null;
  }
}

export function bookAuthoringOperationRequiresNarrativeCraft(operation: BookAuthoringOperation): boolean {
  return narrativeCraftModeForBookAuthoringOperation(operation) !== null;
}

export function listBookNarrativeCraftCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_narrative_craft_capabilities",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    knowledgeVersion: BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION,
    operations: ["compile", "validate_packet", "evaluate"] as const,
    craftModes: ["draft_scene", "revise_scene", "dialogue_pass", "emotion_pass", "prose_pass", "tension_pass", "full_scene_pass"] as const,
    knowledge: ["scene_causality", "character_appraisal", "emotion_regulation", "dialogue_turn_taking", "dialogue_grounding_and_repair", "dialogue_subtext_and_status", "viewpoint_information_control", "prose_specificity_and_rhythm", "suspense_curiosity_surprise", "social_simulation_and_relationship_memory", "anti_genericity_revision"] as const,
    rightsBoundary: {
      namedCreatorInstructionPermitted: false,
      distinctiveSurfaceTransferPermitted: false,
      phraseLevelTransferPermitted: false,
      phraseOverlapScanRequired: true,
      projectOwnedVoiceRequired: true,
      independentReviewRequired: true,
    },
    providerCallPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}
