
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

test("exposes the shared planner and guarded repository inspector", () => {
  assert.match(source, /compile_art_production_plan/);
  assert.match(source, /createProductionPlan/);
  assert.match(source, /assertPathWithinAllowedRoots/);
  assert.match(source, /StdioServerTransport/);
});
