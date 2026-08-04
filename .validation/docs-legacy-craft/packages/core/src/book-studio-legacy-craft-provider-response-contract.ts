import type { EvavoBookStudioAgentProvider } from "./book-studio-legacy-craft-genome-types";
import { sha256CraftText } from "./book-studio-legacy-craft-genome-utils";

function stringSchema(allowedValues: string[], maxLength = 2048): Record<string, unknown> {
  return allowedValues.length ? { type: "string", maxLength, enum: allowedValues } : { type: "string", maxLength };
}

function stringArraySchema(allowedValues: string[], minItems: number, maxItems: number): Record<string, unknown> {
  return { type: "array", minItems, maxItems, uniqueItems: true, items: stringSchema(allowedValues) };
}

function rejectedPatternSchema(patternIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: patternIds,
    properties: Object.fromEntries(patternIds.map((patternId) => [patternId, {
      type: "object",
      additionalProperties: false,
      required: ["passed", "evidence"],
      properties: {
        passed: { type: "boolean" },
        evidence: { type: "string", minLength: 1, maxLength: 2000 },
      },
    }])),
  };
}

export function createEvavoCraftProviderResponseContract(input: {
  packetId: string;
  provider: EvavoBookStudioAgentProvider;
  modelName: string;
  profileFingerprint: string;
  targetUnitIds: string[];
  dimensionIds: string[];
  projectVoiceAnchorIds: string[];
  rejectedPatternIds: string[];
}): { responseContract: string; responseContractSha256: string } {
  const schema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: [
      "outputKind", "schemaVersion", "packetId", "provider", "modelName", "profileFingerprint",
      "targetUnitIds", "candidateText", "appliedDimensionIds", "preservedVoiceAnchorIds",
      "rejectedPatternChecks", "unresolvedRisks", "phraseOverlapScanRequired", "continuation",
    ],
    properties: {
      outputKind: { type: "string", enum: ["evavo_book_studio_craft_genome_provider_response"] },
      schemaVersion: { type: "integer", enum: [1] },
      packetId: { type: "string", enum: [input.packetId] },
      provider: { type: "string", enum: [input.provider] },
      modelName: { type: "string", enum: [input.modelName] },
      profileFingerprint: { type: "string", enum: [input.profileFingerprint] },
      targetUnitIds: stringArraySchema(input.targetUnitIds, input.targetUnitIds.length, input.targetUnitIds.length),
      candidateText: { type: "string", minLength: 1, maxLength: 2_000_000 },
      appliedDimensionIds: stringArraySchema(input.dimensionIds, 1, Math.max(1, input.dimensionIds.length)),
      preservedVoiceAnchorIds: stringArraySchema(input.projectVoiceAnchorIds, input.projectVoiceAnchorIds.length, input.projectVoiceAnchorIds.length),
      rejectedPatternChecks: rejectedPatternSchema(input.rejectedPatternIds),
      unresolvedRisks: { type: "array", maxItems: 256, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 2000 } },
      phraseOverlapScanRequired: { type: "boolean", enum: [true] },
      continuation: {
        type: "object",
        additionalProperties: false,
        required: ["complete", "remainingUnitIds", "exactTail"],
        properties: {
          complete: { type: "boolean" },
          remainingUnitIds: stringArraySchema(input.targetUnitIds, 0, input.targetUnitIds.length),
          exactTail: { type: "string", maxLength: 20_000 },
        },
      },
    },
  };
  const responseContract = JSON.stringify(schema, null, 2);
  return { responseContract, responseContractSha256: sha256CraftText(responseContract) };
}
