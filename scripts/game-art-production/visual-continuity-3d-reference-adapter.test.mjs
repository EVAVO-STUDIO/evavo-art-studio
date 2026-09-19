import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalJson,
  sha256,
  sha256Bytes,
} from "./asset-fabricator-reference-common.mjs";
import {
  ADAPTER_REQUEST_CONTRACT,
  APPROVED_HANDOFF_KIND,
  APPROVED_HANDOFF_PROTOCOL_VERSION,
  compileContinuity3dReferenceHandoff,
  verifyContinuity3dReferenceHandoff,
} from "./visual-continuity-3d-reference-adapter.mjs";

const digest = (character) => character.repeat(64);
const approvalAuthority = {
  decisionRecorded: true,
  providerExecution: false,
  imageMutation: false,
  canonMutation: false,
  repositoryMutation: false,
  publication: false,
};
const handoffAuthority = {
  sourceMutation: false,
  canonMutation: false,
  automaticCreativeApproval: false,
  targetRepositoryMutation: false,
  runtimeActivation: false,
  publication: false,
};

function withHash(value, field) {
  const output = structuredClone(value);
  output[field] = sha256(output);
  return output;
}

function approvalFor(source, index) {
  return withHash(
    {
      schemaVersion: "1.0",
      kind: "evavo.visual-continuity.approval",
      protocolVersion: APPROVED_HANDOFF_PROTOCOL_VERSION,
      bibleSha256: digest("a"),
      sessionId: "ship-session",
      sessionRevision: "1.0.0",
      workItemId: source.workItemId,
      contextSha256: source.contextSha256,
      artifactId: source.artifactId,
      candidateSha256: source.sha256,
      attemptSha256: digest(String((index + 1) % 10)),
      decision: "approved",
      reviewer: "greg",
      reviewedAt: "2026-09-19T14:00:00.000Z",
      evidenceSha256: digest(String((index + 3) % 10)),
      note: `Approved ${source.workItemId} at full resolution.`,
      authority: approvalAuthority,
    },
    "approvalSha256",
  );
}

function approvedHandoff(sources) {
  const approvalReceipts = sources.map(approvalFor);
  return withHash(
    {
      schemaVersion: "1.0",
      kind: APPROVED_HANDOFF_KIND,
      protocolVersion: APPROVED_HANDOFF_PROTOCOL_VERSION,
      targetStudio: "3d-studio",
      receiverProjectId: "ship-3d-project",
      purpose: "Deliver approved orthographic ship sources to the governed 3D adapter.",
      bibleSha256: digest("a"),
      sessionSha256: digest("b"),
      sources,
      continuity: {
        style: {
          title: "Engraved maritime forms",
          intent: "Readable authored construction with a restrained historic palette.",
          authoredEra: "1871",
          renderingLanguage: ["engraved monochrome raster"],
          lineLanguage: ["controlled hatching"],
          valueStructure: ["ink black, paper white, restrained red"],
          materialLanguage: ["weathered timber", "aged brass", "painted iron"],
          lightingLanguage: ["neutral studio reference lighting"],
          compositionLanguage: ["orthographic subject isolation"],
          distinctiveMotifs: ["brass ring", "salt-cut edge", "route-red notch"],
          prohibitedGenericTraits: ["soft AI glow", "random filigree", "fantasy ornament"],
          prohibitedModernTraits: ["modern navigation lights", "plastic fittings"],
        },
        colourTokens: [
          {
            id: "ink-black",
            hex: "#000000",
            role: "primary construction ink",
            usage: ["silhouette", "linework"],
          },
          {
            id: "accent-red",
            hex: "#ff244e",
            role: "restrained accent",
            usage: ["selected details"],
          },
        ],
        references: [],
        locks: [
          {
            id: "ship-identity-lock",
            kind: "identity",
            mustNotVary: ["hull sheer", "mast placement", "rudder side"],
          },
        ],
        entities: [],
        locations: [],
        mapProfiles: [],
        shotTemplates: [],
      },
      requestedOutputs: ["receiver-valid multi-view 3D reference handoff"],
      receivingChecks: ["Verify every source SHA-256 before use."],
      notes: [],
      authority: handoffAuthority,
      approvalReceipts,
      receiverRoute: {
        status: "adapter-required",
        adapterId: "asset-fabricator-reference-handoff",
        receiverId: "evavo-3d-art-reference-brief",
        workerTaskId: "creative-media-3d-art-reference-brief",
        instruction: "Compile the governed multi-view handoff before receiver execution.",
      },
      releaseStatus: "approved-for-receiver-validation",
    },
    "handoffSha256",
  );
}

async function fixture({ omitView = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-continuity-3d-adapter-"));
  const views = ["front", "back", "left", "right", "three-quarter", "top"];
  const sources = [];
  const references = [];
  for (const [index, view] of views.entries()) {
    const filePath = path.join(root, `${view}.png`);
    const bytes = Buffer.from(
      `approved-source-${view}-${"x".repeat(48)}`,
      "utf8",
    );
    await writeFile(filePath, bytes);
    const workItemId = `ship_${view.replaceAll("-", "_")}`;
    const source = {
      workItemId,
      assetType: "3d-reference",
      artifactId: `artifact-${view}`,
      uri: `file://${filePath.replaceAll("\\", "/")}`,
      sha256: sha256Bytes(bytes),
      contextSha256: digest(String((index + 5) % 10)),
    };
    sources.push(source);
    if (view !== omitView) {
      references.push({
        id: `reference-${index + 1}`,
        workItemId,
        path: filePath,
        view,
        role: view === "three-quarter" ? "appearance" : "geometry",
        rights: "owned",
        notes: `${view} approved continuity master`,
      });
    }
  }
  const handoff = approvedHandoff(sources);
  const handoffPath = path.join(root, "approved-handoff.json");
  const handoffBytes = Buffer.from(`${JSON.stringify(handoff, null, 2)}\n`, "utf8");
  await writeFile(handoffPath, handoffBytes);
  const request = {
    contractVersion: ADAPTER_REQUEST_CONTRACT,
    approvedHandoffPath: handoffPath,
    approvedHandoffFileSha256: sha256Bytes(handoffBytes),
    assetId: "merchant-ship-v1",
    subjectId: "merchant-ship",
    assetClass: "vehicle",
    references,
    paletteTokenIds: ["ink-black", "accent-red"],
    threeDArtDirection: {
      styleFamily: "stylised-realism",
      silhouette: "Long low merchant hull, two masts, raised stern and readable rudder silhouette.",
      detailStrategy: "Lock large construction forms first, then add restrained period detail without changing the approved silhouette.",
      additionalAvoid: ["generic pirate decoration", "modern welded superstructure"],
    },
    geometryIntent: {
      topologyStrategy: "manual-review",
      targetTriangles: 120000,
      maximumTriangles: 220000,
      watertightRequired: false,
      manifoldRequired: true,
      maximumComponents: 96,
      minimumThicknessMetres: 0.002,
      symmetry: false,
      hardSurface: true,
      subdivisionReady: false,
    },
    materialIntent: {
      workflow: "openpbr-surface",
      graphId: "merchant-ship-materials",
      textureResolution: 4096,
      requiredChannels: ["base-color", "normal", "roughness", "metalness", "ao", "mask"],
      channelPacking: { r: "ao", g: "roughness", b: "metalness", a: "mask" },
      delightRequired: true,
      bakeRequired: true,
    },
    riggingIntent: {
      type: "mechanical",
      required: true,
      maximumBones: 96,
      maximumInfluences: 4,
      blendshapes: [],
      animations: ["rudder-turn", "sail-trim", "mast-sway"],
    },
    deliveryIntent: {
      targets: ["godot", "blender"],
      format: "glb",
      meshCompression: "meshopt",
      textureCompression: "ktx2-uastc",
      embedTextures: true,
      generateManifest: true,
    },
    dimensionsMetres: {
      width: 8.5,
      height: 26,
      depth: 41,
      groundOrigin: "bottom-center",
    },
    anchors: [
      {
        id: "mast-main",
        purpose: "Main mast rotation and sail rig origin",
        parentHint: "ship-root",
        positionMetres: [0, 5.5, 3],
      },
      {
        id: "rudder",
        purpose: "Rudder articulation origin",
        parentHint: "ship-root",
        positionMetres: [0, 1.2, -19.5],
      },
    ],
    provenance: {
      requestedBy: "EVAVO Studio",
      project: "1871",
      rightsReviewRequired: false,
      notes: "Owner-approved visual continuity sources.",
    },
  };
  const requestPath = path.join(root, "adapter-request.json");
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return { root, request, requestPath, handoff, handoffPath };
}

async function compileFixture(fixtureData) {
  return compileContinuity3dReferenceHandoff(fixtureData.request, {
    baseDirectory: fixtureData.root,
    sourceProgramPath: fixtureData.requestPath,
  });
}

test("compiles exact approved continuity sources into the live 3D receiver schema", async () => {
  const data = await fixture();
  try {
    const first = await compileFixture(data);
    const second = await compileFixture(data);
    assert.deepEqual(first, second);
    assert.equal(first.schema, "evavo.art.asset-fabricator-reference-handoff.v1");
    assert.equal(first.references.length, 6);
    assert.equal(first.viewCoverage.complete, true);
    assert.deepEqual(first.artDirection.palette, ["#000000", "#ff244e"]);
    assert.ok(first.artDirection.styleDescription.includes("Distinctive motifs"));
    assert.ok(first.artDirection.avoid.includes("soft AI glow"));
    assert.ok(first.artDirection.avoid.includes("Do not vary hull sheer"));
    assert.ok(first.provenance.notes.includes(data.handoff.handoffSha256));
    assert.equal(first.sourceProgram.contractVersion, ADAPTER_REQUEST_CONTRACT);
    assert.equal(first.authority.automatic3dGeneration, false);
    assert.equal(
      await verifyContinuity3dReferenceHandoff(
        data.request,
        first,
        {
          baseDirectory: data.root,
          sourceProgramPath: data.requestPath,
        },
      ),
      true,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects local view bytes that do not match the approved continuity source", async () => {
  const data = await fixture();
  try {
    await writeFile(data.request.references[0].path, Buffer.from("tampered-source-bytes-that-are-long-enough-xxxxxxxx"));
    await assert.rejects(
      () => compileFixture(data),
      /REFERENCE_0_SOURCE_HASH_MISMATCH/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects missing required top view for a vehicle", async () => {
  const data = await fixture({ omitView: "top" });
  try {
    await assert.rejects(() => compileFixture(data), /missing-views:top/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects a rehashed approval that no longer matches its source", async () => {
  const data = await fixture();
  try {
    const changed = structuredClone(data.handoff);
    const approval = changed.approvalReceipts[0];
    delete approval.approvalSha256;
    approval.artifactId = "different-artifact";
    approval.approvalSha256 = sha256(approval);
    delete changed.handoffSha256;
    changed.handoffSha256 = sha256(changed);
    const bytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`, "utf8");
    await writeFile(data.handoffPath, bytes);
    data.request.approvedHandoffFileSha256 = sha256Bytes(bytes);
    await writeFile(data.requestPath, `${JSON.stringify(data.request, null, 2)}\n`, "utf8");
    await assert.rejects(() => compileFixture(data), /APPROVAL_SOURCE_MISMATCH/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("replay verification rejects a valid but non-canonical receiver handoff", async () => {
  const data = await fixture();
  try {
    const compiled = await compileFixture(data);
    const changed = structuredClone(compiled);
    changed.provenance.notes = `${changed.provenance.notes} Unbound extra note.`;
    changed.handoffSha256 = sha256(
      Object.fromEntries(
        Object.entries(changed).filter(([key]) => key !== "handoffSha256"),
      ),
    );
    await assert.rejects(
      () =>
        verifyContinuity3dReferenceHandoff(
          data.request,
          changed,
          {
            baseDirectory: data.root,
            sourceProgramPath: data.requestPath,
          },
        ),
      /HANDOFF_REPLAY_MISMATCH/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("adapter request file is byte-bound as the receiver source program", async () => {
  const data = await fixture();
  try {
    const compiled = await compileFixture(data);
    const requestBytes = await readFile(data.requestPath);
    assert.equal(compiled.sourceProgram.sha256, sha256Bytes(requestBytes));
    assert.equal(
      canonicalJson(compiled.references.map((reference) => reference.sha256)),
      canonicalJson(data.handoff.sources.map((source) => source.sha256)),
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});
