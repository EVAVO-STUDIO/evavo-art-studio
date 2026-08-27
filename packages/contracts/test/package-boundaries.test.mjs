import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const testArtifactPattern = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u;

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
};

test("contracts distribution excludes test-only artifacts", async () => {
  const emittedFiles = await walkFiles(distRoot);
  const leakedTests = emittedFiles
    .map((file) => path.relative(distRoot, file).split(path.sep).join("/"))
    .filter((file) => testArtifactPattern.test(file))
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(
    leakedTests,
    [],
    `Production contract output contains test-only artifacts: ${leakedTests.join(", ")}`,
  );
});
