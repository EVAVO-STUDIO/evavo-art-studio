import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("runtime dashboard exposes the complete owner operating workflow", async () => {
  const component = await read("app/operations/runtime-operations-dashboard.tsx");
  const page = await read("app/operations/page.tsx");
  const css = await read("app/operations/operations.module.css");
  for (const token of [
    "Unlock control room",
    "HttpOnly signed session",
    "New durable job",
    "Recover leases",
    "IMMUTABLE EVENTS",
    "ATTEMPT HISTORY",
    "Input artifacts",
    "Output artifacts",
    "Private payload and labels",
    "Download",
    "contentValid",
    "descriptorValid",
    "Confirm",
    "intentional",
    'fetch("/api/operator',
    "autoRefresh",
    "selectedJobDetail",
  ]) {
    assert.ok(`${component}\n${page}\n${css}`.includes(token), `missing dashboard behaviour: ${token}`);
  }
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "EVAVO_ART_WRITE_TOKEN",
    "EVAVO_ART_OPERATOR_ACCESS_TOKEN",
    "dangerouslySetInnerHTML",
    "window.confirm",
    "window.prompt",
  ]) {
    assert.ok(!component.includes(forbidden), `dashboard contains forbidden shortcut: ${forbidden}`);
  }
});

test("studio navigation exposes operations without replacing creative workbenches", async () => {
  const home = await read("app/page.tsx");
  for (const token of [
    'href="/operations"',
    "<StudioWorkspace",
    "<SpriteQualityWorkbench",
    "<SpriteSequenceWorkbench",
  ]) {
    assert.ok(home.includes(token), `missing studio navigation contract: ${token}`);
  }
});
