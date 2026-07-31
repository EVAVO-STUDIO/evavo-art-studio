import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
} from "@evavo/art-direction";

export interface ArtDirectionCommandValues {
  readonly input?: string;
}

export type ArtDirectionCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function inputPath(values: ArtDirectionCommandValues, command: string): string {
  if (!values.input) throw new Error(`--input is required for ${command}.`);
  return path.resolve(values.input);
}

export async function handleArtDirectionCommand(
  command: string,
  values: ArtDirectionCommandValues,
): Promise<ArtDirectionCommandResult> {
  if (command === "art-direction-protocol") {
    return { handled: true, value: artDirectionProtocolSummary() };
  }
  if (command === "art-direction-presets") {
    return { handled: true, value: { schemaVersion: "1.0", presets: listArtDirectionPresets() } };
  }
  if (command === "art-direction-outputs") {
    return {
      handled: true,
      value: { schemaVersion: "1.0", outputProfiles: listArtDirectionOutputProfiles() },
    };
  }
  if (
    !new Set([
      "art-direction-validate",
      "art-direction-compile",
    ]).has(command)
  ) {
    return { handled: false };
  }
  const input = await readJson(inputPath(values, command));
  if (command === "art-direction-validate") {
    return { handled: true, value: validateArtDirectionCompileRequest(input) };
  }
  return {
    handled: true,
    value: {
      schemaVersion: "1.0",
      compiledContract: compileArtDirectionContract(input),
      compiledJob: compileArtDirectionJob(input),
      executionBoundary:
        "Compilation is deterministic and provider-free. Candidate generation, QA, family verification, selection and promotion remain separate governed stages.",
    },
  };
}
