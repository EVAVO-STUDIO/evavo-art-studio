import {
  compileArtDirectionJob as compileNormalizedArtDirectionJob,
} from "./jobs.js";
import { validateArtDirectionCompileRequest } from "./strict-validation.js";
import type {
  ArtDirectionCompileRequestInput,
  CompiledArtDirectionJob,
} from "./types.js";

export function compileArtDirectionJob(
  input: ArtDirectionCompileRequestInput | unknown,
): CompiledArtDirectionJob {
  validateArtDirectionCompileRequest(input);
  return compileNormalizedArtDirectionJob(input);
}
