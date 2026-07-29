import assert from "node:assert/strict";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

const brief = {
  schemaVersion: "1.0",
  project: { projectName: "API Test", targets: [{ kind: "web" }] },
  artDirection: { styleName: "Editorial", intent: "Deliberate", mustHave: ["clear hierarchy"], mustAvoid: ["generic AI look"] },
  assets: [{ id: "hero", name: "Hero", kind: "background", purpose: "Landing hero", quantity: 1, dimensions: { width: 1920, height: 1080 }, transparency: "opaque", outputs: [{ format: "webp", purpose: "runtime", lossless: false }] }],
  autonomy: { mode: "review-gated", candidateCount: 4, maximumIterations: 3, autoApproveThreshold: 0.92, allowProviderFallback: true, requireEvidenceBundle: true }
};

test("serves health and production plans", async (t) => {
  const server = createArtStudioApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  const plan = await fetch(`${base}/v1/plans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(brief) });
  assert.equal(plan.status, 201);
  const payload = await plan.json();
  assert.equal(payload.projectName, "API Test");
});
