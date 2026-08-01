import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("worker routes supervision through request and CAS guards", async () => {
  const [index, guard] = await Promise.all([
    read("src/index.ts"),
    read("src/sprite-supervisor-guarded-handlers.ts"),
  ]);

  assert.ok(index.includes('from "./sprite-supervisor-guarded-handlers.js"'));
  for (const token of [
    "SPRITE_SUPERVISOR_REQUEST_HASH_MISSING",
    "SPRITE_SUPERVISOR_REQUEST_HASH_MISMATCH",
    "SPRITE_SUPERVISOR_STATE_CONFLICT",
    "new TransientRuntimeError",
    'context.job.spec.labels.supervisorTick === "0"',
    "workflow.requestSha256",
  ]) {
    assert.ok(guard.includes(token), `missing supervisor guard invariant: ${token}`);
  }

  for (const forbidden of [
    "OPENAI_API_KEY",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference(",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !guard.includes(forbidden),
      `supervisor guard contains an authority shortcut: ${forbidden}`,
    );
  }
});
