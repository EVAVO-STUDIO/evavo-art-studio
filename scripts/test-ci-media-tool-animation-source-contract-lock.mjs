import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const checker = "scripts/check-animation-source-contract-lock.mjs";
const lockedPaths = [
  "contracts/animation-source-bundle-v1.lock.json",
  "contracts/animation-source-bundle-v1.schema.json",
  "contracts/fixtures/animation-source-bundle-v1.json",
  "scripts/lib/animation-source-bundle.mjs",
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

test("local animation source contract lock verifies exact bytes", () => {
  const result = run();
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  const report = JSON.parse(result.stdout);
  assert.equal(
    report.contractSetDigest,
    "sha256:25494dbbf6a511850dd3b43b818cde01e36654666d3672bd8d08d8eb291e8f0b",
  );
  assert.equal(report.localEvidence.length, 3);
  assert.equal(report.authority.networkRequired, false);
});

test("peer verification detects cross-repository byte drift", async () => {
  const { parent, peer } = await createPeer();
  try {
    const matched = run(["--peer", peer, "--require-peer"]);
    assert.equal(
      matched.status,
      0,
      [matched.stdout, matched.stderr].filter(Boolean).join("\n"),
    );
    assert.equal(JSON.parse(matched.stdout).peer.status, "matched");

    const fixture = path.join(
      peer,
      "contracts",
      "fixtures",
      "animation-source-bundle-v1.json",
    );
    await writeFile(
      fixture,
      `${await readFile(fixture, "utf8")}\n`,
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
