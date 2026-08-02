import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";

export const BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT =
  "evavo_website_book_manuscript_cas_v1" as const;

export interface WebsiteBookManuscriptCompareAndSwapReceiptV1 {
  outputKind: "evavo_website_book_manuscript_compare_and_swap_receipt";
  schemaVersion: 1;
  contract: typeof BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT;
  sourceRepository: "EVAVO-STUDIO/Website";
  writerMode: "website_compatibility";
  operationId: string;
  projectId: string;
  volumeId: string;
  priorRevisionId: string;
  nextRevisionId: string;
  beforeManuscriptSha256: string;
  afterManuscriptSha256: string;
  compareAndSwapRequestFingerprint: string;
  status: "committed" | "idempotent_replay";
  evidenceIds: string[];
  committedAt: string;
  committedBy: string;
  receiptFingerprint: string;
  canonicalManuscriptMutationPerformed: true;
  docsSuiteCanonicalWriterEnabled: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface WebsiteBookManuscriptCompareAndSwapValidationV1 {
  outputKind: "evavo_website_book_manuscript_compare_and_swap_validation";
  schemaVersion: 1;
  status: "ready" | "blocked";
  receipt?: WebsiteBookManuscriptCompareAndSwapReceiptV1;
  blockers: string[];
  receiptFingerprint?: string;
  websiteCanonicalMutationVerified: boolean;
  docsSuiteCanonicalWriterEnabled: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

type UnknownRecord = Record<string, unknown>;

const FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "sourceRepository",
  "writerMode",
  "operationId",
  "projectId",
  "volumeId",
  "priorRevisionId",
  "nextRevisionId",
  "beforeManuscriptSha256",
  "afterManuscriptSha256",
  "compareAndSwapRequestFingerprint",
  "status",
  "evidenceIds",
  "committedAt",
  "committedBy",
  "receiptFingerprint",
  "canonicalManuscriptMutationPerformed",
  "docsSuiteCanonicalWriterEnabled",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);
const UNSIGNED_FIELDS = new Set(
  [...FIELDS].filter((field) => field !== "receiptFingerprint"),
);

export async function sealWebsiteBookManuscriptCompareAndSwapReceipt(
  value: Omit<WebsiteBookManuscriptCompareAndSwapReceiptV1, "receiptFingerprint">,
): Promise<WebsiteBookManuscriptCompareAndSwapReceiptV1> {
  const blockers: string[] = [];
  const source = record(value, blockers);
  rejectUnknown(source, UNSIGNED_FIELDS, blockers);
  const normalized = normalizeReceipt(source, blockers);
  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) {
    throw new Error(
      `Website Book manuscript compare-and-swap receipt is invalid: ${uniqueBlockers.join(" ")}`,
    );
  }
  return {
    ...normalized,
    receiptFingerprint: await fingerprintWebsiteBookManuscriptCompareAndSwapReceipt(
      normalized,
    ),
  };
}

export async function validateWebsiteBookManuscriptCompareAndSwapReceipt(
  value: unknown,
): Promise<WebsiteBookManuscriptCompareAndSwapValidationV1> {
  const blockers: string[] = [];
  const source = record(value, blockers);
  rejectUnknown(source, FIELDS, blockers);
  const receipt = normalizeReceipt(source, blockers);
  const supplied = digest(
    source.receiptFingerprint,
    "receiptFingerprint",
    blockers,
  );
  const expected = await fingerprintWebsiteBookManuscriptCompareAndSwapReceipt(
    receipt,
  );
  if (supplied !== expected) {
    blockers.push(
      "Website Book manuscript compare-and-swap receipt fingerprint differs from its exact canonical contents.",
    );
  }
  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) {
    return {
      outputKind: "evavo_website_book_manuscript_compare_and_swap_validation",
      schemaVersion: 1,
      status: "blocked",
      blockers: uniqueBlockers,
      websiteCanonicalMutationVerified: false,
      docsSuiteCanonicalWriterEnabled: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    };
  }
  const sealed: WebsiteBookManuscriptCompareAndSwapReceiptV1 = {
    ...receipt,
    receiptFingerprint: expected,
  };
  return {
    outputKind: "evavo_website_book_manuscript_compare_and_swap_validation",
    schemaVersion: 1,
    status: "ready",
    receipt: sealed,
    blockers: [],
    receiptFingerprint: expected,
    websiteCanonicalMutationVerified: true,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function fingerprintWebsiteBookManuscriptCompareAndSwapReceipt(
  value:
    | Omit<WebsiteBookManuscriptCompareAndSwapReceiptV1, "receiptFingerprint">
    | WebsiteBookManuscriptCompareAndSwapReceiptV1,
): Promise<string> {
  const { receiptFingerprint: _discarded, ...unsigned } =
    value as WebsiteBookManuscriptCompareAndSwapReceiptV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

function normalizeReceipt(
  value: unknown,
  blockers: string[],
): Omit<WebsiteBookManuscriptCompareAndSwapReceiptV1, "receiptFingerprint"> {
  const source = record(value, blockers);
  if (
    source.outputKind !==
    "evavo_website_book_manuscript_compare_and_swap_receipt"
  ) {
    blockers.push("Website manuscript compare-and-swap outputKind is invalid.");
  }
  if (source.schemaVersion !== 1) {
    blockers.push("Website manuscript compare-and-swap schemaVersion is invalid.");
  }
  if (source.contract !== BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT) {
    blockers.push("Website manuscript compare-and-swap contract is invalid.");
  }
  if (source.sourceRepository !== "EVAVO-STUDIO/Website") {
    blockers.push("Website manuscript compare-and-swap source repository is invalid.");
  }
  if (source.writerMode !== "website_compatibility") {
    blockers.push("Website manuscript compare-and-swap writer mode is invalid.");
  }
  const operationId = id(source.operationId, "operationId", blockers);
  const projectId = id(source.projectId, "projectId", blockers);
  const volumeId = id(source.volumeId, "volumeId", blockers);
  const priorRevisionId = id(
    source.priorRevisionId,
    "priorRevisionId",
    blockers,
  );
  const nextRevisionId = id(source.nextRevisionId, "nextRevisionId", blockers);
  if (priorRevisionId === nextRevisionId) {
    blockers.push("Website compare-and-swap prior and next revisions must differ.");
  }
  const beforeManuscriptSha256 = digest(
    source.beforeManuscriptSha256,
    "beforeManuscriptSha256",
    blockers,
  );
  const afterManuscriptSha256 = digest(
    source.afterManuscriptSha256,
    "afterManuscriptSha256",
    blockers,
  );
  if (beforeManuscriptSha256 === afterManuscriptSha256) {
    blockers.push("Website compare-and-swap before and after manuscript hashes must differ.");
  }
  const compareAndSwapRequestFingerprint = digest(
    source.compareAndSwapRequestFingerprint,
    "compareAndSwapRequestFingerprint",
    blockers,
  );
  const status =
    source.status === "committed" || source.status === "idempotent_replay"
      ? source.status
      : "committed";
  if (source.status !== "committed" && source.status !== "idempotent_replay") {
    blockers.push("Website compare-and-swap status is invalid.");
  }
  const evidenceIds = ids(source.evidenceIds, "evidenceIds", blockers).sort();
  const committedAt = timestamp(source.committedAt, "committedAt", blockers);
  const committedBy = text(source.committedBy, "committedBy", blockers, 300);
  if (
    source.canonicalManuscriptMutationPerformed !== true ||
    source.docsSuiteCanonicalWriterEnabled !== false ||
    source.runtimeCutoverApproved !== false ||
    source.publicationPerformed !== false
  ) {
    blockers.push(
      "Website compare-and-swap authority flags do not preserve the migration boundary.",
    );
  }
  return {
    outputKind: "evavo_website_book_manuscript_compare_and_swap_receipt",
    schemaVersion: 1,
    contract: BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT,
    sourceRepository: "EVAVO-STUDIO/Website",
    writerMode: "website_compatibility",
    operationId,
    projectId,
    volumeId,
    priorRevisionId,
    nextRevisionId,
    beforeManuscriptSha256,
    afterManuscriptSha256,
    compareAndSwapRequestFingerprint,
    status,
    evidenceIds,
    committedAt,
    committedBy,
    canonicalManuscriptMutationPerformed: true,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function record(value: unknown, blockers: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push("Website manuscript compare-and-swap receipt must be an object.");
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(
  value: UnknownRecord,
  allowed: Set<string>,
  blockers: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    blockers.push(
      `Website manuscript compare-and-swap receipt contains unsupported fields: ${unknown.join(", ")}.`,
    );
  }
}
function id(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256: digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value;
}
function ids(value: unknown, label: string, blockers: string[]): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16_384) {
    blockers.push(`${label} must contain 1-16384 IDs.`);
    return [];
  }
  const result = value.map((entry) => id(entry, label, blockers));
  if (new Set(result).size !== result.length) {
    blockers.push(`${label} contains duplicates.`);
  }
  return unique(result);
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function text(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid";
  }
  return value;
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
