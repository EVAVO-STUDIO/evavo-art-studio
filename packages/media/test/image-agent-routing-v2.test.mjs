import assert from "node:assert/strict";
import test from "node:test";

import { listImageAgentGoalsV2, routeImageAgentTaskV2 } from "../dist/index.js";

test("v2 exposes all fifteen governed image workflow goals", () => {
  const goals = listImageAgentGoalsV2();
  assert.equal(goals.length, 15);
  assert.ok(goals.includes("delivery-preflight"));
  for (const goal of goals) {
    const route = routeImageAgentTaskV2(goal);
    assert.equal(route.contract, "evavo.image-agent-route.v2");
    assert.equal(route.goal, goal);
    assert.ok(route.preferredSurface.length > 0);
    assert.ok(route.steps.length > 0);
    assert.ok(route.evidenceExpected.length > 0);
    assert.ok(route.invariants.some((item) => /Never overwrite/.test(item)));
  }
});

test("frame consistency routes ordered animation work to the sequence-finishing surface", () => {
  const route = routeImageAgentTaskV2("frame-consistency");
  assert.equal(route.preferredSurface, "evavo-image-sequence-finishing");
  assert.equal(route.steps[0].tool, "evavo_review_image_sequence_finishing");
  assert.ok(route.steps.some((item) => item.tool === "evavo_review_image_finishing_batch"));
  assert.ok(route.steps.some((item) => item.tool === "evavo_create_image_finishing_batch_proof" && item.privilege === "write-gated-create-only"));
  assert.match(route.invariants.join(" "), /intentional animation holds/);
});

test("delivery preflight is a first-class read-only route", () => {
  const route = routeImageAgentTaskV2("delivery-preflight");
  assert.equal(route.preferredSurface, "evavo-image-delivery-integrity");
  assert.equal(route.steps[0].tool, "evavo_review_image_delivery_integrity");
  assert.equal(route.steps[0].privilege, "read-only");
  assert.ok(route.steps.some((item) => item.tool === "evavo_review_image_delivery_batch"));
  assert.match(route.stopConditions.join(" "), /byte budget/);
});

test("finalization prefers the one-call final admission and never treats readiness as approval", () => {
  const route = routeImageAgentTaskV2("finalize-image");
  assert.equal(route.preferredSurface, "evavo-image-finalization");
  assert.equal(route.steps[0].tool, "evavo_review_image_finalization");
  assert.equal(route.steps[0].privilege, "read-only");
  assert.match(route.invariants.join(" "), /Ready-for-approval-review is not approval/);
});

test("texture route keeps native Godot validation behind an execution privilege", () => {
  const route = routeImageAgentTaskV2("texture-review");
  const native = route.steps.find((item) => item.tool === "evavo_validate_godot_material_resource");
  assert.ok(native);
  assert.equal(native.privilege, "execution-gated");
  assert.ok(route.steps.some((item) => item.tool === "evavo_write_godot_material_resource" && item.privilege === "write-gated-create-only"));
});

test("artifact assessment combines advisory pixels with exact-byte provenance", () => {
  const route = routeImageAgentTaskV2("ai-artifact-assessment");
  assert.equal(route.steps[0].tool, "evavo_review_image_artifact_risk");
  const provenance = route.steps.find((item) => item.tool === "evavo_review_image_provenance");
  assert.ok(provenance);
  assert.equal(provenance.surface, "evavo-image-provenance");
  assert.equal(provenance.privilege, "read-only");
  assert.match(route.stopConditions.join(" "), /do not infer authorship/);
  assert.match(route.stopConditions.join(" "), /invalid or contradictory provenance/);
  assert.match(route.invariants.join(" "), /must not be presented as proof of AI authorship/);
  assert.match(route.invariants.join(" "), /exact image SHA-256/);
});
