import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const MAXIMUM_BATCH_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_CAPTURE_BYTES = 4 * 1024 * 1024;

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(code: string, error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ code, message: error instanceof Error ? error.message : String(error) }, null, 2) }],
  };
}

function executionEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true" && process.env.EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION === "true";
}

function artStudioRoot(): string {
  const configured = process.env.EVAVO_ART_STUDIO_ROOT?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") return path.resolve("C:\\GitRepos\\evavo-art-studio");
  return path.resolve(process.cwd());
}

function requestRoot(): string {
  const local = process.env.LOCALAPPDATA?.trim();
  return local ? path.join(local, "EVAVO", "ArtStudio", "agent-requests", "batch-v2") : path.resolve(".art-studio", "agent-requests", "batch-v2");
}

function canonicalLocalEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const local = process.env.LOCALAPPDATA?.trim();
  if (local) {
    env.EVAVO_ART_COMFYUI_CATALOG ??= path.join(local, "EVAVO", "AI", "ComfyUI", "catalog.json");
    env.EVAVO_ART_COMFYUI_CATALOG_ROOT ??= path.dirname(env.EVAVO_ART_COMFYUI_CATALOG);
  }
  env.EVAVO_ART_COMFYUI_BASE_URL = "http://127.0.0.1:8192";
  env.EVAVO_ART_COMFYUI_ALLOW_REMOTE = "false";
  env.EVAVO_ART_COMFYUI_DEDICATED_INSTANCE = "true";
  return env;
}

function manifestBytes(value: unknown): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.length < 1 || bytes.length > MAXIMUM_BATCH_MANIFEST_BYTES) throw new Error(`batch manifest must contain 1 to ${MAXIMUM_BATCH_MANIFEST_BYTES} bytes`);
  return bytes;
}

function appendBounded(current: Buffer, chunk: Buffer): Buffer {
  const next = Buffer.concat([current, chunk]);
  return next.length <= MAXIMUM_CAPTURE_BYTES ? next : next.subarray(next.length - MAXIMUM_CAPTURE_BYTES);
}

async function executeBatch(manifestPath: string): Promise<{ stdout: string; stderr: string }> {
  const root = artStudioRoot();
  const runner = path.join(root, "scripts", "run-local-art-batch-entry.mjs");
  const child = spawn(process.execPath, [runner, "--manifest", manifestPath, "--actor", "art-studio-mcp-batch-v2"], {
    cwd: root,
    env: canonicalLocalEnvironment(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => { stdout = appendBounded(stdout, Buffer.from(chunk)); });
  child.stderr.on("data", (chunk: Buffer) => { stderr = appendBounded(stderr, Buffer.from(chunk)); });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`managed local generation batch exited ${String(code)}: ${stderr.toString("utf8").trim()}`)));
  });
  return { stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") };
}

function receiptFromStdout(stdout: string): unknown {
  for (const line of stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).reverse()) {
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.schema === "evavo.local-generation-batch-receipt.v2") return parsed;
    } catch { /* ignore non-receipt JSON */ }
  }
  throw new Error("batch execution completed without a v2 receipt");
}

export function registerLocalGenerationBatchTools(server: McpServer): void {
  server.registerTool(
    "local_generation_batch_capabilities",
    {
      description: "Describe the generic data-driven local image batch system: arbitrary shot counts, structured prompt layers, quality profiles, consistency modes, selective retries, QA and per-image reproducibility metadata. Does not generate images.",
      inputSchema: z.object({}),
    },
    async () => textResult({
      schema: "evavo.local-generation-batch-capabilities.v2",
      campaignSchema: "evavo.local-generation-batch.v2",
      maximumShotsPerCampaign: 2000,
      providerChunkSize: 100,
      generationModes: ["independent", "sequential-anchor", "paired", "repair", "variation", "sprite"],
      consistencyModes: ["strict", "balanced", "loose"],
      qualityProfiles: ["portrait_high_quality", "sprite_sheet_clean", "concept_art_painterly", "comic_inked", "cinematic_stills", "product_mockups"],
      promptLayers: ["identity", "style", "quality", "continuity", "shot", "negative"],
      referenceRoles: ["canonical-identity", "direction-master", "previous-key-pose", "next-key-pose", "base-image", "mask", "pose-control", "edge-control", "depth-control", "palette-reference", "line-reference", "material-reference", "layer-context"],
      qa: ["exact-output-count", "file-exists", "non-zero-bytes", "image-signature", "dimensions", "unique-sha256"],
      retries: "shot-selective with deterministic seed bump",
      metadataPerImage: true,
      managedComfyUiLifecycle: true,
      machineBinding: "execution manifest forces the owned loopback endpoint/catalog and derives the reviewed quality adapter unless explicitly pinned",
      localOnly: true,
      hostedFallback: false,
      canonicalBaseUrl: "http://127.0.0.1:8192",
      canonicalCatalog: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "EVAVO", "AI", "ComfyUI", "catalog.json") : null,
      executionEnabled: executionEnabled(),
      note: "Quality-specific reviewed workflow profiles bake KSampler steps/CFG/sampler/scheduler/denoise into executable ComfyUI workflows. Dynamic fields are never claimed active unless the selected profile binds or bakes them. Real image references require reviewed reference bindings/capabilities and provider artifact IDs.",
    }),
  );

  server.registerTool(
    "run_local_generation_batch",
    {
      description: "Execute one generic v2 local Art Studio image campaign end-to-end. The managed entrypoint binds the reviewed local quality adapter and catalog, starts an isolated true-core ComfyUI service, runs arbitrary-size chunked generation with selective QA retries, and shuts the owned service down afterward. Requires the trusted local-generation execution profile.",
      inputSchema: z.object({ campaign: z.unknown() }),
    },
    async ({ campaign }) => {
      if (!executionEnabled()) return toolError("LOCAL_GENERATION_EXECUTION_DISABLED", new Error("Trusted local generation execution is disabled for this MCP process."));
      try {
        const bytes = manifestBytes(campaign);
        const digest = createHash("sha256").update(bytes).digest("hex");
        const root = requestRoot();
        await mkdir(root, { recursive: true });
        const manifestPath = path.join(root, `batch-${digest}.json`);
        try { await writeFile(manifestPath, bytes, { flag: "wx" }); } catch (error: unknown) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          if (code !== "EEXIST") throw error;
        }
        const execution = await executeBatch(manifestPath);
        return textResult({ status: "completed", manifestPath, receipt: receiptFromStdout(execution.stdout), stderrTail: execution.stderr.trim() || null });
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_BATCH_FAILED", error);
      }
    },
  );
}
