import assert from "node:assert/strict";
import test from "node:test";

import { BOOK_AUTHORING_CONTRACT } from "../src/book-studio-authoring-types.ts";
import { BOOK_AUTHORIAL_SYNTHESIS_CONTRACT } from "../src/book-studio-authorial-synthesis-types.ts";
import {
  BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
  compileBookUnattendedAuthorialWritingExecution,
} from "../src/book-studio-unattended-authorial-writing.ts";
import {
  BOOK_UNATTENDED_PRODUCTION_CONTRACT,
  compileBookUnattendedProduction,
} from "../src/book-studio-unattended-production.ts";
import { canonicalBookJson, sha256BookText } from "../src/book-studio-project-contracts.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const targetText = "Mara placed the damaged key on Orren's ledger and asked for the archive register.";
const executionTime = "2026-08-04T10:05:00.000Z";
const dependencyCompletedAt = "2026-08-04T10:04:00.000Z";

function authoringPacket(overrides = {}) {
  return {
    outputKind: "evavo_docs_book_authoring_packet",
    schemaVersion: 1,
    contract: BOOK_AUTHORING_CONTRACT,
    authorityMode: "shadow_migration",
    packetId: "packet-authorial-bridge-1",
    projectId: "project-alpha",
    programmeId: "programme-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    manuscriptSha256: digest("a"),
    projectFingerprint: digest("b"),
    storyStateFingerprint: digest("c"),
    executionTaskId: "task-authorial-bridge-1",
    taskFingerprint: digest("d"),
    provider: "chatgpt",
    modelName: "gpt-reviewed-model",
    operation: "revise_candidate",
    responseMode: "strict_json_schema",
    responseContractFingerprint: digest("e"),
    targetUnitIds: ["scene-council-door"],
    readOnlyUnitIds: ["scene-prior"],
    expectedChangedUnitIds: ["scene-council-door"],
    allowedActionIds: ["revise-target-unit"],
    prohibitedActionIds: ["change-canon-outside-scope", "publish-book", "call-art-studio"],
    requiredOutputStateIds: ["candidate-state", "voice-evidence-state"],
    contextEvidenceIds: ["context-evidence-one"],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    factClaimIds: ["fact-archive-procedure"],
    researchClaimIds: [],
    narrativeConstraintIds: ["constraint-project-world"],
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-generic-metaphor"],
    unresolvedIssueIds: [],
    unresolvedResearchIds: [],
    checkpointId: "checkpoint-authorial-bridge-1",
    checkpointFingerprint: digest("f"),
    idempotencyKey: "authorial-bridge-packet-1",
    maximumOutputCharacters: 40_000,
    createdAt: "2026-08-04T10:00:00.000Z",
    expiresAt: "2026-08-04T12:00:00.000Z",
    remainingUnitIds: [],
    providerMayMutateCanonicalState: false,
    automaticCanonicalAdmissionAllowed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

async function synthesisPacket(overrides = {}) {
  const contextText = "Exact project-owned authorial synthesis constraint for the council-door revision.";
  const contextTextSha256 = await sha256BookText(contextText);
  const writingContextBlock = {
    objectId: `authorial-synthesis:${contextTextSha256.slice("sha256:".length, "sha256:".length + 24)}`,
    objectFingerprint: await sha256BookText(canonicalBookJson({
      contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
      role: "constraint",
      textSha256: contextTextSha256,
    })),
    role: "constraint",
    text: contextText,
    textSha256: contextTextSha256,
  };
  const unsigned = {
    outputKind: "evavo_docs_book_authorial_synthesis_packet",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_SYNTHESIS_CONTRACT,
    status: "ready",
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    synthesisId: "synthesis-council-door",
    synthesisVersion: 1,
    unitKind: "scene",
    operation: "revise",
    targetUnitIds: ["scene-council-door"],
    sourceTextSha256: await sha256BookText(targetText),
    authorialVoiceProfileFingerprint: digest("1"),
    narrativeRegisterProfileFingerprint: digest("2"),
    narrativeCraftPacketFingerprint: digest("3"),
    enhancementBudgets: [],
    flavourPlan: {
      imageSourceDomainIds: ["image-domain-archive"],
      motifIds: ["motif-key"],
      dialogueTextureIds: ["hostile_courteous"],
      proseDeviceBudgets: [],
      prohibitedDeviceIds: ["anaphora"],
      authorialRiskBudget: 0.35,
      maximumNewMotifs: 0,
      maximumFigurativeClustersPerThousandWords: 3,
      evidenceIds: ["flavour-evidence-one"],
    },
    changePolicy: {
      semanticPreservationRequired: true,
      maximumSurfaceChangeRatio: 0.65,
      lockedLayerIds: ["meaning", "canon", "viewpoint"],
      flexibleLayerIds: ["paragraph_structure", "sentence_structure", "diction", "dialogue_surface"],
      requireBeforeAfterEvidence: true,
      requireVoiceComparison: true,
      requireNarrativeCraftEvaluation: true,
      requirePhraseOverlapScan: true,
      requireIndependentReview: true,
    },
    objective: "Improve leverage, emotional aftereffect and exact image coherence without changing canon or project voice.",
    exactMeaningIds: ["meaning-mara-protects-ally"],
    canonEvidenceIds: ["canon-seal-possession"],
    factEvidenceIds: ["fact-archive-procedure"],
    continuityEvidenceIds: ["continuity-orren-favour"],
    evidenceIds: ["synthesis-evidence-one"],
    precedenceRules: ["Canon and project voice outrank every surface preference."],
    operationProtocol: ["Repair structure and motive before sentence-level enhancement."],
    qualityGates: [{
      gateId: "voice-preservation",
      mandatory: true,
      passCondition: "The exact project voice remains inside its evidence-bound tolerance.",
      requiredEvidenceKinds: ["voice-comparison"],
    }],
    providerInstruction: "Preserve exact project voice, canon, causality, viewpoint and rights. Produce one candidate only.",
    writingContextBlock,
    projectVoiceRemainsAuthoritative: true,
    genreRegisterMayReplaceVoice: false,
    ideaMayOverrideCanon: false,
    namedCreatorInstructionPermitted: false,
    rawSourceTextPersisted: false,
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
    ...overrides,
  };
  return { ...unsigned, packetFingerprint: await sha256BookText(canonicalBookJson(unsigned)) };
}

function baseContexts() {
  return [
    {
      objectId: "context-target-council-door",
      objectFingerprint: digest("4"),
      role: "target_manuscript",
      text: targetText,
    },
    {
      objectId: "context-fact-archive-procedure",
      objectFingerprint: digest("5"),
      role: "fact",
      text: "The archive custodian controls access and records every exception in the register.",
    },
  ];
}

async function bridgeInput({ additionalEvidenceIds = [], reverseContexts = false } = {}) {
  const contexts = baseContexts();
  return {
    outputKind: "evavo_docs_book_authorial_writing_bridge_compile_input",
    schemaVersion: 1,
    authoringPacket: authoringPacket(),
    synthesisPacket: await synthesisPacket(),
    baseContextBlocks: reverseContexts ? contexts.reverse() : contexts,
    handoff: {
      requestId: "writing-request-authorial-bridge-1",
      allowedProviderIds: ["chatgpt"],
      providerPolicyFingerprint: digest("6"),
      voiceProfileId: "voice-alpha",
      voiceProfileFingerprint: digest("1"),
      factSetFingerprint: digest("7"),
      additionalEvidenceIds: ["bridge-evidence-one", ...additionalEvidenceIds],
      outputContractFingerprint: digest("e"),
      requestedAt: executionTime,
      expiresAt: "2026-08-04T11:00:00.000Z",
    },
    responseInstruction: "Return the strict candidate object and exact evidence identities required by the Book authoring response contract.",
    maximumOutputCharacters: 30_000,
    maximumOutputTokens: 6_000,
    timeoutMilliseconds: 240_000,
  };
}

function edition(editionId, format) {
  const print = format === "paperback";
  return {
    editionId,
    format,
    enabled: true,
    colourMode: print ? "black_and_white" : "digital_rgb",
    ...(print ? { trimWidthInches: 6, trimHeightInches: 9 } : {}),
    requiresExternalTemplate: print,
    requiresPreviewerEvidence: true,
    requiresPhysicalProof: print,
    outputFileRoleIds: [`${editionId}-interior`, `${editionId}-cover`],
  };
}

function project() {
  return {
    projectId: "project-alpha",
    programmeId: "programme-alpha",
    projectTitle: "Authorial Unattended Integration Fixture",
    projectKind: "standalone",
    contributorDisplayNames: ["Named author"],
    defaultLanguage: "en-AU",
    sourceAuthorityIds: ["source-authority-one"],
    evidenceIds: ["rights-evidence-one"],
    globalConstraintIds: ["source-grounded", "no-filler"],
    providerPolicy: {
      providers: ["chatgpt", "claude", "other_compatible_model"],
      chatgptStrictJsonSchemaRequired: true,
      claudeForcedToolRequired: true,
      compatibleAdapterSchemaRequired: true,
      providerSubstitutionAllowed: false,
      exactProfileFingerprintRequired: true,
      exactPacketFingerprintRequired: true,
      strictResponseIdentityRequired: true,
      phraseOverlapBeforeCanonicalAdmission: true,
    },
    qualityPolicy: {
      exactSourceCoverageRequired: true,
      currentVersionFullReadRequired: true,
      minimumMaterialAlternatives: 3,
      independentReviewRequired: true,
      compareAndSwapCanonicalMutationRequired: true,
      automaticCanonicalAdmissionAllowed: false,
      antiGenericityReviewRequired: true,
      projectOwnedVoiceEvidenceRequired: true,
      defaultReviewProfileIds: ["source-coverage", "independent-review"],
    },
    publicationPolicy: {
      targetPlatformIds: ["amazon-kdp"],
      manualSubmissionOnly: true,
      metadataVerificationRequired: true,
      rightsVerificationRequired: true,
      aiDisclosureDecisionRequired: true,
      isbnEvidenceRequired: true,
      barcodeEvidenceRequired: true,
      previewerEvidenceRequired: true,
      physicalProofEvidenceRequired: true,
      namedReleaseApprovalRequired: true,
    },
    artPolicy: {
      artStudioEnabled: true,
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      credentialsServerSideOnly: true,
      remoteWritesDisabledByDefault: true,
      sourceAndModelProvenanceRequired: true,
    },
    volumes: [{
      volumeId: "volume-one",
      title: "Book One",
      sequence: 1,
      contentClass: "fiction",
      role: "primary",
      status: "source_only",
      language: "en-AU",
      targetWords: 80_000,
      minimumWords: 60_000,
      maximumWords: 100_000,
      sourceAuthorityIds: ["source-authority-one"],
      dependsOnVolumeIds: [],
      reviewProfileIds: [],
      editionPlans: [edition("kindle-one", "kindle_reflowable"), edition("paperback-one", "paperback")],
      illustrationPlan: {
        mode: "mixed",
        minimumCount: 1,
        targetCount: 2,
        maximumCount: 3,
        fullPageTarget: 1,
        smallOrInlineTarget: 1,
        textWrapRequired: false,
        reflowFallback: "separate_accessible_figure",
        textFreeGeneratedArtworkRequired: true,
        editableLabelsRequired: true,
        sourceEvidenceRequired: true,
      },
      coverPlan: {
        routeCount: 3,
        candidatesPerRoute: 2,
        textFreeGeneratedArtworkRequired: true,
        editableTypographyRequired: true,
        seriesIdentityRequired: false,
        manuscriptEvidenceRequired: true,
      },
      constraintIds: [],
      namedApprovalRequired: true,
    }],
  };
}

function policy() {
  return {
    policyId: "unattended-policy-one",
    maximumRevisionCycles: 8,
    minimumIndependentTextReviewers: 3,
    minimumTextConsensusBasisPoints: 9000,
    visualSelectionMode: "independent_model_consensus",
    minimumIndependentVisualReviewers: 3,
    minimumVisualConsensusBasisPoints: 9000,
    allowReceiptDrivenArtPromotion: true,
    allowReceiptDrivenBookUseBinding: true,
    stopOnReadinessWarning: true,
    stopAtExternalEvidence: true,
    automaticCanonicalAdmissionAllowed: false,
    automaticAmazonSubmissionAllowed: false,
  };
}

function unattendedInput() {
  return {
    outputKind: "evavo_docs_book_unattended_production_input",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_PRODUCTION_CONTRACT,
    project: project(),
    policy: policy(),
    requestedAt: "2026-08-04T10:00:00.000Z",
    requestedBy: "book-production-supervisor",
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

async function exactDependencyReceipts(plan, stageId) {
  const stage = plan.volumes
    .flatMap((volume) => volume.stagePlans)
    .find((item) => item.stageId === stageId);
  return Promise.all((stage?.dependencyStageIds ?? []).map(async (dependencyStageId) => ({
    stageId: dependencyStageId,
    receiptFingerprint: await sha256BookText(canonicalBookJson({
      outputKind: "evavo_docs_book_unattended_authorial_dependency_receipt_identity",
      schemaVersion: 1,
      unattendedResultFingerprint: plan.resultFingerprint,
      stageId: dependencyStageId,
      completedAt: dependencyCompletedAt,
    })),
    completedAt: dependencyCompletedAt,
  })));
}

async function executionInput({
  expectedFingerprint,
  stageId = "volume-one:writing_candidate",
  revisionCycle = 1,
  priorRevisionReceiptFingerprint,
  dependencyReceipts,
  additionalEvidenceIds = [],
  reverseContexts = false,
  overrides = {},
} = {}) {
  const unattendedProductionInput = unattendedInput();
  const plan = await compileBookUnattendedProduction(unattendedProductionInput);
  const resolvedDependencyReceipts = dependencyReceipts
    ?? await exactDependencyReceipts(plan, stageId);
  return {
    outputKind: "evavo_docs_book_unattended_authorial_writing_compile_input",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_AUTHORIAL_WRITING_CONTRACT,
    unattendedProductionInput,
    expectedUnattendedResultFingerprint: expectedFingerprint ?? plan.resultFingerprint,
    volumeId: "volume-one",
    stageId,
    revisionCycle,
    ...(priorRevisionReceiptFingerprint === undefined ? {} : { priorRevisionReceiptFingerprint }),
    dependencyReceipts: resolvedDependencyReceipts,
    authorialWritingBridgeInput: await bridgeInput({ additionalEvidenceIds, reverseContexts }),
    executionRequestedAt: executionTime,
    executionRequestedBy: "book-production-supervisor",
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    providerFallbackAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

test("binds one exact unattended writing stage to the authorial runtime without executing a provider", async () => {
  const first = await compileBookUnattendedAuthorialWritingExecution(await executionInput());
  const second = await compileBookUnattendedAuthorialWritingExecution(await executionInput({ reverseContexts: true }));
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(second.status, "ready", second.blockers.join("\n"));
  assert.equal(first.executionFingerprint, second.executionFingerprint);
  assert.equal(first.selectedStage.kind, "writing_candidate");
  assert.equal(first.sourceDispatchOperation, "/api/v1/book-studio/writing-candidate");
  assert.equal(first.effectiveDispatchOperation, "/api/v1/book-studio/writing-candidate/authorial");
  assert.deepEqual(
    first.dependencyReceipts.map((item) => item.stageId),
    first.selectedStage.dependencyStageIds,
  );
  assert.ok(first.dependencyReceipts.length > 0);
  for (const receipt of first.dependencyReceipts) {
    assert.ok(first.requiredWritingHandoffEvidenceIds.includes(receipt.receiptFingerprint));
    assert.ok(first.authorialBridge.handoffRequest.requiredEvidenceIds.includes(receipt.receiptFingerprint));
  }
  assert.equal(first.authorialBridge.status, "ready");
  assert.equal(first.providerCallAllowed, true);
  assert.equal(first.providerCallPerformed, false);
  assert.equal(first.oneBoundedStagePerAutomationCallRequired, true);
  assert.equal(first.oneProviderAttemptPerRevisionCycleRequired, true);
  assert.equal(first.providerFallbackAllowed, false);
  assert.equal(first.canonicalManuscriptMutationPerformed, false);
  assert.equal(first.artStudioCalled, false);
  assert.equal(first.automaticCanonicalAdmissionAllowed, false);
  assert.equal(first.publicationPerformed, false);
});

test("blocks plan drift and a non-writing stage before provider execution", async () => {
  const drifted = await compileBookUnattendedAuthorialWritingExecution(await executionInput({ expectedFingerprint: digest("9") }));
  assert.equal(drifted.status, "blocked");
  assert.ok(drifted.blockers.some((item) => /expected plan/i.test(item)));
  assert.equal(drifted.providerCallAllowed, false);

  const editorial = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    stageId: "volume-one:editorial_review",
  }));
  assert.equal(editorial.status, "blocked");
  assert.ok(editorial.blockers.some((item) => /writing_candidate/i.test(item)));
  assert.ok(editorial.blockers.some((item) => /automatic/i.test(item)));
  assert.equal(editorial.providerCallPerformed, false);
});

test("requires exact revision receipts after the first bounded cycle", async () => {
  const priorReceipt = digest("8");
  const missing = await compileBookUnattendedAuthorialWritingExecution(await executionInput({ revisionCycle: 2 }));
  assert.equal(missing.status, "blocked");
  assert.ok(missing.blockers.some((item) => /priorRevisionReceiptFingerprint is required/i.test(item)));

  const unbound = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    revisionCycle: 2,
    priorRevisionReceiptFingerprint: priorReceipt,
  }));
  assert.equal(unbound.status, "blocked");
  assert.ok(unbound.blockers.some((item) => /prior revision receipt is not bound/i.test(item)));

  const ready = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    revisionCycle: 2,
    priorRevisionReceiptFingerprint: priorReceipt,
    additionalEvidenceIds: [priorReceipt],
  }));
  assert.equal(ready.status, "ready", ready.blockers.join("\n"));
  assert.equal(ready.revisionCycle, 2);
  assert.equal(ready.priorRevisionReceiptFingerprint, priorReceipt);
});

test("rejects dependency, revision-limit and authority escalation attacks", async () => {
  const missingDependency = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    dependencyReceipts: [],
  }));
  assert.equal(missingDependency.status, "blocked");
  assert.ok(missingDependency.blockers.some((item) => /exact selected-stage dependency set/i.test(item)));

  const extraDependency = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    dependencyReceipts: [{
      stageId: "volume-one:invented_dependency",
      receiptFingerprint: digest("7"),
      completedAt: dependencyCompletedAt,
    }],
  }));
  assert.equal(extraDependency.status, "blocked");
  assert.ok(extraDependency.blockers.some((item) => /exact selected-stage dependency set/i.test(item)));

  const overLimit = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    revisionCycle: 9,
    priorRevisionReceiptFingerprint: digest("6"),
    additionalEvidenceIds: [digest("6")],
  }));
  assert.equal(overLimit.status, "blocked");
  assert.ok(overLimit.blockers.some((item) => /exceeds the stage limit/i.test(item)));

  const escalated = await compileBookUnattendedAuthorialWritingExecution(await executionInput({
    overrides: { providerFallbackAllowed: true, inventedAuthority: true },
  }));
  assert.equal(escalated.status, "blocked");
  assert.ok(escalated.blockers.some((item) => /providerFallbackAllowed must remain false/i.test(item)));
  assert.ok(escalated.blockers.some((item) => /unsupported field inventedAuthority/i.test(item)));
  assert.equal(escalated.providerCallPerformed, false);
  assert.equal(escalated.canonicalManuscriptMutationPerformed, false);
  assert.equal(escalated.publicationPerformed, false);
});
