export const EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_CONTRACT =
  "evavo_docs_book_state_migration_bundle_v1" as const;
export const EVAVO_DOCS_SUITE_BOOK_OPERATION_CONTRACT =
  "evavo_docs_book_operation_v1" as const;
export const EVAVO_DOCS_SUITE_BOOK_OPERATION_ENDPOINT =
  "/api/v1/book-studio/operations" as const;
export const EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_ENDPOINT =
  "/api/v1/book-studio/migration/state-bundle" as const;
export const EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_MAX_BODY_BYTES = 4_000_000;
export const EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_DEFAULT_TIMEOUT_MS = 280_000;

export type WebsiteBookStateMigrationKind =
  | "project"
  | "manuscript"
  | "execution"
  | "story"
  | "authoring"
  | "review_craft"
  | "canonical_mutation"
  | "publication"
  | "artwork_use";
export type WebsiteBookStateMigrationScope = "project" | "volume";

export interface WebsiteBookStateSourceDescriptorV1 {
  sourcePath: string;
  sourceGitBlobSha1: string;
  sourceByteLength: number;
  sourceContentSha256: string;
}

export interface WebsiteBookStateMigrationRecordV1 {
  migrationItemId: string;
  stateKind: WebsiteBookStateMigrationKind;
  scope: WebsiteBookStateMigrationScope;
  scopeId: string;
  source: WebsiteBookStateSourceDescriptorV1;
  evidenceIds: string[];
  payload?: unknown;
  artworkUseValidation?: Readonly<{
    binding: Record<string, unknown>;
    artifact: Record<string, unknown>;
  }>;
}

export interface WebsiteBookStateMigrationExportInputV1 {
  outputKind: "evavo_website_book_state_migration_export_input";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  bundleId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  projectId: string;
  programmeId: string;
  volumeIds: string[];
  artworkRequiredVolumeIds: string[];
  records: WebsiteBookStateMigrationRecordV1[];
  compiledAt: string;
  compiledBy: string;
  evidenceIds: string[];
  authoritativeWritesAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export interface WebsiteBookStateMigrationConfiguration {
  origin: string;
  token: string;
  timeoutMs: number;
}

export type WebsiteBookStateMigrationEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type WebsiteBookStateMigrationFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type WebsiteBookStateMigrationOperationExecutor = (
  request: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SOURCE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@/+:-]+$/;
const ARTIFACT_REFERENCE = /^(?:evavo-art|art-studio|book-artifact):\/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const REQUIRED_VOLUME_KINDS = Object.freeze([
  "manuscript",
  "execution",
  "story",
  "authoring",
  "review_craft",
  "canonical_mutation",
  "publication",
] as const);
const OPERATION_BY_KIND = Object.freeze({
  project: "project.validate",
  manuscript: "manuscript.compile_coverage",
  execution: "execution.plan_next",
  story: "story.validate",
  authoring: "authoring.evaluate_admission",
  review_craft: "review.evaluate_admission",
  canonical_mutation: "canonical.validate_plan",
  publication: "publication.compile_programme",
} as const);
const EXPORT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "authorityMode",
  "bundleId",
  "sourceRepository",
  "sourceCommit",
  "projectId",
  "programmeId",
  "volumeIds",
  "artworkRequiredVolumeIds",
  "records",
  "compiledAt",
  "compiledBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);
const RECORD_KEYS = new Set([
  "migrationItemId",
  "stateKind",
  "scope",
  "scopeId",
  "source",
  "evidenceIds",
  "payload",
  "artworkUseValidation",
]);
const SOURCE_KEYS = new Set([
  "sourcePath",
  "sourceGitBlobSha1",
  "sourceByteLength",
  "sourceContentSha256",
]);

export async function compileWebsiteBookStateMigrationBundle(
  input: unknown,
  executeOperation: WebsiteBookStateMigrationOperationExecutor,
): Promise<Record<string, unknown>> {
  const source = strictRecord(input, EXPORT_KEYS, "Website state migration export");
  if (
    source.outputKind !== "evavo_website_book_state_migration_export_input" ||
    source.schemaVersion !== 1 ||
    source.authorityMode !== "shadow_migration" ||
    source.sourceRepository !== "EVAVO-STUDIO/Website"
  ) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_CONTRACT_INVALID");
  }
  for (const [key, expected] of [
    ["authoritativeWritesAllowed", false],
    ["canonicalManuscriptMutationAllowed", false],
    ["runtimeCutoverApproved", false],
    ["sourceDeletionApproved", false],
    ["publicationPerformed", false],
  ] as const) {
    if (source[key] !== expected) {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_AUTHORITY_INVALID");
    }
  }

  const bundleId = safeId(source.bundleId, "bundleId");
  const sourceCommit = exactGitSha(source.sourceCommit, "sourceCommit");
  const projectId = safeId(source.projectId, "projectId");
  const programmeId = safeId(source.programmeId, "programmeId");
  const volumeIds = safeIds(source.volumeIds, "volumeIds", true);
  const artworkRequiredVolumeIds = safeIds(
    source.artworkRequiredVolumeIds,
    "artworkRequiredVolumeIds",
    false,
  );
  const compiledAt = canonicalTimestamp(source.compiledAt, "compiledAt");
  const compiledBy = boundedText(source.compiledBy, "compiledBy", 300);
  const bundleEvidenceIds = safeIds(source.evidenceIds, "evidenceIds", false);
  if (artworkRequiredVolumeIds.some((value) => !volumeIds.includes(value))) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_ARTWORK_SCOPE_INVALID");
  }

  if (!Array.isArray(source.records) || source.records.length < 1 || source.records.length > 10_000) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_RECORDS_INVALID");
  }
  const records = source.records.map((value, index) => parseRecord(value, index));
  validateCoverage({ projectId, volumeIds, artworkRequiredVolumeIds, records });

  const expectedItems = records
    .map(({ migrationItemId, stateKind, scope, scopeId }) => ({
      migrationItemId,
      stateKind,
      scope,
      scopeId,
    }))
    .sort((left, right) => left.migrationItemId.localeCompare(right.migrationItemId));

  const items: Array<Record<string, unknown>> = [];
  for (const record of [...records].sort((left, right) =>
    left.migrationItemId.localeCompare(right.migrationItemId)
  )) {
    const common = {
      migrationItemId: record.migrationItemId,
      stateKind: record.stateKind,
      scope: record.scope,
      scopeId: record.scopeId,
      source: {
        ...record.source,
        sourceRecordFingerprint: await sha256Value(
          record.stateKind === "artwork_use" ? record.artworkUseValidation : record.payload,
        ),
      },
      evidenceIds: [...record.evidenceIds].sort(),
    };

    let unsignedItem: Record<string, unknown>;
    if (record.stateKind === "artwork_use") {
      const artworkUseValidation = record.artworkUseValidation;
      if (!artworkUseValidation || record.payload !== undefined) {
        throw new Error("WEBSITE_BOOK_STATE_MIGRATION_ARTWORK_ITEM_INVALID");
      }
      const issues = validateArtworkUse(
        artworkUseValidation.binding,
        artworkUseValidation.artifact,
      );
      if (issues.length) {
        throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_ARTWORK_INVALID:${issues[0]}`);
      }
      const validation = { valid: true, issues: [] as string[] };
      unsignedItem = {
        ...common,
        artworkUseValidation,
        validationFingerprint: await sha256Value(validation),
      };
    } else {
      if (record.payload === undefined || record.artworkUseValidation !== undefined) {
        throw new Error("WEBSITE_BOOK_STATE_MIGRATION_OPERATION_ITEM_INVALID");
      }
      const operation = OPERATION_BY_KIND[record.stateKind as keyof typeof OPERATION_BY_KIND];
      if (!operation) {
        throw new Error("WEBSITE_BOOK_STATE_MIGRATION_OPERATION_UNSUPPORTED");
      }
      const sourceRecordFingerprint = (common.source as Record<string, unknown>)
        .sourceRecordFingerprint as string;
      const validationRequest = {
        outputKind: "evavo_docs_book_operation_request",
        schemaVersion: 1,
        contract: EVAVO_DOCS_SUITE_BOOK_OPERATION_CONTRACT,
        authorityMode: "shadow_migration",
        requestId: `state:${record.migrationItemId}:${sourceRecordFingerprint.slice(7, 31)}`,
        operation,
        payload: record.payload,
        requestedAt: compiledAt,
        requestedBy: compiledBy,
        evidenceIds: unique([
          ...bundleEvidenceIds,
          ...record.evidenceIds,
          `evidence:website-source:${record.source.sourceContentSha256.slice(7)}`,
          `evidence:website-commit:${sourceCommit}`,
        ]).sort(),
        authoritativeWritesAllowed: false,
        canonicalManuscriptMutationAllowed: false,
        automaticPublicationAllowed: false,
        runtimeCutoverApproved: false,
        sourceDeletionApproved: false,
        publicationPerformed: false,
      };
      const validationResult = await executeOperation(validationRequest);
      await assertOperationResult(validationRequest, validationResult);
      unsignedItem = {
        ...common,
        validationRequest,
        validationResult,
        validationFingerprint: validationResult.resultFingerprint,
      };
    }
    items.push({
      ...unsignedItem,
      itemFingerprint: await fingerprintMigrationItem(unsignedItem),
    });
  }

  return {
    outputKind: "evavo_docs_book_state_migration_bundle_input",
    schemaVersion: 1,
    contract: EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_CONTRACT,
    authorityMode: "shadow_migration",
    bundleId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit,
    projectId,
    programmeId,
    volumeIds: [...volumeIds].sort(),
    artworkRequiredVolumeIds: [...artworkRequiredVolumeIds].sort(),
    expectedItems,
    items,
    compiledAt,
    compiledBy,
    evidenceIds: bundleEvidenceIds.sort(),
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}

export async function exportWebsiteBookStateToDocsSuite(input: {
  exportInput: unknown;
  configuration?: WebsiteBookStateMigrationConfiguration;
  environment?: WebsiteBookStateMigrationEnvironment;
  fetchImpl?: WebsiteBookStateMigrationFetch;
}): Promise<Record<string, unknown>> {
  const configuration = input.configuration ?? resolveWebsiteBookStateMigrationConfiguration(input.environment);
  const fetchImpl = input.fetchImpl ?? fetch;
  let operationCalls = 0;
  const bundle = await compileWebsiteBookStateMigrationBundle(
    input.exportInput,
    async (request) => {
      operationCalls += 1;
      return postJson({
        endpoint: EVAVO_DOCS_SUITE_BOOK_OPERATION_ENDPOINT,
        payload: request,
        configuration,
        fetchImpl,
        ambiguousCode: "WEBSITE_BOOK_STATE_OPERATION_AMBIGUOUS_NO_RETRY",
      });
    },
  );
  const bundleResult = await postJson({
    endpoint: EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_ENDPOINT,
    payload: bundle,
    configuration,
    fetchImpl,
    ambiguousCode: "WEBSITE_BOOK_STATE_BUNDLE_AMBIGUOUS_NO_RETRY",
  });
  await assertBundleResult(bundle, bundleResult);

  const unsignedReceipt = {
    outputKind: "evavo_website_book_state_migration_export_receipt",
    schemaVersion: 1,
    contract: EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_CONTRACT,
    status: bundleResult.status,
    bundleId: bundle.bundleId,
    sourceCommit: bundle.sourceCommit,
    projectId: bundle.projectId,
    programmeId: bundle.programmeId,
    operationCallCount: operationCalls,
    bundleCallCount: 1,
    bundleFingerprint: bundleResult.bundleFingerprint,
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsignedReceipt,
    exportReceiptFingerprint: await sha256Value(unsignedReceipt),
    bundle,
    bundleResult,
  };
}

export function resolveWebsiteBookStateMigrationConfiguration(
  environment: WebsiteBookStateMigrationEnvironment = runtimeEnvironment(),
): WebsiteBookStateMigrationConfiguration {
  const origin = normalizeOrigin(environment.EVAVO_DOCS_SUITE_BOOK_MIGRATION_URL);
  const token = environment.EVAVO_DOCS_SUITE_BOOK_MIGRATION_TOKEN?.trim() ?? "";
  if (!isToken(token)) {
    throw new Error("EVAVO_DOCS_SUITE_BOOK_MIGRATION_TOKEN is missing or malformed.");
  }
  const timeoutMs = parseTimeout(environment.EVAVO_DOCS_SUITE_BOOK_MIGRATION_TIMEOUT_MS);
  return { origin, token, timeoutMs };
}

async function postJson(input: {
  endpoint: string;
  payload: unknown;
  configuration: WebsiteBookStateMigrationConfiguration;
  fetchImpl: WebsiteBookStateMigrationFetch;
  ambiguousCode: string;
}): Promise<Record<string, unknown>> {
  const source = canonicalJson(input.payload);
  const byteLength = utf8Length(source);
  if (!byteLength || byteLength > EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_MAX_BODY_BYTES) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_REQUEST_SIZE_INVALID");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.configuration.timeoutMs);
  try {
    const response = await input.fetchImpl(new URL(input.endpoint, input.configuration.origin), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.configuration.token}`,
        "content-type": "application/json",
      },
      body: source,
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_MAX_BODY_BYTES) {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_RESPONSE_TOO_LARGE");
    }
    const responseSource = await response.text();
    if (utf8Length(responseSource) > EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_MAX_BODY_BYTES) {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_RESPONSE_TOO_LARGE");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseSource);
    } catch {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_RESPONSE_JSON_INVALID");
    }
    if (![200, 400, 422].includes(response.status)) {
      throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_HTTP_${response.status}`);
    }
    const result = asRecord(parsed, "Docs Suite migration response");
    if (!response.ok && result.outputKind !== "evavo_docs_book_state_migration_bundle_result") {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : `WEBSITE_BOOK_STATE_MIGRATION_HTTP_${response.status}`,
      );
    }
    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message === "fetch failed" ||
        error.message.includes("network"))
    ) {
      throw new Error(input.ambiguousCode);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function assertOperationResult(
  request: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  if (
    result.outputKind !== "evavo_docs_book_operation_result" ||
    result.schemaVersion !== 1 ||
    result.contract !== EVAVO_DOCS_SUITE_BOOK_OPERATION_CONTRACT ||
    result.requestId !== request.requestId ||
    result.operation !== request.operation ||
    result.status !== "completed" ||
    !Array.isArray(result.blockers) ||
    result.blockers.length !== 0
  ) {
    throw new Error("WEBSITE_BOOK_STATE_OPERATION_RESULT_INVALID");
  }
  for (const key of [
    "authoritativeWritesPerformed",
    "canonicalManuscriptMutationPerformed",
    "providerCalled",
    "publicationPerformed",
    "docsSuiteCanonicalWriterEnabled",
    "dualAuthoritativeWritesAllowed",
    "runtimeCutoverApproved",
    "sourceDeletionApproved",
  ]) {
    if (result[key] !== false) {
      throw new Error("WEBSITE_BOOK_STATE_OPERATION_AUTHORITY_INVALID");
    }
  }
  if (result.websiteCompatibilityRuntimeStillAuthoritative !== true) {
    throw new Error("WEBSITE_BOOK_STATE_OPERATION_AUTHORITY_INVALID");
  }
  const expectedRequestFingerprint = await sha256Value(request);
  if (result.requestFingerprint !== expectedRequestFingerprint) {
    throw new Error("WEBSITE_BOOK_STATE_OPERATION_REQUEST_FINGERPRINT_MISMATCH");
  }
  const { resultFingerprint: supplied, ...unsigned } = result;
  if (supplied !== (await sha256Value(unsigned))) {
    throw new Error("WEBSITE_BOOK_STATE_OPERATION_RESULT_FINGERPRINT_MISMATCH");
  }
}

async function assertBundleResult(
  bundle: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  if (
    result.outputKind !== "evavo_docs_book_state_migration_bundle_result" ||
    result.schemaVersion !== 1 ||
    result.contract !== EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_CONTRACT ||
    result.sourceRepository !== "EVAVO-STUDIO/Website" ||
    result.bundleId !== bundle.bundleId ||
    result.sourceCommit !== bundle.sourceCommit ||
    result.projectId !== bundle.projectId ||
    result.programmeId !== bundle.programmeId ||
    !["blocked", "needs_resolution", "ready_for_cutover_review"].includes(String(result.status)) ||
    typeof result.bundleFingerprint !== "string" ||
    !SHA256.test(result.bundleFingerprint)
  ) {
    throw new Error("WEBSITE_BOOK_STATE_BUNDLE_RESULT_INVALID");
  }
  for (const key of [
    "authoritativeWritesPerformed",
    "statePersisted",
    "canonicalManuscriptMutationPerformed",
    "docsSuiteCanonicalWriterEnabled",
    "dualAuthoritativeWritesAllowed",
    "runtimeCutoverApproved",
    "sourceDeletionApproved",
    "publicationPerformed",
  ]) {
    if (result[key] !== false) {
      throw new Error("WEBSITE_BOOK_STATE_BUNDLE_RESULT_AUTHORITY_INVALID");
    }
  }
  if (result.websiteCompatibilityRuntimeStillAuthoritative !== true) {
    throw new Error("WEBSITE_BOOK_STATE_BUNDLE_RESULT_AUTHORITY_INVALID");
  }
  const { bundleFingerprint: supplied, ...unsigned } = result;
  if (supplied !== (await sha256Value(unsigned))) {
    throw new Error("WEBSITE_BOOK_STATE_BUNDLE_RESULT_FINGERPRINT_MISMATCH");
  }
}

function parseRecord(value: unknown, index: number): WebsiteBookStateMigrationRecordV1 {
  const source = strictRecord(value, RECORD_KEYS, `records[${index}]`);
  const stateKind = source.stateKind;
  if (![
    "project",
    "manuscript",
    "execution",
    "story",
    "authoring",
    "review_craft",
    "canonical_mutation",
    "publication",
    "artwork_use",
  ].includes(String(stateKind))) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_KIND_INVALID");
  }
  const scope = source.scope;
  if (scope !== "project" && scope !== "volume") {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_SCOPE_INVALID");
  }
  const descriptor = strictRecord(source.source, SOURCE_KEYS, `records[${index}].source`);
  const sourcePath = String(descriptor.sourcePath ?? "");
  if (!SOURCE_PATH.test(sourcePath) || pathIsNotNormalized(sourcePath)) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_SOURCE_PATH_INVALID");
  }
  const record: WebsiteBookStateMigrationRecordV1 = {
    migrationItemId: safeId(source.migrationItemId, "migrationItemId"),
    stateKind: stateKind as WebsiteBookStateMigrationKind,
    scope,
    scopeId: safeId(source.scopeId, "scopeId"),
    source: {
      sourcePath,
      sourceGitBlobSha1: exactGitSha(descriptor.sourceGitBlobSha1, "sourceGitBlobSha1"),
      sourceByteLength: positiveInteger(descriptor.sourceByteLength, "sourceByteLength"),
      sourceContentSha256: exactSha256(descriptor.sourceContentSha256, "sourceContentSha256"),
    },
    evidenceIds: safeIds(source.evidenceIds, "record.evidenceIds", false),
  };
  if (source.payload !== undefined) record.payload = source.payload;
  if (source.artworkUseValidation !== undefined) {
    const artwork = asRecord(source.artworkUseValidation, "artworkUseValidation");
    record.artworkUseValidation = {
      binding: asRecord(artwork.binding, "artworkUseValidation.binding"),
      artifact: asRecord(artwork.artifact, "artworkUseValidation.artifact"),
    };
  }
  if ((record.stateKind === "project") !== (record.scope === "project")) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_SCOPE_KIND_INVALID");
  }
  return record;
}

function validateCoverage(input: {
  projectId: string;
  volumeIds: string[];
  artworkRequiredVolumeIds: string[];
  records: WebsiteBookStateMigrationRecordV1[];
}): void {
  const identities = input.records.map((record) => record.migrationItemId);
  if (new Set(identities).size !== identities.length) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_ITEM_DUPLICATED");
  }
  const projectRecords = input.records.filter((record) => record.stateKind === "project");
  if (
    projectRecords.length !== 1 ||
    projectRecords[0]?.scope !== "project" ||
    projectRecords[0]?.scopeId !== input.projectId
  ) {
    throw new Error("WEBSITE_BOOK_STATE_MIGRATION_PROJECT_COVERAGE_INVALID");
  }
  for (const record of input.records) {
    if (record.scope === "volume" && !input.volumeIds.includes(record.scopeId)) {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_UNKNOWN_VOLUME");
    }
  }
  for (const volumeId of input.volumeIds) {
    for (const stateKind of REQUIRED_VOLUME_KINDS) {
      const count = input.records.filter(
        (record) =>
          record.scope === "volume" &&
          record.scopeId === volumeId &&
          record.stateKind === stateKind,
      ).length;
      if (count !== 1) {
        throw new Error("WEBSITE_BOOK_STATE_MIGRATION_VOLUME_COVERAGE_INVALID");
      }
    }
  }
  for (const volumeId of input.artworkRequiredVolumeIds) {
    const count = input.records.filter(
      (record) =>
        record.scope === "volume" &&
        record.scopeId === volumeId &&
        record.stateKind === "artwork_use",
    ).length;
    if (count !== 1) {
      throw new Error("WEBSITE_BOOK_STATE_MIGRATION_ARTWORK_COVERAGE_INVALID");
    }
  }
}

function validateArtworkUse(
  binding: Record<string, unknown>,
  artifact: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  const bindingIdentity = asRecord(binding.identity, "binding.identity", issues);
  const artifactIdentity = asRecord(artifact.identity, "artifact.identity", issues);
  for (const key of ["workspaceId", "projectId", "bookId", "requestId"]) {
    if (!isSafeId(bindingIdentity[key])) issues.push(`binding.identity.${key} is invalid.`);
    if (!isSafeId(artifactIdentity[key])) issues.push(`artifact.identity.${key} is invalid.`);
    if (bindingIdentity[key] !== artifactIdentity[key]) issues.push(`identity.${key} differs.`);
  }
  if (bindingIdentity.editionId !== artifactIdentity.editionId) issues.push("identity.editionId differs.");
  if (binding.outputKind !== "evavo_book_artwork_use_binding") issues.push("binding outputKind is invalid.");
  if (artifact.outputKind !== "evavo_book_art_artifact_receipt") issues.push("artifact outputKind is invalid.");
  if (binding.schemaVersion !== 1 || artifact.schemaVersion !== 1) issues.push("schemaVersion is invalid.");
  if (binding.contract !== "evavo_book_art_handoff_v1" || artifact.contract !== "evavo_book_art_handoff_v1") issues.push("Book Art contract is invalid.");
  if (artifact.status !== "approved") issues.push("Approved artwork is required.");
  if (!isSafeId(artifact.artifactId) || binding.approvedArtifactId !== artifact.artifactId) issues.push("artifactId differs or is invalid.");
  if (typeof artifact.artifactReference !== "string" || !ARTIFACT_REFERENCE.test(artifact.artifactReference) || binding.approvedArtifactReference !== artifact.artifactReference) issues.push("artifactReference differs or is invalid.");
  for (const [label, value] of [
    ["artifact.contentSha256", artifact.contentSha256],
    ["artifact.technicalQualityReceiptSha256", artifact.technicalQualityReceiptSha256],
    ["artifact.selectionReceiptSha256", artifact.selectionReceiptSha256],
    ["artifact.promotionReceiptSha256", artifact.promotionReceiptSha256],
    ["artifact.artifactFingerprint", artifact.artifactFingerprint],
    ["binding.sourceBriefFingerprint", binding.sourceBriefFingerprint],
    ["binding.approvedArtifactSha256", binding.approvedArtifactSha256],
    ["binding.promotionReceiptSha256", binding.promotionReceiptSha256],
    ["binding.cropOrPlacementSha256", binding.cropOrPlacementSha256],
    ["binding.useFingerprint", binding.useFingerprint],
  ] as const) {
    if (!isSha256(value)) issues.push(`${label} is invalid.`);
  }
  if (binding.approvedArtifactSha256 !== artifact.contentSha256) issues.push("approvedArtifactSha256 differs.");
  if (binding.promotionReceiptSha256 !== artifact.promotionReceiptSha256) issues.push("promotionReceiptSha256 differs.");
  if (binding.sourceBriefFingerprint !== artifact.sourceBriefFingerprint) issues.push("sourceBriefFingerprint differs.");
  if (!Number.isSafeInteger(artifact.byteLength) || Number(artifact.byteLength) < 1) issues.push("artifact.byteLength is invalid.");
  if (!Number.isInteger(artifact.widthPx) || Number(artifact.widthPx) < 1) issues.push("artifact.widthPx is invalid.");
  if (!Number.isInteger(artifact.heightPx) || Number(artifact.heightPx) < 1) issues.push("artifact.heightPx is invalid.");
  if (typeof artifact.mimeType !== "string" || !IMAGE_MIME_TYPES.has(artifact.mimeType)) issues.push("artifact.mimeType is invalid.");
  const provenance = asRecord(artifact.provenance, "artifact.provenance", issues);
  if (provenance.rightsStatus !== "approved_commercial") issues.push("Approved commercial rights are required.");
  if (!Array.isArray(provenance.rightsEvidenceIds) || provenance.rightsEvidenceIds.length < 1) issues.push("rights evidence is required.");
  if (artifact.generatedTextDetected !== false) issues.push("generated text is not allowed.");
  if (!Array.isArray(artifact.unresolvedRisks) || artifact.unresolvedRisks.length !== 0) issues.push("unresolved risks are not allowed.");
  if (typeof artifact.promotedBy !== "string" || !artifact.promotedBy.trim()) issues.push("promotedBy is required.");
  if (!isTimestamp(artifact.promotedAt)) issues.push("promotedAt is invalid.");
  if (!isTimestamp(binding.boundAt)) issues.push("boundAt is invalid.");
  if (typeof binding.boundBy !== "string" || !binding.boundBy.trim()) issues.push("boundBy is required.");
  if (!isSafeId(binding.sceneOrPlacementId)) issues.push("sceneOrPlacementId is invalid.");
  if (binding.canonicalRendererMustVerifyBytes !== true) issues.push("canonical renderer verification is required.");
  if (binding.publicationPerformed !== false || artifact.publicationPerformed !== false) issues.push("publication authority is invalid.");
  return unique(issues);
}

async function fingerprintMigrationItem(value: Record<string, unknown>): Promise<string> {
  return sha256Value({
    ...value,
    evidenceIds: [...(value.evidenceIds as string[])].sort(),
  });
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Value(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function strictRecord(value: unknown, keys: Set<string>, label: string): Record<string, unknown> {
  const record = asRecord(value, label);
  const unknown = Object.keys(record).filter((key) => !keys.has(key)).sort();
  if (unknown.length) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_UNKNOWN_FIELDS:${label}:${unknown.join(",")}`);
  }
  return record;
}

function asRecord(value: unknown, label: string, issues?: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (issues) {
      issues.push(`${label} must be an object.`);
      return {};
    }
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_OBJECT_INVALID:${label}`);
  }
  return value as Record<string, unknown>;
}

function safeId(value: unknown, label: string): string {
  if (!isSafeId(value)) throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_ID_INVALID:${label}`);
  return value;
}
function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
function safeIds(value: unknown, label: string, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > 16_384 || (required && value.length < 1)) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_IDS_INVALID:${label}`);
  }
  const values = value.map((entry) => safeId(entry, label));
  if (new Set(values).size !== values.length) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_IDS_DUPLICATED:${label}`);
  }
  return values;
}
function exactGitSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !GIT_SHA1.test(value)) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_GIT_SHA_INVALID:${label}`);
  }
  return value;
}
function exactSha256(value: unknown, label: string): string {
  if (!isSha256(value)) throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_SHA256_INVALID:${label}`);
  return value;
}
function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_INTEGER_INVALID:${label}`);
  }
  return Number(value);
}
function canonicalTimestamp(value: unknown, label: string): string {
  if (!isTimestamp(value) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_TIMESTAMP_INVALID:${label}`);
  }
  return value;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`WEBSITE_BOOK_STATE_MIGRATION_TEXT_INVALID:${label}`);
  }
  return value;
}
function pathIsNotNormalized(value: string): boolean {
  return value.includes("\\") || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}
function normalizeOrigin(value: string | undefined): string {
  if (!value) throw new Error("EVAVO_DOCS_SUITE_BOOK_MIGRATION_URL is required.");
  const url = new URL(value);
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    throw new Error("Docs Suite migration URL must use HTTPS outside loopback development.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Docs Suite migration URL cannot contain credentials, query or fragment.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Docs Suite migration URL must be an origin without a path.");
  }
  return url.origin;
}
function parseTimeout(value: string | undefined): number {
  if (!value?.trim()) return EVAVO_DOCS_SUITE_BOOK_STATE_MIGRATION_DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 10_000 || parsed > 290_000) {
    throw new Error("EVAVO_DOCS_SUITE_BOOK_MIGRATION_TIMEOUT_MS must be 10000-290000.");
  }
  return parsed;
}
function isToken(value: string): boolean {
  return value.length >= 16 && value.length <= 4_096 && !/[\s\u0000-\u001f\u007f]/.test(value);
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
function runtimeEnvironment(): WebsiteBookStateMigrationEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env ?? {};
}
