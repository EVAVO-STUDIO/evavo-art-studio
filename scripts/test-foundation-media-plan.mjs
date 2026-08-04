#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(root, "scripts", "compile-foundation-media-plan.mjs");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-foundation-plan-"));

const canonical = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const source = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, source, "utf8");
  return createHash("sha256").update(source).digest("hex");
};

const contract = {
  schemaVersion: "1.0",
  contract: "evavo_godot_media_production_contract_v1",
  repository: "EVAVO-STUDIO/GodotGameFoundationKit",
  engine: { name: "Godot", minimumVersion: "4.6.2" },
  roles: [
    {
      id: "shell-desktop-icon",
      auditRoles: ["ui-icon"],
      pathTokens: ["/hub/icons/"],
      runtimeRoot: "examples/playable_foundation_hub/assets/final/icons",
      canvas: {
        policy: "exact",
        width: 32,
        height: 32,
        upscaleAllowed: false,
        cropAllowed: false,
      },
      alphaPolicy: "require-meaningful-alpha",
      fitPolicy: "contain_no_crop",
      runtimeFormat: "png-lossless",
      godotImport: {
        mipmaps: false,
        compression: "lossless",
        filter: "nearest",
        fixAlphaBorder: true,
        premultipliedAlpha: false,
      },
      requiredStages: [
        "small-size-readability-review",
        "godot-import",
        "native-shell-review",
      ],
    },
    {
      id: "music-loop",
      auditRoles: ["audio"],
      pathTokens: ["/audio/music/"],
      runtimeRoot: "examples/shared/audio/final/music",
      canvas: null,
      alphaPolicy: "not-applicable",
      fitPolicy: "not-applicable",
      runtimeFormat: "ogg-vorbis-streaming",
      requiredStages: [
        "loudness-and-true-peak-audit",
        "godot-import",
        "human-listening-approval",
      ],
    },
  ],
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

const audit = (alphaUsage = "meaningful") => ({
  schemaVersion: "1.0",
  analysisVersion: "1.0",
  root: workspace,
  engine: "godot",
  truncated: false,
  artFiles: [
    {
      path: "source_art/hub/icons/godz_icon.png",
      sizeBytes: 256,
      extension: ".png",
      sha256: "a".repeat(64),
      role: "ui-icon",
      image: {
        width: 32,
        height: 32,
        alphaUsage,
      },
      findings: [],
    },
  ],
});

const run = ({ strict, auditValue, outputName }) => {
  const repo = path.join(workspace, "GodotGameFoundationKit");
  const contractPath = path.join(
    repo,
    "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
  );
  const auditPath = path.join(workspace, `${outputName}-audit.json`);
  const output = path.join(workspace, `${outputName}-plan.json`);
  canonical(path.join(repo, "project.godot"), {});
  canonical(contractPath, contract);
  canonical(auditPath, auditValue);
  const args = [
    compiler,
    "--repo",
    repo,
    "--contract",
    contractPath,
    "--audit",
    auditPath,
    "--output",
    output,
    "--role",
    "shell-desktop-icon",
  ];
  if (strict) args.push("--strict");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return { result, output };
};

try {
  const ready = run({
    strict: true,
    auditValue: audit("meaningful"),
    outputName: "ready",
  });
  if (ready.result.status !== 0 || !fs.existsSync(ready.output)) {
    throw new Error(`READY_PLAN_FAILED:${ready.result.stderr}`);
  }
  const plan = JSON.parse(fs.readFileSync(ready.output, "utf8"));
  if (
    plan.contract !== "evavo_godot_media_production_plan_v1" ||
    plan.repository !== "EVAVO-STUDIO/GodotGameFoundationKit" ||
    plan.summary.workItems !== 1 ||
    plan.summary.blocked !== 0 ||
    plan.workItems[0].role !== "shell-desktop-icon" ||
    plan.workItems[0].runtimeTargetPath !==
      "examples/playable_foundation_hub/assets/final/icons/godz_icon.png" ||
    plan.publicationAuthority !== false ||
    plan.deletionAuthority !== false ||
    plan.humanCreativeApprovalRequired !== true
  ) {
    throw new Error("READY_PLAN_CONTRACT_INVALID");
  }

  const blocked = run({
    strict: true,
    auditValue: audit("opaque-channel"),
    outputName: "blocked",
  });
  if (blocked.result.status === 0 || fs.existsSync(blocked.output)) {
    throw new Error("STRICT_ALPHA_BLOCKER_ACCEPTED");
  }
  if (!blocked.result.stderr.includes("STRICT_PLAN_NOT_READY")) {
    throw new Error("STRICT_ALPHA_BLOCKER_NOT_DIAGNOSED");
  }

  const planning = run({
    strict: false,
    auditValue: audit("opaque-channel"),
    outputName: "planning",
  });
  if (planning.result.status !== 0 || !fs.existsSync(planning.output)) {
    throw new Error("PLANNING_MODE_FAILED");
  }
  const planningPlan = JSON.parse(fs.readFileSync(planning.output, "utf8"));
  if (
    planningPlan.summary.blocked !== 1 ||
    planningPlan.summary.reviewRequired !== 1 ||
    !planningPlan.workItems[0].blockers.includes("meaningful-alpha-required")
  ) {
    throw new Error("PLANNING_BLOCKER_EVIDENCE_INVALID");
  }

  process.stdout.write(
    "Foundation media-plan compiler tests passed.\n" +
      "- exact contract and audit identities retained\n" +
      "- strict alpha blocker fails before output\n" +
      "- planning mode retains explicit review work\n",
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
