import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  compileEngineSmokeSession,
  sha256,
  validateEngineSmokeSpec,
  verifyEngineSmokeSession,
} from "./rally-25d-engine-smoke-jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SPEC_PATH = path.join(ROOT, "config/game-art-production/vfx/engine-smoke-production-v1.json");

async function specification() {
  return JSON.parse(await readFile(SPEC_PATH, "utf8"));
}

test("Engine Smoke compiles twelve deterministic transparent jobs", async () => {
  const source = await specification();
  const before = JSON.stringify(source);
  const validated = validateEngineSmokeSpec(source);
  const first = compileEngineSmokeSession(source);
  const second = compileEngineSmokeSession(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(validated.jobs.length, 12);
  assert.equal(first.sessionSha256, second.sessionSha256);
  assert.equal(first.jobCount, 12);
  assert.equal(first.jobs.every((job) => job.render.images === 1 && job.render.transparent === true), true);
  assert.deepEqual(first.roleCounts, {
    "effect-shape-master": 1,
    "effect-response-reference": 8,
    "particle-sprite-reference": 2,
    "decay-reference": 1,
  });
  assert.equal(verifyEngineSmokeSession(first, source), true);
});

test("Engine Smoke detects semantic tampering even after an outer rehash", async () => {
  const source = await specification();
  const session = compileEngineSmokeSession(source);
  session.jobs[5].prompt = "unrelated opaque explosion";
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256"));
  session.sessionSha256 = sha256(body);
  assert.throws(() => verifyEngineSmokeSession(session, source), /deterministic compilation/);
});

test("Engine Smoke rejects provider authority and graph drift", async () => {
  const authorityDrift = await specification();
  authorityDrift.authority.providerExecution = true;
  assert.throws(() => validateEngineSmokeSpec(authorityDrift), /must remain false/);

  const graphDrift = await specification();
  graphDrift.jobs[0].dependsOn = [graphDrift.jobs[1].id];
  graphDrift.jobs[1].dependsOn = [graphDrift.jobs[0].id];
  assert.throws(() => validateEngineSmokeSpec(graphDrift), /cycle/);
});
