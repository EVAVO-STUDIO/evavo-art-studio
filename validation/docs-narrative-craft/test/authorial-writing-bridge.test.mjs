import assert from "node:assert/strict";
import test from "node:test";

import { BOOK_AUTHORING_CONTRACT } from "../src/book-studio-authoring-types.ts";
import { BOOK_AUTHORIAL_SYNTHESIS_CONTRACT } from "../src/book-studio-authorial-synthesis-types.ts";
import { BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT } from "../src/book-studio-authorial-writing-bridge-types.ts";
import { compileBookAuthorialWritingBridge } from "../src/book-studio-authorial-writing-bridge.ts";
import { compileBookWritingCandidateRuntimeRequest } from "../src/book-studio-writing-candidate-contracts.ts";
import {
  canonicalReviewCraftJson,
  sha256ReviewCraftText,
} from "../src/book-studio-review-craft-shared.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const targetText = "Mara placed the damaged key on Orren's ledger and asked for the archive register.";

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
  const contextTextSha256 = await sha256ReviewCraftText(contextText);
  const writingContextBlock = {
    objectId: `authorial-synthesis:${contextTextSha256.slice("sha256:".length, "sha256:".length + 24)}`,
    objectFingerprint: await sha256ReviewCraftText(canonicalReviewCraftJson({
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
    sourceTextSha256: await sha256ReviewCraftText(targetText),
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
  return { ...unsigned, packetFingerprint: await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned)) };
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

async function bridgeInput(overrides = {}) {
  return {
    outputKind: "evavo_docs_book_authorial_writing_bridge_compile_input",
    schemaVersion: 1,
    authoringPacket: authoringPacket(),
    synthesisPacket: await synthesisPacket(),
    baseContextBlocks: baseContexts(),
    handoff: {
      requestId: "writing-request-authorial-bridge-1",
      allowedProviderIds: ["chatgpt"],
      providerPolicyFingerprint: digest("6"),
      voiceProfileId: "voice-alpha",
      voiceProfileFingerprint: digest("1"),
      factSetFingerprint: digest("7"),
      additionalEvidenceIds: ["bridge-evidence-one"],
      outputContractFingerprint: digest("e"),
      requestedAt: "2026-08-04T10:05:00.000Z",
      expiresAt: "2026-08-04T11:00:00.000Z",
    },
    responseInstruction: "Return the strict candidate object and exact evidence identities required by the Book authoring response contract.",
    maximumOutputCharacters: 30_000,
    maximumOutputTokens: 6_000,
    timeoutMilliseconds: 240_000,
    ...overrides,
  };
}

test("bridges exact authorial synthesis into one prevalidated Writing request", async () => {
  const input = await bridgeInput();
  const first = await compileBookAuthorialWritingBridge(input);
  const second = await compileBookAuthorialWritingBridge({
    ...input,
    baseContextBlocks: [...input.baseContextBlocks].reverse(),
  });
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(second.status, "ready", second.blockers.join("\n"));
  assert.equal(first.contract, BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT);
  assert.equal(first.bridgeFingerprint, second.bridgeFingerprint);
  assert.equal(first.runtimeRequestPreview.runtimeRequestFingerprint, second.runtimeRequestPreview.runtimeRequestFingerprint);
  assert.equal(first.providerCallPerformed, false);
  assert.equal(first.runtimeJobSubmitted, false);
  assert.equal(first.runtimeRequestPreview.providerRetryAllowed, false);
  assert.equal(first.runtimeRequestPreview.artStudioCallAllowed, false);
  const roles = new Set(first.runtimeRequestPreview.contextBlocks.map((item) => item.role));
  assert.ok(roles.has("target_manuscript"));
  assert.ok(roles.has("voice"));
  assert.ok(roles.has("constraint"));
  assert.ok(first.runtimeRequestPreview.contextBlocks.some((item) => item.objectId === first.synthesisContextObjectId));
  const independentlyCompiled = await compileBookWritingCandidateRuntimeRequest(first.candidateCompileInput);
  assert.equal(independentlyCompiled.status, "ready", independentlyCompiled.blockers.join("\n"));
  assert.equal(independentlyCompiled.runtimeRequestFingerprint, first.runtimeRequestPreview.runtimeRequestFingerprint);
});

test("blocks source, voice, output-contract and timeout drift before provider execution", async () => {
  const input = await bridgeInput();
  const result = await compileBookAuthorialWritingBridge({
    ...input,
    baseContextBlocks: input.baseContextBlocks.map((item) => item.role === "target_manuscript"
      ? { ...item, text: `${item.text} Altered after synthesis.` }
      : item),
    handoff: {
      ...input.handoff,
      voiceProfileFingerprint: digest("8"),
      outputContractFingerprint: digest("9"),
    },
    timeoutMilliseconds: 280_000,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.providerCallPerformed, false);
  assert.ok(result.blockers.some((item) => /sourceTextSha256/i.test(item)));
  assert.ok(result.blockers.some((item) => /voice profile differs/i.test(item)));
  assert.ok(result.blockers.some((item) => /output contract differs/i.test(item)));
  assert.ok(result.blockers.some((item) => /timeoutMilliseconds/i.test(item)));
});

test("blocks unsupported authoring operations and caller voice injection", async () => {
  const input = await bridgeInput({
    authoringPacket: authoringPacket({ operation: "proofread_candidate" }),
    baseContextBlocks: [
      ...baseContexts(),
      {
        objectId: "caller-voice-context",
        objectFingerprint: digest("a"),
        role: "voice",
        text: "Caller-supplied voice context must not replace synthesis-bound voice evidence.",
      },
    ],
  });
  const result = await compileBookAuthorialWritingBridge(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => /not compatible/i.test(item)));
  assert.ok(result.blockers.some((item) => /cannot supply a voice role/i.test(item)));
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.artStudioCalled, false);
  assert.equal(result.publicationPerformed, false);
});

test("blocks synthesis tampering", async () => {
  const input = await bridgeInput();
  const tampered = structuredClone(input.synthesisPacket);
  tampered.objective = "Silently replace the author's voice.";
  const result = await compileBookAuthorialWritingBridge({ ...input, synthesisPacket: tampered });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => /fingerprint/i.test(item)));
  assert.equal(result.providerCallPerformed, false);
});
