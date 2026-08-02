import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
} from "@evavo/art-contracts";
import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
} from "@evavo/art-providers";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
} from "../dist/index.js";
import {
  createProviderHandlers,
  providerWorkerCapabilities,
} from "../dist/provider-handlers.js";

const sha = (character) => character.repeat(64);

function brief(purpose = "front_cover_art") {
  return {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: "request-1",
    },
    purpose,
    manuscript: {
      manuscriptRevisionId: "manuscript-4",
      manuscriptSha256: sha("a"),
      extractedTextSha256: sha("b"),
      visualCanonSha256: sha("c"),
      artDirectionSha256: sha("d"),
      approvedEvidenceIds: ["evidence-1"],
    },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis:
      "A restrained image built around one manuscript-specific object and a protected editable title field.",
    primarySubject: "The weathered object identified by approved visual canon",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering", "Unapproved characters"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved object and period state."],
    historicalAndMaterialRequirements: [
      "Use period-correct material construction.",
    ],
    negativeSpaceRequirements: [
      "Keep 30 percent quiet space for editable type.",
    ],
    output: {
      widthPx: 3000,
      heightPx: 4800,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "rgb",
      alpha: purpose === "ornament" ? "required" : "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-02T00:00:00.000Z",
    briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
}

async function workOrder(purpose = "front_cover_art") {
  const compiled = await compileBookArtProductionWorkOrder(brief(purpose));
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  return compiled.workOrder;
}

function shadowInput(order, adapterPolicy = undefined) {
  return {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "shadow-execution-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: order,
    adapterPolicy: adapterPolicy ?? {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  };
}

class CountingFixtureImageProviderAdapter extends FixtureImageProviderAdapter {
  calls = 0;

  async execute(resolved, context) {
    this.calls += 1;
    return super.execute(resolved, context);
  }
}

test("compiles one deterministic no-fallback Book Art provider job without side effects", async () => {
  const order = await workOrder();
  const input = shadowInput(order, {
    allowedAdapterIds: ["secondary-image", "fixture-image"],
    preferredAdapterId: "fixture-image",
    preferredModel: "fixture-transparent-v1",
  });

  const first = await compileBookArtProviderShadowJob(input);
  const second = await compileBookArtProviderShadowJob(structuredClone(input));

  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.ok(first.plan);
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.plan.contract, BOOK_ART_PROVIDER_RUNTIME_CONTRACT);
  assert.equal(first.plan.normalizedProviderRequest.operation, "generate");
  assert.equal(first.plan.normalizedProviderRequest.continuityPhase, "independent");
  assert.equal(first.plan.normalizedProviderRequest.candidateCount, 1);
  assert.deepEqual(first.plan.normalizedProviderRequest.references, []);
  assert.deepEqual(first.plan.normalizedProviderRequest.selection.allowedAdapterIds, [
    "fixture-image",
    "secondary-image",
  ]);
  assert.equal(first.plan.normalizedProviderRequest.selection.allowFallback, false);
  assert.equal(first.plan.runtimeSubmission.queue, "provider");
  assert.equal(first.plan.runtimeSubmission.kind, "art.candidate.generate");
  assert.equal(first.plan.runtimeSubmission.maximumAttempts, 1);
  assert.deepEqual(first.plan.runtimeSubmission.requiredCapabilities, [
    "evidence.bundle",
    "provider.candidate-store",
    "provider.generate",
  ]);
  assert.match(first.plan.runtimeSubmission.idempotencyKey, /^book-art:[a-f0-9]{64}$/);
  assert.equal(first.providerCallPerformed, false);
  assert.equal(first.candidateArtifactsWritten, false);
  assert.equal(first.authoritativeBookWritesPerformed, false);
  assert.equal(first.selectionPerformed, false);
  assert.equal(first.promotionPerformed, false);
  assert.equal(first.bookUseBindingCreated, false);
  assert.equal(first.runtimeCutoverApproved, false);
  assert.equal(first.publicationPerformed, false);
});

test("blocks malformed policies, invalid timestamps and tampered work orders fail closed", async () => {
  const order = await workOrder();

  const malformedPolicy = shadowInput(order);
  malformedPolicy.adapterPolicy.allowedAdapterIds = ["fixture-image", 7];
  const malformedPolicyResult = await compileBookArtProviderShadowJob(
    malformedPolicy,
  );
  assert.equal(malformedPolicyResult.status, "blocked");
  assert.ok(
    malformedPolicyResult.blockers.some((entry) =>
      entry.includes("already-trimmed strings"),
    ),
  );

  const invalidTime = shadowInput(order);
  invalidTime.requestedAt = "2026-02-31T00:00:00.000Z";
  const invalidTimeResult = await compileBookArtProviderShadowJob(invalidTime);
  assert.equal(invalidTimeResult.status, "blocked");
  assert.ok(
    invalidTimeResult.blockers.some((entry) => entry.includes("canonical UTC")),
  );

  const tampered = structuredClone(order);
  tampered.providerRequest.candidateCount = 2;
  const tamperedResult = await compileBookArtProviderShadowJob(shadowInput(tampered));
  assert.equal(tamperedResult.status, "blocked");
  assert.equal(tamperedResult.plan, undefined);
  assert.ok(
    tamperedResult.blockers.some((entry) => entry.includes("fingerprint does not match")),
  );

  const malformedWorkOrderResult = await compileBookArtProviderShadowJob(
    shadowInput({ identity: null, workOrderFingerprintSha256: sha("f") }),
  );
  assert.equal(malformedWorkOrderResult.status, "blocked");
  assert.equal(malformedWorkOrderResult.plan, undefined);
});

test("reuses one durable job for duplicate Book Art submissions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-submit-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const input = shadowInput(await workOrder());

  const first = await submitBookArtProviderShadowJob(input, {
    runtime,
    actor: "book-art-shadow-test:first",
    now: new Date("2026-08-02T06:01:00.000Z"),
  });
  const second = await submitBookArtProviderShadowJob(structuredClone(input), {
    runtime,
    actor: "book-art-shadow-test:duplicate",
    now: new Date("2026-08-02T06:02:00.000Z"),
  });

  assert.equal(first.status, "submitted", first.blockers.join("\n"));
  assert.equal(second.status, "submitted", second.blockers.join("\n"));
  assert.ok(first.job);
  assert.ok(second.job);
  assert.equal(first.job.id, second.job.id);
  assert.equal(first.job.specHash, second.job.specHash);
  assert.equal(first.job.attemptLimit, 1);
  assert.equal((await runtime.list()).length, 1);
  assert.equal(
    (await runtime.events()).filter((event) => event.type === "job.submitted").length,
    1,
  );
  assert.equal(first.providerCallPerformed, false);
  assert.equal(second.providerCallPerformed, false);
  assert.equal(first.candidateArtifactsWritten, false);
  assert.equal(second.candidateArtifactsWritten, false);
});

test("executes one fixture candidate once and leaves it unapproved and intermediate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-worker-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const adapter = new CountingFixtureImageProviderAdapter();
  const registry = new ProviderRegistry([adapter]);
  const input = shadowInput(await workOrder());

  const first = await submitBookArtProviderShadowJob(input, {
    runtime,
    actor: "book-art-shadow-test:first",
  });
  const duplicate = await submitBookArtProviderShadowJob(structuredClone(input), {
    runtime,
    actor: "book-art-shadow-test:duplicate",
  });
  assert.equal(first.status, "submitted", first.blockers.join("\n"));
  assert.equal(duplicate.status, "submitted", duplicate.blockers.join("\n"));
  assert.equal(first.job?.id, duplicate.job?.id);

  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "book-art-provider-fixture-worker",
      capabilities: providerWorkerCapabilities(registry),
      queues: ["provider"],
    },
    handlers: createProviderHandlers(registry),
  });

  const run = await worker.runOnce();
  assert.deepEqual(run, {
    claimed: 1,
    succeeded: 1,
    failed: 0,
    cancelled: 0,
    paused: 0,
  });
  assert.equal(adapter.calls, 1);

  const afterSuccess = await submitBookArtProviderShadowJob(structuredClone(input), {
    runtime,
    actor: "book-art-shadow-test:after-success",
  });
  assert.equal(afterSuccess.status, "submitted");
  assert.equal(afterSuccess.job?.id, first.job?.id);
  assert.equal((await runtime.list()).length, 1);

  const idle = await worker.runOnce();
  assert.equal(idle.claimed, 0);
  assert.equal(adapter.calls, 1, "duplicate submissions must not make another provider request");

  const completed = await runtime.get(first.job.id);
  assert.ok(completed);
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.attemptLimit, 1);
  assert.equal(completed.attempts.length, 1);
  assert.equal(completed.attempts[0].outcome, "succeeded");

  const descriptors = [];
  for (const artifactId of completed.outputArtifacts) {
    const verification = await artifacts.verify(artifactId);
    assert.equal(verification.descriptorValid, true);
    assert.equal(verification.contentValid, true);
    const descriptor = await artifacts.get(artifactId);
    assert.ok(descriptor);
    descriptors.push(descriptor);
  }

  const candidates = descriptors.filter(
    (entry) => entry.labels.artifactRole === "provider-candidate",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].storageClass, "intermediate");
  assert.equal(candidates[0].labels.approvalState, "unapproved");
  assert.equal(candidates[0].metadata.finalDeliverable, false);
  assert.equal(candidates[0].metadata.requiresMastering, true);
  assert.equal(candidates[0].metadata.requiresBlockingQa, true);

  const evidence = descriptors.find(
    (entry) => entry.labels.artifactRole === "provider-candidate-evidence",
  );
  assert.ok(evidence);
  assert.equal(evidence.storageClass, "evidence");
  const evidenceBody = JSON.parse(
    (await artifacts.read(evidence.artifactId)).toString("utf8"),
  );
  assert.equal(evidenceBody.outcome, "candidate-produced");
  assert.equal(evidenceBody.selection.adapter.id, "fixture-image");
  assert.equal(evidenceBody.candidateArtifacts.length, 1);
  assert.equal(evidenceBody.request.candidateCount, 1);
  assert.equal(evidenceBody.request.selection.allowFallback, false);
  assert.equal(evidenceBody.request.metadata.bookId, "book-1");
  assert.equal(evidenceBody.request.metadata.providerCandidateMayBeFinal, false);
  assert.equal(evidenceBody.request.metadata.publicationPerformed, false);

  const forbiddenRoles = new Set([
    "selected-art-master",
    "candidate-promotion-authorization",
    "book-art-use-binding",
    "publication-package",
  ]);
  assert.equal(
    descriptors.some((entry) => forbiddenRoles.has(entry.labels.artifactRole)),
    false,
  );
});
