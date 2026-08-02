import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
} from "@evavo/art-contracts";

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

async function inputFile(root) {
  const brief = {
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
  const compiled = await compileBookArtProductionWorkOrder(brief);
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  const file = path.join(root, "book-art-inspection.json");
  await writeFile(
    file,
    JSON.stringify({
      outputKind: "evavo_book_art_provider_shadow_job_input",
      schemaVersion: 1,
      executionId: "book-art-cli-inspection-1",
      requestedAt: "2026-08-02T06:00:00.000Z",
      workOrder: compiled.workOrder,
    }),
  );
  return file;
}

test("CLI inspection reports read-only not-submitted and pending Book Art states", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-inspect-"));
  try {
    const input = await inputFile(root);
    const runtimeRoot = path.join(root, "runtime");
    const artifactRoot = path.join(root, "artifacts");
    const inspectArguments = [
      "book-art-provider-inspect",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
      "--artifact-root",
      artifactRoot,
    ];

    const absent = run(inspectArguments);
    assert.equal(absent.status, 0, absent.stderr);
    const absentBody = JSON.parse(absent.stdout);
    assert.equal(absentBody.status, "not-submitted");
    assert.equal(absentBody.inspectionReadOnly, true);
    assert.equal(absentBody.providerCallPerformedByInspection, false);
    assert.equal(absentBody.candidateArtifactsWrittenByInspection, false);

    const submitted = run([
      "book-art-provider-submit",
      "--input",
      input,
      "--runtime-root",
      runtimeRoot,
      "--actor",
      "book-art-cli-inspection-test",
    ]);
    assert.equal(submitted.status, 0, submitted.stderr);

    const pending = run(inspectArguments);
    assert.equal(pending.status, 0, pending.stderr);
    const pendingBody = JSON.parse(pending.stdout);
    assert.equal(pendingBody.status, "pending");
    assert.equal(pendingBody.runtimeJob.state, "queued");
    assert.equal(pendingBody.providerExecutionObserved, false);
    assert.equal(pendingBody.selectionPerformed, false);
    assert.equal(pendingBody.promotionPerformed, false);
    assert.equal(pendingBody.publicationPerformed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
