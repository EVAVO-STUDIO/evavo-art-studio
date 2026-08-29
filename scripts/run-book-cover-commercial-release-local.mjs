#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_JSON_BYTES = 16 * 1024 * 1024;

function usage() {
  process.stdout.write(`Book cover commercial release local runner\n\nUsage:\n  node scripts/run-book-cover-commercial-release-local.mjs --input <release-input.json> [--output <result.json>] [--no-build]\n  node scripts/run-book-cover-commercial-release-local.mjs --authority <authority.json> [--output <validation.json>] [--no-build]\n\nThis runner is local-only. It does not call GitHub Actions, Vercel, a crawler, an image API or any network service.\n`);
}

function parseArguments(argv) {
  const options = { input: undefined, authority: undefined, output: undefined, build: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { ...options, help: true };
    if (argument === "--no-build") {
      options.build = false;
      continue;
    }
    if (["--input", "--authority", "--output"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a file path.`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (Boolean(options.input) === Boolean(options.authority)) {
    throw new Error("Supply exactly one of --input or --authority.");
  }
  return options;
}

function runBuild() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["--filter", "@evavo/art-contracts", "build"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Unable to run the local contracts build: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Local contracts build failed.${detail ? `\n${detail}` : ""}`);
  }
}

async function readJson(relativeOrAbsolute) {
  const file = path.resolve(process.cwd(), relativeOrAbsolute);
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new Error(`JSON path is not a file: ${file}`);
  if (fileStat.size > MAX_JSON_BYTES) throw new Error(`JSON file exceeds ${MAX_JSON_BYTES} bytes: ${file}`);
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse JSON from ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { file, value };
}

async function emit(value, outputPath) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    const file = path.resolve(process.cwd(), outputPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, json, "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, output: file })}\n`);
    return;
  }
  process.stdout.write(json);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.build) runBuild();
  const modulePath = path.join(root, "packages/contracts/dist/book-cover-commercial-release.js");
  await access(modulePath);
  const {
    compileBookCoverCommercialReleaseAuthority,
    validateBookCoverCommercialReleaseAuthority,
  } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);

  if (options.authority) {
    const source = await readJson(options.authority);
    const validation = validateBookCoverCommercialReleaseAuthority(source.value);
    await emit({
      outputKind: "evavo_art_book_cover_commercial_release_local_validation",
      sourceFile: source.file,
      valid: validation.valid,
      issues: validation.issues,
      localValidationAuthoritative: true,
      networkUsed: false,
      githubHostedActionsUsed: false,
      vercelBackgroundWorkerUsed: false,
      paidServiceUsed: false,
    }, options.output);
    if (!validation.valid) process.exitCode = 1;
    return;
  }

  const source = await readJson(options.input);
  const result = compileBookCoverCommercialReleaseAuthority(source.value);
  const validation = validateBookCoverCommercialReleaseAuthority(result.authority);
  const output = {
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
  };
  await emit(output, options.output);
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
