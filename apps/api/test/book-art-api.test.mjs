import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { createArtStudioApiServer } from "../dist/index.js";

const token = "book-art-api-control-token-abcdefghijklmnopqrstuvwxyz";
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

async function requestBody() {
  const compiled = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  return {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-api-shadow-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: compiled.workOrder,
  };
}

async function withServer(options, run) {
  const server = createArtStudioApiServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function policy() {
  return {
    allowedAdapterIds: ["fixture-image"],
    preferredAdapterId: "fixture-image",
    preferredModel: "fixture-transparent-v1",
  };
}

function authorizedHeaders() {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-evavo-actor": "book-art-api-test",
  };
}

test("Book Art REST protocol reports the non-authoritative shadow boundary", async () => {
  await withServer({ bookArtProviderAdapterPolicy: policy() }, async (base) => {
    const response = await fetch(`${base}/v1/book-art/provider-runtime`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.contract, "evavo_book_art_provider_shadow_runtime_v1");
    assert.equal(body.shadowOnly, true);
    assert.equal(body.providerPolicyConfigured, true);
    assert.equal(body.oneCandidate, true);
    assert.equal(body.maximumRuntimeAttempts, 1);
    assert.equal(body.providerFallbackAllowed, false);
    assert.equal(body.candidateApprovalState, "unapproved");
    assert.equal(body.selectionPerformed, false);
    assert.equal(body.promotionPerformed, false);
    assert.equal(body.runtimeCutoverApproved, false);
    assert.equal(body.publicationPerformed, false);
  });
});

test("Book Art REST compilation injects host policy and performs no runtime write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-api-compile-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    await withServer(
      { runtime, bookArtProviderAdapterPolicy: policy() },
      async (base) => {
        const response = await fetch(`${base}/v1/book-art/provider-jobs/compile`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(await requestBody()),
        });
        const text = await response.text();
        assert.equal(response.status, 200, text);
        const body = JSON.parse(text);
        assert.equal(body.status, "ready", body.blockers.join("\n"));
        assert.equal(body.plan.runtimeSubmission.maximumAttempts, 1);
        assert.equal(
          body.plan.normalizedProviderRequest.selection.allowFallback,
          false,
        );
        assert.deepEqual(
          body.plan.normalizedProviderRequest.selection.allowedAdapterIds,
          ["fixture-image"],
        );
        assert.equal(body.providerCallPerformed, false);
        assert.equal(body.candidateArtifactsWritten, false);
        assert.equal((await runtime.list()).length, 0);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Book Art REST rejects caller-owned adapter policy and missing host policy", async () => {
  const input = await requestBody();
  await withServer({}, async (base) => {
    const missing = await fetch(`${base}/v1/book-art/provider-jobs/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(missing.status, 503);
    assert.equal(
      (await missing.json()).error.code,
      "BOOK_ART_PROVIDER_POLICY_NOT_CONFIGURED",
    );
  });

  await withServer({ bookArtProviderAdapterPolicy: policy() }, async (base) => {
    const response = await fetch(`${base}/v1/book-art/provider-jobs/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, adapterPolicy: policy() }),
    });
    assert.equal(response.status, 422);
    assert.equal(
      (await response.json()).error.code,
      "BOOK_ART_PROVIDER_REQUEST_INVALID",
    );
  });
});

test("Book Art REST submission is authenticated and duplicate-safe without provider execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-api-submit-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    const input = await requestBody();
    await withServer(
      {
        runtime,
        allowWrites: true,
        writeToken: token,
        bookArtProviderAdapterPolicy: policy(),
      },
      async (base) => {
        const denied = await fetch(`${base}/v1/book-art/provider-jobs/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        assert.equal(denied.status, 401);
        assert.equal(
          (await denied.json()).error.code,
          "BOOK_ART_RUNTIME_UNAUTHORIZED",
        );

        const first = await fetch(`${base}/v1/book-art/provider-jobs/submit`, {
          method: "POST",
          headers: authorizedHeaders(),
          body: JSON.stringify(input),
        });
        const firstText = await first.text();
        assert.equal(first.status, 201, firstText);
        const firstBody = JSON.parse(firstText);
        assert.equal(firstBody.status, "submitted");
        assert.equal(firstBody.providerCallPerformed, false);
        assert.equal(firstBody.candidateArtifactsWritten, false);

        const duplicate = await fetch(
          `${base}/v1/book-art/provider-jobs/submit`,
          {
            method: "POST",
            headers: authorizedHeaders(),
            body: JSON.stringify(input),
          },
        );
        const duplicateText = await duplicate.text();
        assert.equal(duplicate.status, 201, duplicateText);
        const duplicateBody = JSON.parse(duplicateText);
        assert.equal(duplicateBody.job.id, firstBody.job.id);
        assert.equal(duplicateBody.job.specHash, firstBody.job.specHash);
        assert.equal((await runtime.list()).length, 1);
        assert.equal(
          (await runtime.events()).filter(
            (entry) => entry.type === "job.submitted",
          ).length,
          1,
        );
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function legacyPlan() {
  return {
    outputKind: "book_cover_artwork_generation_plan",
    version: "book_cover_artwork_generation_plan_v1",
    status: "ready_to_generate",
    projectId: "project-1",
    runId: "legacy-run-1",
    requestedAt: "2026-08-02T00:00:00.000Z",
    profile: "production",
    sceneDigestSha256: sha("1"),
    artDirectionDigestSha256: sha("d"),
    publicationTextDigestSha256: sha("2"),
    directionStatus: "ready_for_composition",
    providerProfile: {},
    maximumRefinementRounds: 3,
    genreProfiles: [],
    conceptTerritories: [],
    tasks: [{
      candidateId: "candidate-1",
      order: 1,
      territoryId: "manuscript-first",
      territoryLabel: "Manuscript first",
      territoryArchetype: "symbolic_monument",
      variationId: "editorial_restraint",
      prompt: "Create one manuscript-grounded text-free image with protected negative space and no publication lettering.",
      promptDigestSha256: sha("3"),
      expectedWidthPx: 2160,
      expectedHeightPx: 3456,
      flattenBackgroundHex: "#000000",
      idempotencyKey: sha("4"),
      state: "ready",
      stopConditions: [],
    }],
    nextCandidateId: "candidate-1",
    completedCandidateIds: [],
    hardErrors: [],
    warnings: [],
    executionRules: [],
    blockedClaims: [],
    inputSnapshot: {},
    inputDigestSha256: sha("5"),
    planDigestSha256: sha("6"),
  };
}

async function legacyTranslationBody() {
  return {
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: await brief(),
    legacyPlan: legacyPlan(),
    candidateId: "candidate-1",
  };
}

test("Book Art REST exposes authenticated read-only legacy plan translation without provider policy", async () => {
  await withServer(
    { allowWrites: true, writeToken: token },
    async (base) => {
      const protocol = await fetch(`${base}/v1/book-art/legacy-plan-runtime`);
      assert.equal(protocol.status, 200);
      const protocolBody = await protocol.json();
      assert.equal(protocolBody.contract, "evavo_book_art_profile_v1");
      assert.equal(protocolBody.requiresCanonicalBookArtBrief, true);
      assert.equal(protocolBody.rawLegacyPromptTrustedAsAuthority, false);
      assert.equal(protocolBody.translationReadOnly, true);
      assert.equal(protocolBody.providerCallPerformed, false);
      assert.equal(protocolBody.runtimeJobSubmitted, false);

      const denied = await fetch(`${base}/v1/book-art/legacy-plans/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(await legacyTranslationBody()),
      });
      assert.equal(denied.status, 401);

      const translated = await fetch(`${base}/v1/book-art/legacy-plans/translate`, {
        method: "POST",
        headers: authorizedHeaders(),
        body: JSON.stringify(await legacyTranslationBody()),
      });
      const text = await translated.text();
      assert.equal(translated.status, 200, text);
      const body = JSON.parse(text);
      assert.equal(body.status, "ready_for_shadow_comparison", body.blockers.join("\n"));
      assert.equal(body.shadowOnly, true);
      assert.equal(body.rawLegacyPromptTrustedAsAuthority, false);
      assert.equal(body.workOrder.outputKind, "evavo_book_art_production_work_order");
      assert.equal(body.workOrder.providerCandidateMayBeFinal, false);
      assert.equal(body.runtimeCutoverApproved, false);
      assert.equal(body.publicationPerformed, false);
    },
  );
});

test("Book Art REST blocks stale or duplicate legacy candidate evidence", async () => {
  const input = await legacyTranslationBody();
  input.legacyPlan.artDirectionDigestSha256 = sha("9");
  input.legacyPlan.tasks.push({ ...input.legacyPlan.tasks[0] });
  await withServer(
    { allowWrites: true, writeToken: token },
    async (base) => {
      const response = await fetch(`${base}/v1/book-art/legacy-plans/translate`, {
        method: "POST",
        headers: authorizedHeaders(),
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 422);
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.ok(body.blockers.some((item) => item.includes("stale or different art direction")));
      assert.ok(body.blockers.some((item) => item.includes("exactly once")));
      assert.equal(body.workOrder, undefined);
    },
  );
});
