import assert from "node:assert/strict";
import test from "node:test";

import {
  describeSpriteEffectAgentCatalog,
  listSpriteEffectAgentIntents,
  planSpriteEffectForAgent,
} from "../dist/index.js";

test("agent catalog exposes every governed effect and intent", () => {
  const catalog = describeSpriteEffectAgentCatalog();
  assert.equal(catalog.length, 6);
  assert.equal(listSpriteEffectAgentIntents().length, 8);
  assert.ok(catalog.some((effect) => effect.id === "sprite_feedback"));
  assert.ok(catalog.some((effect) => effect.id === "sprite_additive_pulse"));
});

test("selection outline maps to shared-material-safe feedback controls", () => {
  const plan = planSpriteEffectForAgent({
    intent: "selection-outline",
    role: "standing-character",
    strength: "subtle",
  });
  assert.equal(plan.decision, "recommended");
  assert.equal(plan.effectId, "sprite_feedback");
  assert.ok(plan.controls.some((control) => control.uniform === "outline_amount"));
  assert.ok(plan.controls.every((control) => control.binderMethod.startsWith("Set")));
  assert.equal(plan.runtimeApprovalRequired, true);
});

test("cheap-only budget refuses to silently recommend a moderate ghost effect", () => {
  const plan = planSpriteEffectForAgent({
    intent: "memory-apparition",
    role: "dialogue-portrait",
    performanceBudget: "cheap-only",
  });
  assert.equal(plan.effectId, "sprite_ghost");
  assert.equal(plan.decision, "review-role-compatibility");
  assert.match(plan.warnings.join(","), /moderate-cost/);
});

test("additive pulse warns against replacing ordinary character materials", () => {
  const plan = planSpriteEffectForAgent({
    intent: "spark-or-glint",
    role: "effect-sprite",
    strength: "standard",
  });
  assert.equal(plan.decision, "recommended");
  assert.equal(plan.effectId, "sprite_additive_pulse");
  assert.match(plan.warnings.join(" "), /dedicated light\/effect sprite/);
});

test("role mismatch is visible instead of being coerced", () => {
  const plan = planSpriteEffectForAgent({
    intent: "ambient-sway",
    role: "dialogue-portrait",
  });
  assert.equal(plan.effectId, "sprite_sway");
  assert.equal(plan.decision, "review-role-compatibility");
  assert.match(plan.warnings.join(","), /not in the reviewed compatibility list/);
});
