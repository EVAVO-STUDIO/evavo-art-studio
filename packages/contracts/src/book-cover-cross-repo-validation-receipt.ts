import { createHash } from "node:crypto";

import {
  validateBookCoverCommercialReleaseAuthorityV2,
  type BookCoverCommercialReleaseAuthorityV2,
} from "./book-cover-commercial-release-v2.js";
import {
  validateBookCoverManuscriptAuthority,
  type BookCoverManuscriptAuthorityV1,
} from "./book-cover-manuscript-authority.js";

export const BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT =
  "evavo_art_book_cover_cross_repo_validation_receipt_v1" as const;

export interface BookCoverCrossRepoValidationReceiptInputV1 {
  outputKind: "evavo_art_book_cover_cross_repo_validation_receipt_input";
  schemaVersion: 1;
  contract: typeof BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT;
  commercialAuthority: BookCoverCommercialReleaseAuthorityV2;
  manuscriptAuthority: BookCoverManuscriptAuthorityV1;
  validatedAt: string;
  validatorId: string;
}

export interface BookCoverCrossRepoValidationReceiptV1 {
  outputKind: "evavo_art_book_cover_cross_repo_validation_receipt";
  schemaVersion: 1;
  contract: typeof BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT;
  commercialAuthorityDigestSha256: string;
  manuscriptAuthorityFingerprint: string;
  projectId: string;
  bookId: string;
  editionId?: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  validatedAt: string;
  validatorId: string;
  commercialAuthorityValid: true;
  manuscriptAuthorityValid: true;
  commercialValidationIssues: string[];
  manuscriptValidationIssues: string[];
  automaticPromotionAllowed: false;
  publicationAllowed: false;
  receiptFingerprint: string;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

export function compileBookCoverCrossRepoValidationReceipt(
  input: BookCoverCrossRepoValidationReceiptInputV1,
): BookCoverCrossRepoValidationReceiptV1 {
  if (
    input.outputKind !== "evavo_art_book_cover_cross_repo_validation_receipt_input" ||
    input.schemaVersion !== 1 ||
    input.contract !== BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT
  ) throw new Error("Book-cover cross-repo validation receipt identity is invalid.");
  if (!ISO_TIME.test(input.validatedAt)) throw new Error("validatedAt must be canonical UTC ISO-8601.");
  if (!input.validatorId?.trim()) throw new Error("validatorId is required.");

  const commercialValidation = validateBookCoverCommercialReleaseAuthorityV2(
    input.commercialAuthority,
  );
  const manuscriptValidation = validateBookCoverManuscriptAuthority(
    input.manuscriptAuthority,
  );
  if (!commercialValidation.valid) {
    throw new Error(`Commercial cover authority is invalid: ${commercialValidation.issues.join(" | ")}`);
  }
  if (!manuscriptValidation.valid) {
    throw new Error(`Cover manuscript authority is invalid: ${manuscriptValidation.issues.join(" | ")}`);
  }
  if (input.commercialAuthority.projectId !== input.manuscriptAuthority.projectId) {
    throw new Error("Commercial and manuscript cover authorities use different projects.");
  }
  if (input.commercialAuthority.bookId !== input.manuscriptAuthority.bookId) {
    throw new Error("Commercial and manuscript cover authorities use different books.");
  }
  if (!SHA256.test(input.commercialAuthority.authorityDigestSha256)) {
    throw new Error("Commercial cover authority digest is invalid.");
  }
  if (!SHA256.test(input.manuscriptAuthority.authorityFingerprint)) {
    throw new Error("Cover manuscript authority fingerprint is invalid.");
  }

  const unsigned = {
    outputKind: "evavo_art_book_cover_cross_repo_validation_receipt" as const,
    schemaVersion: 1 as const,
    contract: BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT,
    commercialAuthorityDigestSha256: input.commercialAuthority.authorityDigestSha256,
    manuscriptAuthorityFingerprint: input.manuscriptAuthority.authorityFingerprint,
    projectId: input.commercialAuthority.projectId,
    bookId: input.commercialAuthority.bookId,
    ...(input.commercialAuthority.editionId ? { editionId: input.commercialAuthority.editionId } : {}),
    manuscriptRevisionId: input.manuscriptAuthority.manuscriptRevisionId,
    manuscriptSha256: input.manuscriptAuthority.manuscriptSha256,
    validatedAt: input.validatedAt,
    validatorId: input.validatorId.trim(),
    commercialAuthorityValid: true as const,
    manuscriptAuthorityValid: true as const,
    commercialValidationIssues: commercialValidation.issues,
    manuscriptValidationIssues: manuscriptValidation.issues,
    automaticPromotionAllowed: false as const,
    publicationAllowed: false as const,
  };

  return { ...unsigned, receiptFingerprint: sha256(unsigned) };
}

export function validateBookCoverCrossRepoValidationReceipt(
  value: unknown,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Receipt must be an object."] };
  const receipt = value as Partial<BookCoverCrossRepoValidationReceiptV1>;
  if (
    receipt.outputKind !== "evavo_art_book_cover_cross_repo_validation_receipt" ||
    receipt.schemaVersion !== 1 ||
    receipt.contract !== BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT
  ) issues.push("Receipt identity is invalid.");
  if (!SHA256.test(String(receipt.commercialAuthorityDigestSha256 ?? ""))) {
    issues.push("Commercial authority digest is invalid.");
  }
  if (!SHA256.test(String(receipt.manuscriptAuthorityFingerprint ?? ""))) {
    issues.push("Manuscript authority fingerprint is invalid.");
  }
  if (!SHA256.test(String(receipt.manuscriptSha256 ?? ""))) issues.push("Manuscript digest is invalid.");
  if (receipt.commercialAuthorityValid !== true || receipt.manuscriptAuthorityValid !== true) {
    issues.push("Receipt does not attest successful Art Studio validation.");
  }
  if ((receipt.commercialValidationIssues ?? []).length || (receipt.manuscriptValidationIssues ?? []).length) {
    issues.push("Receipt retains validation issues.");
  }
  if (receipt.automaticPromotionAllowed !== false || receipt.publicationAllowed !== false) {
    issues.push("Receipt authority flags are invalid.");
  }
  if (!SHA256.test(String(receipt.receiptFingerprint ?? ""))) {
    issues.push("Receipt fingerprint is invalid.");
  } else {
    const { receiptFingerprint: _ignored, ...unsigned } = receipt as BookCoverCrossRepoValidationReceiptV1;
    if (sha256(unsigned) !== receipt.receiptFingerprint) {
      issues.push("Receipt fingerprint differs from canonical contents.");
    }
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}
