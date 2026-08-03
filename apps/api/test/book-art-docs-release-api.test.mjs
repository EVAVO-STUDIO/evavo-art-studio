import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
  DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
  DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
  fingerprintBookArtBrief,
  fingerprintDocsBookWritingArtReleaseReceipt,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { createArtStudioApiServer } from "../dist/index.js";

const token = "book-art-docs-release-api-token-abcdefghijklmnopqrstuvwxyz";
const sha = (character) => `sha256:${character.repeat(64)}`;

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
    "x-evavo-actor": "book-art-docs-release-api-test",
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

async function requestBody() {
  const evidence = [
    "evidence:authoring:1",
    sha("1"),
    sha("2"),
    sha("3"),
    sha("4"),
    sha("5"),
  ].sort();
  const finalArtBrief = {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: {
      workspaceId: "workspace:wren",
      projectId: "project:wren",
      bookId: "volume:wren:1",
      editionId: "edition:wren:paperback",
      requestId: "art-request:wren:cover:api-release:1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "revision:wren:8",
      manuscriptSha256: sha("a"),
      extractedTextSha256: sha("b"),
      visualCanonSha256: sha("c"),
      artDirectionSha256: sha("d"),
      approvedEvidenceIds: evidence,
    },
    conceptTerritoryId: "territory:wren:cover:1",
    conceptTerritoryLabel: "Weathered coastal memory",
    creativeThesis:
      "A restrained maritime image binds the revised manuscript to a durable text-free cover field.",
    primarySubject: "A weathered coastal signal tower",
    supportingSubjects: ["low winter sea", "distant working vessel"],
    compositionRequirements: [
      "Keep the principal silhouette in the lower-left third.",
      "Reserve calm negative space for editable title typography.",
    ],
    mustShow: ["historically credible maritime materials"],
    mustNotShow: ["generated title text", "modern navigation equipment"],
    spoilerRestrictions: ["Do not reveal the final harbour confrontation."],
    continuityRequirements: [
      "Match the approved tower and vessel descriptions in the visual canon.",
    ],
    historicalAndMaterialRequirements: [
      "Use period-correct timber, iron and masonry construction.",
    ],
    negativeSpaceRequirements: ["Keep the upper third visually quiet."],
    output: {
      widthPx: 1800,
      heightPx: 2700,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "cmyk_conversion_required",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights:wren:commercial:1"],
    createdAt: "2026-08-03T00:55:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  finalArtBrief.briefFingerprint = await fingerprintBookArtBrief(finalArtBrief);
  const unsignedReceipt = {
    outputKind: "evavo_docs_book_writing_art_release_receipt",
    schemaVersion: 1,
    contract: DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
    status: "ready_for_art_shadow",
    linkContract: DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
    linkFingerprint: sha("1"),
    mutationId: "mutation:wren:8",
    canonicalMutationPlanFingerprint: sha("2"),
    websiteMutationReceiptFingerprint: sha("3"),
    websiteMutationImportFingerprint: sha("4"),
    projectId: finalArtBrief.identity.projectId,
    programmeId: "programme:wren",
    volumeId: finalArtBrief.identity.bookId,
    manuscriptRevisionId: finalArtBrief.manuscript.manuscriptRevisionId,
    manuscriptSha256: finalArtBrief.manuscript.manuscriptSha256,
    draftArtBriefFingerprint: sha("5"),
    finalArtBriefFingerprint: finalArtBrief.briefFingerprint,
    writingStudioMainCommit: "c776a9e7f856815dbb92ffec08426cd12f176bea",
    artStudioMainCommit: "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45",
    releasedAt: "2026-08-03T01:00:00.000Z",
    releasedBy: "docs-suite-shadow",
    requiredEvidenceIds: evidence,
    blockers: [],
    requiredActions: [],
    websiteCanonicalMutationVerified: true,
    exactFinalArtBriefVerified: true,
    writingStudioMayCallArtStudioDirectly: false,
    docsSuiteCanonicalWriterEnabled: false,
    artStudioCandidateMayBeFinal: false,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const releaseReceipt = {
    ...unsignedReceipt,
    releaseFingerprint:
      await fingerprintDocsBookWritingArtReleaseReceipt(unsignedReceipt),
  };
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_input",
    schemaVersion: 1,
    executionId: "execution:wren:cover:api-release:1",
    requestedAt: "2026-08-03T01:06:00.000Z",
    release: {
      outputKind: "evavo_art_studio_docs_book_release_envelope",
      schemaVersion: 1,
      contract: ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
      sourceRepository: "EVAVO-STUDIO/evavo-docs-suite",
      targetRepository: "EVAVO-STUDIO/evavo-art-studio",
      docsSuiteCommit: "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
      receivedAt: "2026-08-03T01:05:00.000Z",
      releaseReceipt,
      finalArtBrief,
      crossRepositoryRuntimeSourceImportAllowed: false,
      writingStudioMayCallArtStudioDirectly: false,
      authoritativeBookWritesAllowed: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
  };
}

test("Docs release REST protocol reports exact verification and non-authority", async () => {
  await withServer({ bookArtProviderAdapterPolicy: policy() }, async (base) => {
    const response = await fetch(`${base}/v1/book-art/docs-release-runtime`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.contract, "evavo_docs_book_art_release_shadow_runtime_v1");
    assert.equal(body.requiresReadyForArtShadowRelease, true);
    assert.equal(body.verifiesReleaseFingerprint, true);
    assert.equal(body.verifiesExactFinalBrief, true);
    assert.equal(body.oneCandidate, true);
    assert.equal(body.maximumRuntimeAttempts, 1);
    assert.equal(body.providerFallbackAllowed, false);
    assert.equal(body.selectionPerformed, false);
    assert.equal(body.promotionPerformed, false);
    assert.equal(body.publicationPerformed, false);
  });
});

test("Docs release REST compile verifies the full release and writes no runtime job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-api-compile-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    await withServer(
      { runtime, bookArtProviderAdapterPolicy: policy() },
      async (base) => {
        const response = await fetch(`${base}/v1/book-art/docs-releases/compile`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(await requestBody()),
        });
        const text = await response.text();
        assert.equal(response.status, 200, text);
        const body = JSON.parse(text);
        assert.equal(body.status, "ready", body.blockers.join("\n"));
        assert.equal(body.releaseVerified, true);
        assert.equal(body.exactFinalArtBriefVerified, true);
        assert.equal(body.plan.runtimeSubmission.maximumAttempts, 1);
        assert.equal(body.plan.normalizedProviderRequest.candidateCount, 1);
        assert.equal(body.plan.normalizedProviderRequest.selection.allowFallback, false);
        assert.equal(body.providerCallPerformed, false);
        assert.equal(body.candidateArtifactsWritten, false);
        assert.equal((await runtime.list()).length, 0);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Docs release REST submit is authenticated and duplicate-safe", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-api-submit-"));
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
        const denied = await fetch(`${base}/v1/book-art/docs-releases/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        assert.equal(denied.status, 401);

        const first = await fetch(`${base}/v1/book-art/docs-releases/submit`, {
          method: "POST",
          headers: authorizedHeaders(),
          body: JSON.stringify(input),
        });
        const firstText = await first.text();
        assert.equal(first.status, 201, firstText);
        const firstBody = JSON.parse(firstText);
        assert.equal(firstBody.status, "submitted", firstBody.blockers.join("\n"));
        assert.equal(firstBody.releaseVerified, true);
        assert.equal(firstBody.providerCallPerformed, false);

        const duplicate = await fetch(`${base}/v1/book-art/docs-releases/submit`, {
          method: "POST",
          headers: authorizedHeaders(),
          body: JSON.stringify(input),
        });
        const duplicateBody = await duplicate.json();
        assert.equal(duplicate.status, 201);
        assert.equal(duplicateBody.job.id, firstBody.job.id);
        assert.equal((await runtime.list()).length, 1);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Docs release REST rejects caller provider policy and tampered receipt", async () => {
  const input = await requestBody();
  await withServer({ bookArtProviderAdapterPolicy: policy() }, async (base) => {
    const policyResponse = await fetch(`${base}/v1/book-art/docs-releases/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, adapterPolicy: policy() }),
    });
    assert.equal(policyResponse.status, 422);
    assert.equal(
      (await policyResponse.json()).error.code,
      "BOOK_ART_DOCS_RELEASE_REQUEST_INVALID",
    );

    const tampered = structuredClone(input);
    tampered.release.releaseReceipt.manuscriptSha256 = sha("f");
    const tamperedResponse = await fetch(
      `${base}/v1/book-art/docs-releases/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tampered),
      },
    );
    assert.equal(tamperedResponse.status, 422);
    const body = await tamperedResponse.json();
    assert.equal(body.status, "blocked");
    assert.ok(body.blockers.some((entry) => entry.includes("release fingerprint")));
  });
});
