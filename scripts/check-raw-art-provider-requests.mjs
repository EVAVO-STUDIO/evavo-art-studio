#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { hashObject } from './compile-raw-art-provider-requests.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COMPILER = path.join(ROOT, 'compile-raw-art-provider-requests.mjs');
const WORKSHOP_DOC = path.join(ROOT, '..', 'docs', 'RAW_ART_AGENT_WORKSHOP.md');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const artifact = (character) => `artifact_${character.repeat(64)}`;

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, 'utf8');
  return { file, text, sha256: sha256(Buffer.from(text, 'utf8')) };
}

function selfHash(value, key) {
  const result = { ...value };
  result[key] = hashObject(result);
  result.runId = result[key].slice(0, 20);
  return result;
}

function campaignItem(sourcePath, sourceSha256, semanticRole, decision, stage) {
  return {
    itemId: hashObject({ sourceSha256, sourcePath }).slice(0, 24),
    sourcePath,
    sourceSha256,
    semanticRole,
    portId: null,
    decision,
    stage,
    candidateSha256: null,
    evidence: {
      reviewSha256: 'b'.repeat(64),
      workOrderSha256: 'c'.repeat(64),
      processingReceiptSha256: null,
      candidateEvaluationSha256: null,
      runtimeEvidenceSha256: null,
      technicalAdmissionSha256: 'd'.repeat(64),
    },
    technicalAdmission: {
      required: true,
      status: 'passed',
      admissionSha256: 'd'.repeat(64),
      batchId: 'batch-1',
      roleId: semanticRole,
      rawRgbaSha256: 'e'.repeat(64),
      blockingGateIds: [],
      warningGateIds: [],
      technicalActions: [],
      blockerKind: null,
    },
    nextAction: 'produce create-only candidate and receipt',
  };
}

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [COMPILER, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 30_000,
  });
  if (result.status !== expected) {
    throw new Error(
      `compiler exit ${result.status}, expected ${expected}: ${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function fixture(root) {
  const gameHead = 'a'.repeat(40);
  const bridge = {
    schema: 'evavo.brass-brine.art-studio-bridge.v1',
    roles: {
      'standing-character': {
        targetCanvas: { width: 512, height: 512 },
        alphaPolicy: 'meaningful-alpha-required',
      },
      'location-background': {
        targetCanvas: { width: 1280, height: 720 },
        alphaPolicy: 'opaque',
      },
      'ui-icon': {
        targetCanvas: { width: 256, height: 256 },
        alphaPolicy: 'meaningful-alpha-required',
      },
    },
  };
  const bridgeRecord = writeJson(path.join(root, 'bridge.json'), bridge);
  const role = (assetKind, transparency, backgroundStrategy, candidateCount = 4) => ({
    assetKind,
    transparency,
    backgroundStrategy,
    continuityByOperation: {
      generate: assetKind.startsWith('sprite') ? 'identity-master' : 'direction-master',
      edit: 'repair',
      inpaint: 'repair',
    },
    defaultQuality: 'high',
    defaultCandidateCount: candidateCount,
    maximumStyleReferences: 4,
  });
  const providerMap = {
    schema: 'evavo.brass-brine.raw-art-provider-role-map.v2',
    repository: 'EVAVO-STUDIO/Brass_Brine',
    bridgeSchema: 'evavo.brass-brine.art-studio-bridge.v1',
    directionContract: 'evavo.brass-brine.art-direction-animation.v1',
    campaignSchema: 'evavo.brass-brine.raw-art-production-campaign-state.v1',
    campaignRevision: 'evavo.brass-brine.raw-art-production-campaign-revision.v3',
    requestBatchSchema: 'evavo.raw-art-provider-request-batch.v2',
    requestMetadataSchema: 'evavo.raw-art-provider-request-metadata.v2',
    artifactBindingsSchema: 'evavo.raw-art-provider-artifact-bindings.v2',
    artifactBindingsTemplateSchema: 'evavo.raw-art-provider-artifact-bindings-template.v2',
    styleBankSchema: 'evavo.image-style-reference-bank.v1',
    technicalAdmissionRequired: true,
    campaignNextBatchRequired: true,
    campaignNeedsProcessingStageRequired: true,
    sourceCanvasPolicy: 'adapter-derived-from-target',
    candidateEvidenceAutomaticallyStored: true,
    providerExecutionSeparate: true,
    runtimeSubmissionSeparate: true,
    maximumOrdersPerBatch: 100,
    roleMappings: {
      'standing-character': role('sprite-frame', 'required', 'native-alpha'),
      'location-background': role('environment', 'opaque', 'opaque-source'),
      'ui-icon': role('ui', 'required', 'native-alpha', 6),
    },
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      creativeApproval: false,
      historicalApproval: false,
      provenanceApproval: false,
      runtimeApproval: false,
      publication: false,
      forcePush: false,
    },
  };
  const providerMapRecord = writeJson(
    path.join(root, 'provider-map.json'),
    providerMap,
  );
  const entries = [
    {
      sourcePath: 'RAW_ART/characters/sailor.png',
      sourceSha256: '1'.repeat(64),
      sourceBytes: 1000,
      dimensions: { width: 512, height: 512 },
      semanticRole: 'standing-character',
      decision: 'edit',
      state: 'provider-required',
      targetPath: 'assets/art/characters/sailor.png',
      targetCanvas: { width: 512, height: 512 },
      alphaPolicy: 'meaningful-alpha-required',
      operations: ['retouch'],
      assignment: { identityId: 'sailor' },
      defects: ['repair malformed left hand'],
      negativeConstraints: ['no modern clothing'],
    },
    {
      sourcePath: 'RAW_ART/locations/port.png',
      sourceSha256: '2'.repeat(64),
      sourceBytes: 2000,
      dimensions: { width: 1280, height: 720 },
      semanticRole: 'location-background',
      decision: 'recreate',
      state: 'provider-required',
      targetPath: 'assets/art/ports/london/locations/docks/base.png',
      targetCanvas: { width: 1280, height: 720 },
      alphaPolicy: 'opaque',
      operations: [],
      assignment: { portId: 'london', sceneId: 'docks' },
      defects: ['remove generated pseudo-text'],
      negativeConstraints: ['no electrical lighting'],
    },
    {
      sourcePath: 'RAW_ART/ui/coin.png',
      sourceSha256: '3'.repeat(64),
      sourceBytes: 500,
      dimensions: { width: 256, height: 256 },
      semanticRole: 'ui-icon',
      decision: 'generate-variation',
      state: 'provider-required',
      targetPath: 'assets/art/ui/icons/coin.png',
      targetCanvas: { width: 256, height: 256 },
      alphaPolicy: 'meaningful-alpha-required',
      operations: [],
      assignment: { iconId: 'coin' },
      defects: [],
      negativeConstraints: ['no glossy app icon'],
    },
  ];
  const queueBase = {
    schema: 'evavo.raw-art-production-queue.v2',
    sourceRoot: 'C:/RAW_ART',
    inputs: { bridgeSha256: bridgeRecord.sha256 },
    entries,
    batches: [],
    counts: { 'provider-required': entries.length },
    resumableBySourceSha256AndTargetPath: true,
    receiptCannotBypassReviewDecision: true,
    sourceMutation: false,
    sourceDeletion: false,
    providerExecution: false,
    targetRepositoryMutation: false,
    publication: false,
  };
  const queue = { ...queueBase, queueSha256: hashObject(queueBase) };
  const queueRecord = writeJson(path.join(root, 'queue.json'), queue);
  const direction = {
    schemaVersion: '1.0',
    contract: 'evavo.brass-brine.art-direction-animation.v1',
    timeline: { defaultReferenceYear: 1871 },
    visualPillars: [
      {
        id: 'readability',
        rule: 'Every asset must remain readable at actual gameplay size.',
      },
      {
        id: 'linework',
        rule: 'Use controlled engraved linework, stipple and hatching.',
      },
    ],
    palette: {
      base: { nearBlackNavy: '#090c12', signalCherryRed: '#ff244e' },
    },
    cameraAndComposition: {
      allowedPrimaryCameras: ['front-on-stage', 'side-stage'],
      sceneFloorLane: { required: true },
      interactionSafety: { textSafeAreaRequired: true },
    },
    roleProfiles: {
      standing_character: {
        camera: 'front-on-stage-or-side-stage',
        requiredIdentityAnchors: ['face', 'clothing', 'handedness'],
        forbidden: ['cropped-feet', 'modern-pose-language'],
      },
      location_background: {
        camera: 'front-on-stage-or-side-stage',
        requiredBriefFields: ['portId', 'date', 'weather'],
        requiredLayers: ['base', 'foreground_occlusion', 'interaction_mask'],
        forbidden: ['generic-port', 'modern-street-furniture'],
      },
      ui_icon: {
        camera: 'front-symbol',
        requiredIdentityAnchors: ['silhouette'],
        forbidden: ['glossy-app-icon'],
      },
    },
    forbidden: ['photorealism', 'generic-ai-sheen', 'pseudo-text'],
    authority: {
      providerExecution: false,
      sourceOverwrite: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      creativeApproval: false,
      historicalApproval: false,
      runtimeApproval: false,
      publication: false,
      forcePush: false,
    },
  };
  const directionRecord = writeJson(path.join(root, 'direction.json'), direction);
  const styleReferences = [
    ['standing-character', '4', 'standing.png', 'crisp engraved silhouette'],
    ['location-background', '5', 'location.png', 'front-on stage composition'],
    ['ui-icon', '6', 'icon.png', 'strong monochrome silhouette'],
  ];
  const bankBase = {
    schema: 'evavo.image-style-reference-bank.v1',
    contract: 'evavo.executable-image-pipeline.v1',
    sourceRoot: 'C:/RAW_ART',
    references: styleReferences.map(([semanticRole, digit, name, trait]) => ({
      sourcePath: `RAW_ART/style/${name}`,
      sourceSha256: digit.repeat(64),
      sizeBytes: 3000,
      semanticRole,
      approvedTraits: [trait, 'period-specific authored linework'],
      approvalAuthority: 'Greg Parker',
      reviewSha256: String(Number(digit) + 1).repeat(64),
      features: { featureVersion: 'evavo.image-style-features.v1' },
    })),
    roleProfiles: Object.fromEntries(
      styleReferences.map(([semanticRole]) => [semanticRole, {}]),
    ),
    effects: {
      providerExecution: false,
      sourceOverwrite: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      publication: false,
    },
  };
  const bank = selfHash(bankBase, 'bankSha256');
  const bankRecord = writeJson(path.join(root, 'style-bank.json'), bank);

  const campaignItems = [
    campaignItem(
      entries[0].sourcePath,
      entries[0].sourceSha256,
      entries[0].semanticRole,
      entries[0].decision,
      'needs-processing',
    ),
    campaignItem(
      entries[1].sourcePath,
      entries[1].sourceSha256,
      entries[1].semanticRole,
      entries[1].decision,
      'needs-processing',
    ),
    campaignItem(
      entries[2].sourcePath,
      entries[2].sourceSha256,
      entries[2].semanticRole,
      entries[2].decision,
      'needs-processing',
    ),
  ];
  const campaignBase = {
    schema: 'evavo.brass-brine.raw-art-production-campaign-state.v1',
    contract: 'evavo.brass-brine.raw-art-production-campaign.v1',
    repository: 'EVAVO-STUDIO/Brass_Brine',
    revision: 'evavo.brass-brine.raw-art-production-campaign-revision.v3',
    revisionSha256: '9'.repeat(64),
    inputBindings: [],
    resumeFingerprint: '8'.repeat(64),
    inventoryCount: campaignItems.length,
    summaryByStage: { 'needs-processing': campaignItems.length },
    technicalAdmission: {
      required: true,
      status: 'complete',
      path: 'C:/evidence/admission.json',
      fileSha256: '7'.repeat(64),
      admissionSha256: 'd'.repeat(64),
      admissionStatus: 'passed',
      currentSourceBytesVerified: true,
      technicallyPassedSources: campaignItems.length,
      technicallyBlockedSources: 0,
      unassignedSources: 0,
      oversizedSources: 0,
      unreadableSources: 0,
    },
    items: campaignItems,
    nextBatch: {
      maximumItems: 2,
      itemIds: campaignItems.slice(0, 2).map((item) => item.itemId),
      remainingActiveItems: campaignItems.length,
    },
    styleReferenceCandidates: [],
    styleBankBindings: [bank.bankSha256],
    downstreamAuthorities: {},
    effectBoundary: {
      sourceMutation: false,
      runtimeMutation: false,
      providerExecution: false,
      repositoryPublication: false,
      sourceDeletion: false,
      humanApprovalClaimed: false,
    },
  };
  const campaign = selfHash(campaignBase, 'campaignSha256');
  const campaignRecord = writeJson(path.join(root, 'campaign.json'), campaign);
  return {
    gameHead,
    entries,
    queue,
    campaign,
    queueRecord,
    campaignRecord,
    bridgeRecord,
    providerMapRecord,
    directionRecord,
    bankRecord,
  };
}

function commonArguments(state) {
  return [
    '--queue',
    state.queueRecord.file,
    '--campaign',
    state.campaignRecord.file,
    '--bridge',
    state.bridgeRecord.file,
    '--provider-map',
    state.providerMapRecord.file,
    '--direction',
    state.directionRecord.file,
    '--style-bank',
    state.bankRecord.file,
  ];
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-raw-art-provider-v2-'));
  try {
    const state = fixture(root);
    const templatePath = path.join(root, 'bindings-template.json');
    run([
      'template',
      ...commonArguments(state),
      '--game-head',
      state.gameHead,
      '--output',
      templatePath,
    ]);
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    if (
      template.schema !== 'evavo.raw-art-provider-artifact-bindings-template.v2' ||
      template.bindings.length !== 2 ||
      template.counts.providerRequiredTotal !== 3 ||
      template.counts.campaignNextBatchEligible !== 2 ||
      template.deferred.total !== 1 ||
      template.deferred.details[0]?.reason !== 'outside-campaign-next-batch' ||
      template.campaignSha256 !== state.campaign.campaignSha256 ||
      template.authority.providerExecution !== false
    ) {
      throw new Error('valid campaign-gated artifact-binding template was not produced');
    }

    for (const [index, reference] of template.styleReferenceArtifacts.entries()) {
      reference.artifactId = artifact(String(index + 4));
    }
    const sailor = template.bindings[0];
    sailor.creativeIntent =
      'Retouch the existing sailor while preserving identity, pose and period clothing; repair only the malformed left hand.';
    sailor.subject = 'The established 1871 sailor identity, full body, standing.';
    sailor.baseImageArtifactId = artifact('1');
    sailor.canonicalIdentityArtifactId = artifact('7');
    template.bindings = [sailor];
    const completedTemplateRecord = writeJson(
      path.join(root, 'completed-template.json'),
      template,
    );

    const bindingsPath = path.join(root, 'bindings.json');
    run([
      'finalize',
      ...commonArguments(state),
      '--completed-template',
      completedTemplateRecord.file,
      '--output',
      bindingsPath,
    ]);
    const bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
    const unhashedBindings = { ...bindings };
    delete unhashedBindings.bindingsSha256;
    delete unhashedBindings.runId;
    if (
      bindings.schema !== 'evavo.raw-art-provider-artifact-bindings.v2' ||
      bindings.status !== 'partially-ready' ||
      bindings.campaignSha256 !== state.campaign.campaignSha256 ||
      bindings.bindingsSha256 !== hashObject(unhashedBindings) ||
      bindings.runId !== bindings.bindingsSha256.slice(0, 20)
    ) {
      throw new Error('finalized artifact bindings lost exact identity or self hash');
    }

    const batchPath = path.join(root, 'provider-batch.json');
    run([
      'compile',
      ...commonArguments(state),
      '--artifact-bindings',
      bindingsPath,
      '--maximum-orders',
      '2',
      '--output',
      batchPath,
    ]);
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const request = batch.requests[0]?.request;
    if (
      batch.schema !== 'evavo.raw-art-provider-request-batch.v2' ||
      batch.status !== 'partially-ready' ||
      batch.counts.providerRequiredTotal !== 3 ||
      batch.counts.campaignNextBatchEligible !== 2 ||
      batch.counts.ready !== 1 ||
      batch.counts.blocked !== 1 ||
      batch.counts.outsideCampaignNextBatch !== 1 ||
      request?.operation !== 'edit' ||
      request?.assetKind !== 'sprite-frame' ||
      request?.continuityPhase !== 'repair' ||
      Object.hasOwn(request ?? {}, 'sourceCanvas') ||
      request?.metadata?.schema !== 'evavo.raw-art-provider-request-metadata.v2' ||
      request?.metadata?.campaignSha256 !== state.campaign.campaignSha256 ||
      request?.metadata?.campaignItemId !== state.campaign.items[0].itemId ||
      request?.metadata?.providerCanvasPolicy !== 'adapter-derived-from-target' ||
      !request?.references.some((entry) => entry.role === 'canonical-identity') ||
      !request?.references.some((entry) => entry.role === 'direction-master') ||
      batch.authority.providerExecution !== false ||
      batch.authority.runtimeSubmission !== false
    ) {
      throw new Error('valid provider request batch did not retain campaign and artifact evidence');
    }
    if (
      !batch.blocked.some(
        (entry) =>
          entry.sourceSha256 === '2'.repeat(64) &&
          entry.reasons.includes('source-artifact-binding-missing'),
      )
    ) {
      throw new Error('missing binding did not remain isolated as a current-batch blocker');
    }
    if (
      !batch.deferred.some(
        (entry) =>
          entry.sourceSha256 === '3'.repeat(64) &&
          entry.reason === 'outside-campaign-next-batch',
      )
    ) {
      throw new Error('provider work outside campaign nextBatch was not deferred');
    }

    const overwrite = run(
      [
        'compile',
        ...commonArguments(state),
        '--artifact-bindings',
        bindingsPath,
        '--maximum-orders',
        '2',
        '--output',
        batchPath,
      ],
      2,
    );
    if (!overwrite.stderr.includes('output already exists')) {
      throw new Error('create-only output was not enforced');
    }

    const excessive = run(
      [
        'compile',
        ...commonArguments(state),
        '--artifact-bindings',
        bindingsPath,
        '--maximum-orders',
        '3',
        '--output',
        path.join(root, 'excessive.json'),
      ],
      2,
    );
    if (!excessive.stderr.includes('exceeds campaign/provider authority 2')) {
      throw new Error('campaign nextBatch maximum did not bound provider compilation');
    }

    const stale = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
    stale.campaignSha256 = 'f'.repeat(64);
    delete stale.bindingsSha256;
    delete stale.runId;
    const staleReady = selfHash(stale, 'bindingsSha256');
    const stalePath = writeJson(path.join(root, 'stale-bindings.json'), staleReady).file;
    const staleResult = run(
      [
        'compile',
        ...commonArguments(state),
        '--artifact-bindings',
        stalePath,
        '--output',
        path.join(root, 'stale-output.json'),
      ],
      2,
    );
    if (!staleResult.stderr.includes('stale RAW_ART provider artifact bindings')) {
      throw new Error('stale campaign binding was not rejected');
    }

    const stageCampaignBase = { ...state.campaign };
    delete stageCampaignBase.campaignSha256;
    delete stageCampaignBase.runId;
    stageCampaignBase.items = stageCampaignBase.items.map((item, index) =>
      index === 0 ? { ...item, stage: 'needs-work-order' } : item,
    );
    const stageCampaign = selfHash(stageCampaignBase, 'campaignSha256');
    const stageCampaignRecord = writeJson(
      path.join(root, 'stage-campaign.json'),
      stageCampaign,
    );
    const stageTemplatePath = path.join(root, 'stage-template.json');
    run([
      'template',
      '--queue',
      state.queueRecord.file,
      '--campaign',
      stageCampaignRecord.file,
      '--bridge',
      state.bridgeRecord.file,
      '--provider-map',
      state.providerMapRecord.file,
      '--direction',
      state.directionRecord.file,
      '--style-bank',
      state.bankRecord.file,
      '--game-head',
      state.gameHead,
      '--output',
      stageTemplatePath,
    ]);
    const stageTemplate = JSON.parse(fs.readFileSync(stageTemplatePath, 'utf8'));
    if (
      stageTemplate.bindings.length !== 1 ||
      !stageTemplate.deferred.details.some((entry) =>
        entry.reason.startsWith('campaign-stage-not-needs-processing:'),
      )
    ) {
      throw new Error('campaign stage mismatch did not remain deferred');
    }

    const blockedCampaignBase = { ...state.campaign };
    delete blockedCampaignBase.campaignSha256;
    delete blockedCampaignBase.runId;
    blockedCampaignBase.items = blockedCampaignBase.items.map((item, index) =>
      index === 0
        ? {
            ...item,
            technicalAdmission: {
              ...item.technicalAdmission,
              status: 'blocked',
              blockerKind: 'technical-report-blocked',
            },
          }
        : item,
    );
    const blockedCampaign = selfHash(blockedCampaignBase, 'campaignSha256');
    const blockedCampaignRecord = writeJson(
      path.join(root, 'blocked-campaign.json'),
      blockedCampaign,
    );
    const blockedTemplatePath = path.join(root, 'blocked-template.json');
    run([
      'template',
      '--queue',
      state.queueRecord.file,
      '--campaign',
      blockedCampaignRecord.file,
      '--bridge',
      state.bridgeRecord.file,
      '--provider-map',
      state.providerMapRecord.file,
      '--direction',
      state.directionRecord.file,
      '--style-bank',
      state.bankRecord.file,
      '--game-head',
      state.gameHead,
      '--output',
      blockedTemplatePath,
    ]);
    const blockedTemplate = JSON.parse(
      fs.readFileSync(blockedTemplatePath, 'utf8'),
    );
    if (
      blockedTemplate.bindings.length !== 1 ||
      !blockedTemplate.blocked.details.some((entry) =>
        entry.reasons.includes('campaign-technical-admission-not-passed'),
      )
    ) {
      throw new Error('technically blocked campaign source entered provider bindings');
    }

    if (fs.existsSync(WORKSHOP_DOC)) {
      const docs = fs.readFileSync(WORKSHOP_DOC, 'utf8');
      for (const forbidden of [
        'manage_art_runtime_worker',
        'prepare_candidate_evidence_bundle',
      ]) {
        if (docs.includes(forbidden)) {
          throw new Error(`RAW_ART workshop documents nonexistent tool ${forbidden}`);
        }
      }
    }

    process.stdout.write('EVAVO RAW_ART provider request bridge v2\n');
    process.stdout.write('- campaign v3 nextBatch and technical admission gating passed\n');
    process.stdout.write('- create-only template, finalize and request compilation passed\n');
    process.stdout.write('- adapter-derived provider canvas prevents small source canvases from blocking execution\n');
    process.stdout.write('- immutable candidates and provider evidence remain unapproved and unpublished\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
