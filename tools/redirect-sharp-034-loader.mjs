import { pathToFileURL } from "node:url";

const workingSharpUrl = pathToFileURL(
  "C:/Gitrepos/evavo-art-studio/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js",
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "sharp") {
    return { url: workingSharpUrl, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
