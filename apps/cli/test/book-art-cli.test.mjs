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
import { LocalRuntimeRepository } from "@evavo/art-runtime";

const cwd = new URL("..", import.meta.url);
const sha = (character) => character.repeat(64);

function providerEnvironment() {
  return {
    ...process.env,
    EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER: "fixture-image",
    EVAVO_BOOK_ART_PROVIDER_MODEL: "fixture-transparent-v1",
  };
}

function run(args, env = providerEnvironment()) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env,
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

async function inputFile(root) {
  const compiled = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  const file = path.join(root, "book-art-shadow.json");
  await writeFile(
    file,
    JSON.stringify({
      outputKind: "evavo_book_art_provider_shadow_job_input",
      schemaVersion: 1,
      executionId: "book-art-cli-shadow-1",
      requestedAt: "2026-08-02T06:00:00.000Z",
      workOrder: compiled.workOrder,
    }),
  );
  return file;
}

test("CLI reports the Book Art provider shadow protocol without executing work", () => {
  const result = run(["book-art-provider-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.contract, "evavo_book_art_provider_shadow_runtime_v1");
  assert.equal(body.providerPolicyConfigured, true);
  assert.equal(body.oneCandidate, true);
  assert.equal(body.maximumRuntimeAttempts, 1);
  assert.equal(body.providerFallbackAllowed, false);
  assert.equal(body.compilePerformsProviderCall, false);
  assert.equal(body.submitPerformsProviderCall, false);
  assert.equal(body.candidateApprovalState, "unapproved");
  assert.equal(body.runtimeCutoverApproved, false);
  assert.equal(body.publicationPerformed, false);
});

test("CLI compiles with host policy and writes no runtime job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-compile-"));
  try {
    const input = await inputFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const result = run([
      "book-art-provider-compile",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "ready", body.blockers.join("\n"));
    assert.equal(body.plan.runtimeSubmission.maximumAttempts, 1);
    assert.equal(body.plan.normalizedProviderRequest.candidateCount, 1);
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
    assert.equal(
      (await new LocalRuntimeRepository({ root: runtimeRoot }).list()).length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI submits one duplicate-safe durable Book Art job without a provider call", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-submit-"));
  try {
    const input = await inputFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const argumentsList = [
      "book-art-provider-submit",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
      "--actor",
      "book-art-cli-test",
    ];
    const first = run(argumentsList);
    assert.equal(first.status, 0, first.stderr);
    const firstBody = JSON.parse(first.stdout);
    assert.equal(firstBody.status, "submitted", firstBody.blockers.join("\n"));
    assert.equal(firstBody.providerCallPerformed, false);
    assert.equal(firstBody.candidateArtifactsWritten, false);

    const duplicate = run(argumentsList);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    const duplicateBody = JSON.parse(duplicate.stdout);
    assert.equal(duplicateBody.job.id, firstBody.job.id);
    assert.equal(duplicateBody.job.specHash, firstBody.job.specHash);

    const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
    assert.equal((await runtime.list()).length, 1);
    assert.equal(
      (await runtime.events()).filter((entry) => entry.type === "job.submitted")
        .length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects caller-supplied provider policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-policy-"));
  try {
    const input = await inputFile(root);
    const body = JSON.parse(await (await import("node:fs/promises")).readFile(input, "utf8"));
    body.adapterPolicy = { allowedAdapterIds: ["untrusted"] };
    await writeFile(input, JSON.stringify(body));
    const result = run(["book-art-provider-compile", "--input", input]);
    assert.equal(result.status, 1);
    const error = JSON.parse(result.stderr);
    assert.equal(error.error.code, "EVAVO_ART_CLI_ERROR");
    assert.match(error.error.message, /must not contain adapterPolicy/);
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
    providerProfile: {}, maximumRefinementRounds: 3, genreProfiles: [], conceptTerritories: [],
    tasks: [{
      candidateId: "candidate-1", order: 1, territoryId: "manuscript-first", territoryLabel: "Manuscript first",
      territoryArchetype: "symbolic_monument", variationId: "editorial_restraint",
      prompt: "Create one manuscript-grounded text-free image with protected negative space and no publication lettering.",
      promptDigestSha256: sha("3"), expectedWidthPx: 2160, expectedHeightPx: 3456,
      flattenBackgroundHex: "#000000", idempotencyKey: sha("4"), state: "ready", stopConditions: [],
    }],
    nextCandidateId: "candidate-1", completedCandidateIds: [], hardErrors: [], warnings: [], executionRules: [], blockedClaims: [],
    inputSnapshot: {}, inputDigestSha256: sha("5"), planDigestSha256: sha("6"),
  };
}

async function legacyTranslationFile(root) {
  const file = path.join(root, "legacy-plan-translation.json");
  await writeFile(file, JSON.stringify({
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: await brief(),
    legacyPlan: legacyPlan(),
    candidateId: "candidate-1",
  }));
  return file;
}

test("CLI translates an exact legacy Website plan without provider policy or side effects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-legacy-plan-"));
  try {
    const protocol = run(["book-art-legacy-plan-protocol"], { ...process.env });
    assert.equal(protocol.status, 0, protocol.stderr);
    const protocolBody = JSON.parse(protocol.stdout);
    assert.equal(protocolBody.contract, "evavo_book_art_profile_v1");
    assert.equal(protocolBody.translationReadOnly, true);
    assert.equal(protocolBody.providerCallPerformed, false);
    assert.equal(protocolBody.runtimeJobSubmitted, false);

    const input = await legacyTranslationFile(root);
    const result = run(["book-art-legacy-plan-translate", "--input", input], { ...process.env });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "ready_for_shadow_comparison", body.blockers.join("\n"));
    assert.equal(body.rawLegacyPromptTrustedAsAuthority, false);
    assert.equal(body.workOrder.outputKind, "evavo_book_art_production_work_order");
    assert.equal(body.authoritativeWritesPerformed, false);
    assert.equal(body.runtimeCutoverApproved, false);
    assert.equal(body.publicationPerformed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const illustrationCanonical = (value) => Array.isArray(value)
  ? value.map(illustrationCanonical)
  : value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, illustrationCanonical(item)]),
      )
    : value;
const illustrationHashText = async (value) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const illustrationHash = async (value) =>
  illustrationHashText(JSON.stringify(illustrationCanonical(value)));
const illustrationSeal = async (value, key) => ({
  ...value,
  [key]: await illustrationHash(value),
});

async function illustrationBrief() {
  const value = await brief();
  value.identity.requestId = "request-illustration-1";
  value.purpose = "interior_full_page_illustration";
  value.output.minimumPpi = 600;
  value.output.colourIntent = "monochrome";
  value.briefFingerprint = "";
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

async function legacyIllustrationTranslationValue() {
  const styleAuthority = await illustrationSeal({
    outputKind: "book_illustration_style_authority",
    version: "book_illustration_style_authority_v1",
    status: "approved_for_page_design",
    projectId: "project-1",
    styleId: "style-1",
    compiledAt: "2026-08-02T00:00:00.000Z",
    styleFamily: "engraved_book_plate",
    colourMode: "one_bit_black",
    paperTone: "white",
    inkLayerMode: "binary_alpha",
    minimumLineWidthPt: 0.25,
    targetLineArtPpi: 600,
    profile: {},
    projectVisualIdentity: "Exact manuscript-grounded line art",
    projectDirectives: [],
    prohibitedTraits: ["pseudo-text"],
    historicalReferenceDigestSha256: sha("1"),
    approvedReviewIds: ["review-1"],
    hardErrors: [],
    warnings: [],
    requiredRevisions: [],
    requiredHumanDecisions: [],
    blockedClaims: [],
  }, "authorityDigestSha256");
  const pageAuthority = await illustrationSeal({
    outputKind: "book_illustrated_page_authority",
    version: "book_illustrated_page_authority_v1",
    status: "ready_for_generation",
    projectId: "project-1",
    pageId: "page-1",
    compiledAt: "2026-08-02T00:00:00.000Z",
    styleAuthorityDigestSha256: styleAuthority.authorityDigestSha256,
    pageRole: "full_page_black_ink_plate",
    narrativeMode: "literal_scene",
    manuscriptAuthorityDigestSha256: sha("2"),
    visualManuscriptAuthorityDigestSha256: sha("3"),
    manuscriptEvidenceSpanIds: ["span-1"],
    directionDigestSha256: sha("d"),
    layoutDigestSha256: sha("4"),
    editionFormats: ["paperback"],
    sharesPageWithLiveText: true,
    protectedTextZoneCount: 2,
    hardErrors: [],
    warnings: [],
    requiredHumanDecisions: [],
    blockedClaims: [],
  }, "authorityDigestSha256");
  const prompt =
    "Create one exact manuscript-grounded black-ink illustrated page candidate with no generated publication text.";
  const candidateId = "page-1-formal_plate";
  const inputSnapshot = {
    projectId: "project-1",
    runId: "illustration-run-1",
    pageId: "page-1",
  };
  const withoutDigest = {
    outputKind: "book_illustration_generation_plan",
    version: "book_illustration_generation_plan_v1",
    status: "ready_to_generate",
    projectId: "project-1",
    runId: "illustration-run-1",
    requestedAt: "2026-08-02T00:00:00.000Z",
    profile: "production",
    styleAuthority,
    pageAuthority,
    providerProfile: {
      adapter: "openai_image_api",
      model: "gpt-image-2-2026-04-21",
      size: "2048x3072",
      quality: "high",
      outputFormat: "png",
      background: "opaque",
      maximumCandidatesPerRun: 4,
      maximumConcurrency: 1,
      automaticProviderRetries: 0,
    },
    maximumRefinementRounds: 3,
    tasks: [{
      candidateId,
      order: 1,
      variation: "formal_plate",
      prompt,
      promptDigestSha256: await illustrationHashText(prompt),
      expectedWidthPx: 2048,
      expectedHeightPx: 3072,
      flattenBackgroundHex: "#ffffff",
      createTransparentInkLayer: false,
      inkLayerMode: "none",
      idempotencyKey: sha("5"),
      state: "ready",
      stopConditions: [],
    }],
    nextCandidateId: candidateId,
    completedCandidateIds: [],
    hardErrors: [],
    warnings: [],
    executionRules: [],
    blockedClaims: [],
    inputSnapshot,
    inputDigestSha256: await illustrationHash(inputSnapshot),
  };
  return {
    outputKind:
      "evavo_legacy_website_book_illustration_plan_translation_input",
    schemaVersion: 1,
    brief: await illustrationBrief(),
    legacyPlan: await illustrationSeal(
      withoutDigest,
      "planDigestSha256",
    ),
    candidateId,
  };
}

async function legacyIllustrationTranslationFile(root) {
  const file = path.join(
    root,
    "legacy-illustration-plan-translation.json",
  );
  await writeFile(
    file,
    JSON.stringify(await legacyIllustrationTranslationValue()),
  );
  return file;
}

test("CLI translates an exact legacy Website illustration plan without provider policy or side effects", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-book-art-cli-legacy-illustration-plan-"),
  );
  try {
    const protocol = run(
      ["book-art-legacy-illustration-plan-protocol"],
      { ...process.env },
    );
    assert.equal(protocol.status, 0, protocol.stderr);
    const protocolBody = JSON.parse(protocol.stdout);
    assert.equal(protocolBody.contract, "evavo_book_art_profile_v1");
    assert.equal(protocolBody.verifiesStyleAuthorityDigest, true);
    assert.equal(protocolBody.verifiesPageAuthorityDigest, true);
    assert.equal(protocolBody.legacyLayoutTrustedAsArtAuthority, false);
    assert.equal(protocolBody.translationReadOnly, true);
    assert.equal(protocolBody.providerCallPerformed, false);
    assert.equal(protocolBody.runtimeJobSubmitted, false);

    const input = await legacyIllustrationTranslationFile(root);
    const result = run(
      [
        "book-art-legacy-illustration-plan-translate",
        "--input",
        input,
      ],
      { ...process.env },
    );
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(
      body.status,
      "ready_for_shadow_comparison",
      body.blockers.join("\n"),
    );
    assert.equal(body.workOrder.assetClass, "interior_illustration");
    assert.equal(body.legacyEvidence.pageRole, "full_page_black_ink_plate");
    assert.equal(body.rawLegacyPromptTrustedAsAuthority, false);
    assert.equal(body.legacyLayoutTrustedAsArtAuthority, false);
    assert.equal(body.authoritativeWritesPerformed, false);
    assert.equal(body.runtimeCutoverApproved, false);
    assert.equal(body.publicationPerformed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
