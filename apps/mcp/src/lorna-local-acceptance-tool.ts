import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const MAXIMUM_CAPTURE_BYTES = 2 * 1024 * 1024;

function appendBounded(current: Buffer, chunk: Buffer): Buffer {
  const combined = Buffer.concat([current, chunk]);
  if (combined.length <= MAXIMUM_CAPTURE_BYTES) return combined;
  return combined.subarray(combined.length - MAXIMUM_CAPTURE_BYTES);
}

function enabled(): boolean {
  return (
    process.env.EVAVO_ART_ALLOW_WRITES === "true" &&
    process.env.EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION === "true"
  );
}

function localComputeRoot(): string {
  const configured = process.env.EVAVO_LOCAL_COMPUTE_ROOT?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") return path.resolve("C:\\GitRepos\\evavo-local-compute");
  throw new Error("EVAVO_LOCAL_COMPUTE_ROOT is required outside the canonical Windows workstation layout.");
}

function extractDurableAcceptance(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (
        parsed.kind === "evavo-local-art-campaign-acceptance-v1" &&
        parsed.campaignId === "lorna-strip-poker-test" &&
        parsed.durableAcceptance === true
      ) {
        return parsed;
      }
    } catch {
      // Earlier bootstrap output can contain unrelated JSON.
    }
  }
  return null;
}

function errorResult(code: string, error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { code, message: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerLornaLocalAcceptanceTool(server: McpServer): void {
  server.registerTool(
    "run_lorna_strip_poker_acceptance",
    {
      description:
        "Run the shipped clearly-adult non-explicit ten-image Lorna local generation acceptance campaign through Local Compute and ComfyUI. Returns only after all ten generated files have been independently SHA-256 verified and acceptance.json has been atomically persisted in the run folder.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!enabled()) {
        return errorResult(
          "LORNA_LOCAL_ACCEPTANCE_DISABLED",
          new Error(
            "Lorna local acceptance requires EVAVO_ART_ALLOW_WRITES=true and EVAVO_ART_LOCAL_GENERATION_MCP_ALLOW_EXECUTION=true.",
          ),
        );
      }
      if (process.platform !== "win32") {
        return errorResult(
          "LORNA_LOCAL_ACCEPTANCE_WINDOWS_REQUIRED",
          new Error("The durable local acceptance runner currently requires the EVAVO Windows workstation."),
        );
      }
      try {
        const runner = path.join(localComputeRoot(), "RUN-EVAVO-LORNA-STRIP-POKER-CURRENT.ps1");
        const child = spawn(
          "powershell.exe",
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            runner,
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
        const exitCode = await new Promise<number>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code) => resolve(code ?? -1));
        });
        if (exitCode !== 0) {
          throw new Error(
            `Durable Lorna local acceptance exited ${exitCode}: ${stderr.toString("utf8").trim()}`,
          );
        }
        const acceptance = extractDurableAcceptance(stdout.toString("utf8"));
        if (!acceptance) {
          throw new Error("Durable Lorna local acceptance completed without its verified acceptance receipt.");
        }
        if (
          acceptance.lornaTenImageAcceptance !== true ||
          acceptance.localOnly !== true ||
          acceptance.fallbackAllowed !== false ||
          acceptance.allRoutesComfyUi !== true ||
          acceptance.verifiedCandidates !== 10 ||
          acceptance.uniqueFiles !== 10 ||
          acceptance.uniqueSha256 !== 10
        ) {
          throw new Error("Durable Lorna acceptance receipt did not satisfy the exact ten-image local-only contract.");
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "completed",
                  acceptance,
                  stderrTail: stderr.toString("utf8").trim() || null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: unknown) {
        return errorResult("LORNA_LOCAL_ACCEPTANCE_FAILED", error);
      }
    },
  );
}
