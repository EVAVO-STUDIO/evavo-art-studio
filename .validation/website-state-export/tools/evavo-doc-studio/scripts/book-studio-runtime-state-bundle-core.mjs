import { constants as fsConstants } from "node:fs";
import {
  lstat,
  open,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const WEBSITE_BOOK_STATE_EXPORT_CONTRACT =
  "evavo_website_book_state_export_v1";
export const DOCS_BOOK_STATE_MIGRATION_CONTRACT =
  "evavo_docs_book_state_migration_bundle_v1";

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,299}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@:-]+(?:\/[A-Za-z0-9._@:-]+)*$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAXIMUM_SPEC_BYTES = 1_000_000;
const MAXIMUM_RECORD_BYTES = 2_000_000;
const MAXIMUM_OUTPUT_BYTES = 4_000_000;
const MAXIMUM_ITEMS = 10_000;
const MAXIMUM_EVIDENCE_IDS = 100_000;
const MAXIMUM_STRING_LENGTH = 500_000;
const MAXIMUM_NODES = 250_000;
const MAXIMUM_DEPTH = 80;

const STATE_KINDS = new Set([
  "project",
  "manuscript",
  "execution",
  "story",
  "authoring",
  "review_craft",
  "canonical_mutation",
  "publication",
  "artwork_use",
]);
const REQUIRED_VOLUME_KINDS = Object.freeze([
  "manuscript",
  "execution",
  "story",
  "authoring",
  "review_craft",
  "canonical_mutation",
  "publication",
]);
const OPERATION_BY_KIND = Object.freeze({
  project: "project.validate",
  manuscript: "manuscript.compile_coverage",
  execution: "execution.plan_next",
  story: "story.validate",
  authoring: "authoring.evaluate_admission",
  review_craft: "review.evaluate_admission",
  canonical_mutation: "canonical.validate_plan",
  publication: "publication.compile_programme",
});
const SPEC_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "exportId",
  "sourceCommit",
  "projectId",
  "programmeId",
  "volumeIds",
  "artworkRequiredVolumeIds",
  "items",
  "compiledAt",
  "compiledBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);
const SPEC_ITEM_FIELDS = new Set([
  "migrationItemId",
  "stateKind",
  "scope",
  "scopeId",
  "sourcePath",
  "evidenceIds",
]);
const RECORD_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "migrationItemId",
  "stateKind",
  "scope",
  "scopeId",
  "validationRequest",
  "validationResult",
  "artworkUseValidation",
  "validationFingerprint",
]);
const REQUEST_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "authorityMode",
  "requestId",
  "operation",
  "payload",
  "requestedAt",
  "requestedBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "automaticPublicationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);
const RESULT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "status",
  "requestId",
  "operation",
  "requiredScope",
  "requestFingerprint",
  "result",
  "blockers",
  "warnings",
  "resultFingerprint",
  "authoritativeWritesPerformed",
  "canonicalManuscriptMutationPerformed",
  "providerCalled",
  "publicationPerformed",
  "websiteCompatibilityRuntimeStillAuthoritative",
  "docsSuiteCanonicalWriterEnabled",
  "dualAuthoritativeWritesAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
]);
const FORBIDDEN_DATA_KEYS = new Set([
  "manuscripttext",
  "candidatetext",
  "chaptertext",
  "sourcetext",
  "fullmanuscripttext",
  "rawmanuscript",
  "imagebase64",
  "audiobase64",
  "videobase64",
  "binarydata",
  "filebytes",
  "imagebytes",
  "audiobytes",
  "videobytes",
  "dataurl",
  "bloburl",
]);

export async function compileWebsiteBookStateMigrationBundle(input) {
  const {
    specPath,
    stateRoot,
    expectedSourceCommit,
  } = input ?? {};
  if (typeof specPath !== "string" || !specPath.trim()) {
    throw new Error("BOOK_STATE_EXPORT_SPEC_PATH_REQUIRED");
  }
  if (typeof stateRoot !== "string" || !stateRoot.trim()) {
    throw new Error("BOOK_STATE_EXPORT_ROOT_REQUIRED");
  }
  if (typeof expectedSourceCommit !== "string" || !COMMIT.test(expectedSourceCommit)) {
    throw new Error("BOOK_STATE_EXPORT_EXPECTED_COMMIT_INVALID");
  }

  const root = await inspectRoot(stateRoot);
  const specFile = await readAbsoluteFile(specPath, MAXIMUM_SPEC_BYTES);
  const spec = parseJson(specFile.bytes, "BOOK_STATE_EXPORT_SPEC_JSON_INVALID");
  const normalized = normalizeSpec(spec, expectedSourceCommit);
  const items = [];
  const expectedItems = normalized.items.map((item) => pickExpected(item));
  validateCoverage({
    projectId: normalized.projectId,
    volumeIds: normalized.volumeIds,
    artworkRequiredVolumeIds: normalized.artworkRequiredVolumeIds,
    expectedItems,
  });

  for (const expected of [...normalized.items]
    .sort((left, right) => left.migrationItemId.localeCompare(right.migrationItemId))) {
    const sourceFile = await readRelativeFile(
      root,
      expected.sourcePath,
      MAXIMUM_RECORD_BYTES,
    );
    const record = parseJson(
      sourceFile.bytes,
      `BOOK_STATE_EXPORT_RECORD_JSON_INVALID:${expected.migrationItemId}`,
    );
    inspectPortableState(record);
    const item = await compileMigrationItem(expected, record, sourceFile);
    items.push(item);
  }

  const bundle = {
    outputKind: "evavo_docs_book_state_migration_bundle_input",
    schemaVersion: 1,
    contract: DOCS_BOOK_STATE_MIGRATION_CONTRACT,
    authorityMode: "shadow_migration",
    bundleId: normalized.exportId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: normalized.sourceCommit,
    projectId: normalized.projectId,
    programmeId: normalized.programmeId,
    volumeIds: [...normalized.volumeIds],
    artworkRequiredVolumeIds: [...normalized.artworkRequiredVolumeIds],
    expectedItems: [...expectedItems]
      .sort((left, right) => left.migrationItemId.localeCompare(right.migrationItemId)),
    items,
    compiledAt: normalized.compiledAt,
    compiledBy: normalized.compiledBy,
    evidenceIds: [...normalized.evidenceIds],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  const outputBytes = Buffer.byteLength(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  if (outputBytes > MAXIMUM_OUTPUT_BYTES) {
    throw new Error("BOOK_STATE_EXPORT_BUNDLE_TOO_LARGE");
  }
  return bundle;
}

export async function writeBookStateMigrationBundleNoClobber(filePath, bundle) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("BOOK_STATE_EXPORT_OUTPUT_PATH_REQUIRED");
  }
  const target = path.resolve(filePath);
  const source = `${JSON.stringify(bundle, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_OUTPUT_BYTES) {
    throw new Error("BOOK_STATE_EXPORT_BUNDLE_TOO_LARGE");
  }
  const handle = await open(
    target,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | noFollowFlag(),
    0o600,
  );
  try {
    await handle.writeFile(source, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  const installed = await readAbsoluteFile(target, MAXIMUM_OUTPUT_BYTES);
  if (installed.bytes.toString("utf8") !== source) {
    throw new Error("BOOK_STATE_EXPORT_OUTPUT_READBACK_MISMATCH");
  }
  return {
    outputPath: target,
    outputByteLength: installed.bytes.byteLength,
    outputSha256: sha256(installed.bytes),
  };
}

async function compileMigrationItem(expected, recordValue, sourceFile) {
  const record = record(recordValue, `record:${expected.migrationItemId}`);
  rejectUnknown(record, RECORD_FIELDS, `record:${expected.migrationItemId}`);
  if (
    record.outputKind !== "evavo_website_book_state_export_record" ||
    record.schemaVersion !== 1
  ) {
    throw new Error(`BOOK_STATE_EXPORT_RECORD_IDENTITY_INVALID:${expected.migrationItemId}`);
  }
  for (const field of ["migrationItemId", "stateKind", "scope", "scopeId"]) {
    if (record[field] !== expected[field]) {
      throw new Error(`BOOK_STATE_EXPORT_RECORD_SCOPE_MISMATCH:${expected.migrationItemId}:${field}`);
    }
  }
  const validationFingerprint = digest(
    record.validationFingerprint,
    `record:${expected.migrationItemId}.validationFingerprint`,
  );
  let sourceRecord;
  let validationRequest;
  let validationResult;
  let artworkUseValidation;

  if (expected.stateKind === "artwork_use") {
    if (record.validationRequest !== undefined || record.validationResult !== undefined) {
      throw new Error(`BOOK_STATE_EXPORT_ART_OPERATION_EVIDENCE_FORBIDDEN:${expected.migrationItemId}`);
    }
    artworkUseValidation = validateArtworkUseRecord(
      record.artworkUseValidation,
      expected.migrationItemId,
    );
    sourceRecord = artworkUseValidation;
  } else {
    if (record.artworkUseValidation !== undefined) {
      throw new Error(`BOOK_STATE_EXPORT_NON_ART_EVIDENCE_INVALID:${expected.migrationItemId}`);
    }
    validationRequest = validateOperationRequest(
      record.validationRequest,
      expected.stateKind,
      expected.migrationItemId,
    );
    validationResult = await validateOperationResult(
      record.validationResult,
      validationRequest,
      expected.migrationItemId,
    );
    if (validationFingerprint !== validationResult.resultFingerprint) {
      throw new Error(`BOOK_STATE_EXPORT_VALIDATION_FINGERPRINT_MISMATCH:${expected.migrationItemId}`);
    }
    sourceRecord = validationRequest.payload;
  }

  const unsigned = {
    ...pickExpected(expected),
    source: {
      sourcePath: expected.sourcePath,
      sourceGitBlobSha1: gitBlobSha1(sourceFile.bytes),
      sourceByteLength: sourceFile.bytes.byteLength,
      sourceContentSha256: sha256(sourceFile.bytes),
      sourceRecordFingerprint: logicalFingerprint(sourceRecord),
    },
    evidenceIds: [...expected.evidenceIds],
    ...(validationRequest === undefined ? {} : { validationRequest }),
    ...(validationResult === undefined ? {} : { validationResult }),
    ...(artworkUseValidation === undefined ? {} : { artworkUseValidation }),
    validationFingerprint,
  };
  return {
    ...unsigned,
    itemFingerprint: logicalFingerprint({
      ...unsigned,
      evidenceIds: [...unsigned.evidenceIds].sort(),
    }),
  };
}

function normalizeSpec(value, expectedSourceCommit) {
  const source = record(value, "export spec");
  rejectUnknown(source, SPEC_FIELDS, "export spec");
  if (
    source.outputKind !== "evavo_website_book_state_export_spec" ||
    source.schemaVersion !== 1 ||
    source.contract !== WEBSITE_BOOK_STATE_EXPORT_CONTRACT
  ) throw new Error("BOOK_STATE_EXPORT_SPEC_IDENTITY_INVALID");
  const exportId = id(source.exportId, "exportId");
  const sourceCommit = typeof source.sourceCommit === "string" && COMMIT.test(source.sourceCommit)
    ? source.sourceCommit
    : invalid("BOOK_STATE_EXPORT_SOURCE_COMMIT_INVALID");
  if (sourceCommit !== expectedSourceCommit) {
    throw new Error("BOOK_STATE_EXPORT_SOURCE_COMMIT_MISMATCH");
  }
  const projectId = id(source.projectId, "projectId");
  const programmeId = id(source.programmeId, "programmeId");
  const volumeIds = ids(source.volumeIds, "volumeIds", true);
  const artworkRequiredVolumeIds = ids(
    source.artworkRequiredVolumeIds,
    "artworkRequiredVolumeIds",
    false,
  );
  if (artworkRequiredVolumeIds.some((value) => !volumeIds.includes(value))) {
    throw new Error("BOOK_STATE_EXPORT_ART_VOLUME_SET_INVALID");
  }
  if (!Array.isArray(source.items) || !source.items.length || source.items.length > MAXIMUM_ITEMS) {
    throw new Error("BOOK_STATE_EXPORT_ITEMS_INVALID");
  }
  const items = source.items.map((entry, index) => normalizeSpecItem(entry, index));
  const migrationIds = items.map((item) => item.migrationItemId);
  const sourcePaths = items.map((item) => item.sourcePath);
  if (new Set(migrationIds).size !== migrationIds.length) {
    throw new Error("BOOK_STATE_EXPORT_ITEM_ID_DUPLICATE");
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    throw new Error("BOOK_STATE_EXPORT_SOURCE_PATH_DUPLICATE");
  }
  const compiledAt = timestamp(source.compiledAt, "compiledAt");
  const compiledBy = text(source.compiledBy, "compiledBy", 300);
  const evidenceIds = ids(source.evidenceIds, "evidenceIds", false);
  requireFalseAuthority(source, "export spec");
  return {
    exportId,
    sourceCommit,
    projectId,
    programmeId,
    volumeIds,
    artworkRequiredVolumeIds,
    items,
    compiledAt,
    compiledBy,
    evidenceIds,
  };
}

function normalizeSpecItem(value, index) {
  const label = `items[${index}]`;
  const source = record(value, label);
  rejectUnknown(source, SPEC_ITEM_FIELDS, label);
  const stateKind = typeof source.stateKind === "string" && STATE_KINDS.has(source.stateKind)
    ? source.stateKind
    : invalid(`BOOK_STATE_EXPORT_STATE_KIND_INVALID:${label}`);
  const scope = source.scope === "project" || source.scope === "volume"
    ? source.scope
    : invalid(`BOOK_STATE_EXPORT_SCOPE_INVALID:${label}`);
  const sourcePath = safePath(source.sourcePath, `${label}.sourcePath`);
  return {
    migrationItemId: id(source.migrationItemId, `${label}.migrationItemId`),
    stateKind,
    scope,
    scopeId: id(source.scopeId, `${label}.scopeId`),
    sourcePath,
    evidenceIds: ids(source.evidenceIds, `${label}.evidenceIds`, false),
  };
}

function validateCoverage(input) {
  const projectStates = input.expectedItems.filter((item) => item.stateKind === "project");
  if (
    projectStates.length !== 1 ||
    projectStates[0]?.scope !== "project" ||
    projectStates[0]?.scopeId !== input.projectId
  ) throw new Error("BOOK_STATE_EXPORT_PROJECT_COVERAGE_INVALID");
  for (const item of input.expectedItems) {
    if (item.stateKind === "project" && item.scope !== "project") {
      throw new Error(`BOOK_STATE_EXPORT_PROJECT_SCOPE_INVALID:${item.migrationItemId}`);
    }
    if (item.stateKind !== "project" && item.scope !== "volume") {
      throw new Error(`BOOK_STATE_EXPORT_VOLUME_SCOPE_INVALID:${item.migrationItemId}`);
    }
    if (item.scope === "volume" && !input.volumeIds.includes(item.scopeId)) {
      throw new Error(`BOOK_STATE_EXPORT_UNKNOWN_VOLUME:${item.migrationItemId}`);
    }
  }
  for (const volumeId of input.volumeIds) {
    for (const stateKind of REQUIRED_VOLUME_KINDS) {
      const count = input.expectedItems.filter(
        (item) => item.scopeId === volumeId && item.stateKind === stateKind,
      ).length;
      if (count !== 1) {
        throw new Error(`BOOK_STATE_EXPORT_REQUIRED_STATE_INVALID:${volumeId}:${stateKind}`);
      }
    }
    const artCount = input.expectedItems.filter(
      (item) => item.scopeId === volumeId && item.stateKind === "artwork_use",
    ).length;
    if (input.artworkRequiredVolumeIds.includes(volumeId) && artCount < 1) {
      throw new Error(`BOOK_STATE_EXPORT_ARTWORK_STATE_REQUIRED:${volumeId}`);
    }
  }
}

function validateOperationRequest(value, stateKind, migrationItemId) {
  const source = record(value, `validationRequest:${migrationItemId}`);
  rejectUnknown(source, REQUEST_FIELDS, `validationRequest:${migrationItemId}`);
  const expectedOperation = OPERATION_BY_KIND[stateKind];
  if (!expectedOperation || source.operation !== expectedOperation) {
    throw new Error(`BOOK_STATE_EXPORT_OPERATION_MISMATCH:${migrationItemId}`);
  }
  if (String(source.operation).startsWith("migration.")) {
    throw new Error(`BOOK_STATE_EXPORT_NESTED_MIGRATION_FORBIDDEN:${migrationItemId}`);
  }
  if (
    source.outputKind !== "evavo_docs_book_operation_request" ||
    source.schemaVersion !== 1 ||
    source.contract !== "evavo_docs_book_operation_v1" ||
    source.authorityMode !== "shadow_migration"
  ) throw new Error(`BOOK_STATE_EXPORT_OPERATION_IDENTITY_INVALID:${migrationItemId}`);
  id(source.requestId, `validationRequest:${migrationItemId}.requestId`);
  timestamp(source.requestedAt, `validationRequest:${migrationItemId}.requestedAt`);
  text(source.requestedBy, `validationRequest:${migrationItemId}.requestedBy`, 300);
  const evidenceIds = ids(
    source.evidenceIds,
    `validationRequest:${migrationItemId}.evidenceIds`,
    false,
  );
  if (canonicalJson(evidenceIds) !== canonicalJson(source.evidenceIds)) {
    throw new Error(`BOOK_STATE_EXPORT_REQUEST_EVIDENCE_ORDER_INVALID:${migrationItemId}`);
  }
  if (!Object.prototype.hasOwnProperty.call(source, "payload")) {
    throw new Error(`BOOK_STATE_EXPORT_OPERATION_PAYLOAD_MISSING:${migrationItemId}`);
  }
  requireFalseAuthority(source, `validationRequest:${migrationItemId}`);
  if (source.automaticPublicationAllowed !== false) {
    throw new Error(`BOOK_STATE_EXPORT_OPERATION_AUTHORITY_INVALID:${migrationItemId}`);
  }
  inspectPortableState(source.payload);
  return structuredClone(source);
}

async function validateOperationResult(value, request, migrationItemId) {
  const source = record(value, `validationResult:${migrationItemId}`);
  rejectUnknown(source, RESULT_FIELDS, `validationResult:${migrationItemId}`);
  if (
    source.outputKind !== "evavo_docs_book_operation_result" ||
    source.schemaVersion !== 1 ||
    source.contract !== "evavo_docs_book_operation_v1" ||
    source.status !== "completed"
  ) throw new Error(`BOOK_STATE_EXPORT_RESULT_IDENTITY_INVALID:${migrationItemId}`);
  if (source.requestId !== request.requestId || source.operation !== request.operation) {
    throw new Error(`BOOK_STATE_EXPORT_RESULT_REQUEST_MISMATCH:${migrationItemId}`);
  }
  if (source.requiredScope !== "documents:read" && source.requiredScope !== "documents:write") {
    throw new Error(`BOOK_STATE_EXPORT_RESULT_SCOPE_INVALID:${migrationItemId}`);
  }
  if (!Array.isArray(source.blockers) || source.blockers.length) {
    throw new Error(`BOOK_STATE_EXPORT_RESULT_BLOCKED:${migrationItemId}`);
  }
  if (!Array.isArray(source.warnings)) {
    throw new Error(`BOOK_STATE_EXPORT_RESULT_WARNINGS_INVALID:${migrationItemId}`);
  }
  if (
    source.authoritativeWritesPerformed !== false ||
    source.canonicalManuscriptMutationPerformed !== false ||
    source.providerCalled !== false ||
    source.publicationPerformed !== false ||
    source.websiteCompatibilityRuntimeStillAuthoritative !== true ||
    source.docsSuiteCanonicalWriterEnabled !== false ||
    source.dualAuthoritativeWritesAllowed !== false ||
    source.runtimeCutoverApproved !== false ||
    source.sourceDeletionApproved !== false
  ) throw new Error(`BOOK_STATE_EXPORT_RESULT_AUTHORITY_INVALID:${migrationItemId}`);
  const expectedRequestFingerprint = logicalFingerprint(request);
  if (source.requestFingerprint !== expectedRequestFingerprint) {
    throw new Error(`BOOK_STATE_EXPORT_REQUEST_FINGERPRINT_MISMATCH:${migrationItemId}`);
  }
  const resultFingerprint = digest(
    source.resultFingerprint,
    `validationResult:${migrationItemId}.resultFingerprint`,
  );
  const { resultFingerprint: _discarded, ...unsigned } = source;
  if (resultFingerprint !== logicalFingerprint(unsigned)) {
    throw new Error(`BOOK_STATE_EXPORT_RESULT_FINGERPRINT_MISMATCH:${migrationItemId}`);
  }
  inspectPortableState(source.result);
  return structuredClone(source);
}

function validateArtworkUseRecord(value, migrationItemId) {
  const source = record(value, `artworkUseValidation:${migrationItemId}`);
  rejectUnknown(
    source,
    new Set(["binding", "artifact"]),
    `artworkUseValidation:${migrationItemId}`,
  );
  const binding = record(source.binding, `binding:${migrationItemId}`);
  const artifact = record(source.artifact, `artifact:${migrationItemId}`);
  if (
    binding.outputKind !== "evavo_book_artwork_use_binding" ||
    binding.contract !== "evavo_book_art_handoff_v1" ||
    binding.canonicalRendererMustVerifyBytes !== true ||
    binding.publicationPerformed !== false
  ) throw new Error(`BOOK_STATE_EXPORT_ART_BINDING_INVALID:${migrationItemId}`);
  if (
    artifact.outputKind !== "evavo_book_art_artifact_receipt" ||
    artifact.contract !== "evavo_book_art_handoff_v1" ||
    artifact.status !== "approved" ||
    artifact.publicationPerformed !== false ||
    artifact.generatedTextDetected !== false ||
    !Array.isArray(artifact.unresolvedRisks) ||
    artifact.unresolvedRisks.length ||
    artifact.provenance?.rightsStatus !== "approved_commercial" ||
    !SHA256.test(String(artifact.selectionReceiptSha256 ?? "")) ||
    !SHA256.test(String(artifact.promotionReceiptSha256 ?? ""))
  ) throw new Error(`BOOK_STATE_EXPORT_ART_ARTIFACT_INVALID:${migrationItemId}`);
  if (
    canonicalJson(binding.identity) !== canonicalJson(artifact.identity) ||
    binding.approvedArtifactId !== artifact.artifactId ||
    binding.approvedArtifactReference !== artifact.artifactReference ||
    binding.approvedArtifactSha256 !== artifact.contentSha256 ||
    binding.promotionReceiptSha256 !== artifact.promotionReceiptSha256
  ) throw new Error(`BOOK_STATE_EXPORT_ART_IDENTITY_MISMATCH:${migrationItemId}`);
  inspectPortableState(source);
  return structuredClone(source);
}

function requireFalseAuthority(source, label) {
  for (const field of [
    "authoritativeWritesAllowed",
    "canonicalManuscriptMutationAllowed",
    "runtimeCutoverApproved",
    "sourceDeletionApproved",
    "publicationPerformed",
  ]) {
    if (source[field] !== false) {
      throw new Error(`BOOK_STATE_EXPORT_AUTHORITY_INVALID:${label}:${field}`);
    }
  }
}

function inspectPortableState(value) {
  const state = { nodes: 0 };
  visit(value, "$", 0, state);
}

function visit(value, location, depth, state) {
  state.nodes += 1;
  if (state.nodes > MAXIMUM_NODES) throw new Error("BOOK_STATE_EXPORT_RECORD_TOO_COMPLEX");
  if (depth > MAXIMUM_DEPTH) throw new Error("BOOK_STATE_EXPORT_RECORD_TOO_DEEP");
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > MAXIMUM_STRING_LENGTH) {
      throw new Error(`BOOK_STATE_EXPORT_STRING_TOO_LARGE:${location}`);
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new Error(`BOOK_STATE_EXPORT_CONTROL_CHARACTER:${location}`);
    }
    if (/^(?:data|blob):/i.test(value)) {
      throw new Error(`BOOK_STATE_EXPORT_EMBEDDED_BINARY_REFERENCE:${location}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      visit(value[index], `${location}[${index}]`, depth + 1, state);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    throw new Error(`BOOK_STATE_EXPORT_UNSUPPORTED_VALUE:${location}`);
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_DATA_KEYS.has(normalized)) {
      throw new Error(`BOOK_STATE_EXPORT_PRIVATE_PAYLOAD_FORBIDDEN:${location}.${key}`);
    }
    visit(entry, `${location}.${key}`, depth + 1, state);
  }
}

async function inspectRoot(value) {
  const resolved = path.resolve(value);
  const stat = await lstat(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("BOOK_STATE_EXPORT_ROOT_UNSAFE");
  }
  return {
    resolved,
    real: await realpath(resolved),
  };
}

async function readRelativeFile(root, relativePath, maximumBytes) {
  safePath(relativePath, "sourcePath");
  const parts = relativePath.split("/");
  let current = root.resolved;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`BOOK_STATE_EXPORT_SYMLINK_FORBIDDEN:${relativePath}`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`BOOK_STATE_EXPORT_PARENT_NOT_DIRECTORY:${relativePath}`);
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      throw new Error(`BOOK_STATE_EXPORT_SOURCE_NOT_FILE:${relativePath}`);
    }
  }
  const targetReal = await realpath(current);
  const containment = path.relative(root.real, targetReal);
  if (!containment || containment.startsWith("..") || path.isAbsolute(containment)) {
    throw new Error(`BOOK_STATE_EXPORT_PATH_ESCAPE:${relativePath}`);
  }
  return readOpenedFile(current, maximumBytes);
}

async function readAbsoluteFile(filePath, maximumBytes) {
  const target = path.resolve(filePath);
  const stat = await lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("BOOK_STATE_EXPORT_FILE_UNSAFE");
  }
  return readOpenedFile(target, maximumBytes);
}

async function readOpenedFile(filePath, maximumBytes) {
  const handle = await open(
    filePath,
    fsConstants.O_RDONLY | noFollowFlag(),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maximumBytes) {
      throw new Error("BOOK_STATE_EXPORT_FILE_SIZE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== before.size
    ) throw new Error("BOOK_STATE_EXPORT_FILE_CHANGED_DURING_READ");
    return { bytes, stat: after };
  } finally {
    await handle.close();
  }
}

function noFollowFlag() {
  return typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
}

function parseJson(bytes, code) {
  const source = bytes.toString("utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(code);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function logicalFingerprint(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function pickExpected(value) {
  return {
    migrationItemId: value.migrationItemId,
    stateKind: value.stateKind,
    scope: value.scope,
    scopeId: value.scopeId,
  };
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`BOOK_STATE_EXPORT_OBJECT_REQUIRED:${label}`);
  }
  return value;
}

function rejectUnknown(source, allowed, label) {
  const unknown = Object.keys(source).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    throw new Error(`BOOK_STATE_EXPORT_UNKNOWN_FIELDS:${label}:${unknown.join(",")}`);
  }
}

function id(value, label) {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) throw new Error(`BOOK_STATE_EXPORT_ID_INVALID:${label}`);
  return value;
}

function ids(value, label, requireOne) {
  if (
    !Array.isArray(value) ||
    (requireOne && !value.length) ||
    value.length > MAXIMUM_EVIDENCE_IDS
  ) throw new Error(`BOOK_STATE_EXPORT_IDS_INVALID:${label}`);
  const result = value.map((entry) => id(entry, label));
  if (new Set(result).size !== result.length) {
    throw new Error(`BOOK_STATE_EXPORT_IDS_DUPLICATE:${label}`);
  }
  return [...result].sort();
}

function digest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`BOOK_STATE_EXPORT_DIGEST_INVALID:${label}`);
  }
  return value;
}

function safePath(value, label) {
  if (typeof value !== "string" || !SAFE_PATH.test(value)) {
    throw new Error(`BOOK_STATE_EXPORT_PATH_INVALID:${label}`);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) throw new Error(`BOOK_STATE_EXPORT_TIMESTAMP_INVALID:${label}`);
  return value;
}

function text(value, label, maximum) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value.length ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`BOOK_STATE_EXPORT_TEXT_INVALID:${label}`);
  return value;
}

function invalid(code) {
  throw new Error(code);
}
