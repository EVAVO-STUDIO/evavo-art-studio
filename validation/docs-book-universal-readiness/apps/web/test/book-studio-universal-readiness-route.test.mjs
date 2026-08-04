import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "../../../stubs/next-server.ts";
import {
  setDocsSuiteRequestContextForTest,
} from "../src/lib/docs-suite-request-context.ts";
import {
  GET,
  POST,
  dynamic,
  runtime,
} from "../src/app/api/v1/book-studio/universal-readiness/route.ts";

function request(value, headers = {}) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return new NextRequest(source, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(source, "utf8")),
    ...headers,
  });
}

function validProject() {
  return {
    projectId: "route-readiness-project",
    programmeId: "route-readiness-programme",
    projectTitle: "Route Readiness Project",
    projectKind: "standalone",
    contributorDisplayNames: ["Named author"],
    defaultLanguage: "en-AU",
    sourceAuthorityIds: ["source-authority-1"],
    evidenceIds: ["rights-evidence-1"],
    globalConstraintIds: ["source-grounded", "no-filler"],
    providerPolicy: {
      providers: ["chatgpt", "claude", "other_compatible_model"],
      chatgptStrictJsonSchemaRequired: true,
      claudeForcedToolRequired: true,
      compatibleAdapterSchemaRequired: true,
      providerSubstitutionAllowed: false,
      exactProfileFingerprintRequired: true,
      exactPacketFingerprintRequired: true,
      strictResponseIdentityRequired: true,
      phraseOverlapBeforeCanonicalAdmission: true,
    },
    qualityPolicy: {
      exactSourceCoverageRequired: true,
      currentVersionFullReadRequired: true,
      minimumMaterialAlternatives: 3,
      independentReviewRequired: true,
      compareAndSwapCanonicalMutationRequired: true,
      automaticCanonicalAdmissionAllowed: false,
      antiGenericityReviewRequired: true,
      projectOwnedVoiceEvidenceRequired: true,
      defaultReviewProfileIds: ["source-coverage", "independent-review"],
    },
    publicationPolicy: {
      targetPlatformIds: ["amazon-kdp"],
      manualSubmissionOnly: true,
      metadataVerificationRequired: true,
      rightsVerificationRequired: true,
      aiDisclosureDecisionRequired: true,
      isbnEvidenceRequired: true,
      barcodeEvidenceRequired: true,
      previewerEvidenceRequired: true,
      physicalProofEvidenceRequired: true,
      namedReleaseApprovalRequired: true,
    },
    artPolicy: {
      artStudioEnabled: true,
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      credentialsServerSideOnly: true,
      remoteWritesDisabledByDefault: true,
      sourceAndModelProvenanceRequired: true,
    },
    volumes: [{
      volumeId: "volume-1",
      title: "Route Readiness Book",
      sequence: 1,
      contentClass: "fiction",
      role: "primary",
      status: "source_only",
      language: "en-AU",
      targetWords: 80_000,
      minimumWords: 60_000,
      maximumWords: 100_000,
      sourceAuthorityIds: ["source-authority-1"],
      dependsOnVolumeIds: [],
      reviewProfileIds: [],
      editionPlans: [
        {
          editionId: "kindle-1",
          format: "kindle_reflowable",
          enabled: true,
          colourMode: "digital_rgb",
          requiresExternalTemplate: false,
          requiresPreviewerEvidence: true,
          requiresPhysicalProof: false,
          outputFileRoleIds: ["kindle-interior", "kindle-cover"],
        },
        {
          editionId: "paperback-1",
          format: "paperback",
          enabled: true,
          colourMode: "black_and_white",
          trimWidthInches: 6,
          trimHeightInches: 9,
          requiresExternalTemplate: true,
          requiresPreviewerEvidence: true,
          requiresPhysicalProof: true,
          outputFileRoleIds: ["paperback-interior", "paperback-cover"],
        },
      ],
      illustrationPlan: {
        mode: "mixed",
        minimumCount: 1,
        targetCount: 2,
        maximumCount: 3,
        fullPageTarget: 1,
        smallOrInlineTarget: 1,
        textWrapRequired: false,
        reflowFallback: "separate_accessible_figure",
        textFreeGeneratedArtworkRequired: true,
        editableLabelsRequired: true,
        sourceEvidenceRequired: true,
      },
      coverPlan: {
        routeCount: 3,
        candidatesPerRoute: 2,
        textFreeGeneratedArtworkRequired: true,
        editableTypographyRequired: true,
        seriesIdentityRequired: true,
        manuscriptEvidenceRequired: true,
      },
      constraintIds: [],
      namedApprovalRequired: true,
    }],
  };
}

function authorize(scopes = ["documents:read"]) {
  setDocsSuiteRequestContextForTest({
    actorType: "automation",
    workspaceId: "workspace-1",
    scopes,
  });
}

async function body(response) {
  return response.json();
}

function assertPrivate(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
}

test("route remains dynamic Node-only and denies unauthenticated access", async () => {
  assert.equal(runtime, "nodejs");
  assert.equal(dynamic, "force-dynamic");
  setDocsSuiteRequestContextForTest(null);
  const getResponse = await GET();
  assert.equal(getResponse.status, 403);
  assertPrivate(getResponse);
  assert.equal((await body(getResponse)).ok, false);

  const postResponse = await POST(request(validProject()));
  assert.equal(postResponse.status, 403);
  assertPrivate(postResponse);
});

test("GET exposes bounded planning capabilities without authority escalation", async () => {
  authorize();
  const response = await GET();
  const payload = await body(response);
  assert.equal(response.status, 200);
  assertPrivate(response);
  assert.equal(payload.ok, true);
  assert.equal(payload.workspaceId, "workspace-1");
  assert.equal(payload.supportedContentClasses.length, 16);
  assert.equal(payload.planningOnly, true);
  assert.equal(payload.providerCallPerformed, false);
  assert.equal(payload.runtimeJobSubmitted, false);
  assert.equal(payload.canonicalAdmissionAllowed, false);
  assert.equal(payload.automaticPublicationAllowed, false);
  assert.equal(payload.publicationPerformed, false);
});

test("POST returns ready automation only for a governed coherent project", async () => {
  authorize();
  const response = await POST(request(validProject()));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assertPrivate(response);
  assert.equal(payload.ok, true);
  assert.equal(payload.readyForAutomation, true);
  assert.equal(payload.result.status, "ready_for_automation");
  assert.equal(payload.result.providerCallPerformed, false);
  assert.equal(payload.result.canonicalAdmissionAllowed, false);
  assert.equal(payload.result.publicationPerformed, false);
});

test("POST preserves semantic blockers as a private 422 response", async () => {
  authorize();
  const project = validProject();
  project.volumes[0].editionPlans = [];
  const response = await POST(request(project));
  const payload = await body(response);
  assert.equal(response.status, 422);
  assertPrivate(response);
  assert.equal(payload.ok, false);
  assert.equal(payload.readyForAutomation, false);
  assert.equal(payload.result.status, "blocked");
  assert.ok(payload.result.findings.some((finding) => finding.code === "enabled_edition_required"));
});

test("POST rejects missing scope, oversized bodies and malformed JSON without leaking details", async () => {
  authorize(["documents:write"]);
  const missingScope = await POST(request(validProject()));
  assert.equal(missingScope.status, 403);

  authorize();
  const oversized = await POST(request("{}", { "content-length": "4000001" }));
  assert.equal(oversized.status, 413);
  assert.equal((await body(oversized)).error, "Request body is too large.");
  assertPrivate(oversized);

  const malformed = await POST(request("{"));
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).error, "The Book project readiness request is invalid.");
  assertPrivate(malformed);
});
