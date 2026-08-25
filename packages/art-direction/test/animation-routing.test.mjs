import assert from "node:assert/strict";
import test from "node:test";

import { resolveAnimationProductionRoute } from "../dist/index.js";

test("routes sprite-oriented animation styles through Art Studio", () => {
  for (const style of [
    "cinematic-naturalistic",
    "vga-adventure",
    "arcade-snappy",
  ]) {
    const route = resolveAnimationProductionRoute(style);
    assert.equal(route.route, "art-studio-sprite");
    assert.equal(route.directSpriteProviderCompilationAllowed, true);
  }
});

test("routes traditional cel through Cel Animation Studio", () => {
  const route = resolveAnimationProductionRoute("traditional-cel");
  assert.equal(route.route, "cel-animation-studio");
  assert.equal(route.directSpriteProviderCompilationAllowed, false);
  assert.match(route.reason, /X-sheet/);
});
