import assert from "node:assert/strict";
import { mkdtemp, mkdir, lstat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  heavyMetalFightingBatchPolicy,
  heavyMetalFightingStyleContract,
  heavyMetalFightingWorkspaceLayout,
  materializeHmfArtProductionWorkspace,
  verifyHmfArtProductionWorkspace,
} from "./art-production-workspace.mjs";

const ROOTS = ["sources","working","versions","masks","scratch","review","masters","exports","manifests","journals"];

test("HEAVY METAL FIGHTING workspace nests inside the persistent Artist Workspace contract", async () => {
  const layout = await heavyMetalFightingWorkspaceLayout();
  assert.equal(layout.projectId, "heavy-metal-fighting");
  assert.deepEqual(layout.roots, ROOTS);
  assert.ok(layout.directoryCount > 200);
  for (const pilot of ["branka-kovac","miho-tagawa","esi-quartey","parvaneh-razi"]) {
    assert.ok(layout.directories.includes(`working/pilots/${pilot}/identity`));
    assert.ok(layout.directories.includes(`review/pilots/${pilot}`));
  }
  for (const frame of ["bastion","viper","citadel","mirage"]) {
    for (const group of ["neutral-locomotion","defence-reactions","throws","normals","specials-overdrive","core-entrance-result"]) {
      assert.ok(layout.directories.includes(`working/frames/${frame}/sprites/${group}`));
    }
    assert.ok(layout.directories.includes(`masters/frames/${frame}`));
  }
  for (const arena of ["foundry-nine","reactor-spine","orbital-dock","ash-citadel"]) {
    assert.ok(layout.directories.includes(`working/arenas/${arena}/play-plane`));
  }
  assert.equal(new Set(layout.directories).size, layout.directories.length);
  assert.ok(layout.directories.every((entry) => ROOTS.includes(entry.split("/")[0])));
});

test("style contract fails generic AI habits before promotion", async () => {
  const style = await heavyMetalFightingStyleContract();
  assert.equal(style.pixelGrammar.finalFrameCell.width, 160);
  assert.equal(style.pixelGrammar.finalFrameCell.height, 160);
  assert.deepEqual(style.pixelGrammar.pivot, {x:80,y:152});
  assert.ok(style.antiGenericFailureCodes.includes("random-greebles"));
  assert.ok(style.antiGenericFailureCodes.includes("weapon-side-drift"));
  assert.ok(style.antiGenericFailureCodes.includes("pilot-face-drift"));
  assert.ok(style.antiGenericFailureCodes.includes("generated-or-malformed-text"));
  assert.ok(style.antiGenericFailureCodes.includes("modern-pbr-gloss"));
  assert.ok(style.antiGenericFailureCodes.includes("provider-packed-final-atlas"));
  assert.match(style.animationGrammar.principle, /few excellent drawings/i);
  assert.equal(style.authority.providerMayDefineStyle, false);
  assert.equal(style.authority.namedHumanApprovalRequired, true);
});

test("ten-image policy covers every final Frame body cel without padding or mixed identity", async () => {
  const policy = await heavyMetalFightingBatchPolicy();
  assert.equal(policy.maximumImagesPerBatch, 10);
  assert.equal(policy.paddingForbidden, true);
  assert.equal(policy.contactSheetsForbidden, true);
  assert.equal(policy.providerPackedAtlasesForbidden, true);
  assert.equal(policy.frameAnimationProductionGroups.reduce((sum, group) => sum + group.celsPerFrame, 0), 224);
  assert.equal(policy.derived.bodyBatchesPerFrame, 26);
  assert.equal(policy.derived.bodyAnimationBatches, 104);
  assert.equal(policy.supportingFamilyPacking.reduce((sum, family) => sum + family.sourceImages, 0), 677);
  assert.equal(policy.derived.supportingBatches, 75);
  assert.equal(policy.derived.minimumGovernedBatches, 179);
  assert.equal(policy.derived.theoreticalUncontainedMinimumBatches, 158);
  assert.equal(policy.authority.automaticPromotion, false);
});

test("workspace materialization creates only governed subdirectories inside an existing persistent workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-art-workspace-"));
  try {
    for (const directory of ROOTS) await mkdir(path.join(root, directory));
    const receipt = await materializeHmfArtProductionWorkspace(root);
    assert.equal(receipt.status, "passed");
    assert.ok(receipt.createdDirectories > 0);
    for (const relative of [
      "working/style/style-proof",
      "working/frames/bastion/sprites/normals",
      "working/pilots/branka-kovac/overdrive",
      "working/arenas/foundry-nine/play-plane",
      "manifests/batches",
      "review/stage-composites",
      "exports/runtime/frames/bastion"
    ]) {
      const metadata = await lstat(path.join(root, ...relative.split("/")));
      assert.equal(metadata.isDirectory(), true);
      assert.equal(metadata.isSymbolicLink(), false);
    }
    const second = await materializeHmfArtProductionWorkspace(root);
    assert.equal(second.createdDirectories, 0);
  } finally {
    await rm(root, {recursive:true,force:true});
  }
});

test("workspace verification binds the 1573-image census to the style and batch contracts", async () => {
  const verification = await verifyHmfArtProductionWorkspace();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.batchSummary.bodyAnimationBatches, 104);
  assert.equal(verification.batchSummary.minimumGovernedBatches, 179);
});
