import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileAutomaticSpriteWorkflow,
  compileSpriteSupervisorWorkflow,
} from "@evavo/art-sprite-supervisor";

import {
  assertProviderTask,
  containsForbiddenExecutableField,
  loadPacket,
  validateWorkflow,
} from "../../../scripts/run-local-two-stage-animation-packet.mjs";

async function localWorkflow() {
  const input = JSON.parse(
    await readFile(
      new URL(
        "../../../examples/automatic-sprite-workflow.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const automatic = compileAutomaticSpriteWorkflow(input);
  const request = structuredClone(automatic.supervisorRequest);
  request.metadata = {
    ...(request.metadata ?? {}),
    localOnly: true,
  };
  request.policy.maximumActiveChildren = 1;
  for (const task of request.tasks) {
    if (
      task.kind === "art.candidate.generate" ||
      task.kind === "art.candidate.edit"
    ) {
      task.payloadTemplate.selection = {
        preferredAdapterId: "draw-things:test-local-profile",
        allowedAdapterIds: ["draw-things:test-local-profile"],
        allowFallback: false,
        requireSeed: false,
      };
    }
  }
  return compileSpriteSupervisorWorkflow(request);
}

test("packet runner accepts only exact local Draw Things provider locks", () => {
  assert.doesNotThrow(() =>
    assertProviderTask({
      id: "provider-local",
      kind: "art.candidate.generate",
      payloadTemplate: {
        operation: "generate",
        selection: {
          preferredAdapterId: "draw-things:test-profile",
          allowedAdapterIds: ["draw-things:test-profile"],
          allowFallback: false,
        },
      },
    }),
  );

  assert.throws(
    () =>
      assertProviderTask({
        id: "provider-cloud",
        kind: "art.candidate.generate",
        payloadTemplate: {
          operation: "generate",
          selection: {
            allowedAdapterIds: ["openai-images"],
            allowFallback: false,
          },
        },
      }),
    /exactly one draw-things:\*/u,
  );

  assert.throws(
    () =>
      assertProviderTask({
        id: "provider-fallback",
        kind: "art.candidate.edit",
        payloadTemplate: {
          operation: "edit",
          selection: {
            allowedAdapterIds: ["draw-things:test-profile"],
            allowFallback: true,
          },
        },
      }),
    /disable provider fallback/u,
  );
});

test("packet runner rejects caller-selected executable or command fields recursively", () => {
  assert.equal(
    containsForbiddenExecutableField({
      godot: {
        projectPath: "C:\\GitRepos\\game",
        runImporter: true,
      },
    }),
    false,
  );
  assert.equal(
    containsForbiddenExecutableField({
      godot: {
        godotExecutable: "C:\\evil\\godot.exe",
      },
    }),
    true,
  );
  assert.equal(
    containsForbiddenExecutableField({
      nested: [{ command: "powershell.exe" }],
    }),
    true,
  );
});

test("packet loader requires the exact fixed schema and fields", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-two-stage-packet-"),
  );
  const validPath = path.join(root, "valid.json");
  await writeFile(
    validPath,
    JSON.stringify({
      schema: "evavo.local-two-stage-animation-execution.v1",
      workflow: { request: {} },
    }),
  );
  const packet = await loadPacket(validPath);
  assert.equal(
    packet.schema,
    "evavo.local-two-stage-animation-execution.v1",
  );

  const badPath = path.join(root, "bad.json");
  await writeFile(
    badPath,
    JSON.stringify({
      schema: "evavo.local-two-stage-animation-execution.v1",
      workflow: {},
      command: "node.exe",
    }),
  );
  await assert.rejects(
    () => loadPacket(badPath),
    /contain exactly schema=.* and workflow/u,
  );
});

test("packet runner re-compiles the whole supervisor workflow and detects tampering", async () => {
  const workflow = await localWorkflow();
  const verified = validateWorkflow(workflow);
  assert.equal(verified.workflowSha256, workflow.workflowSha256);

  const tampered = structuredClone(workflow);
  tampered.rootJob.timeoutMs += 1;
  assert.throws(
    () => validateWorkflow(tampered),
    /differs from the deterministically recompiled supervisor workflow/u,
  );
});

test("packet runner rejects local metadata or concurrency drift", async () => {
  const workflow = await localWorkflow();

  const nonLocalRequest = structuredClone(workflow.request);
  nonLocalRequest.metadata.localOnly = false;
  const nonLocal = compileSpriteSupervisorWorkflow(nonLocalRequest);
  assert.throws(
    () => validateWorkflow(nonLocal),
    /metadata\.localOnly=true/u,
  );

  const concurrentRequest = structuredClone(workflow.request);
  concurrentRequest.policy.maximumActiveChildren = 2;
  const concurrent = compileSpriteSupervisorWorkflow(concurrentRequest);
  assert.throws(
    () => validateWorkflow(concurrent),
    /maximumActiveChildren=1/u,
  );
});
