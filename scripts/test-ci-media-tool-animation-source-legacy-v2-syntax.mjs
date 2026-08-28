import assert from "node:assert/strict";
import test from "node:test";

import { legacyAnimationSourceAccesses as scan } from "./lib/animation-source-legacy-access-v2.mjs";

const target = "../../../../scripts/lib/animation-source-bundle.mjs";

test("syntax-aware scan ignores comments, strings, templates and MDX prose", () => {
  for (const source of [
    `const example = 'import { readJson } from "${target}";';`,
    `/* import { readJson } from "${target}"; */ export const ok = true;`,
    `// import { readJson } from "${target}";\nexport const ok = true;`,
    `const docs = \`import { readJson } from "${target}";\`;`,
  ]) {
    assert.deepEqual(scan(source, "apps/api/src/docs.ts"), []);
  }
  for (const source of [
    `# Guide\n\nThe string import { readJson } from "${target}" is forbidden.`,
    `> import { readJson } from "${target}";`,
    `# Guide\n\nUse import("${target}") to explain it.`,
    `> import("${target}")`,
    `Use \`import("${target}")\`.`,
  ]) {
    assert.deepEqual(scan(source, "docs/guide.mdx"), []);
  }
});

test("syntax-aware scan preserves URL, comment-gap and computed-load coverage", () => {
  const cases = [
    [`import/*a*/{ readJson }/*b*/from/*c*/"${target}?legacy=1";`, ["readJson"]],
    [`export/*a*/{ writeJsonAtomic }/*b*/from/*c*/"${target}#legacy";`, ["writeJsonAtomic"]],
    [`import { readJson } from "../../../../scripts/lib/animation-source-bundle%2Emjs";`, ["readJson"]],
    [`import { readJson } from "../../../../scripts/lib/animation-source-bundle\\u002emjs";`, ["readJson"]],
    [`import type { readJson } from "../../../../scripts/lib/Animation-Source-Bundle.mjs";`, ["readJson"]],
    [`export * as legacy from "${target}";`, ["star-reexport"]],
    [`const x = import("../../../../scripts/lib/animation-source-" + "bundle.mjs");`, ["dynamic-import"]],
    [`const x = import(\`../../../../scripts/lib/animation-source-${'${"bundle"}'}.mjs\`);`, ["dynamic-import"]],
    [`const x = import(new URL("${target}", import.meta.url));`, ["dynamic-import"]],
    [`const x = import(new URL("${target}", import.meta.url).href);`, ["dynamic-import"]],
    [`const x = createRequire(import.meta.url)("${target}");`, ["require-import"]],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(scan(source, "apps/api/src/runtime.ts"), expected, source);
  }
});

test("syntax-aware scan extracts executable regions from Vue, Svelte and Astro", () => {
  const vue = `<template><p>import { readJson } from "${target}";</p></template>\n<script setup lang="ts">import { readJson } from "${target}";</script>`;
  assert.deepEqual(scan(vue, "component.vue"), ["readJson"]);

  const svelte = `<p>import { readJson } from "${target}";</p>\n<script>const loader = import("${target}");</script>`;
  assert.deepEqual(scan(svelte, "component.svelte"), ["dynamic-import"]);

  const astro = `---\nimport { readJson } from "${target}";\n---\n<p>import { writeJsonAtomic } from "${target}";</p>`;
  assert.deepEqual(scan(astro, "page.astro"), ["readJson"]);
});

test("syntax-aware MDX scan keeps executable ESM and expressions governed", () => {
  const fenced = `# Guide\n\n\`\`\`ts\nimport { readJson } from "${target}";\n\`\`\`\n`;
  assert.deepEqual(scan(fenced, "docs/guide.mdx"), []);

  const realImport = `import { readJson } from "${target}";\n\n# Guide`;
  assert.deepEqual(scan(realImport, "docs/guide.mdx"), ["readJson"]);

  const expression = `Text {import("${target}")}`;
  assert.deepEqual(scan(expression, "docs/guide.mdx"), ["dynamic-import"]);

  const exported = `export const loader = () => import("${target}")\n\n# Guide`;
  assert.deepEqual(scan(exported, "docs/guide.mdx"), ["dynamic-import"]);

  const jsx = `<Example loader={import("${target}")} />`;
  assert.deepEqual(scan(jsx, "docs/guide.mdx"), ["dynamic-import"]);
});
