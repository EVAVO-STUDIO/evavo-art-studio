import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const artRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(artRoot, "scripts", "compile-eva-idle-canonical-profile.mjs");

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function sha(data) {
  return createHash("sha256").update(data).digest("hex");
}
function candidateRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eva-idle-profile-runtime-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "test@evavo.invalid"]);
  runGit(root, ["config", "user.name", "EVAVO Test"]);
  const dir = path.join(root, "assets/eva-female/candidates");
  fs.mkdirSync(dir, { recursive: true });
  const assetPath = path.join(dir, "eva-female-animation-master-v1.alpha.png");
  const bytes = Buffer.from("fixture-eva-alpha-png-bytes");
  fs.writeFileSync(assetPath, bytes);
  const assetSha = sha(bytes);
  const manifest = {
    schema: "evavo.avatar.eva-animation-master-candidate.v1",
    characterId: "eva-female",
    asset: {
      path: "assets/eva-female/candidates/eva-female-animation-master-v1.alpha.png",
      mediaType: "image/png",
      format: "png",
      width: 1024,
      height: 1536,
      bytes: bytes.length,
      sha256: assetSha,
      alpha: "rgba8-straight",
    },
    lifecycle: {
      approvalState: "unapproved",
      productionReady: false,
      runtimeActivationEligible: false,
      maySeedAnimationGeneration: true,
    },
    authority: {
      candidateApproval: false,
      productionPromotion: false,
      providerExecution: false,
      sourceMutation: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      runtimeActivation: false,
      publication: false,
      deployment: false,
    },
  };
  const manifestPath = path.join(dir, "eva-female-animation-master-v1.alpha.candidate.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "fixture EVA master"]);
  return { root, assetPath, assetSha };
}
function invoke(runtime, outputRoot) {
  return spawnSync(process.execPath, [
    cli,
    "--runtime-root", runtime,
    "--profile-output", path.join(outputRoot, "idle-profile.json"),
    "--references-output", path.join(outputRoot, "base-references.json"),
  ], { encoding: "utf8", windowsHide: true });
}

test("compiles approved idle work profile from exact committed unapproved EVA master", () => {
  const fixture = candidateRepo();
  const output = path.join(fixture.root, "out");
  const result = invoke(fixture.root, output);
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(fs.readFileSync(path.join(output, "idle-profile.json"), "utf8"));
  const refs = JSON.parse(fs.readFileSync(path.join(output, "base-references.json"), "utf8"));
  assert.equal(profile.clipId, "idle-primary");
  assert.equal(profile.plan.request.state, "approved");
  assert.equal(profile.plan.quality.promotable, true);
  assert.equal(profile.request.subject.identityReferenceArtifactId, `artifact_${fixture.assetSha}`);
  assert.deepEqual(refs, [{
    artifactId: `artifact_${fixture.assetSha}`,
    contentDigest: `sha256:${fixture.assetSha}`,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
  }]);
  assert.deepEqual(profile.plan.drawings.map((entry) => entry.poseId), ["rest", "inhale", "exhale", "settle"]);
});

test("fails closed if candidate asset changed after Runtime HEAD", () => {
  const fixture = candidateRepo();
  fs.appendFileSync(fixture.assetPath, "dirty");
  const result = invoke(fixture.root, path.join(fixture.root, "out-dirty"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /working-tree bytes do not match Avatar Runtime HEAD/u);
});

test("profile and reference outputs are create-only", () => {
  const fixture = candidateRepo();
  const output = path.join(fixture.root, "out");
  assert.equal(invoke(fixture.root, output).status, 0);
  const second = invoke(fixture.root, output);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /EEXIST|exist/u);
});
