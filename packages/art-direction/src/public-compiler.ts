import {
  compileArtDirectionContract as compileNormalizedArtDirectionContract,
} from "./compiler.js";
import { validateArtDirectionCompileRequest } from "./strict-validation.js";
import { artDirectionSha256 } from "./validation.js";
import type {
  ArtDirectionCompileRequestInput,
  CompiledArtDirectionContract,
} from "./types.js";

function withGodot471Delivery(
  contract: CompiledArtDirectionContract,
): CompiledArtDirectionContract {
  if (!contract.outputs.some((entry) => entry.target === "godot-4.7.1")) {
    return contract;
  }

  const godot = {
    engineVersion: "4.7.1" as const,
    nodeRecommendations: [
      contract.asset.animated
        ? "AnimatedSprite2D with retained SpriteFrames"
        : "Sprite2D or TextureRect according to asset family",
      ...(contract.style.projection === "isometric-2:1"
        ? ["Sibling TileMapLayer and sprite nodes under a Y-sorted parent"]
        : []),
      ...(contract.style.renderingMode === "pre-rendered-2.5d"
        ? ["SpriteFrames billboard with bound normal, depth or emission sidecars where declared"]
        : []),
    ],
    projectSettings: [
      ...(contract.style.pixelGrid.enabled
        ? [
            "nearest texture filtering",
            "integer placement",
            "centered=false or 2D pixel snap to avoid half-pixel deformation",
          ]
        : ["profile-defined texture filtering"]),
      ...(contract.style.projection === "isometric-2:1"
        ? [
            "2:1 isometric TileSet shape",
            "Y-sort enabled on the shared world parent",
            `Y-sort origin ${contract.production.ySortOrigin.x},${contract.production.ySortOrigin.y}`,
          ]
        : []),
    ],
    resourceOutputs: contract.outputs.flatMap(
      (output) => output.engineMetadata,
    ),
  };

  const patched = {
    ...contract,
    delivery: {
      ...contract.delivery,
      godot,
    },
  };
  const { contractSha256: _previousContractSha256, ...withoutHash } = patched;
  return {
    ...withoutHash,
    contractSha256: artDirectionSha256(withoutHash),
  };
}

export function compileArtDirectionContract(
  input: ArtDirectionCompileRequestInput | unknown,
): CompiledArtDirectionContract {
  validateArtDirectionCompileRequest(input);
  return withGodot471Delivery(compileNormalizedArtDirectionContract(input));
}
