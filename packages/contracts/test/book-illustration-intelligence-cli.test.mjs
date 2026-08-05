import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = fileURLToPath(
  new URL("../../../scripts/evavo-art-book-illustration-cli.mjs", import.meta.url),
);

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("reports print-craft illustration capabilities", () => {
  const result = run(["capabilities"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.contract, "evavo_art_book_illustration_intelligence_v1");
  assert.ok(body.capabilities.includes("book.print_craft.qa"));
  assert.ok(body.capabilities.includes("book.cover.candidates.generate"));
  assert.ok(body.capabilities.includes("book.interior.candidates.generate"));
  assert.ok(body.capabilities.includes("book.visual.consensus"));
  assert.ok(body.descriptors.some((entry) => entry.capabilityId === "book.visual.consensus"));
  assert.equal(body.providerFallbackAllowed, false);
  assert.equal(body.automaticSelectionAllowed, false);
});

test("uses exclusive no-clobber output and returns blocked plans", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "art-book-cli-"));
  const output = path.join(directory, "capabilities.json");
  const first = run(["capabilities", "--output", output]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(await readFile(output, "utf8")).publicationPerformed, false);
  const second = run(["capabilities", "--output", output]);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /EEXIST|exist/i);

  const input = path.join(directory, "invalid.json");
  await writeFile(input, "{}\n", "utf8");
  const blocked = run(["compile-plan", "--input", input]);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).status, "blocked");
});


test("returns exit code 2 for blocked generation and consensus requests", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "art-book-cli-blocked-"));
  const input = path.join(directory, "invalid.json");
  await writeFile(input, "{}\n", "utf8");
  for (const command of [
    "compile-generation-dispatch",
    "evaluate-visual-consensus",
  ]) {
    const result = run([command, "--input", input]);
    assert.equal(result.status, 2, `${command}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).status, "blocked");
  }
});
