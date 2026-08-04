import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "shim-paths.json"), "utf8"));
assert.ok(Array.isArray(manifest));
assert.equal(manifest.length, 62);
assert.equal(new Set(manifest).size, 62);
for (const name of manifest) {
  assert.match(name, /^[A-Za-z][A-Za-z0-9]+\.ts$/);
  assert.notEqual(name, "bookArtRetirementCompatibility.ts");
}
await rm(path.join(root, "generated"), { recursive: true, force: true });
await mkdir(path.join(root, "generated"), { recursive: true });
await writeFile(
  path.join(root, "generated", "bookArtRetirementCompatibility.ts"),
  'export * from "../bookArtRetirementCompatibility";\n',
  "utf8",
);
for (const name of manifest) {
  await writeFile(
    path.join(root, "generated", name),
    'export * from "./bookArtRetirementCompatibility";\n',
    "utf8",
  );
}
console.log(JSON.stringify({ status: "PASS", exactShimCount: manifest.length }, null, 2));
