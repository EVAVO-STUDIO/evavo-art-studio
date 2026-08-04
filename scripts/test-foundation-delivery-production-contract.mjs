#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(
  root,
  "scripts",
  "compile-foundation-delivery-manifest.mjs",
);
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "evavo-foundation-contract-compatibility-"),
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  return sha256(bytes);
};

const writeSource = (filePath, contents) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(contents, "utf8");
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
};

const summaryFor = (items) => {
  const roleCounts = {};
  const blockerCounts = {};
  let blocked = 0;
  let reviewRequired = 0;
  for (const item of items) {
    roleCounts[item.role] = (roleCounts[item.role] ?? 0) + 1;
    if (item.blockers.length > 0) blocked += 1;
    if (item.reviewRequired) reviewRequired += 1;
    for (const blocker of item.blockers) {
      blockerCounts[blocker] = (blockerCounts[blocker] ?? 0) + 1;
    }
  }
  return {
    workItems: items.length,
    reviewRequired,
    blocked,
    roleCounts: Object.fromEntries(Object.entries(roleCounts).sort()),
    blockerCounts: Object.fromEntries(Object.entries(blockerCounts).sort()),
  };
};

const imageRole = ({
  id,
  runtimeRoot,
  alphaPolicy = "require-meaningful-alpha",
  runtimeFormat = "png-lossless",
}) => ({
  id,
  auditRoles: ["ui-icon"],
  pathTokens: [`/${id}/`],
  runtimeRoot,
  canvas: {
    policy: "exact",
    width: 32,
    height: 32,
    upscaleAllowed: false,
    cropAllowed: false,
  },
  alphaPolicy,
  fitPolicy: "contain_no_crop",
  masterFormat: "png",
  runtimeFormat,
  godotImport: {
    mipmaps: false,
    compression: "lossless",
    filter: "nearest",
    fixAlphaBorder: alphaPolicy === "require-meaningful-alpha",
    premultipliedAlpha: false,
  },
  requiredStages: ["exact-canvas-review", "godot-import", "native-review"],
  automaticBackgroundRemovalAllowed: false,
});

const audioRole = ({ id, runtimeRoot, runtimeFormat }) => ({
  id,
  auditRoles: ["audio"],
  pathTokens: [`/${id}/`],
  runtimeRoot,
  canvas: null,
  alphaPolicy: "not-applicable",
  fitPolicy: "not-applicable",
  masterFormat: "wav-or-flac-lossless-master",
  runtimeFormat,
  godotImport: {
    streamingPolicyAuthority: "audio-manifest",
    loopPolicyAuthority: "audio-manifest",
    sampleRateCeilingHz: 48_000,
  },
  requiredStages: ["audio-analysis", "godot-import", "human-listening-approval"],
  automaticBackgroundRemovalAllowed: false,
});

const makeScenario = (name, mutate = () => {}) => {
  const scenarioRoot = path.join(workspace, name);
  const repository = path.join(scenarioRoot, "GodotGameFoundationKit");
  const evidence = path.join(scenarioRoot, "evidence");
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });

  const roles = [
    imageRole({
      id: "shell-desktop-icon",
      runtimeRoot: "assets/final/icons",
    }),
    imageRole({
      id: "pizza-management-ui",
      runtimeRoot: "assets/final/ui",
      alphaPolicy: "preserve-role-owned",
    }),
    audioRole({
      id: "ui-sfx",
      runtimeRoot: "assets/final/audio/ui",
      runtimeFormat: "wav-mono-low-latency",
    }),
    audioRole({
      id: "gameplay-sfx",
      runtimeRoot: "assets/final/audio/gameplay",
      runtimeFormat: "wav-or-ogg-role-owned",
    }),
    audioRole({
      id: "ambience-loop",
      runtimeRoot: "assets/final/audio/ambience",
      runtimeFormat: "ogg-vorbis-streaming",
    }),
  ];

  const contract = {
    schemaVersion: "1.0",
    contract: "evavo_godot_media_production_contract_v1",
    repository: "EVAVO-STUDIO/GodotGameFoundationKit",
    projectId: "evavo-foundation-contract-compatibility",
    engine: {
      name: "Godot",
      minimumVersion: "4.6.2",
      renderingDomain: "2d",
      renderer: "compatibility",
      scripting: "gdscript",
    },
    product: {
      hub: "EVAVO Foundation Contract Compatibility",
      games: ["TEST"],
      releaseState: "test",
      newGameAdmissionAllowed: false,
    },
    roots: {
      sourceArchives: ["source_art"],
      runtime: ["assets/final"],
      evidence: ["artifacts/production"],
    },
    roles,
    batchPolicy: {
      sourceFilesAreImmutable: true,
      outputsAreUnapprovedUntilPromoted: true,
      automaticDeletionAllowed: false,
      partialBatchPublicationAllowed: false,
    },
    mcpExecution: {
      rootRestrictionRequired: true,
      arbitraryShellAllowed: false,
      arbitraryGitArgumentsAllowed: false,
      forcePushAllowed: false,
    },
  };

  const icon = writeSource(
    path.join(repository, "source_art/icons/shell.png"),
    `png-source:${name}`,
  );
  const uiAudio = writeSource(
    path.join(repository, "source_art/audio/ui/click.wav"),
    `wav-source:${name}`,
  );

  const contractPath = path.join(
    repository,
    "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
  );
  const contractSha256 = writeJson(contractPath, contract);

  const imageItem = {
    sourcePath: "source_art/icons/shell.png",
    sourceSha256: icon.sha256,
    sourceBytes: icon.bytes,
    sourceExtension: ".png",
    role: "shell-desktop-icon",
    roleAuthority: "audit-role",
    runtimeRoot: "assets/final/icons",
    runtimeFormat: "png-lossless",
    runtimeTargetPath: "assets/final/icons/shell.png",
    canvas: roles[0].canvas,
    alphaPolicy: roles[0].alphaPolicy,
    fitPolicy: roles[0].fitPolicy,
    godotImport: roles[0].godotImport,
    actions: ["retain-immutable-source-identity"],
    requiredStages: roles[0].requiredStages,
    blockers: [],
    reviewRequired: false,
    auditFindings: [],
  };
  const audioItem = {
    sourcePath: "source_art/audio/ui/click.wav",
    sourceSha256: uiAudio.sha256,
    sourceBytes: uiAudio.bytes,
    sourceExtension: ".wav",
    role: "ui-sfx",
    roleAuthority: "audit-role",
    runtimeRoot: "assets/final/audio/ui",
    runtimeFormat: "wav-mono-low-latency",
    runtimeTargetPath: "assets/final/audio/ui/click.wav",
    canvas: null,
    alphaPolicy: "not-applicable",
    fitPolicy: "not-applicable",
    godotImport: roles[2].godotImport,
    actions: ["retain-immutable-source-identity"],
    requiredStages: roles[2].requiredStages,
    blockers: [],
    reviewRequired: false,
    auditFindings: [],
  };

  const plan = {
    schemaVersion: "1.0",
    contract: "evavo_godot_media_production_plan_v1",
    repository: contract.repository,
    contractPath:
      "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
    contractSha256,
    auditRoot: fs.realpathSync.native(repository),
    auditSha256: "b".repeat(64),
    selectedRoles: ["shell-desktop-icon", "ui-sfx"],
    summary: summaryFor([imageItem, audioItem]),
    workItems: [imageItem, audioItem],
    publicationAuthority: false,
    deletionAuthority: false,
    humanCreativeApprovalRequired: true,
  };

  const context = {
    scenarioRoot,
    repository,
    evidence,
    roles,
    contract,
    contractPath,
    plan,
    planPath: path.join(evidence, "media-plan.json"),
    output: path.join(evidence, "delivery-manifest.json"),
  };
  mutate(context);
  const currentContractSha256 = writeJson(context.contractPath, context.contract);
  context.plan.contractSha256 = currentContractSha256;
  context.plan.summary = summaryFor(context.plan.workItems);
  writeJson(context.planPath, context.plan);
  return context;
};

const run = (context, extra = []) =>
  spawnSync(
    process.execPath,
    [
      compiler,
      "--repo",
      context.repository,
      "--contract",
      context.contractPath,
      "--plan",
      context.planPath,
      "--output",
      context.output,
      ...extra,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    },
  );

const expectFailure = (context, code, extra = []) => {
  const result = run(context, extra);
  assert.notEqual(result.status, 0, `${code} unexpectedly passed`);
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(code));
  assert.equal(fs.existsSync(context.output), false);
};

try {
  const productionShape = makeScenario("production-shape");
  const imageOnly = run(productionShape, [
    "--role",
    "shell-desktop-icon",
  ]);
  assert.equal(imageOnly.status, 0, imageOnly.stderr);
  const imageManifest = JSON.parse(
    fs.readFileSync(productionShape.output, "utf8"),
  );
  assert.deepEqual(imageManifest.foundationAuthority.selectedRoles, [
    "shell-desktop-icon",
  ]);
  assert.equal(
    imageManifest.foundationAuthority.deliveryManifestFileCreated,
    true,
  );
  assert.equal(
    Object.hasOwn(imageManifest.foundationAuthority, "planFileCreated"),
    false,
  );

  const mixedSelection = makeScenario("mixed-selection");
  expectFailure(mixedSelection, "RUNTIME_FORMAT_UNSUPPORTED");

  const fakePng = makeScenario("fake-png-format", (context) => {
    context.contract.roles[0].runtimeFormat = "png-executable";
    context.plan.workItems[0].runtimeFormat = "png-executable";
  });
  expectFailure(fakePng, "CONTRACT_RUNTIME_FORMAT_INVALID", [
    "--role",
    "shell-desktop-icon",
  ]);

  const windowsReserved = makeScenario("windows-reserved", (context) => {
    context.plan.workItems[0].runtimeTargetPath =
      "assets/final/icons/con.png";
  });
  expectFailure(windowsReserved, "RUNTIME_TARGET_WINDOWS_RESERVED", [
    "--role",
    "shell-desktop-icon",
  ]);

  const duplicateOption = makeScenario("duplicate-option");
  expectFailure(duplicateOption, "OPTION_DUPLICATE", [
    "--role",
    "shell-desktop-icon",
    "--role",
    "shell-desktop-icon",
  ]);

  process.stdout.write(
    "Foundation production-contract compatibility tests passed.\n" +
      "- the real mixed image/audio contract shape is accepted\n" +
      "- image-only role filtering remains delivery-optimizer compatible\n" +
      "- selected audio and substring-matched pseudo-formats fail closed\n" +
      "- Windows-reserved targets and duplicate options fail before output\n",
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
