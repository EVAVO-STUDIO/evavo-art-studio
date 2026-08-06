import {
  validateBookAuthorialVoiceProfile,
} from "./book-studio-authorial-voice-analyse";
import {
  type BookAuthorialVoiceEnhancementTargetId,
  type BookAuthorialVoiceProfileV1,
} from "./book-studio-authorial-voice-types";
import {
  BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
  type BookAuthorialChangeLayerId,
  type BookAuthorialChangePolicyV1,
  type BookAuthorialEnhancementBudgetV1,
  type BookAuthorialFlavourPlanV1,
  type BookAuthorialSynthesisCompileResultV1,
  type BookAuthorialSynthesisContextBlockV1,
  type BookAuthorialSynthesisOperation,
  type BookAuthorialSynthesisPacketV1,
  type BookAuthorialSynthesisQualityGateV1,
  type BookAuthorialUnitKind,
  type BookDialogueTextureId,
  type BookProseDeviceBudgetV1,
  type BookProseDeviceId,
} from "./book-studio-authorial-synthesis-types";
import {
  validateBookIdeaLabEvaluation,
} from "./book-studio-idea-lab";
import type { BookIdeaLabEvaluationV1 } from "./book-studio-idea-lab-types";
import { validateBookNarrativeCraftPacket } from "./book-studio-narrative-craft-packet";
import type { BookNarrativeCraftPacketV1 } from "./book-studio-narrative-craft-types";
import { validateBookNarrativeRegisterProfile } from "./book-studio-narrative-register";
import type { BookNarrativeRegisterProfileV1 } from "./book-studio-narrative-register-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  intersectsReviewCraft,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftBool,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  reviewCraftText,
  roundReviewCraft,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const UNIT_KINDS = new Set<BookAuthorialUnitKind>([
  "story_concept", "outline", "synopsis", "prologue", "chapter", "scene", "dialogue_exchange",
  "action_sequence", "description", "reflection", "interlude", "epilogue", "codex_entry",
  "letter_or_document", "poem_or_song_fragment", "title", "chapter_title", "blurb", "author_note",
  "line_level_pass",
]);
const OPERATIONS = new Set<BookAuthorialSynthesisOperation>([
  "ideate", "draft", "revise", "expand", "compress", "restructure", "line_edit", "dialogue_polish",
  "emotion_deepen", "tension_build", "description_enrich", "continuity_repair", "opening_rework", "ending_rework",
]);
const PROSE_DEVICES = new Set<BookProseDeviceId>([
  "anaphora", "epistrophe", "strategic_repetition", "parallelism", "asyndeton", "polysyndeton", "fragment",
  "periodic_sentence", "cumulative_sentence", "free_indirect_thought", "juxtaposition", "callback",
  "defamiliarisation", "metonymy", "synecdoche", "understatement", "negative_space", "withheld_subject",
  "sensory_crossfade", "sonic_echo", "image_turn", "motif_transformation",
]);
const DIALOGUE_TEXTURES = new Set<BookDialogueTextureId>([
  "plain_direct", "guarded", "status_formal", "intimate_indirect", "hostile_courteous", "comic_deflection",
  "procedural", "ritualised", "fragmented_under_pressure", "misunderstanding_and_repair", "strategic_silence",
  "mixed",
]);
const CHANGE_LAYERS = new Set<BookAuthorialChangeLayerId>([
  "meaning", "canon", "causality", "character_motive", "viewpoint", "scene_structure", "paragraph_structure",
  "sentence_structure", "diction", "imagery", "dialogue_surface", "punctuation",
]);
const INPUT_KEYS = new Set([
  "outputKind", "schemaVersion", "programmeId", "projectId", "volumeId", "manuscriptRevisionId", "synthesisId",
  "synthesisVersion", "unitKind", "operation", "targetUnitIds", "sourceTextSha256", "authorialVoiceProfile",
  "narrativeRegisterProfile", "narrativeCraftPacket", "ideaLabEvaluation", "selectedIdeaId",
  "enhancementBudgets", "flavourPlan", "changePolicy", "objective", "exactMeaningIds", "canonEvidenceIds",
  "factEvidenceIds", "continuityEvidenceIds", "evidenceIds",
]);
const ENHANCEMENT_KEYS = new Set(["targetId", "strength", "maximumVoiceDriftContribution", "evidenceIds"]);
const FLAVOUR_KEYS = new Set([
  "imageSourceDomainIds", "motifIds", "dialogueTextureIds", "proseDeviceBudgets", "prohibitedDeviceIds",
  "authorialRiskBudget", "maximumNewMotifs", "maximumFigurativeClustersPerThousandWords", "evidenceIds",
]);
const DEVICE_KEYS = new Set(["deviceId", "maximumPerThousandWords", "purpose", "evidenceIds"]);
const CHANGE_POLICY_KEYS = new Set([
  "semanticPreservationRequired", "maximumSurfaceChangeRatio", "lockedLayerIds", "flexibleLayerIds",
  "requireBeforeAfterEvidence", "requireVoiceComparison", "requireNarrativeCraftEvaluation",
  "requirePhraseOverlapScan", "requireIndependentReview",
]);

const SOURCE_OPERATIONS = new Set<BookAuthorialSynthesisOperation>([
  "revise", "expand", "compress", "restructure", "line_edit", "dialogue_polish", "emotion_deepen",
  "tension_build", "description_enrich", "continuity_repair", "opening_rework", "ending_rework",
]);
const STRUCTURAL_OPERATIONS = new Set<BookAuthorialSynthesisOperation>([
  "ideate", "draft", "restructure", "opening_rework", "ending_rework",
]);

const PRECEDENCE_RULES = Object.freeze([
  "Exact canon, facts, chronology, rights and required meaning outrank every craft preference.",
  "Project-owned authorial voice outranks genre, scenario, archetype and provider defaults.",
  "Character knowledge, motive, relationship history and viewpoint boundaries outrank convenient exposition.",
  "Causal consequence and scene purpose outrank ornamental prose or isolated cleverness.",
  "A selected idea controls the intended causal alternative but cannot override canon or project voice.",
  "Genre and scenario registers control reader expectation, pressure, pace and payoff without replacing voice.",
  "Enhancement targets and prose devices are bounded tools; they may intensify an existing tendency but may not become a new mannerism.",
  "When rules conflict, preserve meaning and voice, then report the blocked enhancement rather than silently rewriting authority.",
]);

const DEVICE_GUIDANCE: Readonly<Record<BookProseDeviceId, string>> = Object.freeze({
  anaphora: "Repeat an opening structure only when accumulation changes emotional or argumentative force.",
  epistrophe: "Repeat an ending structure only when the return sharpens consequence or inevitability.",
  strategic_repetition: "Repeat a word, action or image with changed context so meaning develops rather than stalls.",
  parallelism: "Use balanced syntax to expose comparison, conflict, ritual or choice.",
  asyndeton: "Remove conjunctions to compress urgency, accumulation or emotional refusal.",
  polysyndeton: "Add conjunctions to prolong burden, abundance, insistence or childlike immediacy.",
  fragment: "Use a fragment as controlled attention or impact, not as a default dramatic tic.",
  periodic_sentence: "Delay the grammatical completion when suspense or qualification benefits from held structure.",
  cumulative_sentence: "Let clauses accumulate perception or consequence after a clear independent core.",
  free_indirect_thought: "Blend viewpoint diction into narration without granting knowledge the focal character lacks.",
  juxtaposition: "Place images, actions or claims beside one another so the reader performs the comparison.",
  callback: "Return to an earlier detail after events have changed its practical or emotional meaning.",
  defamiliarisation: "Make a familiar object newly perceptible through exact viewpoint, use or consequence.",
  metonymy: "Let a concrete associated object carry institutional, relational or historical pressure.",
  synecdoche: "Use a part to reveal the whole only when the selected part is viewpoint- and world-specific.",
  understatement: "Reduce stated intensity when restraint, status, fear or self-protection makes the omission legible.",
  negative_space: "Let omission become meaningful through surrounding evidence, action and recipient knowledge.",
  withheld_subject: "Delay or omit the actor only when perception, shock, secrecy or sentence movement justifies it.",
  sensory_crossfade: "Move between senses to mark attention, memory or a change in scene pressure.",
  sonic_echo: "Use restrained sound recurrence to bind image or mood without turning prose into conspicuous alliteration.",
  image_turn: "Let an image change direction or implication as the character's understanding changes.",
  motif_transformation: "Repeat a project motif in altered material, scale, ownership or emotional context.",
});

const OPERATION_PROTOCOLS: Readonly<Record<BookAuthorialSynthesisOperation, string[]>> = Object.freeze({
  ideate: [
    "Use the idea lab rather than producing one polished answer.",
    "Separate causal alternatives before combining any strengths.",
    "Return options and evidence, not manuscript-ready canon.",
  ],
  draft: [
    "Establish the causal spine, viewpoint, character appraisals and scene register before surface polish.",
    "Draft in the project voice from the first paragraph rather than applying voice as a cosmetic rewrite.",
    "Leave evidence for unresolved facts, continuity and research rather than inventing certainty.",
  ],
  revise: [
    "Identify the exact failure before changing prose.",
    "Repair structure, motive, viewpoint and dialogue logic before sentence-level enhancement.",
    "Preserve unaffected strengths and compare voice before and after.",
  ],
  expand: [
    "Add only causally, psychologically, spatially or thematically necessary material.",
    "Expand through changed action, perception, relationship or consequence rather than paraphrase.",
    "Preserve the source cadence distribution instead of inflating every paragraph equally.",
  ],
  compress: [
    "Remove redundancy, throat-clearing and repeated implication before removing necessary evidence.",
    "Preserve causal bridges, character-specific reaction and spatial orientation.",
    "Use compression to sharpen pressure rather than flatten rhythm.",
  ],
  restructure: [
    "Reorder by causal and information logic, not by arbitrary excitement.",
    "Preserve exact canon and mark every moved setup, payoff and viewpoint dependency.",
    "Rebuild paragraph and scene transitions after structural movement.",
  ],
  line_edit: [
    "Preserve meaning, voice and paragraph purpose.",
    "Improve nouns, verbs, syntax, rhythm and specificity without smoothing idiosyncrasy into model-neutral prose.",
    "Reject changes that improve local fluency while weakening voice or implication.",
  ],
  dialogue_polish: [
    "Map each turn to the prior turn, hidden objective, recipient design and common-ground update.",
    "Differentiate voices through knowledge, syntax, risk and relationship rather than accent gimmicks.",
    "Use silence, interruption and evasion only when they change interpretation or leverage.",
  ],
  emotion_deepen: [
    "Trace appraisal, mixed feeling, action tendency, regulation, display and aftereffect.",
    "Replace generic emotional labels with character-specific attention, decisions and social performance.",
    "Do not increase melodrama merely by increasing bodily signals.",
  ],
  tension_build: [
    "Clarify the threatened outcome, missing cause or unstable expectation.",
    "Narrow options, time, trust or resources through causal action.",
    "Vary pressure and release so every paragraph is not written at maximum urgency.",
  ],
  description_enrich: [
    "Select details through viewpoint expertise, fear, desire, fatigue and task.",
    "Make setting affect movement, choice, status, memory or consequence.",
    "Use image systems and devices within their budgets rather than decorating every sentence.",
  ],
  continuity_repair: [
    "Preserve the strongest established canon and repair the smallest exact scope that resolves the contradiction.",
    "Propagate changed knowledge, timing, injury, resources and relationship state downstream.",
    "Do not hide a continuity repair behind vague prose.",
  ],
  opening_rework: [
    "Establish a specific normal, pressure, viewpoint and question without front-loading explanation.",
    "Plant images and obligations whose meaning can change later.",
    "Earn urgency through disrupted possibility rather than generic danger language.",
  ],
  ending_rework: [
    "Resolve the central value choice through action and consequence before adding resonance.",
    "Pay off selected setups without explaining every theme.",
    "Let the final image, line or silence carry changed meaning specific to the project.",
  ],
});

export async function compileBookAuthorialSynthesis(input: unknown): Promise<BookAuthorialSynthesisCompileResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = reviewCraftRecord(input, "Authorial synthesis compile input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Authorial synthesis compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_synthesis_compile_input") blockers.push("Authorial synthesis input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Authorial synthesis input schemaVersion is invalid.");
  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const projectId = reviewCraftId(source.projectId, "projectId", blockers);
  const volumeId = reviewCraftId(source.volumeId, "volumeId", blockers);
  const manuscriptRevisionId = reviewCraftId(source.manuscriptRevisionId, "manuscriptRevisionId", blockers);
  const synthesisId = reviewCraftId(source.synthesisId, "synthesisId", blockers);
  const synthesisVersion = reviewCraftInteger(source.synthesisVersion, "synthesisVersion", blockers, 1, 1_000_000);
  const unitKind = reviewCraftEnum(source.unitKind, UNIT_KINDS, "unitKind", blockers, "scene");
  const operation = reviewCraftEnum(source.operation, OPERATIONS, "operation", blockers, "revise");
  const targetUnitIds = reviewCraftIds(source.targetUnitIds, "targetUnitIds", blockers, 1_024, true);
  const sourceTextSha256 = source.sourceTextSha256 === undefined
    ? undefined
    : reviewCraftDigest(source.sourceTextSha256, "sourceTextSha256", blockers);
  if (SOURCE_OPERATIONS.has(operation) && !sourceTextSha256) blockers.push(`Operation ${operation} requires sourceTextSha256.`);
  if (!SOURCE_OPERATIONS.has(operation) && sourceTextSha256) warnings.push(`Operation ${operation} received sourceTextSha256; it will remain an exact comparison identity rather than implying source mutation.`);

  const voiceBlockers = await validateBookAuthorialVoiceProfile(source.authorialVoiceProfile);
  const registerBlockers = await validateBookNarrativeRegisterProfile(source.narrativeRegisterProfile);
  const craftBlockers = await validateBookNarrativeCraftPacket(source.narrativeCraftPacket);
  blockers.push(...voiceBlockers.map((item) => `Authorial voice profile: ${item}`));
  blockers.push(...registerBlockers.map((item) => `Narrative register profile: ${item}`));
  blockers.push(...craftBlockers.map((item) => `Narrative craft packet: ${item}`));
  const voiceProfile = source.authorialVoiceProfile as BookAuthorialVoiceProfileV1;
  const registerProfile = source.narrativeRegisterProfile as BookNarrativeRegisterProfileV1;
  const craftPacket = source.narrativeCraftPacket as BookNarrativeCraftPacketV1;
  validateIdentityBindings({ programmeId, projectId, volumeId, manuscriptRevisionId, voiceProfile, registerProfile, craftPacket }, blockers);

  let ideaLabEvaluation: BookIdeaLabEvaluationV1 | undefined;
  if (source.ideaLabEvaluation !== undefined) {
    const ideaBlockers = await validateBookIdeaLabEvaluation(source.ideaLabEvaluation);
    blockers.push(...ideaBlockers.map((item) => `Idea lab evaluation: ${item}`));
    if (!ideaBlockers.length) ideaLabEvaluation = source.ideaLabEvaluation as BookIdeaLabEvaluationV1;
  }
  const selectedIdeaId = source.selectedIdeaId === undefined
    ? undefined
    : reviewCraftId(source.selectedIdeaId, "selectedIdeaId", blockers);
  if (selectedIdeaId && !ideaLabEvaluation) blockers.push("selectedIdeaId requires an exact ideaLabEvaluation.");
  if (ideaLabEvaluation && !selectedIdeaId) blockers.push("An ideaLabEvaluation requires selectedIdeaId for authorial synthesis.");
  if (ideaLabEvaluation && selectedIdeaId) {
    if (ideaLabEvaluation.status !== "ready_for_human_choice") blockers.push("Selected idea requires an idea lab evaluation ready for human choice.");
    if (!ideaLabEvaluation.portfolio.some((item) => item.ideaId === selectedIdeaId)) blockers.push(`Selected idea ${selectedIdeaId} is not present in the approved divergent portfolio.`);
  }
  if (STRUCTURAL_OPERATIONS.has(operation) && !selectedIdeaId) warnings.push(`Structural operation ${operation} has no selected idea portfolio evidence; it must preserve existing causality rather than inventing an unreviewed direction.`);

  const enhancementBudgets = parseEnhancementBudgets(source.enhancementBudgets, voiceProfile, blockers);
  const flavourPlan = parseFlavourPlan(source.flavourPlan, blockers);
  const changePolicy = parseChangePolicy(source.changePolicy, operation, sourceTextSha256, blockers, warnings);
  const objective = reviewCraftText(source.objective, "objective", blockers, 20_000);
  const exactMeaningIds = reviewCraftIds(source.exactMeaningIds, "exactMeaningIds", blockers, 4_096, changePolicy.semanticPreservationRequired);
  const canonEvidenceIds = reviewCraftIds(source.canonEvidenceIds, "canonEvidenceIds", blockers, 8_192, true);
  const factEvidenceIds = reviewCraftIds(source.factEvidenceIds, "factEvidenceIds", blockers, 8_192, false);
  const continuityEvidenceIds = reviewCraftIds(source.continuityEvidenceIds, "continuityEvidenceIds", blockers, 8_192, false);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 8_192, true);

  if (["dialogue_exchange", "dialogue_polish"].includes(unitKind) && !flavourPlan.dialogueTextureIds.length) blockers.push("Dialogue work requires at least one dialogue texture.");
  if (unitKind === "poem_or_song_fragment" && flavourPlan.authorialRiskBudget < 0.2) warnings.push("Poem or song fragment has a very low authorial risk budget and may remain overly conservative.");
  const finalBlockers = uniqueReviewCraft(blockers);
  if (finalBlockers.length) return blocked(finalBlockers, warnings);

  const qualityGates = buildQualityGates(changePolicy, Boolean(selectedIdeaId));
  const operationProtocol = [...OPERATION_PROTOCOLS[operation]];
  const providerInstruction = buildProviderInstruction({
    synthesisId,
    synthesisVersion,
    unitKind,
    operation,
    objective,
    voiceProfile,
    registerProfile,
    craftPacket,
    ideaLabEvaluation,
    selectedIdeaId,
    enhancementBudgets,
    flavourPlan,
    changePolicy,
    exactMeaningIds,
    canonEvidenceIds,
    factEvidenceIds,
    continuityEvidenceIds,
    operationProtocol,
    qualityGates,
  });
  const base: Omit<BookAuthorialSynthesisPacketV1, "writingContextBlock" | "packetFingerprint"> = {
    outputKind: "evavo_docs_book_authorial_synthesis_packet",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    status: "ready",
    programmeId,
    projectId,
    volumeId,
    manuscriptRevisionId,
    synthesisId,
    synthesisVersion,
    unitKind,
    operation,
    targetUnitIds,
    ...(sourceTextSha256 === undefined ? {} : { sourceTextSha256 }),
    authorialVoiceProfileFingerprint: voiceProfile.profileFingerprint,
    narrativeRegisterProfileFingerprint: registerProfile.profileFingerprint,
    narrativeCraftPacketFingerprint: craftPacket.packetFingerprint,
    ...(ideaLabEvaluation === undefined ? {} : { ideaLabEvaluationFingerprint: ideaLabEvaluation.evaluationFingerprint }),
    ...(selectedIdeaId === undefined ? {} : { selectedIdeaId }),
    enhancementBudgets,
    flavourPlan,
    changePolicy,
    objective,
    exactMeaningIds,
    canonEvidenceIds,
    factEvidenceIds,
    continuityEvidenceIds,
    evidenceIds,
    precedenceRules: [...PRECEDENCE_RULES],
    operationProtocol,
    qualityGates,
    providerInstruction,
    projectVoiceRemainsAuthoritative: true,
    genreRegisterMayReplaceVoice: false,
    ideaMayOverrideCanon: false,
    namedCreatorInstructionPermitted: false,
    rawSourceTextPersisted: false,
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
  const writingContextBlock = await buildContextBlock(base);
  const unsigned: Omit<BookAuthorialSynthesisPacketV1, "packetFingerprint"> = { ...base, writingContextBlock };
  const packetFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const packet: BookAuthorialSynthesisPacketV1 = { ...unsigned, packetFingerprint };
  return {
    outputKind: "evavo_docs_book_authorial_synthesis_compile_result",
    schemaVersion: 1,
    status: "ready",
    packet,
    packetFingerprint,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

export async function validateBookAuthorialSynthesisPacket(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Authorial synthesis packet", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_synthesis_packet" || source.schemaVersion !== 1 || source.contract !== BOOK_AUTHORIAL_SYNTHESIS_CONTRACT || source.status !== "ready") blockers.push("Authorial synthesis packet identity is invalid.");
  if (source.projectVoiceRemainsAuthoritative !== true) blockers.push("Authorial synthesis packet must preserve project voice authority.");
  for (const key of [
    "genreRegisterMayReplaceVoice", "ideaMayOverrideCanon", "namedCreatorInstructionPermitted", "rawSourceTextPersisted",
    "providerCallPerformed", "automaticCanonicalAdmissionAllowed", "canonicalManuscriptMutationPerformed", "publicationPerformed",
  ]) if (source[key] !== false) blockers.push(`Authorial synthesis packet ${key} must remain false.`);
  const packetFingerprint = reviewCraftDigest(source.packetFingerprint, "packetFingerprint", blockers);
  const { packetFingerprint: _discarded, ...unsigned } = source;
  if (packetFingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Authorial synthesis packet fingerprint does not match its exact contents.");
  const context = reviewCraftRecord(source.writingContextBlock, "writingContextBlock", blockers);
  const contextText = typeof context.text === "string" ? context.text : "";
  const textSha256 = reviewCraftDigest(context.textSha256, "writingContextBlock.textSha256", blockers);
  if (textSha256 !== await sha256ReviewCraftText(contextText)) blockers.push("Authorial synthesis context text hash does not match.");
  const expectedFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson({
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    role: "constraint",
    textSha256,
  }));
  if (reviewCraftDigest(context.objectFingerprint, "writingContextBlock.objectFingerprint", blockers) !== expectedFingerprint) blockers.push("Authorial synthesis context fingerprint does not match.");
  const expectedObjectId = `authorial-synthesis:${textSha256.slice("sha256:".length, "sha256:".length + 24)}`;
  if (context.role !== "constraint" || context.objectId !== expectedObjectId) blockers.push("Authorial synthesis context identity is invalid.");
  return uniqueReviewCraft(blockers);
}

export function listBookAuthorialSynthesisCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_authorial_synthesis_capabilities",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    unitKinds: [...UNIT_KINDS].sort(),
    operations: [...OPERATIONS].sort(),
    proseDevices: [...PROSE_DEVICES].sort(),
    dialogueTextures: [...DIALOGUE_TEXTURES].sort(),
    changeLayers: [...CHANGE_LAYERS].sort(),
    authorialVoiceProfileRequired: true,
    narrativeRegisterProfileRequired: true,
    narrativeCraftPacketRequired: true,
    ideaPortfolioSupported: true,
    projectVoiceRemainsAuthoritative: true,
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}

function validateIdentityBindings(input: {
  programmeId: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  voiceProfile: BookAuthorialVoiceProfileV1;
  registerProfile: BookNarrativeRegisterProfileV1;
  craftPacket: BookNarrativeCraftPacketV1;
}, blockers: string[]): void {
  if (input.voiceProfile.programmeId !== input.programmeId || input.voiceProfile.projectId !== input.projectId) blockers.push("Authorial synthesis identity differs from the voice profile.");
  if (input.registerProfile.programmeId !== input.programmeId || input.registerProfile.projectId !== input.projectId || input.registerProfile.volumeId !== input.volumeId) blockers.push("Authorial synthesis identity differs from the narrative register.");
  if (input.registerProfile.authorialVoiceProfileFingerprint !== input.voiceProfile.profileFingerprint) blockers.push("Narrative register is not bound to the supplied authorial voice profile.");
  if (input.craftPacket.programmeId !== input.programmeId || input.craftPacket.projectId !== input.projectId || input.craftPacket.volumeId !== input.volumeId || input.craftPacket.manuscriptRevisionId !== input.manuscriptRevisionId) blockers.push("Authorial synthesis identity differs from the narrative craft packet.");
}

function parseEnhancementBudgets(
  value: unknown,
  voiceProfile: BookAuthorialVoiceProfileV1,
  blockers: string[],
): BookAuthorialEnhancementBudgetV1[] {
  const allowed = new Map(voiceProfile.enhancementTargets.map((item) => [item.targetId, item.strength]));
  const allowedIds = new Set<BookAuthorialVoiceEnhancementTargetId>(voiceProfile.enhancementTargets.map((item) => item.targetId));
  const records = reviewCraftArray(value, "enhancementBudgets", blockers, 0, Math.max(allowedIds.size, 1));
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `enhancement budget ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, ENHANCEMENT_KEYS, `enhancement budget ${index + 1}`, blockers);
    const targetId = reviewCraftEnum(source.targetId, allowedIds, `enhancement budget ${index + 1} targetId`, blockers, voiceProfile.enhancementTargets[0]?.targetId ?? "concrete_specificity");
    const strength = roundReviewCraft(reviewCraftFinite(source.strength, `enhancement budget ${index + 1} strength`, blockers, 0, 1), 3);
    const configured = allowed.get(targetId) ?? 0;
    if (strength > configured + 0.1) blockers.push(`Enhancement ${targetId} strength ${strength} exceeds the project-owned voice allowance ${configured}.`);
    return {
      targetId,
      strength,
      maximumVoiceDriftContribution: roundReviewCraft(reviewCraftFinite(source.maximumVoiceDriftContribution, `enhancement budget ${index + 1} maximumVoiceDriftContribution`, blockers, 0, 0.25), 3),
      evidenceIds: reviewCraftIds(source.evidenceIds, `enhancement budget ${index + 1} evidenceIds`, blockers, 128, true),
    };
  }).sort((left, right) => left.targetId.localeCompare(right.targetId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.targetId));
  if (duplicates.length) blockers.push(`Enhancement budgets are duplicated: ${duplicates.join(", ")}.`);
  const totalDrift = result.reduce((sum, item) => sum + item.maximumVoiceDriftContribution, 0);
  if (totalDrift > 0.5) blockers.push(`Combined enhancement voice-drift contribution ${roundReviewCraft(totalDrift, 3)} exceeds 0.5.`);
  return result;
}

function parseFlavourPlan(value: unknown, blockers: string[]): BookAuthorialFlavourPlanV1 {
  const source = reviewCraftRecord(value, "flavourPlan", blockers);
  rejectReviewCraftUnknown(source, FLAVOUR_KEYS, "flavourPlan", blockers);
  const dialogueTextureIds = parseDialogueTextures(source.dialogueTextureIds, blockers);
  const proseDeviceBudgets = parseDeviceBudgets(source.proseDeviceBudgets, blockers);
  const prohibitedDeviceIds = parseDeviceIds(source.prohibitedDeviceIds, "prohibitedDeviceIds", blockers);
  const overlap = intersectsReviewCraft(proseDeviceBudgets.map((item) => item.deviceId), prohibitedDeviceIds);
  if (overlap.length) blockers.push(`Prose devices cannot be both budgeted and prohibited: ${overlap.join(", ")}.`);
  return {
    imageSourceDomainIds: reviewCraftIds(source.imageSourceDomainIds, "flavourPlan.imageSourceDomainIds", blockers, 128, false),
    motifIds: reviewCraftIds(source.motifIds, "flavourPlan.motifIds", blockers, 256, false),
    dialogueTextureIds,
    proseDeviceBudgets,
    prohibitedDeviceIds,
    authorialRiskBudget: roundReviewCraft(reviewCraftFinite(source.authorialRiskBudget, "flavourPlan.authorialRiskBudget", blockers, 0, 1), 3),
    maximumNewMotifs: reviewCraftInteger(source.maximumNewMotifs, "flavourPlan.maximumNewMotifs", blockers, 0, 12),
    maximumFigurativeClustersPerThousandWords: roundReviewCraft(reviewCraftFinite(source.maximumFigurativeClustersPerThousandWords, "flavourPlan.maximumFigurativeClustersPerThousandWords", blockers, 0, 20), 2),
    evidenceIds: reviewCraftIds(source.evidenceIds, "flavourPlan.evidenceIds", blockers, 1_024, true),
  };
}

function parseDialogueTextures(value: unknown, blockers: string[]): BookDialogueTextureId[] {
  if (!Array.isArray(value) || value.length > DIALOGUE_TEXTURES.size) {
    blockers.push("flavourPlan.dialogueTextureIds is invalid or unbounded.");
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, DIALOGUE_TEXTURES, "flavourPlan.dialogueTextureIds", blockers, "mixed"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`flavourPlan.dialogueTextureIds contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function parseDeviceIds(value: unknown, label: string, blockers: string[]): BookProseDeviceId[] {
  if (!Array.isArray(value) || value.length > PROSE_DEVICES.size) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, PROSE_DEVICES, label, blockers, "strategic_repetition"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function parseDeviceBudgets(value: unknown, blockers: string[]): BookProseDeviceBudgetV1[] {
  const records = reviewCraftArray(value, "flavourPlan.proseDeviceBudgets", blockers, 0, 16);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `prose device budget ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, DEVICE_KEYS, `prose device budget ${index + 1}`, blockers);
    return {
      deviceId: reviewCraftEnum(source.deviceId, PROSE_DEVICES, `prose device budget ${index + 1} deviceId`, blockers, "strategic_repetition"),
      maximumPerThousandWords: roundReviewCraft(reviewCraftFinite(source.maximumPerThousandWords, `prose device budget ${index + 1} maximumPerThousandWords`, blockers, 0, 30), 2),
      purpose: reviewCraftText(source.purpose, `prose device budget ${index + 1} purpose`, blockers, 1_000),
      evidenceIds: reviewCraftIds(source.evidenceIds, `prose device budget ${index + 1} evidenceIds`, blockers, 128, true),
    };
  }).sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.deviceId));
  if (duplicates.length) blockers.push(`Prose device budgets are duplicated: ${duplicates.join(", ")}.`);
  return result;
}

function parseChangePolicy(
  value: unknown,
  operation: BookAuthorialSynthesisOperation,
  sourceTextSha256: string | undefined,
  blockers: string[],
  warnings: string[],
): BookAuthorialChangePolicyV1 {
  const source = reviewCraftRecord(value, "changePolicy", blockers);
  rejectReviewCraftUnknown(source, CHANGE_POLICY_KEYS, "changePolicy", blockers);
  const lockedLayerIds = parseChangeLayers(source.lockedLayerIds, "changePolicy.lockedLayerIds", blockers, false);
  const flexibleLayerIds = parseChangeLayers(source.flexibleLayerIds, "changePolicy.flexibleLayerIds", blockers, true);
  const overlap = intersectsReviewCraft(lockedLayerIds, flexibleLayerIds);
  if (overlap.length) blockers.push(`Change layers cannot be both locked and flexible: ${overlap.join(", ")}.`);
  const semanticPreservationRequired = reviewCraftBool(source.semanticPreservationRequired, "changePolicy.semanticPreservationRequired", blockers);
  const maximumSurfaceChangeRatio = roundReviewCraft(reviewCraftFinite(source.maximumSurfaceChangeRatio, "changePolicy.maximumSurfaceChangeRatio", blockers, 0, 1), 3);
  const requireBeforeAfterEvidence = reviewCraftBool(source.requireBeforeAfterEvidence, "changePolicy.requireBeforeAfterEvidence", blockers);
  const result: BookAuthorialChangePolicyV1 = {
    semanticPreservationRequired,
    maximumSurfaceChangeRatio,
    lockedLayerIds,
    flexibleLayerIds,
    requireBeforeAfterEvidence,
    requireVoiceComparison: reviewCraftBool(source.requireVoiceComparison, "changePolicy.requireVoiceComparison", blockers),
    requireNarrativeCraftEvaluation: reviewCraftBool(source.requireNarrativeCraftEvaluation, "changePolicy.requireNarrativeCraftEvaluation", blockers),
    requirePhraseOverlapScan: reviewCraftBool(source.requirePhraseOverlapScan, "changePolicy.requirePhraseOverlapScan", blockers),
    requireIndependentReview: reviewCraftBool(source.requireIndependentReview, "changePolicy.requireIndependentReview", blockers),
  };
  if (SOURCE_OPERATIONS.has(operation) && !semanticPreservationRequired && ["line_edit", "dialogue_polish", "compress", "continuity_repair"].includes(operation)) blockers.push(`Operation ${operation} requires semantic preservation.`);
  if (sourceTextSha256 && !requireBeforeAfterEvidence) blockers.push("Source-bound synthesis requires before/after evidence.");
  if (operation === "line_edit" && maximumSurfaceChangeRatio > 0.35) blockers.push("Line editing maximumSurfaceChangeRatio cannot exceed 0.35.");
  if (operation === "dialogue_polish" && maximumSurfaceChangeRatio > 0.5) blockers.push("Dialogue polishing maximumSurfaceChangeRatio cannot exceed 0.5.");
  if (operation === "compress" && maximumSurfaceChangeRatio > 0.65) warnings.push("Compression allows a high surface-change ratio; review voice and causal evidence closely.");
  if (!result.requireVoiceComparison) blockers.push("Authorial synthesis requires voice comparison before review readiness.");
  if (!result.requireNarrativeCraftEvaluation) blockers.push("Authorial synthesis requires narrative craft evaluation.");
  if (!result.requirePhraseOverlapScan) blockers.push("Authorial synthesis requires phrase-overlap assurance.");
  if (!result.requireIndependentReview) blockers.push("Authorial synthesis requires independent review.");
  return result;
}

function parseChangeLayers(value: unknown, label: string, blockers: string[], required: boolean): BookAuthorialChangeLayerId[] {
  if (!Array.isArray(value) || value.length > CHANGE_LAYERS.size || (required && value.length === 0)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, CHANGE_LAYERS, label, blockers, "sentence_structure"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function buildQualityGates(changePolicy: BookAuthorialChangePolicyV1, selectedIdea: boolean): BookAuthorialSynthesisQualityGateV1[] {
  return [
    { gateId: "identity_and_scope", mandatory: true, passCondition: "Every output change remains inside exact target units and bound project identities.", requiredEvidenceKinds: ["target-unit", "packet-fingerprint"] },
    { gateId: "meaning_and_canon", mandatory: true, passCondition: "Required meaning, facts, chronology, canon and continuity remain supported after the change.", requiredEvidenceKinds: ["before-after", "canon", "fact", "continuity"] },
    { gateId: "authorial_voice", mandatory: changePolicy.requireVoiceComparison, passCondition: "The candidate passes the project authorial voice comparison and preserves core metrics.", requiredEvidenceKinds: ["voice-comparison"] },
    { gateId: "narrative_craft", mandatory: changePolicy.requireNarrativeCraftEvaluation, passCondition: "The candidate passes causal, psychological, dialogue, viewpoint, prose and originality criteria.", requiredEvidenceKinds: ["narrative-craft-evaluation"] },
    { gateId: "selected_idea", mandatory: selectedIdea, passCondition: "The candidate executes the selected divergent idea without collapsing it into another alternative or overriding canon.", requiredEvidenceKinds: ["idea-evaluation", "selected-idea"] },
    { gateId: "device_budget", mandatory: true, passCondition: "Prose devices, motifs and figurative clusters remain inside declared budgets and serve stated purposes.", requiredEvidenceKinds: ["device-usage", "motif-usage"] },
    { gateId: "phrase_overlap", mandatory: changePolicy.requirePhraseOverlapScan, passCondition: "The candidate passes rights-tracked phrase-overlap assurance.", requiredEvidenceKinds: ["phrase-overlap"] },
    { gateId: "independent_review", mandatory: changePolicy.requireIndependentReview, passCondition: "An independent reviewer verifies voice preservation, scene function and unresolved risks.", requiredEvidenceKinds: ["independent-review"] },
  ];
}

function buildProviderInstruction(input: {
  synthesisId: string;
  synthesisVersion: number;
  unitKind: BookAuthorialUnitKind;
  operation: BookAuthorialSynthesisOperation;
  objective: string;
  voiceProfile: BookAuthorialVoiceProfileV1;
  registerProfile: BookNarrativeRegisterProfileV1;
  craftPacket: BookNarrativeCraftPacketV1;
  ideaLabEvaluation: BookIdeaLabEvaluationV1 | undefined;
  selectedIdeaId: string | undefined;
  enhancementBudgets: BookAuthorialEnhancementBudgetV1[];
  flavourPlan: BookAuthorialFlavourPlanV1;
  changePolicy: BookAuthorialChangePolicyV1;
  exactMeaningIds: string[];
  canonEvidenceIds: string[];
  factEvidenceIds: string[];
  continuityEvidenceIds: string[];
  operationProtocol: string[];
  qualityGates: BookAuthorialSynthesisQualityGateV1[];
}): string {
  return [
    `EVAVO AUTHORIAL SYNTHESIS: ${input.synthesisId} v${input.synthesisVersion}`,
    `Unit kind: ${input.unitKind}. Operation: ${input.operation}.`,
    `Objective: ${input.objective}`,
    "AUTHORITY PRECEDENCE",
    ...PRECEDENCE_RULES.map((item, index) => `${index + 1}. ${item}`),
    "PROJECT VOICE",
    input.voiceProfile.providerInstruction,
    "GENRE, SCENE AND SCENARIO REGISTER",
    input.registerProfile.providerInstruction,
    "NARRATIVE CRAFT",
    input.craftPacket.providerInstruction,
    input.selectedIdeaId
      ? `SELECTED DIVERGENT IDEA: ${input.selectedIdeaId}, evaluation ${input.ideaLabEvaluation?.evaluationFingerprint}. Execute this option's causal and emotional logic without borrowing surface expression from another candidate.`
      : "NO SELECTED IDEA: preserve established causal direction and do not invent an unreviewed structural alternative.",
    "ENHANCEMENT BUDGETS",
    ...(input.enhancementBudgets.length
      ? input.enhancementBudgets.map((item) => `- ${item.targetId}: strength ${item.strength}, maximum voice-drift contribution ${item.maximumVoiceDriftContribution}.`)
      : ["- No additional enhancement targets are authorised beyond the existing craft and voice profiles."]),
    "FLAVOUR PLAN",
    `- Image source domains: ${input.flavourPlan.imageSourceDomainIds.join(", ") || "project evidence only"}.`,
    `- Motifs: ${input.flavourPlan.motifIds.join(", ") || "no required motif"}.`,
    `- Dialogue textures: ${input.flavourPlan.dialogueTextureIds.join(", ") || "scene evidence decides"}.`,
    `- Authorial risk budget: ${input.flavourPlan.authorialRiskBudget}.`,
    `- Maximum new motifs: ${input.flavourPlan.maximumNewMotifs}.`,
    `- Maximum figurative clusters per thousand words: ${input.flavourPlan.maximumFigurativeClustersPerThousandWords}.`,
    ...input.flavourPlan.proseDeviceBudgets.flatMap((item) => [
      `- ${item.deviceId}: maximum ${item.maximumPerThousandWords} per thousand words; purpose: ${item.purpose}`,
      `  ${DEVICE_GUIDANCE[item.deviceId]}`,
    ]),
    `- Prohibited devices: ${input.flavourPlan.prohibitedDeviceIds.join(", ") || "none beyond ordinary anti-genericity rules"}.`,
    "CHANGE POLICY",
    `- Semantic preservation required: ${input.changePolicy.semanticPreservationRequired}.`,
    `- Maximum surface change ratio: ${input.changePolicy.maximumSurfaceChangeRatio}.`,
    `- Locked layers: ${input.changePolicy.lockedLayerIds.join(", ") || "none"}.`,
    `- Flexible layers: ${input.changePolicy.flexibleLayerIds.join(", ")}.`,
    `- Required meaning identities: ${input.exactMeaningIds.join(", ") || "none for new drafting"}.`,
    `- Canon evidence: ${input.canonEvidenceIds.join(", ")}.`,
    `- Fact evidence: ${input.factEvidenceIds.join(", ") || "none supplied"}.`,
    `- Continuity evidence: ${input.continuityEvidenceIds.join(", ") || "none supplied"}.`,
    "OPERATION PROTOCOL",
    ...input.operationProtocol.map((item) => `- ${item}`),
    "REQUIRED QUALITY GATES",
    ...input.qualityGates.map((item) => `- ${item.gateId}: ${item.passCondition}`),
    "Return candidate writing and concise evidence only. Do not expose chain-of-thought, mutate canonical state, approve your own result, call another provider, or publish.",
  ].join("\n");
}

async function buildContextBlock(
  packet: Omit<BookAuthorialSynthesisPacketV1, "writingContextBlock" | "packetFingerprint">,
): Promise<BookAuthorialSynthesisContextBlockV1> {
  const text = canonicalReviewCraftJson({
    outputKind: "evavo_docs_book_authorial_synthesis_context",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    synthesisId: packet.synthesisId,
    synthesisVersion: packet.synthesisVersion,
    programmeId: packet.programmeId,
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    manuscriptRevisionId: packet.manuscriptRevisionId,
    unitKind: packet.unitKind,
    operation: packet.operation,
    targetUnitIds: packet.targetUnitIds,
    sourceTextSha256: packet.sourceTextSha256,
    authorialVoiceProfileFingerprint: packet.authorialVoiceProfileFingerprint,
    narrativeRegisterProfileFingerprint: packet.narrativeRegisterProfileFingerprint,
    narrativeCraftPacketFingerprint: packet.narrativeCraftPacketFingerprint,
    ideaLabEvaluationFingerprint: packet.ideaLabEvaluationFingerprint,
    selectedIdeaId: packet.selectedIdeaId,
    enhancementBudgets: packet.enhancementBudgets,
    flavourPlan: packet.flavourPlan,
    changePolicy: packet.changePolicy,
    objective: packet.objective,
    exactMeaningIds: packet.exactMeaningIds,
    canonEvidenceIds: packet.canonEvidenceIds,
    factEvidenceIds: packet.factEvidenceIds,
    continuityEvidenceIds: packet.continuityEvidenceIds,
    precedenceRules: packet.precedenceRules,
    operationProtocol: packet.operationProtocol,
    qualityGates: packet.qualityGates,
    providerInstruction: packet.providerInstruction,
    authority: {
      projectVoiceRemainsAuthoritative: true,
      genreRegisterMayReplaceVoice: false,
      ideaMayOverrideCanon: false,
      namedCreatorInstructionPermitted: false,
      automaticCanonicalAdmissionAllowed: false,
    },
  });
  const textSha256 = await sha256ReviewCraftText(text);
  const objectFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson({
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    role: "constraint",
    textSha256,
  }));
  return {
    objectId: `authorial-synthesis:${textSha256.slice("sha256:".length, "sha256:".length + 24)}`,
    objectFingerprint,
    role: "constraint",
    text,
    textSha256,
  };
}

function blocked(blockers: string[], warnings: string[]): BookAuthorialSynthesisCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_authorial_synthesis_compile_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}
