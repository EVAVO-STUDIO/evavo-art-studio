import { canonicalReviewCraftJson, reviewCraftDigest, reviewCraftRecord, sha256ReviewCraftText, uniqueReviewCraft } from "./book-studio-review-craft-shared";
import { BOOK_REVIEW_CRAFT_CONTRACT } from "./book-studio-review-craft-types";

export async function validateBookCraftProfile(profile: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(profile, "Book craft profile", blockers);
  if (source.outputKind !== "evavo_docs_book_craft_profile" || source.schemaVersion !== 1 || source.contract !== BOOK_REVIEW_CRAFT_CONTRACT) blockers.push("Book craft profile identity is invalid.");
  if (source.authorityMode !== "shadow_migration" || source.status !== "ready") blockers.push("Book craft profile authority or status is invalid.");
  const requiredFalse = ["providerBriefContainsNamedSources", "directImitationPermitted", "phraseLaunderingPermitted", "canonicalAdmissionAllowed", "dualAuthoritativeWritesAllowed", "runtimeCutoverApproved", "publicationPerformed"];
  for (const key of requiredFalse) if (source[key] !== false) blockers.push(`Book craft profile ${key} must remain false.`);
  if (source.projectOwnedExpressionRequired !== true || source.websiteCompatibilityRuntimeStillAuthoritative !== true) blockers.push("Book craft profile ownership or compatibility authority is invalid.");
  const fingerprint = reviewCraftDigest(source.profileFingerprint, "profileFingerprint", blockers);
  const { profileFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Book craft profile fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}
