import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseVisualContinuity3dAdapterCli,
  runVisualContinuity3dAdapterCli,
} from "./visual-continuity-3d-reference-adapter-cli.mjs";

test("compile output is never parsed as a handoff path", () => {
  assert.deepEqual(
    parseVisualContinuity3dAdapterCli([
      "compile",
      "request.json",
      "--output",
      "compiled-handoff.json",
    ]),
    {
      command: "compile",
      requestPath: "request.json",
      outputPath: "compiled-handoff.json",
    },
  );
});

test("verify retains both positional files and a separate output", () => {
  assert.deepEqual(
    parseVisualContinuity3dAdapterCli([
      "verify",
      "request.json",
      "receiver-handoff.json",
      "--output",
      "verification.json",
    ]),
    {
      command: "verify",
      requestPath: "request.json",
      handoffPath: "receiver-handoff.json",
      outputPath: "verification.json",
    },
  );
});

test("capabilities supports create-only output without positional ambiguity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-continuity-3d-cli-"));
  try {
    const outputPath = path.join(root, "capabilities.json");
    const parsed = parseVisualContinuity3dAdapterCli([
      "capabilities",
      "--output",
      outputPath,
    ]);
    const executed = await runVisualContinuity3dAdapterCli(parsed);
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(written.receiver, "evavo-3d-art-reference-brief");
    assert.equal(written.receiverExecution, false);
    assert.deepEqual(written, executed.result);
    await assert.rejects(
      runVisualContinuity3dAdapterCli(parsed),
      (error) => error.code === "EEXIST",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed command lines fail before any file is read", () => {
  for (const args of [
    [],
    ["compile"],
    ["compile", "one.json", "two.json"],
    ["verify", "one.json"],
    ["capabilities", "unexpected.json"],
    ["compile", "request.json", "--output"],
    ["compile", "request.json", "--unknown"],
  ]) {
    assert.throws(
      () => parseVisualContinuity3dAdapterCli(args),
      /EVAVO_VISUAL_CONTINUITY_3D_ADAPTER_CLI/u,
    );
  }
});
