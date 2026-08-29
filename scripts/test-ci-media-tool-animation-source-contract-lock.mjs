import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const checker = "scripts/check-animation-source-contract-lock.mjs";
const contractSetDigest =
  "sha256:e8ea163a56364cf8fe40c61e9428f6861c891944f7e31f4ccb793f1a447b9314";
const lockedPaths = [
  "contracts/animation-source-bundle-v1.lock.json",
  "contracts/animation-source-bundle-v1.schema.json",
  "contracts/fixtures/animation-source-bundle-v1.json",
  "scripts/lib/animation-source-bundle.mjs",
  "scripts/lib/animation-source-file-observer.mjs",
  "scripts/lib/animation-source-image-probes.mjs",
  "scripts/lib/animation-source-observation-common.mjs",
  "scripts/lib/animation-source-stable-observation.mjs",
];

function run(args = []) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

async function createPeer() {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-contract-peer-"),
  );
  const peer = path.join(parent, "peer-studio");
  for (const relativePath of lockedPaths) {
    const destination = path.join(peer, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(
      path.join(repositoryRoot, ...relativePath.split("/")),
      destination,
    );
  }
  return { parent, peer };
}

test("local animation source operational contract lock verifies stable exact bytes", () => {
  const result = run();
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  const report = JSON.parse(result.stdout);
  assert.equal(report.contractSetDigest, contractSetDigest);
  assert.equal(report.localEvidence.length, 7);
  assert.equal(
    report.localEvidence.every(
      (entry) => entry.stableIdentityVerified === true,
    ),
    true,
  );
  assert.equal(report.authority.networkRequired, false);
});

test("peer verification detects stable verifier byte drift", async () => {
  const { parent, peer } = await createPeer();
  try {
    const matched = run(["--peer", peer, "--require-peer"]);
    assert.equal(
      matched.status,
      0,
      [matched.stdout, matched.stderr].filter(Boolean).join("\n"),
    );
    const report = JSON.parse(matched.stdout);
    assert.equal(report.peer.status, "matched");
    assert.equal(report.peer.evidence.length, 7);

    const observer = path.join(
      peer,
      "scripts",
      "lib",
      "animation-source-file-observer.mjs",
    );
    await writeFile(
      observer,
      `${await readFile(observer, "utf8")}\n`,
      "utf8",
    );
    const drifted = run(["--peer", peer, "--require-peer"]);
    assert.notEqual(drifted.status, 0);
    assert.match(
      drifted.stderr,
      /ANIMATION_SOURCE_CONTRACT_LOCK_FILE_MISMATCH/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("peer verification rejects symlink substitution", async (t) => {
  if (process.platform === "win32") {
    t.skip("Windows symlink creation may require an elevated local policy.");
    return;
  }
  const { parent, peer } = await createPeer();
  try {
    const target = path.join(
      peer,
      "scripts",
      "lib",
      "animation-source-stable-observation.mjs",
    );
    const outside = path.join(parent, "outside-stable-observation.mjs");
    await cp(target, outside);
    await rm(target);
    await symlink(outside, target);

    const result = run(["--peer", peer, "--require-peer"]);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /ANIMATION_SOURCE_CONTRACT_LOCK_SYMLINK_FORBIDDEN/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("peer requirement fails closed when the repository is absent", () => {
  const missing = path.join(
    os.tmpdir(),
    `evavo-animation-missing-peer-${process.pid}-${Date.now()}`,
  );
  const result = run(["--peer", missing, "--require-peer"]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /ANIMATION_SOURCE_CONTRACT_LOCK_PEER_REQUIRED/,
  );
});
