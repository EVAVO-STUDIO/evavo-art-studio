import path from 'node:path';

import {
  boundedInteger,
  canonicalJson,
  boundedNumber,
  boundedString,
  canonicalRelativePath,
  fail,
  hashFileBounded,
  inspectImageFile,
  isRecord,
  mediaTypeFromPath,
  requireDirectoryNoSymlink,
  resolveExistingWithinRoot,
  safeId,
  sha256,
  timestamp,
  verifyDocumentHash,
  withDocumentHash,
} from './common.mjs';

export const REFERENCE_DERIVED_REQUEST_SCHEMA = 'evavo.reference-derived-image-request.v1';
export const REFERENCE_DERIVED_PLAN_SCHEMA = 'evavo.reference-derived-image-plan.v1';
export const REFERENCE_BINDINGS_SCHEMA = 'evavo.reference-derived-artifact-bindings.v1';
export const REFERENCE_INGEST_SCHEMA = 'evavo.reference-derived-artifact-ingest.v1';

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const OPERATIONS = new Set([
  'match-family',
  'matching-frame',
  'in-between-frame',
  'controlled-variation',
  'style-locked-recreate',
  'sheet-extension',
]);
const ASSET_KINDS = new Set([
  'sprite-frame',
  'sprite-layer',
  'environment',
  'effect',
  'ui',
  'illustration',
  'print',
]);
const REFERENCE_ROLES = new Set([
  'canonical-identity',
  'direction-master',
  'previous-key-pose',
  'next-key-pose',
  'base-image',
  'mask',
  'pose-control',
  'edge-control',
  'depth-control',
  'palette-reference',
  'line-reference',
  'material-reference',
  'layer-context',
]);
const CAPABILITY_BY_ROLE = Object.freeze({
  'canonical-identity': 'identity-reference',
  'direction-master': 'direction-reference',
  'previous-key-pose': 'temporal-reference',
  'next-key-pose': 'temporal-reference',
  'base-image': null,
  mask: 'mask',
  'pose-control': 'pose-control',
  'edge-control': 'edge-control',
  'depth-control': 'depth-control',
  'palette-reference': 'palette-reference',
  'line-reference': 'line-reference',
  'material-reference': 'material-reference',
  'layer-context': 'layer-context-reference',
});

function providerSafeId(value, label) {
  const normalized = safeId(value, label);
  if (normalized.length > 128) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', `${label} must not exceed 128 characters.`);
  }
  return normalized;
}
const OPERATION_MAP = Object.freeze({
  'match-family': { providerOperation: 'generate', continuityPhase: 'independent' },
  'matching-frame': { providerOperation: 'generate', continuityPhase: 'key-pose' },
  'in-between-frame': { providerOperation: 'generate', continuityPhase: 'in-between' },
  'controlled-variation': { providerOperation: 'edit', continuityPhase: 'repair' },
  'style-locked-recreate': { providerOperation: 'generate', continuityPhase: 'repair' },
  'sheet-extension': { providerOperation: 'edit', continuityPhase: 'repair' },
});

function stringArray(value, label, maximumItems = 64, maximumLength = 1024) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', `${label} must be an array with at most ${maximumItems} items.`);
  }
  return [...new Set(value.map((item, index) => boundedString(item, `${label}[${index}]`, maximumLength)))];
}

function authorityBoundary(value) {
  if (value === undefined) return;
  if (!isRecord(value)) fail('REFERENCE_DERIVED_AUTHORITY_INVALID', 'authority must be an object.');
  const allowed = new Set([
    'referenceCompilation',
    'artifactIngest',
    'providerExecution',
    'runtimeSubmission',
    'candidateApproval',
    'candidatePromotion',
    'sourceMutation',
    'sourceDeletion',
    'targetRepositoryMutation',
    'publication',
    'deployment',
    'forcePush',
  ]);
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key) || entry !== false) {
      fail('REFERENCE_DERIVED_AUTHORITY_INVALID', `authority.${key} must be a supported false value.`);
    }
  }
}

function normalizeStyle(value) {
  if (!isRecord(value)) fail('REFERENCE_DERIVED_REQUEST_INVALID', 'style must be an object.');
  return {
    styleName: boundedString(value.styleName, 'style.styleName', 256),
    intent: boundedString(value.intent, 'style.intent', 16_384),
    mustHave: stringArray(value.mustHave, 'style.mustHave'),
    mustAvoid: stringArray(value.mustAvoid, 'style.mustAvoid'),
    identityLocks: stringArray(value.identityLocks, 'style.identityLocks'),
    palette: stringArray(value.palette, 'style.palette', 256, 128),
    lineTreatment: stringArray(value.lineTreatment, 'style.lineTreatment'),
    materials: stringArray(value.materials, 'style.materials'),
    cameraRules: stringArray(value.cameraRules, 'style.cameraRules'),
    compositionRules: stringArray(value.compositionRules, 'style.compositionRules'),
    eraRules: stringArray(value.eraRules, 'style.eraRules'),
  };
}

function normalizeShot(value) {
  if (!isRecord(value)) fail('REFERENCE_DERIVED_REQUEST_INVALID', 'shot must be an object.');
  return {
    subject: boundedString(value.subject, 'shot.subject', 2048),
    ...(value.action === undefined ? {} : { action: boundedString(value.action, 'shot.action', 2048) }),
    ...(value.direction === undefined ? {} : { direction: boundedString(value.direction, 'shot.direction', 256) }),
    include: stringArray(value.include, 'shot.include'),
    exclude: stringArray(value.exclude, 'shot.exclude'),
    separateAssets: stringArray(value.separateAssets, 'shot.separateAssets'),
    framing: stringArray(value.framing, 'shot.framing'),
  };
}

function normalizeTarget(value) {
  if (!isRecord(value)) fail('REFERENCE_DERIVED_REQUEST_INVALID', 'target must be an object.');
  const transparency = value.transparency ?? 'required';
  if (!['required', 'preferred', 'opaque'].includes(transparency)) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'target.transparency is invalid.');
  }
  const outputFormat = value.outputFormat ?? 'png';
  if (!['png', 'webp', 'jpeg'].includes(outputFormat)) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'target.outputFormat is invalid.');
  }
  if (outputFormat === 'jpeg' && transparency === 'required') {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'JPEG cannot satisfy required transparency.');
  }
  return {
    width: boundedInteger(value.width, 'target.width', 1, 8_192),
    height: boundedInteger(value.height, 'target.height', 1, 8_192),
    transparency,
    outputFormat,
  };
}

function normalizeBackground(value, target) {
  const input = value === undefined ? {} : value;
  if (!isRecord(input)) fail('REFERENCE_DERIVED_REQUEST_INVALID', 'background must be an object.');
  const strategy = input.strategy ?? (target.transparency === 'required' ? 'native-alpha' : 'provider-auto');
  if (!['native-alpha', 'chroma-key', 'opaque-source', 'provider-auto'].includes(strategy)) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'background.strategy is invalid.');
  }
  let matteColour;
  if (input.matteColour !== undefined) {
    matteColour = boundedString(input.matteColour, 'background.matteColour', 7).toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(matteColour)) {
      fail('REFERENCE_DERIVED_REQUEST_INVALID', 'background.matteColour must use #RRGGBB.');
    }
  }
  if (strategy === 'chroma-key' && !matteColour) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'chroma-key requires background.matteColour.');
  }
  if (target.transparency === 'required' && strategy === 'opaque-source') {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'required transparency cannot use opaque-source.');
  }
  return { strategy, ...(matteColour ? { matteColour } : {}) };
}

function normalizeSelection(value) {
  if (value === undefined) {
    return { allowedAdapterIds: [], allowFallback: true, requireSeed: false };
  }
  if (!isRecord(value)) fail('REFERENCE_DERIVED_REQUEST_INVALID', 'selection must be an object.');
  const allowedAdapterIds = stringArray(value.allowedAdapterIds, 'selection.allowedAdapterIds', 32, 128).map((item) => providerSafeId(item, 'adapter id'));
  return {
    ...(value.preferredAdapterId === undefined
      ? {}
      : { preferredAdapterId: providerSafeId(value.preferredAdapterId, 'selection.preferredAdapterId') }),
    ...(value.preferredModel === undefined
      ? {}
      : { preferredModel: providerSafeId(value.preferredModel, 'selection.preferredModel') }),
    allowedAdapterIds,
    allowFallback: value.allowFallback !== false,
    requireSeed: value.requireSeed === true,
  };
}

function normalizeBindings(value) {
  if (value === undefined) return new Map();
  if (!isRecord(value) || value.schema !== REFERENCE_BINDINGS_SCHEMA) {
    fail('REFERENCE_DERIVED_BINDINGS_INVALID', `Bindings must use ${REFERENCE_BINDINGS_SCHEMA}.`);
  }
  verifyDocumentHash(value);
  if (!Array.isArray(value.bindings)) {
    fail('REFERENCE_DERIVED_BINDINGS_INVALID', 'bindings must be an array.');
  }
  const map = new Map();
  for (const [index, binding] of value.bindings.entries()) {
    if (!isRecord(binding)) fail('REFERENCE_DERIVED_BINDINGS_INVALID', `bindings[${index}] must be an object.`);
    const referenceId = safeId(binding.referenceId, `bindings[${index}].referenceId`);
    if (!ARTIFACT_ID.test(binding.artifactId || '')) {
      fail('REFERENCE_DERIVED_BINDINGS_INVALID', `bindings[${index}].artifactId is invalid.`);
    }
    if (map.has(referenceId)) fail('REFERENCE_DERIVED_BINDINGS_INVALID', `Duplicate binding: ${referenceId}.`);
    map.set(referenceId, binding.artifactId);
  }
  return map;
}

function validateReferenceTopology(operation, roles, assetKind, continuityPhase) {
  const has = (role) => roles.includes(role);
  if (has('mask')) {
    fail('REFERENCE_DERIVED_TOPOLOGY_INVALID', 'Mask references belong to the existing governed inpaint repair path, not these reference-derived operations.');
  }
  const lockedSprite = ['sprite-frame', 'sprite-layer'].includes(assetKind) && !['independent', 'identity-master'].includes(continuityPhase);
  if (lockedSprite && !has('canonical-identity')) {
    fail('REFERENCE_DERIVED_TOPOLOGY_INVALID', 'Continuity-locked sprite work requires a canonical-identity reference.');
  }
  if (operation === 'in-between-frame' && (!has('previous-key-pose') || !has('next-key-pose'))) {
    fail('REFERENCE_DERIVED_TOPOLOGY_INVALID', 'in-between-frame requires previous-key-pose and next-key-pose references.');
  }
  if (['controlled-variation', 'sheet-extension'].includes(operation) && !has('base-image')) {
    fail('REFERENCE_DERIVED_TOPOLOGY_INVALID', `${operation} requires one base-image reference.`);
  }
  if (roles.filter((role) => role === 'base-image').length > 1) {
    fail('REFERENCE_DERIVED_TOPOLOGY_INVALID', 'Only one base-image reference is allowed.');
  }
}

export async function compileReferenceDerivedImagePlan({
  workspaceRoot,
  request,
  requestBytes,
  bindings,
  bindingsBytes,
  compiledAt = new Date().toISOString(),
}) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspace-root');
  timestamp(compiledAt, 'compiledAt');
  if (!isRecord(request) || request.schema !== REFERENCE_DERIVED_REQUEST_SCHEMA) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', `Request must use ${REFERENCE_DERIVED_REQUEST_SCHEMA}.`);
  }
  authorityBoundary(request.authority);
  const referenceOperation = request.operation;
  if (!OPERATIONS.has(referenceOperation)) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', `Unsupported reference-derived operation: ${referenceOperation}.`);
  }
  const operation = OPERATION_MAP[referenceOperation];
  const assetKind = request.assetKind;
  if (!ASSET_KINDS.has(assetKind)) fail('REFERENCE_DERIVED_REQUEST_INVALID', `Unsupported assetKind: ${assetKind}.`);
  const requestId = providerSafeId(request.requestId, 'requestId');
  const projectId = providerSafeId(request.projectId, 'projectId');
  const assetId = providerSafeId(request.assetId, 'assetId');
  const candidateFamilyId = providerSafeId(request.candidateFamilyId, 'candidateFamilyId');
  if (bindings !== undefined && (bindings.requestId !== requestId || bindings.projectId !== projectId)) {
    fail('REFERENCE_DERIVED_BINDINGS_INVALID', 'Bindings do not belong to this request and project.');
  }
  const bindingMap = normalizeBindings(bindings);
  if (!Array.isArray(request.references) || request.references.length < 1 || request.references.length > 16) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'references must contain 1-16 entries.');
  }
  const referenceIds = new Set();
  const normalizedReferences = [];
  for (const [index, reference] of request.references.entries()) {
    if (!isRecord(reference)) fail('REFERENCE_DERIVED_REQUEST_INVALID', `references[${index}] must be an object.`);
    const referenceId = safeId(reference.referenceId, `references[${index}].referenceId`);
    if (referenceIds.has(referenceId)) fail('REFERENCE_DERIVED_REQUEST_INVALID', `Duplicate referenceId: ${referenceId}.`);
    referenceIds.add(referenceId);
    const role = reference.role;
    if (!REFERENCE_ROLES.has(role)) fail('REFERENCE_DERIVED_REQUEST_INVALID', `Unsupported reference role: ${role}.`);
    let artifactId = reference.artifactId ?? bindingMap.get(referenceId) ?? null;
    if (artifactId !== null && !ARTIFACT_ID.test(artifactId)) {
      fail('REFERENCE_DERIVED_REQUEST_INVALID', `Invalid artifactId for ${referenceId}.`);
    }
    let local = null;
    if (reference.path !== undefined) {
      const relativePath = canonicalRelativePath(reference.path, `references[${index}].path`);
      const resolved = await resolveExistingWithinRoot(root, relativePath, `reference ${referenceId}`);
      const identity = await hashFileBounded(resolved.absolutePath);
      if (reference.expectedSha256 !== undefined && reference.expectedSha256 !== identity.sha256) {
        fail('REFERENCE_DERIVED_REFERENCE_HASH_MISMATCH', `Reference SHA-256 mismatch: ${relativePath}.`);
      }
      const image = await inspectImageFile(resolved.absolutePath);
      if (!image) fail('REFERENCE_DERIVED_REQUEST_INVALID', `Reference must be a supported image: ${relativePath}.`);
      local = {
        path: relativePath,
        sha256: identity.sha256,
        bytes: identity.bytes,
        mediaType: mediaTypeFromPath(relativePath),
        image,
      };
    }
    if (!artifactId && !local) {
      fail('REFERENCE_DERIVED_REQUEST_INVALID', `Reference ${referenceId} requires artifactId, path, or a supplied binding.`);
    }
    normalizedReferences.push({
      referenceId,
      role,
      strength: boundedNumber(reference.strength ?? 1, `references[${index}].strength`, 0, 1),
      required: reference.required !== false,
      ...(reference.note === undefined ? {} : { note: boundedString(reference.note, `references[${index}].note`, 512) }),
      ...(artifactId ? { artifactId } : {}),
      ...(local ? { local } : {}),
    });
  }
  validateReferenceTopology(referenceOperation, normalizedReferences.map((reference) => reference.role), assetKind, operation.continuityPhase);

  const target = normalizeTarget(request.target);
  const style = normalizeStyle(request.style);
  const shot = normalizeShot(request.shot);
  const selection = normalizeSelection(request.selection);
  const background = normalizeBackground(request.background, target);
  const candidateCount = boundedInteger(request.candidateCount ?? 4, 'candidateCount', 1, 8);
  const quality = request.quality ?? 'high';
  if (!['draft', 'standard', 'high'].includes(quality)) {
    fail('REFERENCE_DERIVED_REQUEST_INVALID', 'quality must be draft, standard, or high.');
  }
  const requiredCapabilities = new Set([
    operation.providerOperation,
    ...(normalizedReferences.length ? ['reference-images'] : []),
    ...(normalizedReferences.length > 1 ? ['multiple-reference-images'] : []),
    ...(candidateCount > 1 ? ['candidate-count'] : []),
    ...(target.transparency === 'required' ? ['native-alpha'] : []),
    'custom-size',
  ]);
  for (const reference of normalizedReferences) {
    const capability = CAPABILITY_BY_ROLE[reference.role];
    if (capability) requiredCapabilities.add(capability);
  }
  const missingArtifactReferenceIds = normalizedReferences
    .filter((reference) => !reference.artifactId)
    .map((reference) => reference.referenceId);
  const providerCompilable = missingArtifactReferenceIds.length === 0;
  const providerRequest = providerCompilable
    ? {
        schemaVersion: '1.0',
        requestId,
        operation: operation.providerOperation,
        assetKind,
        continuityPhase: operation.continuityPhase,
        assetId,
        candidateFamilyId,
        ...(request.frameId === undefined ? {} : { frameId: providerSafeId(request.frameId, 'frameId') }),
        ...(request.layerId === undefined ? {} : { layerId: providerSafeId(request.layerId, 'layerId') }),
        creativeIntent: boundedString(request.creativeIntent, 'creativeIntent', 32_768),
        ...(request.negativeIntent === undefined
          ? {}
          : { negativeIntent: boundedString(request.negativeIntent, 'negativeIntent', 32_768) }),
        style,
        shot,
        target,
        ...(request.sourceCanvas === undefined
          ? {}
          : {
              sourceCanvas: {
                width: boundedInteger(request.sourceCanvas.width, 'sourceCanvas.width', 1, 8_192),
                height: boundedInteger(request.sourceCanvas.height, 'sourceCanvas.height', 1, 8_192),
              },
            }),
        background,
        quality,
        candidateCount,
        ...(request.seed === undefined ? {} : { seed: boundedInteger(request.seed, 'seed', 0, 4_294_967_295) }),
        references: normalizedReferences.map((reference) => ({
          artifactId: reference.artifactId,
          role: reference.role,
          strength: reference.strength,
          required: reference.required,
          ...(reference.note === undefined ? {} : { note: reference.note }),
        })),
        selection,
        metadata: {
          schema: 'evavo.reference-derived-provider-metadata.v1',
          projectId,
          referenceOperation,
          referencePlanRequestSha256: sha256(requestBytes),
          referenceBindingsSha256: bindingsBytes ? sha256(bindingsBytes) : null,
          exactReferenceEvidence: normalizedReferences.map((reference) => ({
            referenceId: reference.referenceId,
            role: reference.role,
            artifactId: reference.artifactId,
            ...(reference.local
              ? {
                  localPath: reference.local.path,
                  localSha256: reference.local.sha256,
                  localBytes: reference.local.bytes,
                }
              : {}),
          })),
          requiresFreshAdmission: true,
          requiresFreshExecutionAuthorization: true,
          independentApprovalPerformed: false,
        },
      }
    : null;

  const ingestEntries = normalizedReferences
    .filter((reference) => !reference.artifactId && reference.local)
    .map((reference) => ({
      referenceId: reference.referenceId,
      role: reference.role,
      path: reference.local.path,
      sha256: reference.local.sha256,
      bytes: reference.local.bytes,
      mediaType: reference.local.mediaType,
      storageClass: 'source',
      labels: {
        projectId,
        requestId,
        referenceOperation,
        referenceRole: reference.role,
      },
    }));

  const plan = withDocumentHash({
    schema: REFERENCE_DERIVED_PLAN_SCHEMA,
    requestId,
    projectId,
    compiledAt,
    runId: `reference-derived:${sha256(`${requestId}\0${sha256(requestBytes)}\0${compiledAt}`).slice(0, 24)}`,
    referenceOperation,
    providerOperation: operation.providerOperation,
    continuityPhase: operation.continuityPhase,
    assetKind,
    assetId,
    candidateFamilyId,
    target,
    references: normalizedReferences,
    requiredCapabilities: [...requiredCapabilities].sort(),
    providerCompilable,
    missingArtifactReferenceIds,
    providerRequest,
    providerRequestSha256: providerRequest ? sha256(canonicalJson(providerRequest)) : null,
    artifactIngest: {
      schema: REFERENCE_INGEST_SCHEMA,
      required: ingestEntries.length > 0,
      entries: ingestEntries,
      explicitArtifactWriteRequired: ingestEntries.length > 0,
      providerExecution: false,
    },
    requestSha256: sha256(requestBytes),
    bindingsSha256: bindingsBytes ? sha256(bindingsBytes) : null,
    workflow: {
      nextStep: providerCompilable ? 'explicit-selection' : 'explicit-reference-artifact-ingest',
      requiresFreshAdmission: true,
      requiresFreshExecutionAuthorization: true,
      independentApprovalPerformed: false,
      candidatePromotionPerformed: false,
    },
    authority: {
      referenceCompilation: true,
      artifactIngest: false,
      providerExecution: false,
      runtimeSubmission: false,
      candidateApproval: false,
      candidatePromotion: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
  });
  verifyDocumentHash(plan);
  return plan;
}
