import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  planTargetedRepair,
  targetedRepairProtocolSummary,
  targetedRepairRequestSha256,
  validateTargetedRepairRequest,
} from "@evavo/art-repair";

export interface RepairCommandValues {
  readonly input?: string;
  readonly "artifact-root"?: string;
}

export type RepairCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function inputPath(values: RepairCommandValues, command: string): string {
  if (!values.input) throw new Error(`--input is required for ${command}.`);
  return path.resolve(values.input);
}

function runtimeJob(request: ReturnType<typeof validateTargetedRepairRequest>) {
  const inputArtifacts = [
    request.familyEvidenceArtifactId,
    ...(request.maskArtifactId ? [request.maskArtifactId] : []),
    ...request.references.map((reference) => reference.artifactId),
  ];
  return {
    queue: "selection",
    kind: "art.repair.plan",
    idempotencyKey: request.repairId,
    payload: request,
    inputArtifacts: [...new Set(inputArtifacts)].sort(),
    requiredCapabilities: [
      "repair.plan",
      "artifacts.store",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 60_000,
    timeoutMs: 300_000,
    labels: {
      repairId: request.repairId,
      familyEvidenceArtifactId: request.familyEvidenceArtifactId,
      frameId: request.target.frameId,
      ...(request.target.layerId ? { layerId: request.target.layerId } : {}),
    },
  } as const;
}

export async function handleRepairCommand(
  command: string,
  values: RepairCommandValues,
): Promise<RepairCommandResult> {
  if (command === "repair-protocol") {
    return { handled: true, value: targetedRepairProtocolSummary() };
  }
  if (!new Set(["repair-validate", "repair-compile", "repair-run"]).has(command)) {
    return { handled: false };
  }
  const request = validateTargetedRepairRequest(
    await readJson(inputPath(values, command)),
  );
  if (command === "repair-validate") {
    return { handled: true, value: request };
  }
  if (command === "repair-compile") {
    return {
      handled: true,
      value: {
        schemaVersion: "1.0",
        request,
        requestSha256: targetedRepairRequestSha256(request),
        executionMode: "durable-worker-or-deliberate-local-planning",
        runtimeJob: runtimeJob(request),
      },
    };
  }
  return {
    handled: true,
    value: await planTargetedRepair(request, {
      artifacts: new LocalArtifactStore({
        root: path.resolve(values["artifact-root"] ?? ".art-studio/artifacts"),
      }),
    }),
  };
}
