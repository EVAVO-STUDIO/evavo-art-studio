#!/usr/bin/env node
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import {
  runGodotSpriteFramesImport,
  toGodotResourcePath,
  writeGodotSpriteFramesImporter,
} from "@evavo/art-godot";
import { buildSpriteAtlasPackage } from "@evavo/art-media";
import {
  analyseDecodedSpriteFrame,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "@evavo/art-quality";
import { inspectRepository } from "@evavo/art-repo-inspector";

import {
  handleLocalControlCommand,
  type LocalControlValues,
} from "./runtime-commands.js";

const help = `EVAVO Art Studio CLI

Usage:
  evavo-art capabilities
  evavo-art validate --input brief.json
  evavo-art plan --input brief.json [--output plan.json]
  evavo-art inspect --repo C:\\GitRepos\\my-game [--output snapshot.json]
  evavo-art quality-frame --input frame.png --expectations frame-quality.json [--output report.json]
  evavo-art quality-sequence --manifest sequence.json [--output report.json]
  evavo-art atlas-build --manifest atlas.json --output-dir generated [--godot-project C:\\GitRepos\\game] [--godot-executable C:\\Path\\Godot_v4.6.2.exe]

  evavo-art runtime-submit --input job.json [--runtime-root .art-studio/runtime] [--actor cli]
  evavo-art runtime-list [--state queued,running] [--queue media] [--kind sprite.atlas.build] [--limit 100]
  evavo-art runtime-show --job job_id
  evavo-art runtime-events [--after 0]
  evavo-art runtime-cancel --job job_id [--force]
  evavo-art runtime-pause --job job_id [--force]
  evavo-art runtime-resume --job job_id
  evavo-art runtime-redrive --job job_id [--attempts 1]
  evavo-art runtime-recover

  evavo-art artifact-put --input file.png --descriptor descriptor.json [--artifact-root .art-studio/artifacts]
  evavo-art artifact-show --artifact artifact_sha256
  evavo-art artifact-verify --artifact artifact_sha256
  evavo-art artifact-ref-set --namespace projects/demo --name approved-master --artifact artifact_sha256 [--expected-generation 0]
  evavo-art artifact-ref-resolve --namespace projects/demo --name approved-master

All commands emit JSON so ChatGPT, Claude, CI and scripts can consume the same contract.
A quality command exits with code 3 when deterministic blocking gates fail.
Atlas and durable-runtime writes are explicit, local, root-scoped and never call a provider.
`;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, "utf8");
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      repo: { type: "string", short: "r" },
      expectations: { type: "string", short: "e" },
      manifest: { type: "string", short: "m" },
      descriptor: { type: "string", short: "d" },
      "output-dir": { type: "string" },
      "godot-project": { type: "string" },
      "godot-executable": { type: "string" },
      "runtime-root": { type: "string" },
      "artifact-root": { type: "string" },
      artifact: { type: "string" },
      job: { type: "string" },
      state: { type: "string" },
      queue: { type: "string" },
      kind: { type: "string" },
      limit: { type: "string" },
      actor: { type: "string" },
      attempts: { type: "string" },
      after: { type: "string" },
      force: { type: "boolean" },
      namespace: { type: "string" },
      name: { type: "string" },
      "expected-generation": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!command || parsed.values.help) {
    process.stdout.write(help);
    return;
  }

  const localControl = await handleLocalControlCommand(
    command,
    parsed.values as LocalControlValues,
  );
  if (localControl.handled) {
    await emit(localControl.value, parsed.values.output);
    return;
  }

  if (command === "capabilities") {
    await emit(
      { schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG },
      parsed.values.output,
    );
    return;
  }

  if (command === "inspect") {
    if (!parsed.values.repo) throw new Error("--repo is required for inspect.");
    await emit(await inspectRepository(parsed.values.repo), parsed.values.output);
    return;
  }

  if (command === "quality-frame") {
    if (!parsed.values.input) throw new Error("--input is required for quality-frame.");
    if (!parsed.values.expectations) {
      throw new Error("--expectations is required for quality-frame.");
    }
    const report = analyseDecodedSpriteFrame(
      await decodeSpriteFrame(parsed.values.input),
      await readJson(parsed.values.expectations),
    );
    await emit(report, parsed.values.output);
    if (!report.passed) process.exitCode = 3;
    return;
  }

  if (command === "quality-sequence") {
    if (!parsed.values.manifest) {
      throw new Error("--manifest is required for quality-sequence.");
    }
    const manifestPath = path.resolve(parsed.values.manifest);
    const report = await analyseSpriteSequenceManifestFile(manifestPath, {
      allowedRoots: [path.dirname(manifestPath)],
    });
    await emit(report, parsed.values.output);
    if (!report.passed) process.exitCode = 3;
    return;
  }

  if (command === "atlas-build") {
    if (!parsed.values.manifest) throw new Error("--manifest is required for atlas-build.");
    if (!parsed.values["output-dir"]) {
      throw new Error("--output-dir is required for atlas-build.");
    }
    if (parsed.values["godot-executable"] && !parsed.values["godot-project"]) {
      throw new Error("--godot-project is required when --godot-executable is supplied.");
    }

    const manifestPath = path.resolve(parsed.values.manifest);
    const outputDirectory = path.resolve(parsed.values["output-dir"]);
    const projectPath = parsed.values["godot-project"]
      ? path.resolve(parsed.values["godot-project"])
      : undefined;
    const allowedRoots = [projectPath ?? path.dirname(manifestPath)];
    const atlas = await buildSpriteAtlasPackage(manifestPath, outputDirectory, {
      allowedRoots,
    });
    const godot = projectPath
      ? await writeGodotSpriteFramesImporter(atlas, projectPath)
      : undefined;
    const execution =
      godot && projectPath && parsed.values["godot-executable"]
        ? await runGodotSpriteFramesImport({
            godotExecutable: parsed.values["godot-executable"],
            projectPath,
            importerPath: toGodotResourcePath(projectPath, godot.importerPath),
            descriptorResourcePath: toGodotResourcePath(
              projectPath,
              godot.descriptorPath,
            ),
          })
        : undefined;

    await emit(
      {
        schemaVersion: "1.0",
        atlasId: atlas.packageData.atlasId,
        atlas: {
          imagePath: atlas.imagePath,
          dataPath: atlas.dataPath,
          evidencePath: atlas.evidencePath,
          width: atlas.packageData.width,
          height: atlas.packageData.height,
          frames: atlas.packageData.frames.length,
          animations: atlas.packageData.animations.length,
          imageSha256: atlas.packageData.atlasImage.sha256,
          dataSha256: atlas.atlasDataSha256,
        },
        ...(godot
          ? {
              godot: {
                descriptorPath: godot.descriptorPath,
                importerPath: godot.importerPath,
                resourcePath: godot.resourcePath,
                headlessCommand: godot.headlessCommand,
              },
            }
          : {}),
        ...(execution ? { execution } : {}),
      },
      parsed.values.output,
    );
    return;
  }

  if (!parsed.values.input) throw new Error("--input is required.");
  const input = await readJson(parsed.values.input);

  if (command === "validate") {
    const result = validateArtBrief(input);
    await emit(result, parsed.values.output);
    if (!result.success) process.exitCode = 2;
    return;
  }

  if (command === "plan") {
    await emit(createProductionPlan(input), parsed.values.output);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_ART_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
