#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = [
  "config/image-finishing-artist.capabilities.json",
  "config/image-repair-agent.capabilities.json",
  "config/texture-review-agent.capabilities.json",
];

const parsed = [];
for (const relative of manifests) {
  const filePath = path.join(root, relative);
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (manifest.schemaVersion !== "1.0" || typeof manifest.entrypoint !== "string") {
    throw new Error(`${relative} is missing the current capability contract.`);
  }
  const entrypoint = path.join(root, manifest.entrypoint);
  await access(entrypoint);
  const syntax = spawnSync(process.execPath, ["--check", entrypoint], {
    cwd: root,
    encoding: "utf8",
  });
  if (syntax.status !== 0) {
    throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
  }
  const source = await readFile(entrypoint, "utf8");
  for (const tool of manifest.tools ?? []) {
    if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
      throw new Error(`${relative} advertises ${tool}, but ${manifest.entrypoint} does not expose it.`);
    }
  }
  parsed.push({ id: manifest.id, entrypoint: manifest.entrypoint, tools: manifest.tools?.length ?? 0 });
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
for (const requiredExport of ["./image-repair-routing.js", "./texture-map-review.js"]) {
  if (!mediaIndex.includes(`export * from "${requiredExport}";`)) {
    throw new Error(`packages/media/src/index.ts does not export ${requiredExport}.`);
  }
}

for (const requiredTest of [
  "packages/media/test/image-repair-routing.test.mjs",
  "packages/media/test/texture-map-review.test.mjs",
]) {
  await access(path.join(root, requiredTest));
}

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-agent-surfaces.check.v1",
  ok: true,
  surfaces: parsed,
  mediaExports: ["image-repair-routing", "texture-map-review"],
}, null, 2)}\n`);
