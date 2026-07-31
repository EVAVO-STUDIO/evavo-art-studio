import {
  compileArtDirectionContract as compileNormalizedArtDirectionContract,
} from "./compiler.js";
import { validateArtDirectionCompileRequest } from "./strict-validation.js";
import type {
  ArtDirectionCompileRequestInput,
  CompiledArtDirectionContract,
} from "./types.js";

export function compileArtDirectionContract(
  input: ArtDirectionCompileRequestInput | unknown,
): CompiledArtDirectionContract {
  validateArtDirectionCompileRequest(input);
  return compileNormalizedArtDirectionContract(input);
}
