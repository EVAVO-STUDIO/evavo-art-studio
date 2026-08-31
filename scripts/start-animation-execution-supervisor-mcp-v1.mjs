#!/usr/bin/env node

import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  serveAnimationExecutionSupervisorMcp,
} from "../tools/animation_execution_supervisor_v1_mcp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function defaultLocalRoot() {
  const root = process.env.LOCALAPPDATA || process.env.HOME || process.cwd();
  return resolve(root, "EVAVO");
}

async function repositoryRoots() {
  const ownRoot = await realpath(resolve(HERE, ".."));
  const name = basename(ownRoot).toLowerCase();
  if (name === "evavo-art-studio") {
    return {
      artRoot: ownRoot,
      celRoot: resolve(ownRoot, "..", "cel-animation-studio"),
    };
  }
  if (name === "cel-animation-studio") {
    return {
      artRoot: resolve(ownRoot, "..", "evavo-art-studio"),
      celRoot: ownRoot,
    };
  }
  throw new Error("ANIMATION_EXECUTION_MCP_REPOSITORY_IDENTITY_UNKNOWN");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (!["--enable-execution", "--enable-approval-write"].includes(arg)) {
      throw new Error(`ANIMATION_EXECUTION_MCP_ARGUMENT_INVALID:${arg}`);
    }
  }
  if (args.has("--enable-execution")) {
    process.env.EVAVO_ANIMATION_EXECUTION_ENABLED = "enabled";
  }
  if (args.has("--enable-approval-write")) {
    process.env.EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED = "enabled";
  }
  const roots = await repositoryRoots();
  const localRoot = defaultLocalRoot();
  const workspaceRoot =
    process.env.EVAVO_ANIMATION_EXECUTION_WORKSPACE_ROOT ||
    resolve(localRoot, "animation-execution");
  const artifactRoot =
    process.env.EVAVO_ART_ARTIFACT_ROOT || resolve(localRoot, "artifacts");
  await Promise.all([
    mkdir(workspaceRoot, { recursive: true }),
    mkdir(artifactRoot, { recursive: true }),
  ]);
  process.env.EVAVO_ANIMATION_EXECUTION_WORKSPACE_ROOT = workspaceRoot;
  process.env.EVAVO_ART_STUDIO_ROOT =
    process.env.EVAVO_ART_STUDIO_ROOT || roots.artRoot;
  process.env.EVAVO_CEL_ANIMATION_STUDIO_ROOT =
    process.env.EVAVO_CEL_ANIMATION_STUDIO_ROOT || roots.celRoot;
  process.env.EVAVO_ART_ARTIFACT_ROOT = artifactRoot;
  process.env.EVAVO_ART_COMFYUI_ALLOW_REMOTE = "false";
  process.env.EVAVO_ART_COMFYUI_DEDICATED_INSTANCE =
    process.env.EVAVO_ART_COMFYUI_DEDICATED_INSTANCE || "true";
  process.env.EVAVO_ART_COMFYUI_BASE_URL =
    process.env.EVAVO_ART_COMFYUI_BASE_URL || "http://127.0.0.1:8188";
  await serveAnimationExecutionSupervisorMcp({ environment: process.env });
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
