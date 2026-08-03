import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  translateLegacyWebsiteBookArtGenerationPlan,
  translateLegacyWebsiteBookIllustrationGenerationPlan,
} from "../../../packages/contracts/dist/index.js";

const require = createRequire(import.meta.url);
const docs = require("../dist/packages/core/src/index.js");
const client = require("../dist/apps/web/src/lib/book-studio-art-plan-translation-client.js");
const service = require("../dist/apps/web/src/lib/book-studio-art-plan-translation-service.js");

const sha = (character) => character.repeat(64);
const digest = (character) => `sha256:${sha(character)}`;
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      )
    : value;
const hashText = async (value) => [...new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const hash = async (value) => hashText(JSON.stringify(canonical(value)));
const seal = async (value, key) => ({ ...value, [key]: await hash(value) });

async function bookBrief(purpose = "front_cover_art") {
  return docs.sealBookArtBrief({
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: docs.BOOK_ART_HANDOFF_CONTRACT,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: purpose === "ornament" ? "request-ornament-1" : "request-cover-1",
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
    conceptTerritoryId: purpose === "ornament" ? "chapter-plate-1" : "manuscript-first",
    conceptTerritoryLabel: purpose === "ornament" ? "Chapter plate" : "Manuscript first",
    creativeThesis: purpose === "ornament"
      ? "A manuscript-specific black-ink ornament with disciplined page craft and protected live-text space."
      : "A restrained image built around one manuscript-specific object and a protected editable title field.",
    primarySubject: purpose === "ornament"
      ? "The exact manuscript-grounded ornamental object"
      : "The weathered object identified by approved visual canon",
    supportingSubjects: [],
    compositionRequirements: ["Use measured hierarchy and stable perspective."],
    mustShow: ["The exact approved subject."],
    mustNotShow: ["Generated lettering", "Unsupported objects"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved character and object state."],
    historicalAndMaterialRequirements: ["Use period-correct construction and materials."],
    negativeSpaceRequirements: ["Protect the live title and caption zones."],
    output: {
      widthPx: purpose === "ornament" ? 2400 : 3000,
      heightPx: purpose === "ornament" ? 3600 : 4800,
      minimumPpi: purpose === "ornament" ? 600 : 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: purpose === "ornament" ? "monochrome" : "rgb",
      alpha: purpose === "ornament" ? "required" : "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-03T12:00:00.000Z",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  });
}

function coverPlan() {
  return {
    outputKind: "book_cover_artwork_generation_plan",
    version: "book_cover_artwork_generation_plan_v1",
    status: "ready_to_generate",
    projectId: "project-1",
    runId: "legacy-run-1",
    requestedAt: "2026-08-03T12:00:00.000Z",
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

async function illustrationPlan() {
  const style = await seal({
    outputKind: "book_illustration_style_authority",
    version: "book_illustration_style_authority_v1",
    status: "approved_for_page_design",
    projectId: "project-1",
    styleId: "style-1",
    compiledAt: "2026-08-03T12:00:00.000Z",
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
  const page = await seal({
    outputKind: "book_illustrated_page_authority",
    version: "book_illustrated_page_authority_v1",
    status: "ready_for_generation",
    projectId: "project-1",
    pageId: "page-1",
    compiledAt: "2026-08-03T12:00:00.000Z",
    styleAuthorityDigestSha256: style.authorityDigestSha256,
    pageRole: "ornamental_divider",
    narrativeMode: "ornamental",
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
  const prompt = "Create one exact manuscript-grounded black-ink ornamental candidate with no generated publication text.";
  const candidateId = "page-1-ornamental_restraint";
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
    requestedAt: "2026-08-03T12:00:00.000Z",
    profile: "production",
    styleAuthority: style,
    pageAuthority: page,
    providerProfile: {
      adapter: "openai_image_api",
      model: "gpt-image-2-2026-04-21",
      size: "2048x3072",
      quality: "high",
      outputFormat: "png",
      background: "transparent",
      maximumCandidatesPerRun: 4,
      maximumConcurrency: 1,
      automaticProviderRetries: 0,
    },
    maximumRefinementRounds: 3,
    tasks: [{
      candidateId,
      order: 1,
      variation: "ornamental_restraint",
      prompt,
      promptDigestSha256: await hashText(prompt),
      expectedWidthPx: 2048,
      expectedHeightPx: 3072,
      flattenBackgroundHex: "#ffffff",
      createTransparentInkLayer: true,
      inkLayerMode: "binary_alpha",
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
    inputDigestSha256: await hash(inputSnapshot),
  };
  return {
    candidateId,
    plan: await seal(withoutDigest, "planDigestSha256"),
  };
}

async function coverInput() {
  return {
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: await bookBrief(),
    legacyPlan: coverPlan(),
    candidateId: "candidate-1",
  };
}

async function illustrationInput() {
  const legacy = await illustrationPlan();
  return {
    outputKind: "evavo_legacy_website_book_illustration_plan_translation_input",
    schemaVersion: 1,
    brief: await bookBrief("ornament"),
    legacyPlan: legacy.plan,
    candidateId: legacy.candidateId,
  };
}

async function artTranslate(input) {
  return input.outputKind === "evavo_legacy_website_book_art_plan_translation_input"
    ? translateLegacyWebsiteBookArtGenerationPlan(input)
    : translateLegacyWebsiteBookIllustrationGenerationPlan(input);
}

test("Docs and Art derive identical cover and illustration work orders", async () => {
  for (const input of [await coverInput(), await illustrationInput()]) {
    const compilation = await docs.compileBookArtPlanTranslationRequest(input);
    assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
    const remote = await artTranslate(input);
    assert.equal(remote.status, "ready_for_shadow_comparison", remote.blockers.join("\n"));
    const result = await docs.validateBookArtPlanTranslationResult(input, remote);
    assert.equal(result.status, "ready_for_shadow_comparison", result.blockers.join("\n"));
    assert.deepEqual(result.workOrder, remote.workOrder);
    assert.deepEqual(result.legacyEvidence, remote.legacyEvidence);
    assert.equal(result.providerCallPerformed, false);
    assert.equal(result.runtimeJobSubmitted, false);
    assert.equal(result.selectionPerformed, false);
    assert.equal(result.promotionPerformed, false);
    assert.equal(result.bookUseBindingCreated, false);
    assert.equal(result.publicationPerformed, false);
  }
});

test("substitution, authority escalation and malformed responses fail closed", async () => {
  const input = await coverInput();
  const remote = await artTranslate(input);
  const tampered = structuredClone(remote);
  tampered.workOrder.providerRequest.target.width += 1;
  tampered.legacyEvidence.legacyRunId = "different-run";
  tampered.providerCandidateMayBeFinal = true;
  const blocked = await docs.validateBookArtPlanTranslationResult(input, tampered);
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.some((entry) => entry.includes("work order differs")));
  assert.ok(blocked.blockers.some((entry) => entry.includes("legacy evidence differs")));
  assert.ok(blocked.blockers.some((entry) => entry.includes("providerCandidateMayBeFinal")));

  const malformed = await docs.validateBookArtPlanTranslationResult(input, null);
  assert.equal(malformed.status, "blocked");
  assert.equal(malformed.artStudioCalled, true);
  assert.ok(malformed.blockers.length > 0);
});

test("client configuration and network ambiguity remain bounded and no-retry", async () => {
  const config = client.resolveBookArtPlanTranslationClientConfig({
    EVAVO_ART_STUDIO_BOOK_ART_URL: "http://127.0.0.1:4173",
    EVAVO_ART_STUDIO_BOOK_ART_TOKEN: "x".repeat(32),
    EVAVO_ART_STUDIO_BOOK_ART_TIMEOUT_MS: "120000",
    EVAVO_ART_STUDIO_BOOK_ART_MAX_RESPONSE_BYTES: "4000000",
  });
  assert.equal(config.origin, "http://127.0.0.1:4173");
  assert.throws(
    () => client.resolveBookArtPlanTranslationClientConfig({
      EVAVO_ART_STUDIO_BOOK_ART_URL: "https://art.example.com/path",
      EVAVO_ART_STUDIO_BOOK_ART_TOKEN: "x".repeat(32),
    }),
    /URL_INVALID/,
  );
  assert.throws(
    () => client.resolveBookArtPlanTranslationClientConfig({
      EVAVO_ART_STUDIO_BOOK_ART_URL: "https://art.example.com",
      EVAVO_ART_STUDIO_BOOK_ART_TOKEN: "contains whitespace and is invalid token",
    }),
    /TOKEN_INVALID/,
  );
  const input = await coverInput();
  let calls = 0;
  await assert.rejects(
    () => client.callArtStudioBookPlanTranslation(
      input,
      config,
      async () => {
        calls += 1;
        throw new Error("network unavailable");
      },
    ),
    /AMBIGUOUS_NETWORK_NO_RETRY/,
  );
  assert.equal(calls, 1);
});

test("coordinator makes one call and revalidates the actual Art result", async () => {
  const input = await coverInput();
  let calls = 0;
  const result = await service.coordinateBookArtPlanTranslation(input, {
    config: {
      origin: "https://art.example.com",
      token: "x".repeat(32),
      timeoutMilliseconds: 1000,
      maximumResponseBytes: 4_000_000,
    },
    fetchImpl: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init.body));
      const remote = await artTranslate(request);
      return new Response(JSON.stringify(remote), {
        status: remote.status === "ready_for_shadow_comparison" ? 200 : 422,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "ready_for_shadow_comparison", result.blockers.join("\n"));
  assert.equal(result.artStudioCalled, true);
  assert.equal(result.providerCallPerformed, false);
});
