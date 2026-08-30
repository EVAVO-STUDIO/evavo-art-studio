#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["syntax:profile-base", ["--check", "tools/animation_production_profile_v1.mjs"]],
  ["syntax:profile-canonical", ["--check", "tools/animation_production_profile_canonical_v1.mjs"]],
  ["syntax:profile-mcp", ["--check", "tools/animation_production_profile_canonical_v1_mcp.mjs"]],
  ["syntax:delivery-base", ["--check", "tools/animation_sequence_delivery_v1.mjs"]],
  ["syntax:delivery-guard", ["--check", "tools/animation_sequence_delivery_guard_v1.mjs"]],
  ["syntax:delivery-canonical", ["--check", "tools/animation_sequence_delivery_canonical_v1.mjs"]],
  ["syntax:delivery-mcp", ["--check", "tools/animation_sequence_delivery_canonical_v1_mcp.mjs"]],
  ["test:profile-base", ["--test", "scripts/test-animation-production-profile-v1.mjs"]],
  ["test:profile-canonical", ["--test", "scripts/test-animation-production-profile-canonical-v1.mjs"]],
  ["test:delivery-canonical", ["--test", "scripts/test-animation-sequence-delivery-canonical-v1.mjs"]],
];

for (const [name, args] of checks) {
  process.stdout.write(`EVAVO_ANIMATION_CHECK_START ${name}\n`);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`EVAVO_ANIMATION_CHECK_FAILED ${name} exit=${String(result.status)}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`EVAVO_ANIMATION_CHECK_PASS ${name}\n`);
}

process.stdout.write("EVAVO_ANIMATION_PRODUCTION_CANONICAL_V1_PASS\n");
