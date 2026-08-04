#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(root, "scripts", "compile-foundation-delivery-manifest.mjs");
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "evavo-foundation-delivery-"),
);

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  return digest(bytes);
};

const writeSource = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(text, "utf8");
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  return { bytes: bytes.byteLength, sha256: digest(bytes) };
};

const role = ({
  id,
  runtimeRoot,
  runtimeFormat = "png-lossless",
  alphaPolicy = "require-meaningful-alpha",
  stages = ["exact-canvas-review", "godot-import", "native-review"],
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
  requiredStages: stages,
  automaticBackgroundRemovalAllowed: false,
});

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

const makeScenario = (name, mutate = () => {}) => {
  const scenarioRoot = path.join(workspace, name);
  const repository = path.join(scenarioRoot, "GodotGameFoundationKit");
  const evidence = path.join(scenarioRoot, "evidence");
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  writeJson(path.join(repository, "project.godot"), {
    "config/name": "Foundation Test",
  });
  const roles = [
    role({
      id: "shell-desktop-icon",
      runtimeRoot: "assets/final/icons",
    }),
    role({
      id: "bitmap-font-atlas",
      runtimeRoot: "assets/final/fonts",
      runtimeFormat: "png-plus-fnt",
      stages: [
        "glyph-coverage-review",
        "godot-import",
        "native-text-legibility-review",
      ],
    }),
  ];
  const contract = {
    schemaVersion: "1.0",
    contract: "evavo_godot_media_production_contract_v1",
    repository: "EVAVO-STUDIO/GodotGameFoundationKit",
    projectId: "evavo-foundation-test",
    engine: {
      name: "Godot",
      minimumVersion: "4.6.2",
      renderingDomain: "2d",
      renderer: "compatibility",
      scripting: "gdscript",
    },
    product: {
      hub: "EVAVO Foundation Test",
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
    `png-source:${name}:icon`,
  );
  const font = writeSource(
    path.join(repository, "source_art/fonts/ui_font.png"),
    `png-source:${name}:font`,
  );
  const contractPath = path.join(
    repository,
    "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
  );
  const contractSha256 = writeJson(contractPath, contract);
  const items = [
    {
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
    },
    {
      sourcePath: "source_art/fonts/ui_font.png",
      sourceSha256: font.sha256,
      sourceBytes: font.bytes,
      sourceExtension: ".png",
      role: "bitmap-font-atlas",
      roleAuthority: "audit-role",
      runtimeRoot: "assets/final/fonts",
      runtimeFormat: "png-plus-fnt",
      runtimeTargetPath: "assets/final/fonts/ui_font.png",
      canvas: roles[1].canvas,
      alphaPolicy: roles[1].alphaPolicy,
      fitPolicy: roles[1].fitPolicy,
      godotImport: roles[1].godotImport,
      actions: ["retain-immutable-source-identity"],
      requiredStages: roles[1].requiredStages,
      blockers: [],
      reviewRequired: false,
      auditFindings: [],
    },
  ];
  const plan = {
    schemaVersion: "1.0",
    contract: "evavo_godot_media_production_plan_v1",
    repository: contract.repository,
    contractPath:
      "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
    contractSha256,
    auditRoot: fs.realpathSync.native(repository),
    auditSha256: "b".repeat(64),
    selectedRoles: roles.map((entry) => entry.id),
    summary: summaryFor(items),
    workItems: items,
    publicationAuthority: false,
    deletionAuthority: false,
    humanCreativeApprovalRequired: true,
  };
  const context = {
    scenarioRoot,
    repository,
    evidence,
    contract,
    roles,
    contractPath,
    plan,
    planPath: path.join(evidence, "media-plan.json"),
    output: path.join(evidence, "delivery-manifest.json"),
  };
  mutate(context);
  if (!fs.existsSync(context.contractPath)) {
    writeJson(context.contractPath, context.contract);
  }
  const currentContractSha = digest(fs.readFileSync(context.contractPath));
  if (!context.keepPlanContractSha) context.plan.contractSha256 = currentContractSha;
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

const expectFailure = (name, code, mutate, extra = []) => {
  const context = makeScenario(name, mutate);
  const result = run(context, extra);
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${name} did not report ${code}`,
  );
  assert.equal(fs.existsSync(context.output), false, `${name} created output`);
};

try {
  const ready = makeScenario("ready");
  const readyResult = run(ready);
  assert.equal(readyResult.status, 0, readyResult.stderr);
  const manifest = JSON.parse(fs.readFileSync(ready.output, "utf8"));
  assert.equal(manifest.schema, "evavo.art-delivery-optimization.v1");
  assert.match(manifest.batchId, /^foundation-[a-f0-9]{24}$/);
  assert.equal(manifest.project.id, "evavo-foundation-test");
  assert.equal(manifest.items.length, 2);
  assert.ok(
    manifest.items.every((item) => item.profileId === "godot-sprite-lossless"),
  );
  assert.ok(manifest.items.every((item) => item.background.mode === "preserve"));
  assert.equal(manifest.foundationAuthority.exactSourceBytesVerified, true);
  assert.equal(
    manifest.foundationAuthority.targetRepositoryMutationPerformed,
    false,
  );
  assert.equal(manifest.postDelivery.applyAuthorized, false);
  assert.equal(manifest.postDelivery.publicationAuthority, false);
  assert.deepEqual(
    manifest.postDelivery.items.find((item) => item.role === "bitmap-font-atlas")
      .sidecars,
    ["bitmap-font-metadata"],
  );
  const stdoutReceipt = JSON.parse(readyResult.stdout);
  assert.equal(stdoutReceipt.mutationPerformed, true);
  assert.equal(stdoutReceipt.mutationScope, "create-only-delivery-manifest");
  assert.equal(stdoutReceipt.targetRepositoryMutationPerformed, false);

  const filtered = makeScenario("filtered");
  const filteredResult = run(filtered, ["--role", "shell-desktop-icon"]);
  assert.equal(filteredResult.status, 0, filteredResult.stderr);
  const filteredManifest = JSON.parse(fs.readFileSync(filtered.output, "utf8"));
  assert.equal(filteredManifest.items.length, 1);
  assert.deepEqual(filteredManifest.foundationAuthority.selectedRoles, [
    "shell-desktop-icon",
  ]);

  expectFailure("blocked", "PLAN_ITEM_NOT_READY", (context) => {
    context.plan.workItems[0].blockers = ["manual-review-required"];
    context.plan.workItems[0].reviewRequired = true;
  });

  const tampered = makeScenario("tampered-source");
  fs.appendFileSync(
    path.join(tampered.repository, "source_art/icons/shell.png"),
    "tamper",
  );
  const tamperedResult = run(tampered);
  assert.notEqual(tamperedResult.status, 0);
  assert.match(tamperedResult.stderr, /SOURCE_BYTES_MISMATCH|SOURCE_SHA256_MISMATCH/);
  assert.equal(fs.existsSync(tampered.output), false);

  expectFailure("contract-hash", "PLAN_CONTRACT_SHA256_MISMATCH", (context) => {
    context.keepPlanContractSha = true;
    context.plan.contractSha256 = "c".repeat(64);
  });

  expectFailure("wrong-audit-root", "PLAN_AUDIT_ROOT_MISMATCH", (context) => {
    const other = path.join(context.scenarioRoot, "other-repository");
    fs.mkdirSync(other, { recursive: true });
    context.plan.auditRoot = fs.realpathSync.native(other);
  });

  expectFailure("target-collision", "RUNTIME_TARGET_COLLISION", (context) => {
    context.plan.workItems[1].runtimeRoot = "assets/final/icons";
    context.plan.workItems[1].runtimeFormat = "png-lossless";
    context.plan.workItems[1].runtimeTargetPath =
      context.plan.workItems[0].runtimeTargetPath;
    context.plan.workItems[1].role = "shell-desktop-icon";
    context.plan.workItems[1].alphaPolicy = context.roles[0].alphaPolicy;
    context.plan.workItems[1].fitPolicy = context.roles[0].fitPolicy;
    context.plan.workItems[1].requiredStages = context.roles[0].requiredStages;
    context.plan.selectedRoles = ["shell-desktop-icon"];
  });

  expectFailure("unsupported-format", "RUNTIME_FORMAT_UNSUPPORTED", (context) => {
    context.contract.roles[0].runtimeFormat = "avif";
    writeJson(context.contractPath, context.contract);
    context.plan.workItems[0].runtimeFormat = "avif";
    context.plan.workItems[0].runtimeTargetPath =
      "assets/final/icons/shell.avif";
  });

  expectFailure("output-inside-repository", "OUTPUT_INSIDE_REPOSITORY", (context) => {
    context.output = path.join(
      context.repository,
      "artifacts/production/delivery-manifest.json",
    );
    fs.mkdirSync(path.dirname(context.output), { recursive: true });
  });

  const existing = makeScenario("existing-output");
  fs.writeFileSync(existing.output, "existing");
  const existingResult = run(existing);
  assert.notEqual(existingResult.status, 0);
  assert.match(existingResult.stderr, /OUTPUT_EXISTS/);
  assert.equal(fs.readFileSync(existing.output, "utf8"), "existing");

  expectFailure("plan-inside-repository", "PLAN_INSIDE_REPOSITORY", (context) => {
    context.planPath = path.join(context.repository, "artifacts/media-plan.json");
    fs.mkdirSync(path.dirname(context.planPath), { recursive: true });
  });

  if (process.platform !== "win32") {
    const symlinked = makeScenario("symlinked-source");
    const actual = path.join(symlinked.repository, "source_art/icons/shell.png");
    const target = path.join(symlinked.repository, "source_art/icons/real-shell.png");
    fs.renameSync(actual, target);
    fs.symlinkSync(target, actual);
    const symlinkResult = run(symlinked);
    assert.notEqual(symlinkResult.status, 0);
    assert.match(symlinkResult.stderr, /SYMLINK_PATH_FORBIDDEN/);
    assert.equal(fs.existsSync(symlinked.output), false);
  }

  if (process.env.FOUNDATION_DELIVERY_REQUIRE_PACKAGE === "1") {
    const manifestModule = path.join(
      root,
      "packages/delivery-optimizer/dist/manifest.js",
    );
    assert.equal(
      fs.existsSync(manifestModule),
      true,
      "delivery optimizer must be built before authority validation",
    );
    const { validateDeliveryBatchManifest } = await import(
      pathToFileURL(manifestModule).href
    );
    const validated = validateDeliveryBatchManifest(manifest);
    assert.equal(validated.batchId, manifest.batchId);
    assert.equal(validated.items.length, manifest.items.length);
  }

  process.stdout.write(
    "Foundation delivery-manifest compiler tests passed.\n" +
      "- exact contract, plan and source-byte identities verified\n" +
      "- blocked, tampered, colliding and symlinked inputs fail before output\n" +
      "- emitted JSON is a delivery-optimizer-compatible create-only manifest\n" +
      "- selection, promotion and publication authority remain false\n",
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
