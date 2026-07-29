
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("keeps the web surface bound to shared contracts", async () => {
  const route = await read("../app/api/plans/route.ts");
  const page = await read("../app/page.tsx");
  assert.match(route, /validateArtBrief/);
  assert.match(route, /createProductionPlan/);
  assert.match(page, /Governed art-production control plane/);
});
