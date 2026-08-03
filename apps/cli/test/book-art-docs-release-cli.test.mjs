import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

const cwd = new URL("..", import.meta.url);
const sha = (character) => `sha256:${character.repeat(64)}`;

function environment() {
  return {
    ...process.env,
    EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_MODEL: "fixture-transparent-v1",
  };
}

function run(args, env = environment()) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env,
  });
}

async function inputFile(root) {
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
      requestId: "art-request:wren:cover:cli-release:1",
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
  const file = path.join(root, "docs-book-art-release.json");
  await writeFile(
    file,
    JSON.stringify({
      outputKind: "evavo_docs_book_art_release_shadow_job_input",
      schemaVersion: 1,
      executionId: "execution:wren:cover:cli-release:1",
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
    }),
  );
  return file;
}

test("CLI reports the verified Docs release protocol", () => {
  const result = run(["book-art-docs-release-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.contract, "evavo_docs_book_art_release_shadow_runtime_v1");
  assert.equal(body.requiresReadyForArtShadowRelease, true);
  assert.equal(body.verifiesReleaseFingerprint, true);
  assert.equal(body.verifiesExactFinalBrief, true);
  assert.equal(body.oneCandidate, true);
  assert.equal(body.maximumRuntimeAttempts, 1);
  assert.equal(body.providerFallbackAllowed, false);
  assert.equal(body.publicationPerformed, false);
});

test("CLI compiles a verified Docs release without writing a runtime job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-cli-compile-"));
  try {
    const input = await inputFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const result = run([
      "book-art-docs-release-compile",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "ready", body.blockers.join("\n"));
    assert.equal(body.releaseVerified, true);
    assert.equal(body.plan.runtimeSubmission.maximumAttempts, 1);
    assert.equal(body.plan.normalizedProviderRequest.candidateCount, 1);
    assert.equal(body.plan.normalizedProviderRequest.selection.allowFallback, false);
    assert.equal(body.providerCallPerformed, false);
    assert.equal(
      (await new LocalRuntimeRepository({ root: runtimeRoot }).list()).length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI submits duplicate Docs releases idempotently without provider execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-cli-submit-"));
  try {
    const input = await inputFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const args = [
      "book-art-docs-release-submit",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
      "--actor",
      "docs-release-cli-test",
    ];
    const first = run(args);
    assert.equal(first.status, 0, first.stderr);
    const firstBody = JSON.parse(first.stdout);
    assert.equal(firstBody.status, "submitted", firstBody.blockers.join("\n"));
    assert.equal(firstBody.releaseVerified, true);
    assert.equal(firstBody.providerCallPerformed, false);

    const duplicate = run(args);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    const duplicateBody = JSON.parse(duplicate.stdout);
    assert.equal(duplicateBody.job.id, firstBody.job.id);
    assert.equal((await new LocalRuntimeRepository({ root: runtimeRoot }).list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects caller-owned adapter policy and tampered Docs releases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-cli-reject-"));
  try {
    const input = await inputFile(root);
    const fs = await import("node:fs/promises");
    const callerPolicy = JSON.parse(await fs.readFile(input, "utf8"));
    callerPolicy.adapterPolicy = { allowedAdapterIds: ["untrusted"] };
    await writeFile(input, JSON.stringify(callerPolicy));
    const denied = run(["book-art-docs-release-compile", "--input", input]);
    assert.equal(denied.status, 1);
    assert.match(JSON.parse(denied.stderr).error.message, /must not contain adapterPolicy/);

    const tamperedFile = await inputFile(root);
    const tampered = JSON.parse(await fs.readFile(tamperedFile, "utf8"));
    tampered.release.releaseReceipt.manuscriptSha256 = sha("f");
    await writeFile(tamperedFile, JSON.stringify(tampered));
    const blocked = run(["book-art-docs-release-compile", "--input", tamperedFile]);
    assert.equal(blocked.status, 2);
    const body = JSON.parse(blocked.stdout);
    assert.equal(body.status, "blocked");
    assert.ok(body.blockers.some((entry) => entry.includes("release fingerprint")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
