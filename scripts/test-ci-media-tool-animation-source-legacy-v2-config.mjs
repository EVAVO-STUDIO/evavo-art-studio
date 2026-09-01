import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertAnimationSourceLegacyConfigUsageV2,
  inspectAnimationSourceLegacyConfigUsageV2,
} from "./lib/animation-source-legacy-config-v2.mjs";
import {
  legacyFixture,
  removeFixture,
  track,
} from "./test-support/animation-source-legacy-v2-fixture.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("package imports and conditional exports cannot alias the legacy library", async () => {
  const root = await legacyFixture();
  try {
    await track(
      root,
      "package.json",
      JSON.stringify({
        imports: {
          "#legacy": "./scripts/lib/animation-source-bundle.mjs",
        },
        exports: {
          "./legacy": {
            import: "./scripts/lib/animation-source-bundle.mjs",
          },
        },
      }),
    );
    const report = await inspectAnimationSourceLegacyConfigUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, 2);
    await assert.rejects(
      assertAnimationSourceLegacyConfigUsageV2(root),
      /ANIMATION_SOURCE_LEGACY_CONFIG_ALIAS_FORBIDDEN/u,
    );
  } finally {
    await removeFixture(root);
  }
});

test("package export and TypeScript wildcard aliases cannot expose the legacy library", async () => {
  const root = await legacyFixture();
  try {
    await track(
      root,
      "package.json",
      JSON.stringify({
        exports: {
          "./legacy/*": "./scripts/lib/*",
        },
      }),
    );
    await track(
      root,
      "tsconfig.base.json",
      `{
        // JSONC is expected for TypeScript configuration.
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@legacy/*": ["scripts/lib/*"]
          }
        }
      }`,
    );
    const report = await inspectAnimationSourceLegacyConfigUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, 2);
  } finally {
    await removeFixture(root);
  }
});

test("Deno and import-map prefix aliases cannot expose the legacy library", async () => {
  const root = await legacyFixture();
  try {
    await track(
      root,
      "deno.jsonc",
      `{
        // Directory-prefix imports append the requested module path.
        "imports": {
          "@legacy/": "./scripts/lib/"
        }
      }`,
    );
    await track(
      root,
      "import-map.json",
      JSON.stringify({
        scopes: {
          "./apps/": {
            "@legacy/": "./scripts/lib/",
          },
        },
      }),
    );
    const report = await inspectAnimationSourceLegacyConfigUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, 2);
  } finally {
    await removeFixture(root);
  }
});

test("safe CLI aliases and documentation strings do not target the legacy library", async () => {
  const root = await legacyFixture();
  try {
    await track(
      root,
      "package.json",
      JSON.stringify({
        description:
          "scripts/lib/animation-source-bundle.mjs is documented here",
        imports: {
          "#animation-source-cli":
            "./scripts/animation-source-bundle.mjs",
        },
      }),
    );
    await track(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          paths: {
            "@safe/*": ["packages/safe/*"],
          },
        },
      }),
    );
    const report = await assertAnimationSourceLegacyConfigUsageV2(root);
    assert.equal(report.status, "passed");
  } finally {
    await removeFixture(root);
  }
});

test("malformed governed configuration fails closed", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "package.json", "{ not-json");
    await assert.rejects(
      inspectAnimationSourceLegacyConfigUsageV2(root),
      /ANIMATION_SOURCE_LEGACY_CONFIG_JSON_INVALID/u,
    );
  } finally {
    await removeFixture(root);
  }
});

test("untracked configuration has no repository authority", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "package.json", JSON.stringify({ name: "safe" }));
    await writeFile(
      path.join(root, "import-map.json"),
      JSON.stringify({
        imports: {
          "@legacy": "./scripts/lib/animation-source-bundle.mjs",
        },
      }),
      "utf8",
    );
    const report = await assertAnimationSourceLegacyConfigUsageV2(root);
    assert.equal(report.status, "passed");
    assert.equal(report.configFileCount, 1);
  } finally {
    await removeFixture(root);
  }
});

test("the actual tracked Art Studio configuration exposes no legacy alias", async () => {
  const report =
    await assertAnimationSourceLegacyConfigUsageV2(repositoryRoot);
  assert.equal(report.status, "passed");
  assert.equal(report.authority.githubActionsRequired, false);
  assert.equal(report.authority.vercelRequired, false);
});
