#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { canonicalJson } from "./project-art/intake.mjs";

import {
  python,
  run,
  sha256,
  verifySelfHash,
} from "./project-art/intake-test-support.mjs";

const py = python();
const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-project-art-intake-"));
try {
  const incoming = path.join(temporary, "incoming");
  await mkdir(incoming);
  const fixtureScript = [
    "from PIL import Image, ImageDraw",
    "from pathlib import Path",
    `root = Path(${JSON.stringify(incoming)})`,
    "for index, size in enumerate(((16, 20), (24, 12), (10, 30)), 1):",
    "    width, height = size",
    "    image = Image.new('RGBA', (width + 8, height + 8), (0, 0, 0, 0))",
    "    draw = ImageDraw.Draw(image)",
    "    draw.rectangle((4, 4, 3 + width, 3 + height), fill=(30 * index, 90, 180, 255))",
    "    draw.rectangle((6, 6, 8, 8), fill=(255, 255, 255, 128))",
    "    image.save(root / f'frame-{index}.png')",
  ].join("\n");
  run(py.executable, [...py.prefix, "-c", fixtureScript]);

  const intakeRequest = path.join(temporary, "intake-request.json");
  const intakePlan = path.join(temporary, "intake-plan.json");
  const workspace = path.join(temporary, "workspace");
  await writeFile(
    intakeRequest,
    `${JSON.stringify({
      schema: "evavo.project-art-intake-request.v1",
      sessionId: "chat-fixture-001",
      projectId: "test-game",
      createdBy: "chatgpt-test",
      allowedSourceRoots: [incoming],
      sources: [1, 2, 3].map((index) => ({
        id: `frame-${index}`,
        sourcePath: path.join(incoming, `frame-${index}.png`),
        origin: index === 1 ? "chat-upload" : "chat-generated",
        logicalPath: `characters/hero/idle/frame-${index}.png`,
        role: "sprite-frame",
      })),
      storage: {
        enabled: true,
        vaultId: "art",
        logicalPrefix: "Projects/TestGame/Art",
        tags: ["test-game", "sprite"],
      },
    }, null, 2)}\n`,
  );
  run(process.execPath, [
    "scripts/compile-project-art-intake.mjs",
    "--request",
    intakeRequest,
    "--output",
    intakePlan,
    "--compiled-at",
    "2026-08-09T08:00:00.000Z",
  ]);
  const plan = JSON.parse(await readFile(intakePlan, "utf8"));
  verifySelfHash(plan, "planSha256");
  assert.equal(plan.sources.length, 3);
  assert.equal(plan.authority.repositoryMutation, false);
  assert.equal(plan.bytesFlowThroughMcp, false);

  run(py.executable, [
    ...py.prefix,
    "tools/run_project_art_intake.py",
    "--plan",
    intakePlan,
    "--output-root",
    workspace,
  ]);
  const receipt = JSON.parse(
    await readFile(path.join(workspace, "manifests", "intake-receipt.json"), "utf8"),
  );
  verifySelfHash(receipt, "receiptSha256");
  assert.equal(receipt.sourceCount, 3);
  assert.equal(receipt.storageWrite, false);
  assert.equal(receipt.repositoryMutation, false);
  for (const asset of receipt.assets) {
    const original = await readFile(path.join(workspace, asset.original.path));
    const working = await readFile(path.join(workspace, asset.working.path));
    assert.deepEqual(working, original);
    assert.equal(sha256(original), asset.source.contentSha256);
    assert.equal(asset.image.inspection, "decoded");
  }
  const handoff = JSON.parse(
    await readFile(path.join(workspace, "manifests", "storage-handoff.json"), "utf8"),
  );
  verifySelfHash(handoff, "requestSha256");
  assert.equal(handoff.schema, "evavo.storage-art-ingest-request.v1");
  assert.equal(handoff.items.length, 3);
  assert.equal(handoff.authority.storageWrite, false);
  assert.equal(handoff.bytesFlowThroughMcp, false);

  run(py.executable, [
    ...py.prefix,
    "tools/run_project_art_intake.py",
    "--plan",
    intakePlan,
    "--output-root",
    workspace,
  ], { expectFailure: true });

  const atlasRequest = path.join(temporary, "atlas-request.json");
  const atlasPlan = path.join(temporary, "atlas-plan.json");
  const atlasRoot = path.join(temporary, "atlas");
  await writeFile(
    atlasRequest,
    `${JSON.stringify({
      schema: "evavo.project-art-atlas-request.v1",
      atlasId: "hero-idle",
      projectId: "test-game",
      outputName: "hero-idle",
      allowedSourceRoots: [path.join(workspace, "working")],
      frames: [1, 2, 3].map((index) => ({
        id: `hero/idle/${String(index).padStart(2, "0")}`,
        sourcePath: path.join(
          workspace,
          "working",
          "characters",
          "hero",
          "idle",
          `frame-${index}.png`,
        ),
      })),
      options: {
        trimAlpha: true,
        padding: 2,
        margin: 2,
        extrude: 1,
        powerOfTwo: true,
        maximumWidth: 256,
        maximumHeight: 256,
      },
    }, null, 2)}\n`,
  );
  run(process.execPath, [
    "scripts/compile-project-art-atlas.mjs",
    "--request",
    atlasRequest,
    "--output",
    atlasPlan,
    "--compiled-at",
    "2026-08-09T08:01:00.000Z",
  ]);
  const compiledAtlas = JSON.parse(await readFile(atlasPlan, "utf8"));
  verifySelfHash(compiledAtlas, "planSha256");
  run(py.executable, [
    ...py.prefix,
    "tools/build_project_art_atlas.py",
    "--plan",
    atlasPlan,
    "--output-root",
    atlasRoot,
  ]);
  const atlasReceipt = JSON.parse(
    await readFile(path.join(atlasRoot, "hero-idle.receipt.json"), "utf8"),
  );
  verifySelfHash(atlasReceipt, "receiptSha256");
  assert.equal(atlasReceipt.frameCount, 3);
  assert.equal(atlasReceipt.repositoryMutation, false);
  assert.equal(atlasReceipt.size.width & (atlasReceipt.size.width - 1), 0);
  assert.equal(atlasReceipt.size.height & (atlasReceipt.size.height - 1), 0);
  const atlasManifest = JSON.parse(
    await readFile(path.join(atlasRoot, "hero-idle.atlas.json"), "utf8"),
  );
  verifySelfHash(atlasManifest, "manifestSha256");
  assert.equal(Object.keys(atlasManifest.frames).length, 3);
  const regions = Object.values(atlasManifest.frames).map((entry) => entry.frame);
  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
      const left = regions[leftIndex];
      const right = regions[rightIndex];
      const overlap = !(
        left.x + left.w <= right.x ||
        right.x + right.w <= left.x ||
        left.y + left.h <= right.y ||
        right.y + right.h <= left.y
      );
      assert.equal(overlap, false);
    }
  }

  const tamperedPlan = path.join(temporary, "tampered-plan.json");
  const tampered = structuredClone(plan);
  tampered.sources[0].contentSha256 = "0".repeat(64);
  delete tampered.planSha256;
  tampered.planSha256 = sha256(canonicalJson(tampered));
  await writeFile(tamperedPlan, `${JSON.stringify(tampered, null, 2)}\n`);
  run(py.executable, [
    ...py.prefix,
    "tools/run_project_art_intake.py",
    "--plan",
    tamperedPlan,
    "--output-root",
    path.join(temporary, "tampered-output"),
  ], { expectFailure: true });

  if (process.platform !== "win32") {
    const linked = path.join(temporary, "linked-frame.png");
    await symlink(path.join(incoming, "frame-1.png"), linked);
    const linkedRequest = path.join(temporary, "linked-request.json");
    await writeFile(
      linkedRequest,
      `${JSON.stringify({
        schema: "evavo.project-art-intake-request.v1",
        sessionId: "chat-fixture-link",
        projectId: "test-game",
        createdBy: "test",
        allowedSourceRoots: [temporary],
        sources: [{
          id: "linked",
          sourcePath: linked,
          origin: "local-file",
          logicalPath: "linked.png",
        }],
      }, null, 2)}\n`,
    );
    run(process.execPath, [
      "scripts/compile-project-art-intake.mjs",
      "--request",
      linkedRequest,
      "--output",
      path.join(temporary, "linked-plan.json"),
    ], { expectFailure: true });
  }

  console.log("Project-art chat intake and atlas regressions passed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
