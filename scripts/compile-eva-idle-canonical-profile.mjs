#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { compileEvaCanonicalProfileBundle } from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";

const CANDIDATE_SCHEMA = "evavo.avatar.eva-animation-master-candidate.v1";
const SHA = /^[a-f0-9]{64}$/u;

function usage() {
  return [
    "Usage: node scripts/compile-eva-idle-canonical-profile.mjs",
    "  --runtime-root <evavo-avatar-runtime checkout>",
    "  --profile-output <create-only idle profile entry JSON>",
    "  --references-output <create-only base reference bindings JSON>",
    "  [--candidate-manifest <repo-relative candidate manifest>]",
    "",
    "The EVA animation-master asset and manifest must already be committed at Avatar Runtime HEAD.",
    "This approves the deterministic production profile shape only; it does not approve or promote media.",
  ].join("\n");
}

function parse(argv) {
  const options = { candidateManifest: "assets/eva-female/candidates/eva-female-animation-master-v1.alpha.candidate.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") return { help: true };
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${token}`);
    if (token === "--runtime-root") options.runtimeRoot = value;
    else if (token === "--profile-output") options.profileOutput = value;
    else if (token === "--references-output") options.referencesOutput = value;
    else if (token === "--candidate-manifest") options.candidateManifest = value;
    else throw new Error(`unknown option ${token}`);
    i += 1;
  }
  return options;
}

function shaBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function shaFile(filePath) {
  return shaBytes(fs.readFileSync(filePath));
}
function git(root, args, { binary = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    shell: false,
    windowsHide: true,
    encoding: binary ? null : "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = binary ? "" : String(result.stderr || "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return binary ? result.stdout : String(result.stdout).trim();
}
function regularDir(value, label) {
  const absolute = path.resolve(value);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symbolic directory`);
  return absolute;
}
function repoPath(root, relative, label) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || path.posix.isAbsolute(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} path is invalid`);
  }
  const absolute = path.resolve(root, ...relative.split("/"));
  const back = path.relative(root, absolute).split(path.sep).join("/");
  if (back !== relative) throw new Error(`${label} escaped Avatar Runtime checkout`);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is missing or symbolic`);
  return absolute;
}
function verifyCommitted(root, relative, localPath, label) {
  const headBytes = git(root, ["show", `HEAD:${relative}`], { binary: true });
  const localBytes = fs.readFileSync(localPath);
  if (!Buffer.isBuffer(headBytes) || !headBytes.equals(localBytes)) {
    throw new Error(`${label} working-tree bytes do not match Avatar Runtime HEAD`);
  }
  return shaBytes(localBytes);
}
async function createOnly(filePath, value) {
  const absolute = path.resolve(filePath);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  const handle = await fsp.open(absolute, "wx");
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
  finally { await handle.close(); }
  return absolute;
}
function candidate(value) {
  if (!value || value.schema !== CANDIDATE_SCHEMA || value.characterId !== "eva-female" || !value.asset || !value.lifecycle) {
    throw new Error("committed EVA animation-master candidate manifest is invalid");
  }
  if (value.asset.mediaType !== "image/png" || value.asset.format !== "png" || value.asset.width !== 1024 || value.asset.height !== 1536 || value.asset.alpha !== "rgba8-straight" || !SHA.test(value.asset.sha256 ?? "")) {
    throw new Error("committed EVA animation-master candidate asset contract is invalid");
  }
  const expectedLifecycle = { approvalState: "unapproved", productionReady: false, runtimeActivationEligible: false, maySeedAnimationGeneration: true };
  for (const [key, expected] of Object.entries(expectedLifecycle)) {
    if (value.lifecycle[key] !== expected) throw new Error(`EVA animation-master lifecycle is not generation-seed eligible: ${key}`);
  }
  if (!value.authority || Object.values(value.authority).some((entry) => entry !== false)) {
    throw new Error("EVA animation-master candidate authority drifted");
  }
  return value;
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  if (!options.runtimeRoot || !options.profileOutput || !options.referencesOutput) throw new Error(usage());
  const runtimeRoot = regularDir(options.runtimeRoot, "Avatar Runtime checkout");
  const manifestPath = repoPath(runtimeRoot, options.candidateManifest, "EVA candidate manifest");
  const manifest = candidate(JSON.parse(await fsp.readFile(manifestPath, "utf8")));
  const assetPath = repoPath(runtimeRoot, manifest.asset.path, "EVA animation-master asset");
  const manifestSha = verifyCommitted(runtimeRoot, options.candidateManifest, manifestPath, "EVA candidate manifest");
  const assetSha = verifyCommitted(runtimeRoot, manifest.asset.path, assetPath, "EVA animation-master asset");
  if (assetSha !== manifest.asset.sha256 || fs.statSync(assetPath).size !== manifest.asset.bytes) {
    throw new Error("EVA animation-master committed bytes disagree with candidate manifest");
  }
  const commit = git(runtimeRoot, ["rev-parse", "HEAD"]);
  const tree = git(runtimeRoot, ["rev-parse", "HEAD^{tree}"]);
  if (!/^[a-f0-9]{40}$/u.test(commit) || !/^[a-f0-9]{40}$/u.test(tree)) throw new Error("Avatar Runtime Git identity is invalid");
  const commitTimeRaw = git(runtimeRoot, ["show", "-s", "--format=%cI", "HEAD"]);
  const compiledAt = new Date(commitTimeRaw).toISOString();

  const suitePlan = {
    schema: "evavo.project-art-avatar-animation-suite-plan.v3",
    characterId: "eva-female",
    compiledAt,
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: {
      provider: "git-repository-asset",
      repository: "EVAVO-STUDIO/evavo-avatar-runtime",
      commit,
      tree,
      asset: {
        path: manifest.asset.path,
        mediaType: "image/png",
        format: "png",
        width: manifest.asset.width,
        height: manifest.asset.height,
        bytes: manifest.asset.bytes,
        sha256: manifest.asset.sha256,
        alpha: "rgba8-straight",
      },
      candidateManifest: { path: options.candidateManifest, sha256: manifestSha },
      lifecycle: {
        approvalState: "unapproved",
        productionReady: false,
        runtimeActivationEligible: false,
        maySeedAnimationGeneration: true,
      },
    },
    clips: [{
      id: "idle-primary",
      kind: "idle",
      loopMode: "loop",
      targetFrames: 36,
      fps: 24,
      performance: "quiet neutral breathing",
    }],
  };
  const bundle = compileEvaCanonicalProfileBundle(suitePlan, {
    generatedAt: compiledAt,
    state: "approved",
    identityRevision: 1,
    styleRevision: 1,
    revision: 1,
  });
  const profile = bundle.bodyProfiles.find((entry) => entry.clipId === "idle-primary");
  if (!profile || profile.plan?.request?.state !== "approved" || profile.plan?.quality?.promotable !== true) {
    throw new Error("compiled EVA idle canonical profile did not pass deterministic profile validation");
  }
  const artifactId = `artifact_${assetSha}`;
  if (profile.request.subject.identityReferenceArtifactId !== artifactId) {
    throw new Error("compiled EVA idle profile identity reference disagrees with committed animation master");
  }
  const references = [{
    artifactId,
    contentDigest: `sha256:${assetSha}`,
    mediaType: "image/png",
    width: manifest.asset.width,
    height: manifest.asset.height,
  }];
  const profilePath = await createOnly(options.profileOutput, profile);
  const referencesPath = await createOnly(options.referencesOutput, references);
  console.log(`[eva-idle-profile] PASS commit=${commit} master=${assetSha} profile=${profilePath} references=${referencesPath}`);
}

main().catch((error) => {
  console.error(`[eva-idle-profile] ERROR ${error.message}`);
  process.exitCode = 1;
});
