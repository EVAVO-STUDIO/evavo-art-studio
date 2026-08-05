import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  stream: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream.ts",
  client: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient.ts",
  route: "src/app/api/books/write/craft-genome/route.ts",
  attack: "scripts/check-book-studio-craft-stream.ts",
  tsconfig: "tsconfig.book-studio-craft-genome.json",
  docs: "docs/BOOK_STUDIO_CRAFT_GENOME.md",
  workflow: "../../.github/workflows/book-studio-craft-genome.yml"
} as const;

const source = {} as Record<keyof typeof files, string>;
for (const [name, relative] of Object.entries(files) as Array<[keyof typeof files, string]>) {
  const absolute = path.join(root, relative);
  assert.equal(existsSync(absolute), true, `Missing bounded stream integration file: ${relative}`);
  source[name] = readFileSync(absolute, "utf8");
}

for (const token of [
  "const buffer = new Uint8Array(input.maximumBytes)",
  "const nextTotal = totalBytes + value.byteLength",
  "buffer.set(value, totalBytes)",
  "buffer.subarray(0, totalBytes)",
  "reader.cancel(\"bounded-body-limit-exceeded\")",
  "TextDecoder(\"utf-8\", { fatal: true })"
]) assert.ok(source.stream.includes(token), `Bounded stream source missing ${token}.`);
for (const forbidden of [
  "const chunks:",
  "chunks.push(",
  "Array.fromAsync(",
  "new Response(input.body).text("
]) assert.equal(source.stream.includes(forbidden), false, `Bounded stream source must not contain ${forbidden}.`);

for (const value of [source.client, source.route]) {
  assert.ok(value.includes("readEvavoBoundedUtf8Body"));
  assert.equal(value.includes(".arrayBuffer()"), false);
}
assert.equal(source.client.includes("response.text()"), false);
assert.equal(source.route.includes("request.text()"), false);

for (const token of [
  "tinyChunkCount = 16_384",
  "manyTinyChunks",
  "boundedAssemblyBuffer: true",
  "dishonestDeclaredLengthRejectedByActualBytes: true",
  "STREAM_INVALID_UTF8",
  "BOOK_CRAFT_STREAM_BOUND_INVALID"
]) assert.ok(source.attack.includes(token), `Bounded stream attack missing ${token}.`);

for (const token of [
  "scripts/check-book-studio-craft-stream.ts",
  "scripts/check-book-studio-craft-stream-source.ts",
  "storyBookStudioDocsSuiteLegacyCraftStream.ts"
]) assert.ok(source.tsconfig.includes(token), `Focused TypeScript boundary missing ${token}.`);

for (const token of [
  "fixed maximum-sized byte buffer",
  "tiny chunks",
  "npx tsx scripts/check-book-studio-craft-stream.ts",
  "npx tsx scripts/check-book-studio-craft-stream-source.ts"
]) assert.ok(source.docs.includes(token), `Craft documentation missing ${token}.`);

for (const token of [
  "Run bounded stream source-contract checks",
  "npx tsx scripts/check-book-studio-craft-stream-source.ts",
  "Run bounded stream assembly attacks",
  "npx tsx scripts/check-book-studio-craft-stream.ts"
]) assert.ok(source.workflow.includes(token), `Craft workflow missing ${token}.`);

console.log(JSON.stringify({
  status: "PASS",
  fixedMaximumBufferRequired: true,
  unboundedChunkArrayForbidden: true,
  tinyChunkRegressionCount: 16_384,
  streamedRequestAndResponseConsumers: 2,
  strictUtf8Required: true,
  actualByteLimitRequired: true
}, null, 2));
