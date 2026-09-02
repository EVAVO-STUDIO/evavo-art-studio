import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const MAXIMUM_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAXIMUM_CAMPAIGN_BYTES = 512 * 1024;

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
        schema: "evavo.local-generation-agent-capabilities.v1",
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
        agentWorkflow: [
          "submit campaign object",
          "persist bounded local request",
          "bootstrap Local Compute",
          "ensure headless loopback ComfyUI",
          "route each scene to a reviewed local profile",
          "execute durable Art Studio provider jobs",
          "materialize viewable candidate images",
          "return exact receipt and output paths",
        ],
        matureContent: "clearly-adult mature-nonexplicit only",
        explicitPornographyBypass: false,
      }),
  );

  server.registerTool(
    "run_local_generation_campaign",
    {
      description:
        "Run one complete data-driven image-generation campaign on the local EVAVO workstation without opening ComfyUI or manually pasting prompts. The campaign is persisted locally, Local Compute ensures ComfyUI, Art Studio routes every scene to a reviewed local profile, and the tool returns the resulting receipt and output folder. Requires explicit local execution enablement.",
      inputSchema: z.object({ campaign: z.unknown() }),
    },
    async ({ campaign }) => {
      if (!executionEnabled()) {
        return toolError(
          "LOCAL_GENERATION_EXECUTION_DISABLED",
          new Error(
            "Local generation requires EVAVO_ART_ALLOW_WRITES=true and EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION=true in the trusted local MCP process.",
          ),
        );
      }
      try {
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
        return textResult({
          status: "completed",
          manifestPath,
          receipt,
          stderrTail: execution.stderr.trim() || null,
        });
      } catch (error: unknown) {
        return toolError("LOCAL_GENERATION_EXECUTION_FAILED", error);
      }
    },
  );
}
