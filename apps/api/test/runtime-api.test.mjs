import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { createArtStudioApiServer } from "../dist/index.js";

const token = "runtime-control-token-abcdefghijklmnopqrstuvwxyz";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-api-"));
  return {
    root,
    runtime: new LocalRuntimeRepository({ root: path.join(root, "runtime") }),
    artifacts: new LocalArtifactStore({ root: path.join(root, "artifacts") }),
  };
}

async function withServer(options, run) {
  const server = createArtStudioApiServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function headers() {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-evavo-actor": "api-test",
  };
}

test("runtime API denies operational reads without the control token", async () => {
  const state = await fixture();
  await withServer(
    {
      runtime: state.runtime,
      artifacts: state.artifacts,
      allowWrites: true,
      writeToken: token,
    },
    async (base) => {
      const response = await fetch(`${base}/v1/runtime/jobs`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "ART_STUDIO_RUNTIME_UNAUTHORIZED");
    },
  );
});

test("runtime API submits, queries and controls durable jobs", async () => {
  const state = await fixture();
  await withServer(
    {
      runtime: state.runtime,
      artifacts: state.artifacts,
      allowWrites: true,
      writeToken: token,
    },
    async (base) => {
      const submittedResponse = await fetch(`${base}/v1/runtime/jobs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          queue: "media",
          kind: "sprite.atlas.build",
          idempotencyKey: "api-runtime-job",
          payload: {
            manifestPath: "C:/GitRepos/game/art/atlas.json",
            outputDirectory: "C:/GitRepos/game/art/generated",
          },
          requiredCapabilities: ["atlas.pack", "godot.export"],
          leaseDurationMs: 60000,
          timeoutMs: 900000,
        }),
      });
      assert.equal(submittedResponse.status, 201, await submittedResponse.text());
      const submitted = (await submittedResponse.json()).jobs;
      assert.equal(submitted.state, "queued");

      const listResponse = await fetch(
        `${base}/v1/runtime/jobs?state=queued&queue=media`,
        { headers: headers() },
      );
      assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()).jobs;
      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, submitted.id);

      const paused = await fetch(
        `${base}/v1/runtime/jobs/${encodeURIComponent(submitted.id)}/pause`,
        { method: "POST", headers: headers(), body: "{}" },
      );
      assert.equal(paused.status, 200);
      assert.equal((await paused.json()).state, "paused");
      const resumed = await fetch(
        `${base}/v1/runtime/jobs/${encodeURIComponent(submitted.id)}/resume`,
        { method: "POST", headers: headers(), body: "{}" },
      );
      assert.equal(resumed.status, 200);
      assert.equal((await resumed.json()).state, "queued");
      const cancelled = await fetch(
        `${base}/v1/runtime/jobs/${encodeURIComponent(submitted.id)}/cancel`,
        { method: "POST", headers: headers(), body: "{}" },
      );
      assert.equal(cancelled.status, 200);
      assert.equal((await cancelled.json()).state, "cancelled");

      const events = await fetch(`${base}/v1/runtime/events`, {
        headers: headers(),
      });
      assert.equal(events.status, 200);
      const eventBody = await events.json();
      assert.ok(eventBody.events.some((entry) => entry.type === "job.cancelled"));
    },
  );
});

test("artifact API verifies content and updates approved references", async () => {
  const state = await fixture();
  const stored = await state.artifacts.put("approved", {
    mediaType: "text/plain",
    storageClass: "master",
    fileName: "approved.txt",
  });
  await withServer(
    {
      runtime: state.runtime,
      artifacts: state.artifacts,
      allowWrites: true,
      writeToken: token,
    },
    async (base) => {
      const shown = await fetch(`${base}/v1/artifacts/${stored.artifactId}`, {
        headers: headers(),
      });
      assert.equal(shown.status, 200);
      assert.equal((await shown.json()).artifactId, stored.artifactId);
      const verified = await fetch(
        `${base}/v1/artifacts/${stored.artifactId}/verify`,
        { headers: headers() },
      );
      assert.equal(verified.status, 200);
      assert.equal((await verified.json()).contentValid, true);

      const reference = await fetch(`${base}/v1/artifact-references`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          namespace: "projects/fixture",
          name: "approved-master",
          artifactId: stored.artifactId,
          expectedGeneration: 0,
        }),
      });
      assert.equal(reference.status, 200);
      assert.equal((await reference.json()).generation, 1);
      const resolved = await fetch(
        `${base}/v1/artifact-references?namespace=${encodeURIComponent("projects/fixture")}&name=approved-master`,
        { headers: headers() },
      );
      assert.equal(resolved.status, 200);
      assert.equal((await resolved.json()).artifactId, stored.artifactId);
    },
  );
});
