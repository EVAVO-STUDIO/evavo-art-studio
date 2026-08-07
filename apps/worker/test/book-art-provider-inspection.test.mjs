import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
} from "@evavo/art-providers";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import {
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
} from "@evavo/art-book-runtime";
import { inspectBookArtProviderShadowJob } from "@evavo/art-book-runtime/inspection";
import {
  createProviderHandlers,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
} from "../dist/provider-handlers.js";

const sha = (character) => character.repeat(64);

async function brief() {
  const value = {
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
    purpose: "front_cover_art",
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
      alpha: "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-02T00:00:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

async function input() {
  const compiled = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  return {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-inspection-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: compiled.workOrder,
    adapterPolicy: {
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

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-inspect-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const request = await input();
  const compilation = await compileBookArtProviderShadowJob(request);
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  return { root, runtime, artifacts, request, compilation };
}

test("Book Art inspection proves absent, queued and successful immutable shadow states", async () => {
  const fx = await fixture();
  try {
    const absent = await inspectBookArtProviderShadowJob(fx.compilation, {
      runtime: fx.runtime,
      artifacts: fx.artifacts,
    });
    assert.equal(absent.status, "not-submitted");
    assert.equal(absent.inspectionReadOnly, true);
    assert.equal(absent.providerCallPerformedByInspection, false);
    assert.equal(absent.candidateArtifactsWrittenByInspection, false);

    const submission = await submitBookArtProviderShadowJob(fx.request, {
      runtime: fx.runtime,
      actor: "book-art-inspection-test",
    });
    assert.equal(submission.status, "submitted", submission.blockers.join("\n"));

    const queued = await inspectBookArtProviderShadowJob(fx.compilation, {
      runtime: fx.runtime,
      artifacts: fx.artifacts,
    });
    assert.equal(queued.status, "pending");
    assert.equal(queued.runtimeJob.state, "queued");
    assert.equal(queued.providerExecutionObserved, false);

    const adapter = new CountingFixtureImageProviderAdapter();
    const registry = new ProviderRegistry([adapter]);
    const worker = new RuntimeWorker({
      runtime: fx.runtime,
      artifacts: fx.artifacts,
      worker: {
        id: "book-art-inspection-worker",
        capabilities: providerWorkerCapabilities(registry),
        capabilityProfiles: providerWorkerCapabilityProfiles(registry),
        queues: ["provider"],
      },
      handlers: createProviderHandlers(registry),
    });
    const run = await worker.runOnce();
    assert.equal(run.succeeded, 1);
    assert.equal(adapter.calls, 1);

    const succeeded = await inspectBookArtProviderShadowJob(fx.compilation, {
      runtime: fx.runtime,
      artifacts: fx.artifacts,
    });
    assert.equal(succeeded.status, "succeeded", succeeded.blockers.join("\n"));
    assert.deepEqual(succeeded.blockers, []);
    assert.equal(succeeded.runtimeJob.state, "succeeded");
    assert.equal(succeeded.runtimeJob.attemptCount, 1);
    assert.equal(succeeded.providerExecutionObserved, true);
    assert.equal(succeeded.candidateArtifactObserved, true);
    assert.equal(succeeded.providerEvidenceObserved, true);
    assert.equal(succeeded.candidate.artifactRole, "provider-candidate");
    assert.equal(succeeded.candidate.approvalState, "unapproved");
    assert.equal(succeeded.candidate.storageClass, "intermediate");
    assert.equal(
      succeeded.providerEvidence.artifactRole,
      "provider-candidate-evidence",
    );
    assert.equal(succeeded.providerEvidence.storageClass, "evidence");
    assert.match(succeeded.inspectionFingerprintSha256, /^[a-f0-9]{64}$/);
    assert.equal(succeeded.selectionPerformed, false);
    assert.equal(succeeded.promotionPerformed, false);
    assert.equal(succeeded.bookUseBindingCreated, false);
    assert.equal(succeeded.runtimeCutoverApproved, false);
    assert.equal(succeeded.publicationPerformed, false);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("Book Art inspection blocks a descriptor that falsely claims candidate approval", async () => {
  const fx = await fixture();
  try {
    const submission = await submitBookArtProviderShadowJob(fx.request, {
      runtime: fx.runtime,
      actor: "book-art-inspection-tamper-test",
    });
    assert.equal(submission.status, "submitted", submission.blockers.join("\n"));
    const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
    const worker = new RuntimeWorker({
      runtime: fx.runtime,
      artifacts: fx.artifacts,
      worker: {
        id: "book-art-inspection-tamper-worker",
        capabilities: providerWorkerCapabilities(registry),
        capabilityProfiles: providerWorkerCapabilityProfiles(registry),
        queues: ["provider"],
      },
      handlers: createProviderHandlers(registry),
    });
    assert.equal((await worker.runOnce()).succeeded, 1);

    const completed = await fx.runtime.get(submission.job.id);
    const descriptors = await Promise.all(
      completed.outputArtifacts.map((artifactId) => fx.artifacts.get(artifactId)),
    );
    const candidate = descriptors.find(
      (entry) => entry?.labels.artifactRole === "provider-candidate",
    );
    assert.ok(candidate);

    const tamperedArtifacts = {
      get: async (artifactId) => {
        const descriptor = await fx.artifacts.get(artifactId);
        if (!descriptor || artifactId !== candidate.artifactId) return descriptor;
        return {
          ...descriptor,
          labels: { ...descriptor.labels, approvalState: "selected" },
        };
      },
      read: (artifactId) => fx.artifacts.read(artifactId),
      verify: (artifactId) => fx.artifacts.verify(artifactId),
    };
    const blocked = await inspectBookArtProviderShadowJob(fx.compilation, {
      runtime: fx.runtime,
      artifacts: tamperedArtifacts,
    });
    assert.equal(blocked.status, "blocked");
    assert.ok(
      blocked.blockers.some((entry) =>
        entry.includes("not an unapproved intermediate image"),
      ),
    );
    assert.equal(blocked.selectionPerformed, false);
    assert.equal(blocked.promotionPerformed, false);
    assert.equal(blocked.publicationPerformed, false);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
