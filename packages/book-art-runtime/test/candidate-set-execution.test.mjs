import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtCandidateSetWorkOrder,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
  fingerprintBookIllustrationValue,
} from "@evavo/art-contracts";
import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
  executeProviderCandidateRequest,
} from "@evavo/art-providers";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
  compileBookArtCandidateSetProviderRunReceipt,
  evaluateBookArtCandidateSetExecutionConsensus,
  fingerprintBookArtCandidateSetProviderRunReceipt,
  validateBookArtCandidateSetProviderRunReceipt,
} from "../dist/candidate-set-execution.js";
import {
  compileBookArtCandidateSetProviderJob,
  submitBookArtCandidateSetProviderJob,
} from "../dist/candidate-set.js";

class DistinctFixtureImageProviderAdapter extends FixtureImageProviderAdapter {
  async execute(resolved, context) {
    const result = await super.execute(resolved, context);
    return {
      ...result,
      outputs: result.outputs.map((output, index) => ({
        ...output,
        bytes: Buffer.concat([
          Buffer.from(output.bytes),
          Buffer.from([index + 1]),
        ]),
      })),
    };
  }
}

const digest = (character) => `sha256:${character.repeat(64)}`;

async function candidateSetWorkOrder() {
  const brief = {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: {
      workspaceId: "workspace-execution",
      projectId: "project-execution",
      bookId: "book-execution",
      editionId: "paperback-execution",
      requestId: "request-execution",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "manuscript-execution-4",
      manuscriptSha256: digest("a"),
      extractedTextSha256: digest("b"),
      visualCanonSha256: digest("c"),
      artDirectionSha256: digest("d"),
      approvedEvidenceIds: [
        "docs-main-evidence",
        "docs-writing-art-link-evidence",
        "docs-visual-canon-evidence",
      ],
    },
    conceptTerritoryId: "execution-bound-manuscript-first",
    conceptTerritoryLabel: "Execution-bound manuscript first",
    creativeThesis:
      "Use the admitted damaged brass seal and flood-marked ledger cloth as exact narrative evidence, with no generic poster symbolism.",
    primarySubject: "The admitted damaged brass transit seal",
    supportingSubjects: ["Flood-marked ledger cloth"],
    compositionRequirements: [
      "Use an asymmetrical low anchor and protect editable title space.",
    ],
    mustShow: ["The split lower seal tooth"],
    mustNotShow: ["Generated lettering", "Generic fantasy emblems"],
    spoilerRestrictions: ["Do not identify the final owner."],
    continuityRequirements: ["Match the admitted seal damage exactly."],
    historicalAndMaterialRequirements: [
      "Use 1871 brass and iron construction.",
    ],
    negativeSpaceRequirements: ["Protect the upper-right title field."],
    output: {
      widthPx: 3000,
      heightPx: 4800,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "rgb",
      alpha: "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-project-owned-visual-canon"],
    createdAt: "2026-08-06T03:00:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  brief.briefFingerprint = await fingerprintBookArtBrief(brief);
  const base = await compileBookArtProductionWorkOrder(brief);
  assert.equal(base.status, "ready", base.blockers.join("\n"));
  const set = await compileBookArtCandidateSetWorkOrder({
    outputKind: "evavo_book_art_candidate_set_work_order_compile_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    baseWorkOrder: base.workOrder,
    candidateCount: 4,
    requestedAt: "2026-08-06T03:05:00.000Z",
    requestedBy: "book-execution-test",
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  });
  assert.equal(set.status, "ready", set.blockers.join("\n"));
  return set.workOrder;
}

async function executeCandidateSet() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-book-set-execution-"),
  );
  const artifacts = new LocalArtifactStore({
    root: path.join(root, "artifacts"),
  });
  const runtime = new LocalRuntimeRepository({
    root: path.join(root, "runtime"),
  });
  const input = {
    outputKind: "evavo_book_art_candidate_set_provider_job_input",
    schemaVersion: 1,
    executionId: "candidate-set-execution-test-1",
    requestedAt: "2026-08-06T03:10:00.000Z",
    workOrder: await candidateSetWorkOrder(),
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  };
  const compilation = await compileBookArtCandidateSetProviderJob(input);
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.plan);
  const submission = await submitBookArtCandidateSetProviderJob(input, {
    runtime,
    actor: "execution-test:submit",
    now: new Date("2026-08-06T03:11:00.000Z"),
  });
  assert.equal(submission.status, "submitted", submission.blockers.join("\n"));
  const [claimed] = await runtime.claim({
    worker: {
      id: "execution-test-worker",
      capabilities: submission.job.spec.requiredCapabilities,
      queues: ["provider"],
    },
    maximumJobs: 1,
    now: new Date("2026-08-06T03:12:00.000Z"),
  });
  assert.ok(claimed);
  const started = await runtime.start(
    claimed.job.id,
    claimed.lease.token,
    "execution-test-worker",
    new Date("2026-08-06T03:12:01.000Z"),
  );
  let clockIndex = 0;
  const clock = [
    "2026-08-06T03:12:02.000Z",
    "2026-08-06T03:12:03.000Z",
    "2026-08-06T03:12:04.000Z",
  ];
  const run = await executeProviderCandidateRequest(started.spec.payload, {
    registry: new ProviderRegistry([
      new DistinctFixtureImageProviderAdapter(),
    ]),
    artifacts,
    signal: new AbortController().signal,
    now: () =>
      new Date(clock[Math.min(clockIndex++, clock.length - 1)]),
  });
  const completed = await runtime.complete(
    started.id,
    claimed.lease.token,
    [...run.candidateArtifacts, run.evidenceArtifact],
    "execution-test-worker",
    new Date("2026-08-06T03:12:05.000Z"),
  );
  const receiptResult = await compileBookArtCandidateSetProviderRunReceipt(
    {
      outputKind:
        "evavo_book_art_candidate_set_provider_run_receipt_compile_input",
      schemaVersion: 1,
      plan: compilation.plan,
    },
    { runtime, artifacts },
  );
  assert.equal(receiptResult.status, "ready", receiptResult.blockers.join("\n"));
  assert.ok(receiptResult.receipt);
  return {
    root,
    artifacts,
    runtime,
    compilation,
    completed,
    receipt: receiptResult.receipt,
  };
}

function visualConsensus(proof, index) {
  const unsigned = {
    outputKind: "evavo_art_book_visual_consensus_evaluation",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    status: "ready_for_governed_selection",
    candidateId: proof.candidateId,
    candidateContentSha256: proof.contentSha256,
    candidateArtifactFingerprint: proof.descriptorSha256,
    planFingerprint: digest("9"),
    qaResultFingerprint: digest("8"),
    reviewFingerprints: [digest("7"), digest("6")],
    passingReviewerProducerIds: [
      `independent-reviewer-alpha-${index}`,
      `independent-reviewer-beta-${index}`,
    ],
    dissentingReviewerProducerIds: [],
    minorityFindingIds: [],
    consensusBasisPoints: 10_000,
    minimumConsensusBasisPoints: 9_000,
    minimumIndependentReviewers: 2,
    minimumPassingReviewerScore: 80,
    consensusReached: true,
    requiredActions: [],
    providerCallPerformed: false,
    reviewerFallbackAllowed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    evaluationFingerprint: fingerprintBookIllustrationValue(unsigned),
  };
}

function consensusInput(receipt) {
  const candidates = [...receipt.candidates]
    .sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    )
    .map((proof, index) => ({
      candidateId: proof.candidateId,
      candidateProducerId: receipt.providerAttempt.adapterId,
      candidateContentSha256: proof.contentSha256,
      candidateArtifactFingerprint: proof.descriptorSha256,
      planFingerprint: digest("9"),
      conceptFingerprint: digest(String(index + 1)),
      compositionFingerprint: digest(String(index + 2)),
      silhouetteFingerprint: digest(String(index + 3)),
      manuscriptEvidenceIds: [
        `chapter-04-seal-tooth-${index}`,
        `chapter-11-ledger-tide-mark-${index}`,
      ],
      evidenceIds: [proof.candidateId, receipt.providerEvidence.artifactId],
      visualConsensus: visualConsensus(proof, index),
    }));
  const pairwiseComparisons = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      pairwiseComparisons.push({
        leftCandidateId: candidates[left].candidateId,
        rightCandidateId: candidates[right].candidateId,
        overallSimilarityBasisPoints: 2_500 + left + right,
        conceptSimilarityBasisPoints: 2_000 + left + right,
        compositionSimilarityBasisPoints: 2_100 + left + right,
        silhouetteSimilarityBasisPoints: 2_200 + left + right,
        evidenceIds: [`execution-pair-${left}-${right}`],
      });
    }
  }
  return {
    outputKind: "evavo_art_book_candidate_set_consensus_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    candidateSetId: receipt.candidateSetId,
    workOrderFingerprintSha256: receipt.workOrderFingerprintSha256,
    expectedCandidateCount: receipt.candidateCount,
    providerRunFingerprint: receipt.receiptFingerprintSha256,
    candidates,
    pairwiseComparisons,
    setReviewerId: "human-execution-art-director",
    setReviewMethod: "human_with_machine_assistance",
    machineOnlyDecision: false,
    requestedAt: "2026-08-06T03:30:00.000Z",
    requestedBy: "book-execution-test",
    providerCallAllowed: false,
    reviewerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

test(
  "rebuilds one immutable receipt from the exact durable provider execution",
  async () => {
    const fixture = await executeCandidateSet();
    try {
      assert.equal(
        fixture.receipt.contract,
        BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
      );
      assert.equal(fixture.receipt.candidateCount, 4);
      assert.equal(fixture.receipt.candidates.length, 4);
      assert.equal(fixture.receipt.providerAttempt.outcome, "succeeded");
      assert.equal(fixture.receipt.oneProviderAttemptForEntireSet, true);
      assert.equal(fixture.receipt.exactOutputSetVerified, true);
      assert.deepEqual(
        validateBookArtCandidateSetProviderRunReceipt(fixture.receipt),
        [],
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test(
  "allows Docs quality review only for the exact provider output set",
  async () => {
    const fixture = await executeCandidateSet();
    try {
      const result = evaluateBookArtCandidateSetExecutionConsensus({
        outputKind:
          "evavo_book_art_candidate_set_execution_consensus_input",
        schemaVersion: 1,
        contract: BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
        providerRunReceipt: fixture.receipt,
        consensusInput: consensusInput(fixture.receipt),
      });
      assert.equal(
        result.status,
        "ready_for_docs_quality_gate",
        JSON.stringify(result),
      );
      assert.equal(result.selectionPerformed, false);
      assert.equal(result.promotionPerformed, false);
      assert.equal(result.publicationPerformed, false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test(
  "blocks omitted or substituted candidates even when visual evidence is re-fingerprinted",
  async () => {
    const fixture = await executeCandidateSet();
    try {
      const input = consensusInput(fixture.receipt);
      const replacementHash = digest("f");
      input.candidates[0].candidateContentSha256 = replacementHash;
      input.candidates[0].visualConsensus.candidateContentSha256 =
        replacementHash;
      const { evaluationFingerprint: _discarded, ...unsigned } =
        input.candidates[0].visualConsensus;
      input.candidates[0].visualConsensus.evaluationFingerprint =
        fingerprintBookIllustrationValue(unsigned);
      const result = evaluateBookArtCandidateSetExecutionConsensus({
        outputKind:
          "evavo_book_art_candidate_set_execution_consensus_input",
        schemaVersion: 1,
        contract: BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
        providerRunReceipt: fixture.receipt,
        consensusInput: input,
      });
      assert.equal(result.status, "blocked");
      assert.match(
        result.blockers.join("\n"),
        /omitted|substituted|provider evidence/i,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test(
  "blocks a forged receipt after candidate or runtime identity tampering",
  async () => {
    const fixture = await executeCandidateSet();
    try {
      const forged = structuredClone(fixture.receipt);
      forged.runtimeJobId = "different-runtime-job";
      assert.match(
        validateBookArtCandidateSetProviderRunReceipt(forged).join("\n"),
        /fingerprint/i,
      );
      forged.receiptFingerprintSha256 =
        fingerprintBookArtCandidateSetProviderRunReceipt(forged);
      const rebound = evaluateBookArtCandidateSetExecutionConsensus({
        outputKind:
          "evavo_book_art_candidate_set_execution_consensus_input",
        schemaVersion: 1,
        contract: BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
        providerRunReceipt: forged,
        consensusInput: consensusInput(fixture.receipt),
      });
      assert.equal(rebound.status, "blocked");
      assert.match(
        rebound.blockers.join("\n"),
        /provider-run fingerprint/i,
      );

      const missingRuntime = {
        get: async () => null,
      };
      const result = await compileBookArtCandidateSetProviderRunReceipt(
        {
          outputKind:
            "evavo_book_art_candidate_set_provider_run_receipt_compile_input",
          schemaVersion: 1,
          plan: fixture.compilation.plan,
        },
        { runtime: missingRuntime, artifacts: fixture.artifacts },
      );
      assert.equal(result.status, "blocked");
      assert.match(result.blockers.join("\n"), /durable runtime job/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);
