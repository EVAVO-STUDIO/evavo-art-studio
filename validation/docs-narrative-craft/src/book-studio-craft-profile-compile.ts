import { BOOK_REVIEW_CRAFT_CONTRACT } from "./book-studio-review-craft-types";
import {
  canonicalReviewCraftJson,
  reviewCraftArray,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

export async function compileBookCraftProfile(input: unknown) {
  const blockers: string[] = [];
  const source = reviewCraftRecord(input, "Book craft compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_craft_compile_input") blockers.push("Book craft compile input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Book craft compile input schemaVersion is invalid.");
  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const profileId = reviewCraftId(source.profileId, "profileId", blockers);
  const profileVersion = reviewCraftInteger(source.profileVersion, "profileVersion", blockers, 1, 1_000_000);
  const projectVoiceAnchorIds = reviewCraftIds(source.projectVoiceAnchorIds, "projectVoiceAnchorIds", blockers, 256, true);
  const narrativeConstraintIds = reviewCraftIds(source.narrativeConstraintIds, "narrativeConstraintIds", blockers, 256, true);
  const acceptedPatternIds = reviewCraftIds(source.acceptedPatternIds, "acceptedPatternIds", blockers, 256, false);
  const rejectedPatternIds = reviewCraftIds(source.rejectedPatternIds, "rejectedPatternIds", blockers, 256, false);
  const influences = reviewCraftArray(source.influences, "influences", blockers, 2, 24);
  if (projectVoiceAnchorIds.length < 3) blockers.push("Craft profile requires at least three project-owned voice anchors.");
  if (blockers.length) {
    return {
      outputKind: "evavo_docs_book_craft_compile_result",
      schemaVersion: 1,
      status: "blocked" as const,
      blockers: uniqueReviewCraft(blockers),
      warnings: [],
      canonicalAdmissionAllowed: false as const,
      publicationPerformed: false as const,
    };
  }
  const providerInstruction = [
    `ORIGINAL CRAFT PROFILE: ${profileId} v${profileVersion}`,
    "Use only de-identified general craft mechanisms and exact project-owned evidence.",
    "Do not reconstruct a source creator, work, signature phrase or recognisable surface mannerism.",
    `Project voice anchors: ${projectVoiceAnchorIds.join(", ")}.`,
    `Narrative constraints: ${narrativeConstraintIds.join(", ")}.`,
    `Rejected patterns: ${rejectedPatternIds.join(", ") || "none"}.`,
  ].join("\n");
  const unsigned = {
    outputKind: "evavo_docs_book_craft_profile" as const,
    schemaVersion: 1 as const,
    contract: BOOK_REVIEW_CRAFT_CONTRACT,
    authorityMode: "shadow_migration" as const,
    status: "ready" as const,
    programmeId,
    profileId,
    profileVersion,
    synthesisDepth: 1,
    normalizedInfluences: influences.map((_, index) => ({
      influenceId: `validation-influence-${index + 1}`,
      normalizedWeight: 1 / influences.length,
      sourceKind: "abstract_profile",
      rightsBasis: "abstract_observation",
      sourceFingerprint: `sha256:${String(index + 1).padStart(64, "0")}`,
      productionMechanismIds: [`validation-mechanism-${index + 1}`],
      withheldMechanismIds: [],
      ancestryProfileFingerprints: [],
      synthesisDepth: 0,
    })),
    dimensions: [
      { dimensionId: "causal-pressure", value: 0.1, confidence: 0.9, mechanismCount: influences.length, productionDirections: ["Preserve causal consequence."], sourceInfluenceIds: influences.map((_, index) => `validation-influence-${index + 1}`) },
      { dimensionId: "dialogue-indirection", value: 0, confidence: 0.9, mechanismCount: influences.length, productionDirections: ["Preserve recipient-sensitive dialogue."], sourceInfluenceIds: influences.map((_, index) => `validation-influence-${index + 1}`) },
    ],
    influenceDistances: influences.map((_, index) => ({ influenceId: `validation-influence-${index + 1}`, distance: 0.5 })),
    pairwiseInfluenceDiversity: 0.5,
    projectVoiceAnchorIds,
    narrativeConstraintIds,
    acceptedPatternIds,
    rejectedPatternIds,
    providerInstruction,
    providerBriefContainsNamedSources: false as const,
    directImitationPermitted: false as const,
    phraseLaunderingPermitted: false as const,
    projectOwnedExpressionRequired: true as const,
    canonicalAdmissionAllowed: false as const,
    websiteCompatibilityRuntimeStillAuthoritative: true as const,
    dualAuthoritativeWritesAllowed: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  const profileFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const profile = { ...unsigned, profileFingerprint };
  return {
    outputKind: "evavo_docs_book_craft_compile_result",
    schemaVersion: 1,
    status: "ready" as const,
    profile,
    profileFingerprint,
    blockers: [],
    warnings: [],
    canonicalAdmissionAllowed: false as const,
    publicationPerformed: false as const,
  };
}
