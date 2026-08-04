import { validateBookCraftProfile } from "./book-studio-craft-profile-validate";
import { BOOK_NARRATIVE_KNOWLEDGE_MODULES, BOOK_NARRATIVE_QUALITY_RUBRIC, BOOK_NARRATIVE_REVISION_PROTOCOL } from "./book-studio-narrative-craft-knowledge";
import { parseArchetypeMix } from "./book-studio-narrative-craft-archetype";
import { validateNarrativeCraftCrossFields } from "./book-studio-narrative-craft-cross-field";
import { buildBookNarrativeCraftContextBlock, buildBookNarrativeCraftProviderInstruction } from "./book-studio-narrative-craft-provider";
import {
  parseNarrativeCharacters,
  parseNarrativeCraftPolicy,
  parseNarrativeDialogue,
  parseNarrativeEmotionBeats,
  parseNarrativeKnowledgeModuleIds,
  parseNarrativeProse,
  parseNarrativeScene,
} from "./book-studio-narrative-craft-state";
import {
  BOOK_NARRATIVE_CRAFT_CONTRACT,
  BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION,
  type BookNarrativeCraftCompileResultV1,
  type BookNarrativeCraftMode,
  type BookNarrativeCraftPacketV1,
} from "./book-studio-narrative-craft-types";
import {
  canonicalReviewCraftJson,
  rejectReviewCraftUnknown,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftRecord,
  sameReviewCraftSet,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const MODES = new Set<BookNarrativeCraftMode>(["draft_scene", "revise_scene", "dialogue_pass", "emotion_pass", "prose_pass", "tension_pass", "full_scene_pass"]);
const INPUT_KEYS = new Set(["outputKind", "schemaVersion", "programmeId", "projectId", "volumeId", "manuscriptRevisionId", "mode", "craftProfile", "requestedKnowledgeModuleIds", "archetypeMix", "projectVoiceAnchorIds", "narrativeConstraintIds", "scene", "characters", "dialogue", "emotionBeats", "prose", "acceptedPatternIds", "rejectedPatternIds", "evidenceIds", "policy"]);
const DIRECT_IMITATION_REQUEST = /(?:\bin the style of\b|\bwrite like\b|\bsound like\b|\brecreate the voice of\b|\bindistinguishable from\b|\bperfectly like\b|\b(?:imitate|mimic)\s+(?:the\s+)?(?:voice|style|prose|writing|work)\s+of\b)/i;

export async function compileBookNarrativeCraftPacket(input: unknown): Promise<BookNarrativeCraftCompileResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = reviewCraftRecord(input, "Narrative craft compile input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Narrative craft compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_craft_compile_input") blockers.push("Narrative craft compile input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Narrative craft compile input schemaVersion is invalid.");

  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const projectId = reviewCraftId(source.projectId, "projectId", blockers);
  const volumeId = reviewCraftId(source.volumeId, "volumeId", blockers);
  const manuscriptRevisionId = reviewCraftId(source.manuscriptRevisionId, "manuscriptRevisionId", blockers);
  const mode = reviewCraftEnum(source.mode, MODES, "mode", blockers, "full_scene_pass");
  const policy = parseNarrativeCraftPolicy(source.policy, blockers);

  const profileBlockers = await validateBookCraftProfile(source.craftProfile);
  blockers.push(...profileBlockers.map((item) => `Craft profile: ${item}`));
  const craftProfile = reviewCraftRecord(source.craftProfile, "craftProfile", blockers);
  const craftProfileFingerprint = reviewCraftDigest(craftProfile.profileFingerprint, "craftProfile.profileFingerprint", blockers);
  const craftProfileProviderInstruction = typeof craftProfile.providerInstruction === "string" ? craftProfile.providerInstruction : "";
  if (!craftProfileProviderInstruction) blockers.push("Craft profile requires its de-identified provider instruction.");
  if (DIRECT_IMITATION_REQUEST.test(craftProfileProviderInstruction)) blockers.push("Craft profile provider instruction requests direct imitation.");

  const projectVoiceAnchorIds = reviewCraftIds(source.projectVoiceAnchorIds, "projectVoiceAnchorIds", blockers, 256, true);
  const narrativeConstraintIds = reviewCraftIds(source.narrativeConstraintIds, "narrativeConstraintIds", blockers, 256, true);
  const acceptedPatternIds = reviewCraftIds(source.acceptedPatternIds, "acceptedPatternIds", blockers, 256, false);
  const rejectedPatternIds = reviewCraftIds(source.rejectedPatternIds, "rejectedPatternIds", blockers, 256, true);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 4_096, true);
  const profileVoiceIds = Array.isArray(craftProfile.projectVoiceAnchorIds) ? craftProfile.projectVoiceAnchorIds.filter((item): item is string => typeof item === "string") : [];
  const profileConstraintIds = Array.isArray(craftProfile.narrativeConstraintIds) ? craftProfile.narrativeConstraintIds.filter((item): item is string => typeof item === "string") : [];
  const profileAcceptedIds = Array.isArray(craftProfile.acceptedPatternIds) ? craftProfile.acceptedPatternIds.filter((item): item is string => typeof item === "string") : [];
  const profileRejectedIds = Array.isArray(craftProfile.rejectedPatternIds) ? craftProfile.rejectedPatternIds.filter((item): item is string => typeof item === "string") : [];
  if (!sameReviewCraftSet(projectVoiceAnchorIds, profileVoiceIds)) blockers.push("Narrative craft voice anchors differ from the validated craft profile.");
  if (!sameReviewCraftSet(narrativeConstraintIds, profileConstraintIds)) blockers.push("Narrative constraints differ from the validated craft profile.");
  if (!sameReviewCraftSet(acceptedPatternIds, profileAcceptedIds)) blockers.push("Accepted patterns differ from the validated craft profile.");
  if (!sameReviewCraftSet(rejectedPatternIds, profileRejectedIds)) blockers.push("Rejected patterns differ from the validated craft profile.");

  const moduleIds = parseNarrativeKnowledgeModuleIds(source.requestedKnowledgeModuleIds, blockers, policy);
  const knowledgeModules = moduleIds.map((moduleId) => BOOK_NARRATIVE_KNOWLEDGE_MODULES.find((item) => item.moduleId === moduleId)).filter((item): item is (typeof BOOK_NARRATIVE_KNOWLEDGE_MODULES)[number] => item !== undefined);
  const { normalizedArchetypes, compositeDimensions, minimumDistanceFromArchetype } = parseArchetypeMix(source.archetypeMix, policy, blockers);
  const scene = parseNarrativeScene(source.scene, blockers);
  const characters = parseNarrativeCharacters(source.characters, blockers);
  const dialogue = parseNarrativeDialogue(source.dialogue, blockers);
  const emotionBeats = parseNarrativeEmotionBeats(source.emotionBeats, blockers);
  const prose = parseNarrativeProse(source.prose, blockers);

  validateNarrativeCraftCrossFields({
    mode,
    moduleIds,
    policy,
    projectVoiceAnchorIds,
    narrativeConstraintIds,
    scene,
    characters,
    dialogue,
    emotionBeats,
    prose,
    acceptedPatternIds,
    rejectedPatternIds,
    evidenceIds,
    providerInstructionFromCraftProfile: craftProfileProviderInstruction,
  }, blockers, warnings);

  const uniqueBlockers = uniqueReviewCraft(blockers);
  if (uniqueBlockers.length) return blocked(uniqueBlockers, warnings);
  const providerInstruction = buildBookNarrativeCraftProviderInstruction({
    mode,
    craftProfileProviderInstruction,
    modules: knowledgeModules,
    archetypeMix: normalizedArchetypes,
    compositeDimensions,
    sceneId: scene.sceneId,
    projectVoiceAnchorIds,
    narrativeConstraintIds,
    rejectedPatternIds,
  });
  const base: Omit<BookNarrativeCraftPacketV1, "writingContextBlock" | "packetFingerprint"> = {
    outputKind: "evavo_docs_book_narrative_craft_packet",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    knowledgeVersion: BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION,
    authorityMode: "shadow_migration",
    status: "ready",
    programmeId,
    projectId,
    volumeId,
    manuscriptRevisionId,
    mode,
    craftProfileFingerprint,
    knowledgeModules,
    archetypeMix: normalizedArchetypes,
    compositeDimensions,
    minimumDistanceFromArchetype,
    projectVoiceAnchorIds,
    narrativeConstraintIds,
    scene,
    characters,
    dialogue,
    emotionBeats,
    prose,
    acceptedPatternIds,
    rejectedPatternIds,
    evidenceIds,
    providerInstruction,
    qualityRubric: [...BOOK_NARRATIVE_QUALITY_RUBRIC],
    minimumPassingScore: policy.minimumPassingScore,
    minimumIndependentReviewIds: policy.minimumIndependentReviewIds,
    revisionProtocol: [...BOOK_NARRATIVE_REVISION_PROTOCOL],
    providerBriefContainsNamedSources: false,
    namedCreatorInstructionPermitted: false,
    distinctiveSurfaceTransferPermitted: false,
    phraseLevelTransferPermitted: false,
    phraseOverlapScanRequired: true,
    projectOwnedVoiceRequired: true,
    independentReviewRequired: true,
    automaticCanonicalAdmissionAllowed: false,
    providerCallPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const writingContextBlock = await buildBookNarrativeCraftContextBlock(base);
  const unsigned: Omit<BookNarrativeCraftPacketV1, "packetFingerprint"> = { ...base, writingContextBlock };
  const packetFingerprint = await fingerprintBookNarrativeCraftPacket(unsigned);
  const packet: BookNarrativeCraftPacketV1 = { ...unsigned, packetFingerprint };
  return {
    outputKind: "evavo_docs_book_narrative_craft_compile_result",
    schemaVersion: 1,
    status: "ready",
    packet,
    packetFingerprint,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function validateBookNarrativeCraftPacket(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Narrative craft packet", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_craft_packet" || source.schemaVersion !== 1 || source.contract !== BOOK_NARRATIVE_CRAFT_CONTRACT || source.knowledgeVersion !== BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION) blockers.push("Narrative craft packet identity is invalid.");
  if (source.authorityMode !== "shadow_migration" || source.status !== "ready") blockers.push("Narrative craft packet authority or status is invalid.");
  const requiredFalse = ["providerBriefContainsNamedSources", "namedCreatorInstructionPermitted", "distinctiveSurfaceTransferPermitted", "phraseLevelTransferPermitted", "automaticCanonicalAdmissionAllowed", "providerCallPerformed", "canonicalManuscriptMutationPerformed", "runtimeCutoverApproved", "publicationPerformed"];
  for (const key of requiredFalse) if (source[key] !== false) blockers.push(`Narrative craft packet ${key} must remain false.`);
  const requiredTrue = ["phraseOverlapScanRequired", "projectOwnedVoiceRequired", "independentReviewRequired", "websiteCompatibilityRuntimeStillAuthoritative"];
  for (const key of requiredTrue) if (source[key] !== true) blockers.push(`Narrative craft packet ${key} must remain true.`);
  if (typeof source.providerInstruction !== "string" || DIRECT_IMITATION_REQUEST.test(source.providerInstruction)) blockers.push("Narrative craft provider instruction is invalid or imitation-seeking.");
  const packetFingerprint = reviewCraftDigest(source.packetFingerprint, "packetFingerprint", blockers);
  const { packetFingerprint: _discarded, ...unsigned } = source;
  if (packetFingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Narrative craft packet fingerprint does not match its exact contents.");
  const context = reviewCraftRecord(source.writingContextBlock, "writingContextBlock", blockers);
  const contextText = typeof context.text === "string" ? context.text : "";
  const contextTextSha256 = reviewCraftDigest(context.textSha256, "writingContextBlock.textSha256", blockers);
  if (contextTextSha256 !== await sha256ReviewCraftText(contextText)) blockers.push("Narrative craft context text hash does not match.");
  const expectedContextFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson({
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    role: "constraint",
    textSha256: contextTextSha256,
  }));
  if (reviewCraftDigest(context.objectFingerprint, "writingContextBlock.objectFingerprint", blockers) !== expectedContextFingerprint) blockers.push("Narrative craft context fingerprint does not match.");
  const expectedObjectId = `narrative-craft:${contextTextSha256.slice("sha256:".length, "sha256:".length + 24)}`;
  if (context.role !== "constraint" || context.objectId !== expectedObjectId) blockers.push("Narrative craft context block identity is invalid.");
  return uniqueReviewCraft(blockers);
}

export async function fingerprintBookNarrativeCraftPacket(
  value: Omit<BookNarrativeCraftPacketV1, "packetFingerprint"> | BookNarrativeCraftPacketV1,
): Promise<string> {
  const { packetFingerprint: _discarded, ...unsigned } = value as BookNarrativeCraftPacketV1;
  return sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
}

function blocked(blockers: string[], warnings: string[]): BookNarrativeCraftCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_narrative_craft_compile_result",
    schemaVersion: 1,
    status: "blocked",
    blockers,
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}
