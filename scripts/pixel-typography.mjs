#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const automationManifestPath = path.join(root, "config", "pixel-font-automation-suite.v1.json");
const python = process.env.EVAVO_PIXEL_TYPOGRAPHY_PYTHON
  ?? process.env.EVAVO_PIXEL_FONT_UNIVERSAL_PYTHON
  ?? "python";

const commands = Object.freeze({
  font: {
    executable: python,
    args: [path.join(root, "tools", "pixel_font_universal.py")],
    description: "Universal Pixel Font Studio v3 compiler and validator",
  },
  text: {
    executable: python,
    args: [path.join(root, "tools", "pixel_text_studio.py")],
    description: "Pixel Text Studio static/animated raster-title renderer",
  },
  delivery: {
    executable: process.execPath,
    args: [path.join(root, "scripts", "pixel-font-repository-delivery.mjs")],
    description: "Transactional allowlisted cross-repository installer and normal Git publisher",
  },
});

const checkCommands = Object.freeze([
  [python, path.join(root, "tools", "check_pixel_font_universal.py")],
  [python, path.join(root, "tools", "check_pixel_text_studio.py")],
  [process.execPath, path.join(root, "scripts", "check-pixel-text-studio-mcp.mjs")],
  [process.execPath, path.join(root, "scripts", "check-pixel-font-repository-delivery.mjs")],
  [process.execPath, path.join(root, "scripts", "check-pixel-font-automation-suite.mjs")],
]);

function usage() {
  process.stderr.write([
    "Usage: node scripts/pixel-typography.mjs <command> [args...]",
    "",
    "Commands:",
    "  catalog              Print the machine-readable unified capability catalogue",
    "  font <args...>       Forward to Universal Pixel Font Studio v3",
    "  text <args...>       Forward to Pixel Text Studio",
    "  delivery <args...>   Forward to guarded cross-repository delivery",
    "  check                Run the canonical pixel typography validation stack",
    "",
    "Examples:",
    "  node scripts/pixel-typography.mjs font catalog",
    "  node scripts/pixel-typography.mjs text catalog",
    "  node scripts/pixel-typography.mjs delivery catalog",
    "  node scripts/pixel-typography.mjs check",
    "",
  ].join("\n"));
}

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    process.stderr.write(`pixel-typography failed to start ${path.basename(executable)}: ${result.error.message}\n`);
    return 1;
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

async function catalog() {
  const automation = JSON.parse(await readFile(automationManifestPath, "utf8"));
  return {
    schema: "evavo.pixel-typography-cli.catalog.v1",
    version: 1,
    description: "One shell-free discovery and dispatch surface for EVAVO pixel fonts, pixel titles/UI text, validation and governed repository delivery.",
    commands: {
      catalog: { mode: "read-only", description: "machine-readable capabilities" },
      font: { mode: "delegated", entrypoint: "tools/pixel_font_universal.py", description: commands.font.description },
      text: { mode: "delegated", entrypoint: "tools/pixel_text_studio.py", description: commands.text.description },
      delivery: { mode: "delegated", entrypoint: "scripts/pixel-font-repository-delivery.mjs", description: commands.delivery.description },
      check: { mode: "read-only", description: "canonical deterministic validation stack" },
    },
    mcp: automation.servers.map(({ id, entrypoint, defaultWriteEnabled, defaultGitPublishEnabled }) => ({
      id,
      entrypoint,
      defaultWriteEnabled,
      ...(defaultGitPublishEnabled === undefined ? {} : { defaultGitPublishEnabled }),
    })),
    policy: {
      arbitraryShell: false,
      callerSelectedExecutable: false,
      fontMasterMutation: false,
      creativeApproval: false,
      repositoryMutationByCatalogue: false,
      publicationEnabledByDefault: automation.publication.enabledByDefault,
      exactTargetHeadRequired: automation.publication.exactTargetHeadRequired,
      normalPushOnly: automation.publication.normalPushOnly,
      forcePush: automation.publication.forcePush,
    },
    docs: [
      "docs/PIXEL_TYPOGRAPHY_AUTOMATION.md",
      "docs/PIXEL_TEXT_STUDIO.md",
      "docs/PIXEL_FONT_REPOSITORY_DELIVERY.md",
    ],
  };
}

const [, , command, ...forwarded] = process.argv;
if (!command || command === "help" || command === "--help" || command === "-h") {
  usage();
  process.exit(command ? 0 : 2);
}

if (command === "catalog") {
  if (forwarded.length) {
    process.stderr.write("catalog does not accept additional arguments\n");
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(await catalog(), null, 2)}\n`);
  process.exit(0);
}

if (command === "check") {
  if (forwarded.length) {
    process.stderr.write("check does not accept additional arguments\n");
    process.exit(2);
  }
  for (const [executable, script] of checkCommands) {
    const status = run(executable, [script]);
    if (status !== 0) process.exit(status);
  }
  process.stdout.write("EVAVO_PIXEL_TYPOGRAPHY_CHECK_OK\n");
  process.exit(0);
}

const delegated = commands[command];
if (!delegated) {
  process.stderr.write(`unknown pixel-typography command: ${command}\n`);
  usage();
  process.exit(2);
}
process.exit(run(delegated.executable, [...delegated.args, ...forwarded]));
