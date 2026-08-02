import {
  validateBookArtBrief,
  type BookArtBriefV1,
  type BookArtValidationResult,
} from "./book-studio-art-contracts";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";

const TOP_LEVEL_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "identity",
  "purpose",
  "manuscript",
  "conceptTerritoryId",
  "conceptTerritoryLabel",
  "creativeThesis",
  "primarySubject",
  "supportingSubjects",
  "compositionRequirements",
  "mustShow",
  "mustNotShow",
  "spoilerRestrictions",
  "continuityRequirements",
  "historicalAndMaterialRequirements",
  "negativeSpaceRequirements",
  "output",
  "rightsEvidenceIds",
  "createdAt",
  "briefFingerprint",
  "providerCandidateMayBeFinal",
  "publicationPerformed",
]);
const IDENTITY_FIELDS = new Set([
  "workspaceId",
  "projectId",
  "bookId",
  "editionId",
  "requestId",
]);
const MANUSCRIPT_FIELDS = new Set([
  "manuscriptRevisionId",
  "manuscriptSha256",
  "extractedTextSha256",
  "visualCanonSha256",
  "artDirectionSha256",
  "approvedEvidenceIds",
]);
const OUTPUT_FIELDS = new Set([
  "widthPx",
  "heightPx",
  "minimumPpi",
  "allowedMimeTypes",
  "colourIntent",
  "alpha",
  "textPolicy",
  "printUse",
  "digitalUse",
]);

type UnknownRecord = Record<string, unknown>;

export async function fingerprintBookArtBrief(
  value: Omit<BookArtBriefV1, "briefFingerprint"> | BookArtBriefV1,
): Promise<string> {
  const { briefFingerprint: _discarded, ...unsigned } = value as BookArtBriefV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

export async function sealBookArtBrief(
  value: Omit<BookArtBriefV1, "briefFingerprint">,
): Promise<BookArtBriefV1> {
  const strictIssues = validateExactFieldBoundary(value, false);
  if (strictIssues.length) {
    throw new Error(`Book Art brief is invalid: ${strictIssues.join(" ")}`);
  }
  const brief: BookArtBriefV1 = {
    ...value,
    briefFingerprint: await fingerprintBookArtBrief(value),
  };
  const validation = await validateBookArtBriefExact(brief);
  if (!validation.valid) {
    throw new Error(`Book Art brief is invalid: ${validation.issues.join(" ")}`);
  }
  return brief;
}

export async function validateBookArtBriefExact(
  value: BookArtBriefV1,
): Promise<BookArtValidationResult> {
  const issues = validateExactFieldBoundary(value, true);
  let structural: BookArtValidationResult;
  try {
    structural = validateBookArtBrief(value);
  } catch {
    return {
      valid: false,
      issues: unique([
        ...issues,
        "Book Art brief structural validation failed closed.",
      ]),
    };
  }
  issues.push(...structural.issues);
  if (issues.length === 0) {
    const expected = await fingerprintBookArtBrief(value);
    if (value.briefFingerprint !== expected) {
      issues.push(
        "Book Art brief fingerprint differs from its exact canonical contents.",
      );
    }
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

function validateExactFieldBoundary(
  value: unknown,
  fingerprintRequired: boolean,
): string[] {
  const issues: string[] = [];
  const root = record(value, "Book Art brief", issues);
  rejectUnknown(root, TOP_LEVEL_FIELDS, "Book Art brief", issues);
  if (fingerprintRequired && typeof root.briefFingerprint !== "string") {
    issues.push("Book Art brief requires briefFingerprint.");
  }
  if (!fingerprintRequired && root.briefFingerprint !== undefined) {
    issues.push("Unsigned Book Art brief cannot supply briefFingerprint.");
  }
  const identity = record(root.identity, "Book Art brief identity", issues);
  const manuscript = record(root.manuscript, "Book Art brief manuscript", issues);
  const output = record(root.output, "Book Art brief output", issues);
  rejectUnknown(identity, IDENTITY_FIELDS, "Book Art brief identity", issues);
  rejectUnknown(
    manuscript,
    MANUSCRIPT_FIELDS,
    "Book Art brief manuscript",
    issues,
  );
  rejectUnknown(output, OUTPUT_FIELDS, "Book Art brief output", issues);
  return unique(issues);
}

function record(
  value: unknown,
  label: string,
  issues: string[],
): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}

function rejectUnknown(
  value: UnknownRecord,
  allowed: Set<string>,
  label: string,
  issues: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    issues.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
