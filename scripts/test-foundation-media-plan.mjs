#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(root, "scripts", "compile-foundation-media-plan.mjs");
const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "evavo-foundation-plan-"),
);
const repository = path.join(workspace, "GodotGameFoundationKit");
const evidenceRoot = path.join(workspace, "evidence");

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
  roots: {
    runtime: [
      "examples/playable_foundation_hub/assets/final",
      "examples/shared/audio/final",
    ],
  },
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

const imageRow = (
  filePath = "source_art/hub/icons/godz_icon.png",
  { alphaUsage = "meaningful", sha256 = "a".repeat(64) } = {},
) => ({
  path: filePath,
  sizeBytes: 256,
  extension: ".png",
  category: "image",
  sha256,
  role: "ui-icon",
  transparencyPolicy: "require-meaningful-alpha",
  image: {
    format: "png",
    width: 32,
    height: 32,
    hasAlphaChannel: true,
    alphaUsage,
    probeComplete: true,
    warnings: [],
  },
  referencedBy: [],
  referenceCount: 0,
  optimization: {
    masterFormat: "png",
    runtimeFormat: "png-lossless",
    compression: "lossless",
    allowUpscale: false,
    notes: [],
  },
  findings: [],
});

const audit = ({
  rootPath = repository,
  rows = [imageRow()],
  truncated = false,
} = {}) => ({
  schemaVersion: "1.0",
  analysisVersion: "1.0",
  root: rootPath,
  engine: "godot",
  truncated,
  artFiles: rows,
});

const defaultContractPath = path.join(
  repository,
  "examples/playable_foundation_hub/data/foundation_kit_media_production_contract_v1.json",
);

const run = ({
  strict = false,
  auditValue = audit(),
  outputName,
  contractValue = contract,
  contractPath = defaultContractPath,
  outputPath,
  roles = ["shell-desktop-icon"],
}) => {
  const auditPath = path.join(evidenceRoot, `${outputName}-audit.json`);
  const output =
    outputPath ?? path.join(evidenceRoot, `${outputName}-plan.json`);
  canonical(defaultContractPath, contractValue);
  if (contractPath !== defaultContractPath && !fs.existsSync(contractPath)) {
    canonical(contractPath, contractValue);
  }
  canonical(auditPath, auditValue);
  const args = [
    compiler,
    "--repo",
    repository,
    "--contract",
    contractPath,
    "--audit",
    auditPath,
    "--output",
    output,
  ];
  for (const role of roles) args.push("--role", role);
  if (strict) args.push("--strict");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return { result, output };
};

const expectFailure = (execution, token, label) => {
  if (execution.result.status === 0 || fs.existsSync(execution.output)) {
    throw new Error(`${label}_ACCEPTED`);
  }
  if (!execution.result.stderr.includes(token)) {
    throw new Error(`${label}_NOT_DIAGNOSED:${execution.result.stderr}`);
  }
};

try {
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(evidenceRoot, { recursive: true });
  canonical(path.join(repository, "project.godot"), {});

  const ready = run({
    strict: true,
    auditValue: audit(),
    outputName: "ready",
  });
  if (ready.result.status !== 0 || !fs.existsSync(ready.output)) {
    throw new Error(`READY_PLAN_FAILED:${ready.result.stderr}`);
  }
  const plan = JSON.parse(fs.readFileSync(ready.output, "utf8"));
  const receipt = JSON.parse(ready.result.stdout);
  if (
    plan.contract !== "evavo_godot_media_production_plan_v1" ||
    plan.repository !== "EVAVO-STUDIO/GodotGameFoundationKit" ||
    plan.auditRoot !== fs.realpathSync.native(repository) ||
    plan.summary.workItems !== 1 ||
    plan.summary.blocked !== 0 ||
    plan.workItems[0].role !== "shell-desktop-icon" ||
    plan.workItems[0].runtimeTargetPath !==
      "examples/playable_foundation_hub/assets/final/icons/godz_icon.png" ||
    plan.publicationAuthority !== false ||
    plan.deletionAuthority !== false ||
    plan.humanCreativeApprovalRequired !== true ||
    receipt.planFileCreated !== true ||
    receipt.mutationPerformed !== true ||
    receipt.mutationScope !== "create-only-plan-file" ||
    receipt.targetRepositoryMutationPerformed !== false
  ) {
    throw new Error("READY_PLAN_CONTRACT_INVALID");
  }

  expectFailure(
    run({
      strict: true,
      auditValue: audit({
        rows: [imageRow(undefined, { alphaUsage: "opaque-channel" })],
      }),
      outputName: "blocked-alpha",
    }),
    "STRICT_PLAN_NOT_READY",
    "STRICT_ALPHA_BLOCKER",
  );

  const planning = run({
    auditValue: audit({
      rows: [imageRow(undefined, { alphaUsage: "opaque-channel" })],
    }),
    outputName: "planning",
  });
  if (planning.result.status !== 0 || !fs.existsSync(planning.output)) {
    throw new Error(`PLANNING_MODE_FAILED:${planning.result.stderr}`);
  }
  const planningPlan = JSON.parse(
    fs.readFileSync(planning.output, "utf8"),
  );
  if (
    planningPlan.summary.blocked !== 1 ||
    planningPlan.summary.reviewRequired !== 1 ||
    !planningPlan.workItems[0].blockers.includes(
      "meaningful-alpha-required",
    )
  ) {
    throw new Error("PLANNING_BLOCKER_EVIDENCE_INVALID");
  }

  const otherRepository = path.join(workspace, "WrongRepository");
  fs.mkdirSync(otherRepository, { recursive: true });
  canonical(path.join(otherRepository, "project.godot"), {});
  expectFailure(
    run({
      auditValue: audit({ rootPath: otherRepository }),
      outputName: "wrong-root",
    }),
    "AUDIT_ROOT_MISMATCH",
    "AUDIT_ROOT_MISMATCH",
  );

  expectFailure(
    run({
      auditValue: audit({
        rows: [imageRow(undefined, { sha256: "not-a-sha" })],
      }),
      outputName: "bad-sha",
    }),
    "AUDIT_ROW_SHA256_INVALID",
    "MALFORMED_AUDIT_SHA",
  );

  const insideRepository = path.join(
    repository,
    "artifacts",
    "inside-repository-plan.json",
  );
  fs.mkdirSync(path.dirname(insideRepository), { recursive: true });
  expectFailure(
    run({
      auditValue: audit(),
      outputName: "inside-repository",
      outputPath: insideRepository,
    }),
    "OUTPUT_INSIDE_REPOSITORY",
    "TARGET_REPOSITORY_OUTPUT",
  );

  const collision = run({
    auditValue: audit({
      rows: [
        imageRow("source_art/hub/icons/shared.png", {
          sha256: "b".repeat(64),
        }),
        imageRow("source_art/alternate/shared.png", {
          sha256: "c".repeat(64),
        }),
      ],
    }),
    outputName: "collision",
  });
  if (collision.result.status !== 0 || !fs.existsSync(collision.output)) {
    throw new Error(`COLLISION_PLAN_FAILED:${collision.result.stderr}`);
  }
  const collisionPlan = JSON.parse(
    fs.readFileSync(collision.output, "utf8"),
  );
  if (
    collisionPlan.summary.blocked !== 2 ||
    collisionPlan.summary.blockerCounts["runtime-target-collision"] !== 2 ||
    collisionPlan.workItems.some(
      (item) => !item.blockers.includes("runtime-target-collision"),
    )
  ) {
    throw new Error("COLLISION_DID_NOT_BLOCK_ALL_MEMBERS");
  }

  const reserved = run({
    auditValue: audit({
      rows: [
        imageRow("source_art/hub/icons/con.png", {
          sha256: "d".repeat(64),
        }),
      ],
    }),
    outputName: "windows-reserved",
  });
  if (reserved.result.status !== 0 || !fs.existsSync(reserved.output)) {
    throw new Error(`RESERVED_PLAN_FAILED:${reserved.result.stderr}`);
  }
  const reservedPlan = JSON.parse(fs.readFileSync(reserved.output, "utf8"));
  if (
    reservedPlan.summary.blocked !== 1 ||
    !reservedPlan.workItems[0].blockers.includes(
      "windows-reserved-runtime-name",
    )
  ) {
    throw new Error("WINDOWS_RESERVED_RUNTIME_NAME_ACCEPTED");
  }

  const invalidContract = structuredClone(contract);
  delete invalidContract.roles[0].canvas.height;
  expectFailure(
    run({
      contractValue: invalidContract,
      auditValue: audit(),
      outputName: "invalid-contract",
    }),
    "POSITIVE_INTEGER_INVALID",
    "INVALID_EXACT_CANVAS",
  );

  if (process.platform !== "win32") {
    const realContract = path.join(
      repository,
      "examples/playable_foundation_hub/data/real-contract.json",
    );
    const linkedContract = path.join(
      repository,
      "examples/playable_foundation_hub/data/linked-contract.json",
    );
    canonical(realContract, contract);
    fs.symlinkSync(realContract, linkedContract);
    expectFailure(
      run({
        contractPath: linkedContract,
        auditValue: audit(),
        outputName: "symlink-contract",
      }),
      "SYMLINK_PATH_FORBIDDEN",
      "SYMLINKED_CONTRACT",
    );
  }

  process.stdout.write(
    "Foundation media-plan compiler tests passed.\n" +
      "- exact repository and audit roots are bound\n" +
      "- malformed source identities and symlinked authorities fail closed\n" +
      "- strict alpha blockers fail before output\n" +
      "- every runtime collision member is blocked\n" +
      "- output cannot mutate the target repository\n" +
      "- create-only plan-file mutation is reported truthfully\n",
  );
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
