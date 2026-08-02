import type { BookProviderId } from "./book-studio-project-contracts";
import {
  fingerprintBookStoryState,
  validateAndNormalizeBookStoryState as validateBookStoryStateInternal,
} from "./book-studio-story-validator";
import type {
  BookStoryValidationResultV1,
} from "./book-studio-story-types";

export { fingerprintBookStoryState } from "./book-studio-story-validator";

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PROVIDERS = new Set<BookProviderId>(["chatgpt", "claude", "other_compatible_model"]);
const BLOCKED_IDS = new Set(["__proto__", "constructor", "prototype"]);

export async function validateAndNormalizeBookStoryState(
  input: unknown,
): Promise<BookStoryValidationResultV1> {
  const blockers = validateTopLevelIdentity(input);
  if (blockers.length) return blocked(blockers);
  return validateBookStoryStateInternal(input);
}

function validateTopLevelIdentity(input: unknown): string[] {
  const blockers: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["Book story state must be an object."];
  }
  const source = input as Record<string, unknown>;
  for (const [key, label] of [
    ["storyStateId", "storyStateId"],
    ["projectId", "projectId"],
    ["programmeId", "programmeId"],
    ["checkpointId", "checkpointId"],
  ] as const) {
    const value = source[key];
    if (typeof value !== "string" || !SAFE_ID.test(value) || BLOCKED_IDS.has(value)) {
      blockers.push(`${label} is invalid.`);
    }
  }
  if (typeof source.projectFingerprint !== "string" || !SHA256.test(source.projectFingerprint)) {
    blockers.push("projectFingerprint must be an exact sha256 digest.");
  }
  if (!Array.isArray(source.providerIds) || source.providerIds.length < 1 || source.providerIds.length > 32) {
    blockers.push("providerIds must contain 1-32 supported providers.");
  } else {
    const values = source.providerIds;
    if (values.some((value) => typeof value !== "string" || !PROVIDERS.has(value as BookProviderId))) {
      blockers.push("providerIds contain an unsupported provider.");
    }
    if (new Set(values).size !== values.length) blockers.push("providerIds must not contain duplicates.");
  }
  if (!Array.isArray(source.evidenceIds) || source.evidenceIds.length < 1 || source.evidenceIds.length > 100_000) {
    blockers.push("evidenceIds must contain 1-100000 bounded identities.");
  } else {
    const values = source.evidenceIds;
    if (values.some((value) => typeof value !== "string" || !SAFE_ID.test(value) || BLOCKED_IDS.has(value))) {
      blockers.push("evidenceIds contain an invalid identity.");
    }
    if (new Set(values).size !== values.length) blockers.push("evidenceIds must not contain duplicates.");
  }
  return [...new Set(blockers)];
}

function blocked(blockers: string[]): BookStoryValidationResultV1 {
  return {
    outputKind: "evavo_docs_book_story_validation",
    schemaVersion: 1,
    status: "blocked",
    blockers,
    requiredActions: [],
    invalidLocationIds: [],
    invalidActorIds: [],
    invalidKnowledgeIds: [],
    invalidPlanIds: [],
    invalidEventIds: [],
    invalidResearchClaimIds: [],
    invalidCanonIds: [],
    invalidArcIds: [],
    danglingSetupIds: [],
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}
