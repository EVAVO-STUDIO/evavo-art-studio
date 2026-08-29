#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_JSON_BYTES = 16 * 1024 * 1024;

function parseArguments(argv) {
  const options = { input: undefined, authority: undefined, output: undefined, build: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { ...options, help: true };
    if (argument === "--no-build") { options.build = false; continue; }
    if (["--input", "--authority", "--output"].includes(argument)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${argument} requires a file path.`);
      options[argument.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (Boolean(options.input) === Boolean(options.authority)) throw new Error("Supply exactly one of --input or --authority.");
  return options;
}

function usage() {
  process.stdout.write(`Book cover commercial release V2 local runner\n\nUsage:\n  node scripts/run-book-cover-commercial-release-v2-local.mjs --input <release-v2-input.json> [--output <result.json>] [--no-build]\n  node scripts/run-book-cover-commercial-release-v2-local.mjs --authority <authority-v2.json> [--output <validation.json>] [--no-build]\n\nLocal validation is authoritative. No network, GitHub Actions, Vercel worker or paid service is used.\n`);
}

function buildContracts() {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(executable, ["--filter", "@evavo/art-contracts", "build"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.error) throw new Error(`Could not start local contract build: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Local contract build failed.\n${[result.stdout, result.stderr].filter(Boolean).join("\n")}`);
}

async function readJson(fileValue) {
  const file = path.resolve(process.cwd(), fileValue);
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`JSON path is not a file: ${file}`);
  if (info.size > MAX_JSON_BYTES) throw new Error(`JSON exceeds ${MAX_JSON_BYTES} bytes: ${file}`);
  try {
    return { file, value: JSON.parse(await readFile(file, "utf8")) };
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function emit(value, outputValue) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputValue) { process.stdout.write(json); return; }
  const output = path.resolve(process.cwd(), outputValue);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, json, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, output })}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { usage(); return; }
  if (options.build) buildContracts();
  const modulePath = path.join(root, "packages/contracts/dist/book-cover-commercial-release-v2.js");
  const module = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const source = await readJson(options.authority ?? options.input);
  if (options.authority) {
    const validation = module.validateBookCoverCommercialReleaseAuthorityV2(source.value);
    await emit({
      outputKind: "evavo_art_book_cover_commercial_release_v2_local_validation",
      sourceFile: source.file,
      ...validation,
      localValidationAuthoritative: true,
      networkUsed: false,
      githubHostedActionsUsed: false,
      vercelBackgroundWorkerUsed: false,
      paidServiceUsed: false,
    }, options.output);
    if (!validation.valid) process.exitCode = 1;
    return;
  }
  const result = module.compileBookCoverCommercialReleaseAuthorityV2(source.value);
  const validation = module.validateBookCoverCommercialReleaseAuthorityV2(result.authority);
  await emit({
    ...result,
    localValidation: {
      sourceFile: source.file,
      authorityValid: validation.valid,
      authorityIssues: validation.issues,
      localValidationAuthoritative: true,
      networkUsed: false,
      githubHostedActionsUsed: false,
      vercelBackgroundWorkerUsed: false,
      paidServiceUsed: false,
    },
  }, options.output);
  if (!validation.valid) process.exitCode = 1;
  else if (result.status !== "ready_for_docs_composition") process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    localValidationAuthoritative: true,
    networkUsed: false,
    githubHostedActionsUsed: false,
    vercelBackgroundWorkerUsed: false,
    paidServiceUsed: false,
  })}\n`);
  process.exitCode = 1;
});
