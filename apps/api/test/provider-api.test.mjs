import assert from "node:assert/strict";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

async function withServer(run) {
  const server = createArtStudioApiServer();
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

const independentRequest = {
  schemaVersion: "1.0",
  operation: "generate",
  assetKind: "illustration",
  continuityPhase: "independent",
  assetId: "loading-screen",
  candidateFamilyId: "loading-screen-v1",
  creativeIntent: "Create one authored loading-screen candidate.",
  style: {
    styleName: "Engraved maritime adventure",
    intent: "Historically grounded black-and-white linework.",
    mustHave: ["clear silhouette"],
    mustAvoid: ["generic AI detail"],
  },
  shot: {
    subject: "One steamship crossing rough water.",
    include: ["complete ship silhouette"],
    exclude: ["modern vessels", "text"],
    separateAssets: ["UI progress indicator"],
  },
  target: {
    width: 1280,
    height: 720,
    transparency: "opaque",
    outputFormat: "png",
  },
  background: { strategy: "opaque-source" },
  candidateCount: 2,
};

test("provider protocol and compilation are public deterministic contracts", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/provider-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.ok(protocolBody.referenceRoles.includes("canonical-identity"));
    assert.ok(protocolBody.referenceRoles.includes("previous-key-pose"));

    const compiled = await fetch(`${base}/v1/providers/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(independentRequest),
    });
    assert.equal(compiled.status, 200, await compiled.text());
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-only");
    assert.equal(body.request.operation, "generate");
    assert.equal(body.requestSha256.length, 64);
    assert.equal(body.compiledPromptSha256.length, 64);
    assert.ok(body.compiledPrompt.includes("intermediate candidate artwork only"));
  });
});

test("provider API rejects continuity-locked sprites without identity evidence", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/providers/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...independentRequest,
        assetKind: "sprite-frame",
        continuityPhase: "key-pose",
        target: {
          width: 128,
          height: 128,
          transparency: "required",
          outputFormat: "png",
        },
        background: { strategy: "chroma-key", matteColour: "#00ff00" },
      }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "PROVIDER_CANDIDATE_REQUEST_INVALID");
    assert.match(body.error.message, /canonical-identity/);
  });
});
