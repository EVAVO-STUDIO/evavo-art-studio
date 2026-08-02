import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import { compileBookArtProviderShadowJob } from "@evavo/art-book-runtime";
import { fingerprintWebsiteBookArtProviderShadowObservation } from "@evavo/art-book-runtime/parity";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

const cwd = new URL("..", import.meta.url);
const sha = (character) => character.repeat(64);

function environment() {
  return {
    ...process.env,
    EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_MODEL: "fixture-transparent-v1",
  };
}

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: environment(),
  });
}

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
    creativeThesis: "A restrained manuscript-specific image with editable type space.",
    primarySubject: "The exact manuscript-specific object",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match approved period state."],
    historicalAndMaterialRequirements: ["Use period-correct construction."],
    negativeSpaceRequirements: ["Keep quiet space for editable type."],
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

async function parityFile(root) {
  const workOrder = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(workOrder.status, "ready", workOrder.blockers.join("\n"));
  assert.ok(workOrder.workOrder);
  const request = {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-cli-parity-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: workOrder.workOrder,
  };
  const compilation = await compileBookArtProviderShadowJob({
    ...request,
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  });
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.plan);
  const unsigned = {
    outputKind: "evavo_website_book_art_provider_shadow_observation",
    schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "d".repeat(40),
    observedAt: "2026-08-02T06:05:00.000Z",
    identity: compilation.plan.identity,
    executionId: compilation.plan.executionId,
    sourceBriefFingerprint: compilation.plan.sourceBriefFingerprint,
    workOrderFingerprintSha256: compilation.plan.workOrderFingerprintSha256,
    normalizedProviderRequestSha256:
      compilation.plan.normalizedProviderRequestSha256,
    outcome: "not-submitted",
    requestedCandidateCount: 1,
    attemptCount: 0,
    providerFallbackUsed: false,
    providerExecutionObserved: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const file = path.join(root, "book-art-parity.json");
  await writeFile(
    file,
    JSON.stringify({
      request,
      websiteObservation: {
        ...unsigned,
        observationFingerprintSha256:
          fingerprintWebsiteBookArtProviderShadowObservation(unsigned),
      },
    }),
  );
  return file;
}

test("CLI parity reports matching incomplete state without submitting or writing artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-parity-"));
  try {
    const input = await parityFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const artifactRoot = path.join(root, "artifacts");
    const result = run([
      "book-art-provider-parity",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
      "--artifact-root",
      artifactRoot,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "incomplete", body.blockers.join("\n"));
    assert.deepEqual(body.blockers, []);
    assert.deepEqual(body.mismatches, []);
    assert.equal(body.parityReadOnly, true);
    assert.equal(body.providerCallPerformedByParity, false);
    assert.equal(body.artifactWritesPerformedByParity, false);
    assert.equal(body.visualSimilarityEvaluated, false);
    assert.equal(body.cutoverEligible, false);
    assert.equal(body.websiteSourceDeletionAllowed, false);
    assert.equal((await new LocalRuntimeRepository({ root: runtimeRoot }).list()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
