#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const files = {
  compiler: "scripts/compile-foundation-delivery-manifest.mjs",
  tests: "scripts/test-foundation-delivery-manifest.mjs",
  productionContractTests:
    "scripts/test-foundation-delivery-production-contract.mjs",
  docs: "docs/foundation-kit-media-delivery-manifest.md",
  workflow: ".github/workflows/foundation-media-delivery-authority.yml",
  package: "package.json",
  deliveryManifest: "packages/delivery-optimizer/dist/manifest.js",
};

const read = (relative, maximum = 2_000_000) => {
  const absolute = path.resolve(root, relative);
  const relation = path.relative(root, absolute);
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relation)
  ) {
    throw new Error(`FOUNDATION_DELIVERY_PATH_ESCAPE:${relative}`);
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`FOUNDATION_DELIVERY_MISSING:${relative}`);
  }
  const stats = fs.lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`FOUNDATION_DELIVERY_FILE_INVALID:${relative}`);
  }
  if (stats.size > maximum) {
    throw new Error(`FOUNDATION_DELIVERY_FILE_TOO_LARGE:${relative}`);
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} is missing ${token}`);
  }
};

const forbidTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (source.includes(token)) {
      errors.push(`${label} contains prohibited ${token}`);
    }
  }
};

const run = (label, command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    errors.push(
      `${label} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
};

try {
  const source = Object.fromEntries(
    Object.entries(files).map(([name, relative]) => [name, read(relative)]),
  );

  requireTokens("Foundation delivery compiler", source.compiler, [
    "evavo_godot_media_production_contract_v1",
    "evavo_godot_media_production_plan_v1",
    "evavo.art-delivery-optimization.v1",
    "evavo.foundation-media-delivery-authority.v1",
    "PLAN_AUDIT_ROOT_MISMATCH",
    "PLAN_CONTRACT_SHA256_MISMATCH",
    "SOURCE_SHA256_MISMATCH",
    "SOURCE_CHANGED_BEFORE_WRITE",
    "RUNTIME_TARGET_COLLISION",
    "RUNTIME_TARGET_WINDOWS_RESERVED",
    "CONTRACT_RUNTIME_FORMAT_INVALID",
    "RUNTIME_FORMAT_UNSUPPORTED",
    "OUTPUT_INSIDE_REPOSITORY",
    "PLAN_ITEM_NOT_READY",
    "png-lossless",
    "png-plus-fnt",
    "webp-lossless",
    "wav-mono-low-latency",
    "wav-or-ogg-role-owned",
    "ogg-vorbis-streaming",
    "preserve-role-owned",
    "not-applicable",
    "godot-sprite-lossless",
    "godot-cutout-webp-1080p",
    "godot-background-1080p",
    "deliveryManifestSha256",
    "deliveryManifestFileCreated: true",
    "syncDirectoryBestEffort",
    "exactSourceBytesVerified: true",
    'mutationScope: "create-only-delivery-manifest"',
    "targetRepositoryMutationPerformed: false",
    "applyAuthorized: false",
    "publicationAuthority: false",
  ]);
  forbidTokens("Foundation delivery compiler", source.compiler, [
    "new OpenAI",
    "images.generate",
    "images.edit",
    "git push",
    "git commit",
    "execSync",
    "spawnSync",
    "unlinkSync",
    "rmSync",
    "planFileCreated: true",
    "applyAuthorized: true",
    "selectionPerformed: true",
    "promotionPerformed: true",
    "publicationPerformed: true",
  ]);

  requireTokens("Foundation delivery tests", source.tests, [
    "PLAN_ITEM_NOT_READY",
    "SOURCE_BYTES_MISMATCH",
    "PLAN_CONTRACT_SHA256_MISMATCH",
    "PLAN_AUDIT_ROOT_MISMATCH",
    "RUNTIME_TARGET_COLLISION",
    "RUNTIME_FORMAT_UNSUPPORTED",
    "OUTPUT_INSIDE_REPOSITORY",
    "OUTPUT_EXISTS",
    "PLAN_INSIDE_REPOSITORY",
    "SYMLINK_PATH_FORBIDDEN",
    "FOUNDATION_DELIVERY_REQUIRE_PACKAGE",
    "validateDeliveryBatchManifest",
  ]);

  requireTokens(
    "Foundation production-contract compatibility tests",
    source.productionContractTests,
    [
      "preserve-role-owned",
      "wav-mono-low-latency",
      "wav-or-ogg-role-owned",
      "ogg-vorbis-streaming",
      "deliveryManifestFileCreated",
      "RUNTIME_FORMAT_UNSUPPORTED",
      "CONTRACT_RUNTIME_FORMAT_INVALID",
      "RUNTIME_TARGET_WINDOWS_RESERVED",
      "OPTION_DUPLICATE",
    ],
  );

  requireTokens("Foundation delivery documentation", source.docs, [
    "Exact input authorities",
    "create-only delivery manifest",
    "Delivery profile mapping",
    "Staging and execution",
    "Independent gates",
    "Truth boundary",
    "png-lossless",
    "webp-lossless",
    "mixed image and audio contract",
    "deliveryManifestFileCreated",
    "Godot Game Test Lab",
    "EVAVO Development Studio",
  ]);

  requireTokens("Foundation delivery workflow", source.workflow, [
    "name: Foundation Media Delivery Authority",
    "ubuntu-24.04",
    "version: 10.13.1",
    'node-version: "22.14.0"',
    "pnpm install --no-frozen-lockfile",
    "pnpm --filter @evavo/art-delivery-optimizer... build",
    "pnpm --filter @evavo/art-delivery-optimizer typecheck",
    "pnpm --filter @evavo/art-delivery-optimizer test",
    "node scripts/check-foundation-delivery-manifest.mjs",
    "git diff --exit-code",
    "foundation-media-delivery-authority-${{ github.sha }}",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  ]);

  const packageJson = JSON.parse(source.package);
  if (
    packageJson.scripts?.["foundation:delivery"] !==
      "node scripts/compile-foundation-delivery-manifest.mjs" ||
    packageJson.scripts?.["foundation:delivery:check"] !==
      "node scripts/check-foundation-delivery-manifest.mjs" ||
    !String(packageJson.scripts?.check ?? "").includes(
      "pnpm run foundation:delivery:check",
    )
  ) {
    errors.push("Root package scripts do not enforce Foundation delivery authority.");
  }

  requireTokens("Delivery manifest runtime", source.deliveryManifest, [
    "validateDeliveryBatchManifest",
    "DELIVERY_MANIFEST_SCHEMA_INVALID",
    "DELIVERY_MANIFEST_SHA256_INVALID",
    "DELIVERY_MANIFEST_TARGET_COLLISION",
  ]);

  for (const relative of [
    files.compiler,
    files.tests,
    files.productionContractTests,
    "scripts/check-foundation-delivery-manifest.mjs",
  ]) {
    run(`Syntax check ${relative}`, process.execPath, [
      "--check",
      path.join(root, relative),
    ]);
  }
  run(
    "Foundation delivery executable attacks",
    process.execPath,
    [path.join(root, files.tests)],
    {
      timeout: 180_000,
      env: { FOUNDATION_DELIVERY_REQUIRE_PACKAGE: "1" },
    },
  );
  run(
    "Foundation production-contract compatibility attacks",
    process.execPath,
    [path.join(root, files.productionContractTests)],
    { timeout: 180_000 },
  );
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  process.stderr.write("Foundation media-delivery authority check failed:\n");
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Foundation media-delivery authority check passed.\n" +
      "- exact contract, plan, audit and source-byte authorities remain bound\n" +
      "- the mixed production contract is accepted without widening selected formats\n" +
      "- emitted output is accepted by the delivery-optimizer manifest runtime\n" +
      "- blocked, tampered, colliding and unsafe paths fail before output\n" +
      "- execution, approval and publication remain separate authorities\n",
  );
}
