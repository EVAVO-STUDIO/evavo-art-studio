import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

function cli(args) {
  const result = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("CLI stores, verifies and promotes immutable artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-cli-artifacts-"));
  const artifactRoot = path.join(root, "artifacts");
  const sourcePath = path.join(root, "master.txt");
  const descriptorPath = path.join(root, "descriptor.json");
  await writeFile(sourcePath, "approved master", "utf8");
  await writeFile(
    descriptorPath,
    JSON.stringify({
      mediaType: "text/plain",
      storageClass: "master",
      fileName: "master.txt",
      labels: { project: "fixture" },
    }),
  );

  const stored = cli([
    "artifact-put",
    "--input",
    sourcePath,
    "--descriptor",
    descriptorPath,
    "--artifact-root",
    artifactRoot,
  ]);
  assert.match(stored.artifactId, /^artifact_[a-f0-9]{64}$/);
  const verified = cli([
    "artifact-verify",
    "--artifact",
    stored.artifactId,
    "--artifact-root",
    artifactRoot,
  ]);
  assert.equal(verified.contentValid, true);
  const reference = cli([
    "artifact-ref-set",
    "--namespace",
    "projects/fixture",
    "--name",
    "approved-master",
    "--artifact",
    stored.artifactId,
    "--expected-generation",
    "0",
    "--artifact-root",
    artifactRoot,
  ]);
  assert.equal(reference.generation, 1);
  const resolved = cli([
    "artifact-ref-resolve",
    "--namespace",
    "projects/fixture",
    "--name",
    "approved-master",
    "--artifact-root",
    artifactRoot,
  ]);
  assert.equal(resolved.artifactId, stored.artifactId);
});

test("CLI submits, queries and controls durable runtime jobs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-cli-runtime-"));
  const runtimeRoot = path.join(root, "runtime");
  const submissionPath = path.join(root, "job.json");
  await writeFile(
    submissionPath,
    JSON.stringify({
      queue: "media",
      kind: "sprite.atlas.build",
      idempotencyKey: "fixture-atlas",
      payload: {
        manifestPath: "C:/GitRepos/game/art/hero.atlas.json",
        outputDirectory: "C:/GitRepos/game/art/generated",
      },
      requiredCapabilities: ["atlas.pack", "godot.export"],
      maximumAttempts: 3,
      leaseDurationMs: 60000,
      timeoutMs: 900000,
    }),
  );

  const submitted = cli([
    "runtime-submit",
    "--input",
    submissionPath,
    "--runtime-root",
    runtimeRoot,
    "--actor",
    "cli-test",
  ]);
  assert.equal(submitted.state, "queued");
  const listed = cli([
    "runtime-list",
    "--state",
    "queued",
    "--runtime-root",
    runtimeRoot,
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, submitted.id);

  const paused = cli([
    "runtime-pause",
    "--job",
    submitted.id,
    "--runtime-root",
    runtimeRoot,
  ]);
  assert.equal(paused.state, "paused");
  const resumed = cli([
    "runtime-resume",
    "--job",
    submitted.id,
    "--runtime-root",
    runtimeRoot,
  ]);
  assert.equal(resumed.state, "queued");
  const cancelled = cli([
    "runtime-cancel",
    "--job",
    submitted.id,
    "--runtime-root",
    runtimeRoot,
  ]);
  assert.equal(cancelled.state, "cancelled");
  const events = cli([
    "runtime-events",
    "--runtime-root",
    runtimeRoot,
  ]);
  assert.ok(events.some((entry) => entry.type === "job.submitted"));
  assert.ok(events.some((entry) => entry.type === "job.cancelled"));
});
