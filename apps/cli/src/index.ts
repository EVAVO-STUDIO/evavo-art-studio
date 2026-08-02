#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
  compileProviderCandidatePrompt,
  providerProtocolSummary,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  analyseDecodedSpriteFrame,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "@evavo/art-quality";
import { inspectRepository } from "@evavo/art-repo-inspector";

import {
  handleArtDirectionCommand,
  type ArtDirectionCommandValues,
} from "./art-direction-commands.js";
import {
  handleBookArtCommand,
  type BookArtCommandValues,
} from "./book-art-commands.js";
import {
  handleMasteringCommand,
  type MasteringCommandValues,
} from "./mastering-command.js";
import {
  handleLocalControlCommand,
  type LocalControlValues,
} from "./runtime-commands.js";
import {
  handleSelectionCommand,
  type SelectionCommandValues,
} from "./selection-commands.js";
import {
  handleSpriteSupervisorCommand,
  type SpriteSupervisorCommandValues,
} from "./sprite-supervisor-commands.js";

const help = `EVAVO Art Studio CLI

Usage:
  evavo-art capabilities
  evavo-art validate --input brief.json
  evavo-art plan --input brief.json [--output plan.json]
  evavo-art inspect --repo C:\\GitRepos\\my-game [--output snapshot.json]

  evavo-art art-direction-protocol [--output art-direction-protocol.json]
  evavo-art art-direction-presets [--output art-direction-presets.json]
  evavo-art art-direction-outputs [--output art-direction-output-profiles.json]
  evavo-art art-direction-validate --input art-direction.json [--output normalized-art-direction.json]
  evavo-art art-direction-compile --input art-direction.json [--output compiled-art-direction.json]

  evavo-art sprite-plan-protocol [--output sprite-plan-protocol.json]
  evavo-art sprite-plan-validate --input sprite-plan.json [--output normalized-sprite-plan.json]
  evavo-art sprite-plan-compile --input sprite-plan.json [--output compiled-sprite-plan.json]

  evavo-art sprite-supervisor-protocol [--output sprite-supervisor-protocol.json]
  evavo-art sprite-supervisor-validate --input sprite-supervisor.json [--output normalized-supervisor.json]
  evavo-art sprite-supervisor-compile --input sprite-supervisor.json [--output compiled-supervisor.json]
  evavo-art sprite-supervisor-start --input sprite-supervisor.json [--runtime-root .art-studio/runtime] [--actor cli]

  evavo-art quality-frame --input frame.png --expectations frame-quality.json [--output report.json]
  evavo-art quality-sequence --manifest sequence.json [--output report.json]
  evavo-art master-alpha --input candidate.png --matte #00ff00 --output candidate.alpha.png [--evidence candidate.alpha.evidence.json] [--expectations frame-quality.json]
  evavo-art atlas-build --manifest atlas.json --output-dir generated [--godot-project C:\\GitRepos\\game] [--godot-executable C:\\Path\\Godot_v4.6.2.exe]

  evavo-art provider-protocol [--output provider-protocol.json]
  evavo-art provider-validate --input candidate-request.json [--output normalized-request.json]
  evavo-art provider-compile --input candidate-request.json [--output compiled-provider-contract.json]

  evavo-art book-art-provider-protocol [--output book-art-provider-protocol.json]
  evavo-art book-art-provider-compile --input book-art-shadow-request.json [--output compiled-book-art-job.json]
  evavo-art book-art-provider-submit --input book-art-shadow-request.json [--runtime-root .art-studio/runtime] [--actor cli] [--output submitted-book-art-job.json]

  evavo-art selection-protocol [--output selection-protocol.json]
  evavo-art selection-validate --input selection.json [--output normalized-selection.json]
  evavo-art selection-compile --input selection.json [--output selection-job.json]
  evavo-art selection-run --input selection.json [--artifact-root .art-studio/artifacts] [--output result.json]
  evavo-art promotion-validate --input promotion.json [--output normalized-promotion.json]
  evavo-art promotion-compile --input promotion.json [--output promotion-job.json]
  evavo-art promotion-run --input promotion.json [--artifact-root .art-studio/artifacts] [--output result.json]

  evavo-art runtime-submit --input job.json [--runtime-root .art-studio/runtime] [--actor cli]
  evavo-art runtime-list [--state queued,running] [--queue selection] [--kind art.candidate.select] [--limit 100]
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
Art-direction compilation locks style, projection, shot ownership, layers, QA and output requirements before any provider call.
Sprite planning calculates complete clip, direction, frame, layer, variant, sheet, atlas and Godot coverage.
Sprite supervision submits bounded durable jobs, observes immutable evidence, redrives transient failures, routes authorised repair and stops for review without weakening quality gates.
Provider validation and compilation never call an external model. Candidate execution occurs only through a capability-matched durable worker job.
Book Art provider commands require EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS; the input may not supply adapterPolicy. Compilation and submission perform no provider call, and submission remains one-attempt and duplicate-safe.
Alpha mastering is deterministic and writes an unapproved PNG plus evidence. It exits with code 3 when blocking sprite QA fails.
Selection writes immutable ranking evidence. Promotion is a separate explicit compare-and-swap operation and cannot override blocking failures.
Atlas and durable-runtime writes are explicit, local and root-scoped.
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
      evidence: { type: "string" },
      matte: { type: "string" },
      "connection-distance": { type: "string" },
      "opaque-seed-distance": { type: "string" },
      "edge-search-radius": { type: "string" },
      "bleed-radius": { type: "string" },
      "minimum-border-matte-fraction": { type: "string" },
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

  const supervisor = await handleSpriteSupervisorCommand(
    command,
    parsed.values as SpriteSupervisorCommandValues,
  );
  if (supervisor.handled) {
    await emit(supervisor.value, parsed.values.output);
    return;
  }

  const artDirection = await handleArtDirectionCommand(
    command,
    parsed.values as ArtDirectionCommandValues,
  );
  if (artDirection.handled) {
    await emit(artDirection.value, parsed.values.output);
    return;
  }

  const bookArt = await handleBookArtCommand(
    command,
    parsed.values as BookArtCommandValues,
  );
  if (bookArt.handled) {
    await emit(bookArt.value, parsed.values.output);
    if (bookArt.exitCode !== undefined) process.exitCode = bookArt.exitCode;
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

  const mastering = await handleMasteringCommand(
    command,
    parsed.values as MasteringCommandValues,
  );
  if (mastering.handled) {
    await emit(mastering.value);
    if (mastering.exitCode !== undefined) process.exitCode = mastering.exitCode;
    return;
  }

  const selection = await handleSelectionCommand(
    command,
    parsed.values as SelectionCommandValues,
  );
  if (selection.handled) {
    await emit(selection.value, parsed.values.output);
    return;
  }

  if (command === "capabilities") {
    await emit(
      { schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG },
      parsed.values.output,
    );
    return;
  }

  if (command === "provider-protocol") {
    await emit(providerProtocolSummary(), parsed.values.output);
    return;
  }

  if (command === "provider-validate" || command === "provider-compile") {
    if (!parsed.values.input) {
      throw new Error(`--input is required for ${command}.`);
    }
    const request = validateProviderCandidateRequest(
      await readJson(parsed.values.input),
    );
    if (command === "provider-validate") {
      await emit(request, parsed.values.output);
      return;
    }
    const prompt = compileProviderCandidatePrompt(request);
    await emit(
      {
        schemaVersion: "1.0",
        request,
        requestSha256: providerRequestSha256(request),
        compiledPrompt: prompt.text,
        compiledPromptSha256: prompt.sha256,
        executionMode: "durable-worker-only",
      },
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
    if (!parsed.values.input) {
      throw new Error("--input is required for quality-frame.");
    }
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
    if (!parsed.values.manifest) {
      throw new Error("--manifest is required for atlas-build.");
    }
    if (!parsed.values["output-dir"]) {
      throw new Error("--output-dir is required for atlas-build.");
    }
    if (parsed.values["godot-executable"] && !parsed.values["godot-project"]) {
      throw new Error(
        "--godot-project is required when --godot-executable is supplied.",
      );
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