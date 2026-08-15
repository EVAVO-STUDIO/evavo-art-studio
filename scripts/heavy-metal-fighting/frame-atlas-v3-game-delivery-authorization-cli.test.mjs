import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_CLI_REQUEST_SCHEMA,
  preflightHmfAtlasV3DeliveryAuthorizationPlanPaths,
  readHmfAtlasV3StableSingleLinkFile,
} from "./frame-atlas-v3-game-delivery-authorization-cli.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(HERE, "..", "heavy-metal-fighting-frame-atlas-v3.mjs");

async function withTemp(prefix, callback) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function planFixture(root, frameId = "bastion") {
  const sourceRoot = path.join(root, "masters", "frames", frameId, "sprites");
  const sources = Array.from({ length: 224 }, (_, index) => {
    const name = `${frameId}-source-${String(index).padStart(3, "0")}.png`;
    return {
      masterRelativePath: `masters/frames/${frameId}/sprites/${name}`,
      sourcePath: path.join(sourceRoot, name),
    };
  });
  return {
    frameId,
    workspaceRoot: root,
    allowedSourceRoot: sourceRoot,
    outputs: {
      image: `${frameId}.png`,
      receipt: `${frameId}.atlas-v3.receipt.json`,
      recommendedWorkspaceParent: `exports/runtime/frames/${frameId}`,
    },
    sources,
  };
}

test("stable authorization CLI reader admits one regular single-link file", async () => {
  await withTemp("hmf-auth-cli-regular-", async (root) => {
    const file = path.join(root, "evidence.json");
    writeFileSync(file, "{\"ok\":true}\n");
    const bytes = await readHmfAtlasV3StableSingleLinkFile(file, {
      label: "evidence",
      maximumBytes: 1024,
    });
    assert.equal(bytes.toString("utf8"), "{\"ok\":true}\n");
  });
});

test("stable authorization CLI reader rejects symbolic and multiply-linked evidence", { skip: process.platform === "win32" }, async () => {
  await withTemp("hmf-auth-cli-links-", async (root) => {
    const target = path.join(root, "target.json");
    writeFileSync(target, "{}\n");
    const symbolic = path.join(root, "symbolic.json");
    symlinkSync(target, symbolic);
    await assert.rejects(
      readHmfAtlasV3StableSingleLinkFile(symbolic, { label: "evidence", maximumBytes: 1024 }),
      /symbolic link or junction/,
    );

    const linked = path.join(root, "linked.json");
    linkSync(target, linked);
    await assert.rejects(
      readHmfAtlasV3StableSingleLinkFile(target, { label: "evidence", maximumBytes: 1024 }),
      /exactly one filesystem link/,
    );
  });
});

test("plan path preflight confines all 224 source reads to the canonical Frame source root", async () => {
  await withTemp("hmf-auth-cli-plan-", async (root) => {
    const plan = planFixture(root);
    const result = preflightHmfAtlasV3DeliveryAuthorizationPlanPaths(plan, "bastion");
    assert.equal(result.sourcePaths.length, 224);
    assert.ok(result.sourcePaths.every((sourcePath) => sourcePath.startsWith(result.expectedSourceRoot)));

    const escaped = structuredClone(plan);
    escaped.sources[13].masterRelativePath = "../outside.png";
    escaped.sources[13].sourcePath = path.join(root, "outside.png");
    assert.throws(
      () => preflightHmfAtlasV3DeliveryAuthorizationPlanPaths(escaped, "bastion"),
      /masterRelativePath is unsafe/,
    );
  });
});

test("real CLI routes authorize-game-delivery through the closed request manifest", async () => {
  await withTemp("hmf-auth-cli-route-", async (root) => {
    const requestPath = path.join(root, "request.json");
    writeFileSync(requestPath, `${JSON.stringify({
      schema: `${HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_CLI_REQUEST_SCHEMA}.drift`,
      expectedGameHead: "1".repeat(40),
      gameValidationAdmissionPath: "validation-admission.json",
      gameValidationReceiptPath: "validation-receipt.json",
      humanAuthorizationPath: "human-authorization.json",
      frames: ["bastion", "viper", "citadel", "mirage"].map((frameId) => ({
        frameId,
        planPath: `${frameId}.plan.json`,
        buildRoot: `${frameId}-build`,
      })),
    }, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [CLI_PATH, "authorize-game-delivery", "--request", requestPath],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /request schema drifted/);
  });
});

test("real CLI requires exactly one --request argument", () => {
  const result = spawnSync(process.execPath, [CLI_PATH, "authorize-game-delivery"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires exactly --request/);
});
