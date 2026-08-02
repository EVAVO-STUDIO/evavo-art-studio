import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { createArtStudioApiServer } from "../dist/index.js";

const token = "book-art-api-inspection-token-abcdefghijklmnopqrstuvwxyz";
const sha = (character) => character.repeat(64);

function brief() {
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
    briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
}

async function requestBody() {
  const compiled = await compileBookArtProductionWorkOrder(brief());
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  return {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-api-inspection-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: compiled.workOrder,
  };
}

function policy() {
  return {
    allowedAdapterIds: ["fixture-image"],
    preferredAdapterId: "fixture-image",
    preferredModel: "fixture-transparent-v1",
  };
}

function headers() {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-evavo-actor": "book-art-api-inspection-test",
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

test("Book Art REST inspection is protected, read-only and reports exact pending state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-api-inspect-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
    const input = await requestBody();
    await withServer(
      {
        runtime,
        artifacts,
        allowWrites: true,
        writeToken: token,
        bookArtProviderAdapterPolicy: policy(),
      },
      async (base) => {
        const denied = await fetch(`${base}/v1/book-art/provider-jobs/inspect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        assert.equal(denied.status, 401);
        assert.equal(
          (await denied.json()).error.code,
          "BOOK_ART_RUNTIME_UNAUTHORIZED",
        );

        const absent = await fetch(`${base}/v1/book-art/provider-jobs/inspect`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        });
        const absentText = await absent.text();
        assert.equal(absent.status, 200, absentText);
        const absentBody = JSON.parse(absentText);
        assert.equal(absentBody.status, "not-submitted");
        assert.equal(absentBody.inspectionReadOnly, true);
        assert.equal(absentBody.providerCallPerformedByInspection, false);
        assert.equal(absentBody.candidateArtifactsWrittenByInspection, false);
        assert.equal((await runtime.list()).length, 0);

        const submitted = await fetch(`${base}/v1/book-art/provider-jobs/submit`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        });
        assert.equal(submitted.status, 201, await submitted.text());

        const pending = await fetch(`${base}/v1/book-art/provider-jobs/inspect`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        });
        const pendingText = await pending.text();
        assert.equal(pending.status, 200, pendingText);
        const pendingBody = JSON.parse(pendingText);
        assert.equal(pendingBody.status, "pending");
        assert.equal(pendingBody.runtimeJob.state, "queued");
        assert.equal(pendingBody.providerExecutionObserved, false);
        assert.equal(pendingBody.selectionPerformed, false);
        assert.equal(pendingBody.promotionPerformed, false);
        assert.equal(pendingBody.publicationPerformed, false);
        assert.equal((await runtime.list()).length, 1);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
