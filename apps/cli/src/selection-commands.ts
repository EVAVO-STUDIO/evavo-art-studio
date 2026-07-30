import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  executeCandidateSelection,
  promoteSelectedCandidate,
  promotionRequestSha256,
  selectionProtocolSummary,
  selectionRequestSha256,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";

export interface SelectionCommandValues {
  readonly input?: string;
  readonly "artifact-root"?: string;
}

export type SelectionCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function inputPath(values: SelectionCommandValues, command: string): string {
  if (!values.input) throw new Error(`--input is required for ${command}.`);
  return path.resolve(values.input);
}

function store(values: SelectionCommandValues): LocalArtifactStore {
  return new LocalArtifactStore({
    root: path.resolve(values["artifact-root"] ?? ".art-studio/artifacts"),
  });
}

export async function handleSelectionCommand(
  command: string,
  values: SelectionCommandValues,
): Promise<SelectionCommandResult> {
  if (command === "selection-protocol") {
    return { handled: true, value: selectionProtocolSummary() };
  }
  if (
    !new Set([
      "selection-validate",
      "selection-compile",
      "selection-run",
      "promotion-validate",
      "promotion-compile",
      "promotion-run",
    ]).has(command)
  ) {
    return { handled: false };
  }

  const input = await readJson(inputPath(values, command));
  if (command.startsWith("selection-")) {
    const request = validateCandidateSelectionRequest(input);
    if (command === "selection-validate") {
      return { handled: true, value: request };
    }
    if (command === "selection-compile") {
      return {
        handled: true,
        value: {
          schemaVersion: "1.0",
          request,
          requestSha256: selectionRequestSha256(request),
          executionMode: "durable-worker-or-deliberate-local",
          runtimeJob: {
            queue: "selection",
            kind: "art.candidate.select",
            idempotencyKey: request.selectionId,
            payload: request,
            inputArtifacts: [
              request.referenceArtifactId,
              ...request.candidateArtifactIds,
              ...request.externalEvidenceArtifactIds,
            ],
            requiredCapabilities: ["selection.compare", "evidence.bundle"],
            maximumAttempts: 1,
            leaseDurationMs: 120_000,
            timeoutMs: 900_000,
          },
        },
      };
    }
    return {
      handled: true,
      value: await executeCandidateSelection(request, {
        artifacts: store(values),
      }),
    };
  }

  const request = validateCandidatePromotionRequest(input);
  if (command === "promotion-validate") {
    return { handled: true, value: request };
  }
  if (command === "promotion-compile") {
    return {
      handled: true,
      value: {
        schemaVersion: "1.0",
        request,
        requestSha256: promotionRequestSha256(request),
        executionMode: "durable-worker-or-deliberate-local",
        runtimeJob: {
          queue: "selection",
          kind: "art.candidate.promote",
          idempotencyKey: request.promotionId,
          payload: request,
          inputArtifacts: [
            request.selectionEvidenceArtifactId,
            request.candidateArtifactId,
          ],
          requiredCapabilities: [
            "selection.promote",
            "artifacts.store",
            "evidence.bundle",
          ],
          maximumAttempts: 1,
          leaseDurationMs: 60_000,
          timeoutMs: 300_000,
        },
      },
    };
  }
  return {
    handled: true,
    value: await promoteSelectedCandidate(request, {
      artifacts: store(values),
    }),
  };
}
