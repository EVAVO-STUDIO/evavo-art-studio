import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const MAXIMUM_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAXIMUM_CAMPAIGN_BYTES = 512 * 1024;
const MAXIMUM_IMAGE_BYTES = 32 * 1024 * 1024;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHIPPED_EXAMPLES = Object.freeze({
  "lorna-strip-poker-test": "local-generation-campaign.lorna.json",
});

type ShippedExampleId = keyof typeof SHIPPED_EXAMPLES;

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(code: string, error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

function executionEnabled(): boolean {
  return (
    process.env.EVAVO_ART_ALLOW_WRITES === "true" &&
    process.env.EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION === "true"
  );
}

function artStudioRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function localComputeRoot(): string {
  const configured = process.env.EVAVO_LOCAL_COMPUTE_ROOT?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") {
    return path.resolve("C:\\GitRepos\\evavo-local-compute");
  }
  throw new Error(
    "EVAVO_LOCAL_COMPUTE_ROOT is required outside the canonical Windows workstation layout.",
  );
}

function requestRoot(): string {
  const configured = process.env.EVAVO_ART_LOCAL_GENERATION_REQUEST_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return path.join(localAppData, "EVAVO", "ArtStudio", "agent-requests");
  }
  return path.resolve(".art-studio", "agent-requests");
}

function campaignOutputRoot(): string {
  const configured = process.env.EVAVO_ART_LOCAL_GENERATION_OUTPUT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return path.join(localAppData, "EVAVO", "ArtStudio", "campaigns");
  }
  return path.resolve(".art-studio", "local-campaigns");
}

function defaultCatalogPath(): string {
  const configured = process.env.EVAVO_ART_COMFYUI_CATALOG?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") return path.resolve("C:\\EVAVO\\comfyui\\catalog.json");
  return path.join(artStudioRoot(), ".art-studio", "comfyui", "catalog.json");
}

function defaultComfyBaseUrl(): string {
  return process.env.EVAVO_ART_COMFYUI_BASE_URL?.trim() || "http://127.0.0.1:8188";
}

function loopbackBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("ComfyUI base URL must be an unauthenticated loopback HTTP endpoint.");
  }
  return parsed.toString().replace(/\/$/u, "");
}

function shippedExamplePath(exampleId: ShippedExampleId): string {
  return path.join(artStudioRoot(), "examples", SHIPPED_EXAMPLES[exampleId]);
}

function safeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`${label} must be a safe identifier.`);
  return value;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realPathWithin(root: string, candidate: string, label: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const canonicalCandidate = await realpath(candidate);
  if (!inside(canonicalRoot, canonicalCandidate)) {
    throw new Error(`${label} resolves outside the local generation campaign root.`);
  }
  return canonicalCandidate;
}

async function regularFileEvidence(filePath: string): Promise<{
  readonly path: string;
  readonly exists: boolean;
  readonly regularFile: boolean;
  readonly sizeBytes: number | null;
}> {
  try {
    const info = await stat(filePath);
    return {
      path: filePath,
      exists: true,
      regularFile: info.isFile(),
      sizeBytes: info.isFile() ? info.size : null,
    };
  } catch {
    return { path: filePath, exists: false, regularFile: false, sizeBytes: null };
  }
}

async function directoryEvidence(directoryPath: string): Promise<{
  readonly path: string;
  readonly exists: boolean;
  readonly directory: boolean;
}> {
  try {
    const info = await stat(directoryPath);
    return { path: directoryPath, exists: true, directory: info.isDirectory() };
  } catch {
    return { path: directoryPath, exists: false, directory: false };
  }
}

async function comfyEvidence(baseUrl: string): Promise<{
  readonly baseUrl: string;
  readonly reachable: boolean;
  readonly status: number | null;
  readonly error: string | null;
}> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, {
      signal: AbortSignal.timeout(3000),
    });
    return {
      baseUrl,
      reachable: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    return {
      baseUrl,
      reachable: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function campaignBytes(campaign: unknown): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(campaign, null, 2)}\n`, "utf8");
  if (!bytes.length || bytes.length > MAXIMUM_CAMPAIGN_BYTES) {
    throw new Error(
      `campaign JSON must contain 1 to ${MAXIMUM_CAMPAIGN_BYTES} bytes`,
    );
  }
  return bytes;
}

function appendBounded(current: Buffer, chunk: Buffer): Buffer {
  const combined = Buffer.concat([current, chunk]);
  if (combined.length <= MAXIMUM_CAPTURE_BYTES) return combined;
  return combined.subarray(combined.length - MAXIMUM_CAPTURE_BYTES);
}

async function invokeLocalCompute(manifestPath: string): Promise<{
  readonly stdout: string;
  readonly stderr: string;
}> {
  if (process.platform !== "win32") {
    throw new Error(
      "Automated Local Compute art execution currently requires the EVAVO Windows workstation bridge.",
    );
  }
  const bridge = path.join(
    localComputeRoot(),
    "RUN-EVAVO-ART-CAMPAIGN-CURRENT.ps1",
  );
  await access(bridge);
  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      bridge,
      "-ManifestPath",
      manifestPath,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendBounded(stdout, Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendBounded(stderr, Buffer.from(chunk));
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Local Compute art campaign exited with code ${String(code)}. ${stderr.toString("utf8").trim()}`,
          ),
        );
      }
    });
  });
  return {
    stdout: stdout.toString("utf8"),
    stderr: stderr.toString("utf8"),
  };
}

function extractReceipt(stdout: string): unknown | null {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.schema === "evavo.local-generation-campaign-receipt.v1") {
        return parsed;
      }
    } catch {
      // Other workstation commands may emit non-receipt JSON. Ignore them.
    }
  }
  return null;
}

async function executeCampaign(campaign: unknown): Promise<{
  readonly status: "completed";
  readonly manifestPath: string;
  readonly receipt: unknown;
  readonly outputRoot: string;
  readonly stderrTail: string | null;
}> {
  if (!executionEnabled()) {
    throw new Error(
      "Local generation requires EVAVO_ART_ALLOW_WRITES=true and EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION=true in the trusted local MCP process.",
    );
  }
  const bytes = campaignBytes(campaign);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const root = requestRoot();
  await mkdir(root, { recursive: true });
  const manifestPath = path.join(root, `campaign-${digest}.json`);
  try {
    await writeFile(manifestPath, bytes, { flag: "wx" });
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "EEXIST") throw error;
  }

  const execution = await invokeLocalCompute(manifestPath);
  const receipt = extractReceipt(execution.stdout);
  if (!receipt) {
    throw new Error(
      "Local generation completed without a parseable Art Studio campaign receipt.",
    );
  }
  return {
    status: "completed",
    manifestPath,
    receipt,
    outputRoot: campaignOutputRoot(),
    stderrTail: execution.stderr.trim() || null,
  };
}

function imageMimeType(filePath: string): "image/png" | "image/webp" | "image/jpeg" {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new Error("Only PNG, WebP and JPEG campaign outputs can be returned as images.");
}

export function registerLocalGenerationTools(server: McpServer): void {
  server.registerTool(
    "local_generation_campaign_capabilities",
    {
      description:
        "Describe the headless local ComfyUI campaign execution bridge available to trusted EVAVO agents. This does not execute a campaign.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({
        schema: "evavo.local-generation-agent-capabilities.v2",
        executionEnabled: executionEnabled(),
        localOnly: true,
        hostedFallback: false,
        campaignSchema: "evavo.local-generation-campaign.v1",
        supportedAssetKinds: [
          "sprite-frame",
          "sprite-layer",
          "environment",
          "effect",
          "ui",
          "illustration",
          "print",
        ],
        shippedExamples: Object.keys(SHIPPED_EXAMPLES),
        agentWorkflow: [
          "run local_generation_doctor",
          "submit campaign object or shipped example",
          "persist bounded local request",
          "bootstrap Local Compute",
          "ensure headless loopback ComfyUI",
          "route each scene to a reviewed local profile",
          "execute durable Art Studio provider jobs",
          "materialize viewable candidate images",
          "list local campaign outputs",
          "return selected generated images through MCP",
          "return exact receipt and output paths",
        ],
        outputRoot: campaignOutputRoot(),
        matureContent: "clearly-adult mature-nonexplicit only",
        explicitPornographyBypass: false,
      }),
  );

  server.registerTool(
    "local_generation_doctor",
    {
      description:
        "Read-only readiness check for the local Art Studio generation path. Verifies execution flags, Local Compute bridge files, shipped example, catalog path, output root and current loopback ComfyUI health without starting a generation campaign.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const computeRoot = localComputeRoot();
        const bridge = path.join(computeRoot, "RUN-EVAVO-ART-CAMPAIGN-CURRENT.ps1");
        const ensureComfy = path.join(computeRoot, "ENSURE-EVAVO-COMFYUI-CURRENT.ps1");
        const example = shippedExamplePath("lorna-strip-poker-test");
        const catalog = defaultCatalogPath();
        const baseUrl = loopbackBaseUrl(defaultComfyBaseUrl());
        const [bridgeEvidence, ensureEvidence, exampleEvidence, catalogEvidence, outputEvidence, comfy] = await Promise.all([
          regularFileEvidence(bridge),
          regularFileEvidence(ensureComfy),
          regularFileEvidence(example),
          regularFileEvidence(catalog),
          directoryEvidence(campaignOutputRoot()),
          comfyEvidence(baseUrl),
        ]);
        const readyWithoutStartingComfy = Boolean(
          executionEnabled() &&
          bridgeEvidence.regularFile &&
          ensureEvidence.regularFile &&
          exampleEvidence.regularFile &&
          catalogEvidence.regularFile &&
          comfy.reachable,
        );
        const bootstrapReady = Boolean(
          executionEnabled() &&
          bridgeEvidence.regularFile &&
          ensureEvidence.regularFile &&
          exampleEvidence.regularFile,
        );
        return textResult({
          schema: "evavo.local-generation-doctor.v1",
          readyWithoutStartingComfy,
          bootstrapReady,
          executionEnabled: executionEnabled(),
          localComputeRoot: computeRoot,
          bridge: bridgeEvidence,
          ensureComfy: ensureEvidence,
          shippedLornaCampaign: exampleEvidence,
          catalog: catalogEvidence,
          outputRoot: outputEvidence,
          comfy,
          note: comfy.reachable
            ? "ComfyUI is already reachable on the configured loopback endpoint."
            : "ComfyUI is not currently reachable; the campaign runner will attempt the reviewed headless Local Compute bootstrap before generation.",
        });
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_DOCTOR_FAILED", error);
      }
    },
  );

  server.registerTool(
    "run_local_generation_campaign",
    {
      description:
        "Run one complete data-driven image-generation campaign on the local EVAVO workstation without opening ComfyUI or manually pasting prompts. The campaign is persisted locally, Local Compute ensures ComfyUI, Art Studio routes every scene to a reviewed local profile, and the tool returns the resulting receipt and output folder. Requires explicit local execution enablement.",
      inputSchema: z.object({ campaign: z.unknown() }),
    },
    async ({ campaign }) => {
      try {
        return textResult(await executeCampaign(campaign));
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_EXECUTION_FAILED", error);
      }
    },
  );

  server.registerTool(
    "run_shipped_local_generation_campaign",
    {
      description:
        "Run a reviewed image-generation campaign shipped with Art Studio. Use lorna-strip-poker-test for the ten-frame clearly-adult mature non-explicit local generation acceptance sequence.",
      inputSchema: z.object({
        exampleId: z.literal("lorna-strip-poker-test"),
      }),
    },
    async ({ exampleId }) => {
      try {
        const filePath = shippedExamplePath(exampleId);
        const bytes = await readFile(filePath);
        if (bytes.length < 1 || bytes.length > MAXIMUM_CAMPAIGN_BYTES) {
          throw new Error(`Shipped campaign must contain 1 to ${MAXIMUM_CAMPAIGN_BYTES} bytes.`);
        }
        const campaign = JSON.parse(bytes.toString("utf8")) as unknown;
        const result = await executeCampaign(campaign);
        return textResult({
          ...result,
          exampleId,
          shippedManifestPath: filePath,
        });
      } catch (error: unknown) {
        return toolError("SHIPPED_LOCAL_GENERATION_EXECUTION_FAILED", error);
      }
    },
  );

  server.registerTool(
    "list_local_generation_outputs",
    {
      description:
        "List completed local Art Studio generation runs and viewable image outputs for one campaign. This tool is read-only and only traverses the configured campaign output root.",
      inputSchema: z.object({
        campaignId: z.string().min(1).max(128),
        runId: z.string().min(1).max(128).optional(),
      }),
    },
    async ({ campaignId, runId }) => {
      try {
        const root = campaignOutputRoot();
        const campaign = safeSegment(campaignId, "campaignId");
        const campaignPath = await realPathWithin(root, path.join(root, campaign), "campaignId");
        const runNames = runId
          ? [safeSegment(runId, "runId")]
          : (await readdir(campaignPath, { withFileTypes: true }))
              .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
              .map((entry) => entry.name)
              .sort()
              .reverse();
        const runs = [];
        for (const name of runNames.slice(0, 50)) {
          const runPath = await realPathWithin(root, path.join(campaignPath, name), "runId");
          const outputsPath = path.join(runPath, "outputs");
          let outputEntries: string[];
          try {
            const canonicalOutputs = await realPathWithin(root, outputsPath, "outputs");
            outputEntries = (await readdir(canonicalOutputs, { withFileTypes: true }))
              .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
              .map((entry) => entry.name)
              .filter((name) => /\.(?:png|webp|jpe?g)$/iu.test(name))
              .sort()
              .map((name) => path.join(canonicalOutputs, name));
          } catch {
            outputEntries = [];
          }
          runs.push({
            runId: name,
            runPath,
            receiptPath: path.join(runPath, "receipt.json"),
            outputs: outputEntries,
          });
        }
        return textResult({ campaignId: campaign, campaignPath, runs });
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_OUTPUT_LIST_FAILED", error);
      }
    },
  );

  server.registerTool(
    "get_local_generation_image",
    {
      description:
        "Return one generated PNG, WebP or JPEG from the local Art Studio campaign output root as MCP image content so an agent can visually inspect the actual local render.",
      inputSchema: z.object({ imagePath: z.string().min(1).max(4096) }),
    },
    async ({ imagePath }) => {
      try {
        const root = campaignOutputRoot();
        const resolved = await realPathWithin(root, path.resolve(imagePath), "imagePath");
        const info = await stat(resolved);
        if (!info.isFile() || info.size < 1 || info.size > MAXIMUM_IMAGE_BYTES) {
          throw new Error(`Generated image must contain 1 to ${MAXIMUM_IMAGE_BYTES} bytes.`);
        }
        const mimeType = imageMimeType(resolved);
        const bytes = await readFile(resolved);
        return {
          content: [
            { type: "image" as const, data: bytes.toString("base64"), mimeType },
            {
              type: "text" as const,
              text: JSON.stringify({ imagePath: resolved, sizeBytes: bytes.length, mimeType }),
            },
          ],
        };
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_IMAGE_READ_FAILED", error);
      }
    },
  );
}
