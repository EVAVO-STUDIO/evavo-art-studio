import fs from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { BASE64, EXPECTED_CONTRACT, EXPECTED_PACKAGE, EXPECTED_VERSION, PART_NAME, cleanText, exactSha, plainObject, safeInteger, sha256 } from "./runtime-common.mjs";
import { descriptorRuntimeFiles } from "./runtime-verification.mjs";

export function loadSealedBundle(distributionRoot, descriptor) {
  if (Number.parseInt(process.versions.node.split(".")[0], 10) < 22) throw new Error("Creative Asset Publisher requires Node.js 22 or newer.");
  plainObject(descriptor, "distribution descriptor");
  const packageIdentity = plainObject(descriptor.package, "package");
  const entrypoints = plainObject(descriptor.entrypoints, "entrypoints");
  if (descriptor.contract !== EXPECTED_CONTRACT || descriptor.version !== EXPECTED_VERSION || packageIdentity.name !== EXPECTED_PACKAGE || packageIdentity.version !== EXPECTED_VERSION || descriptor.compression !== "brotli" || descriptor.archiveFormat !== "ustar" || entrypoints.cli !== "src/cli.mjs" || entrypoints.mcp !== "src/mcp-server.mjs" || descriptor.repositoryMutationAuthority !== false || descriptor.storageMutationAuthority !== false || descriptor.githubMcpMutationAuthority !== false || descriptor.developmentStudioSealedPublicationAuthority !== true || descriptor.sealedExecutionPackageRequired !== true || descriptor.exactShaProviderConfirmationRequired !== true || descriptor.repositoryReliabilityProfileRequired !== true || descriptor.rawMainlineApplyAuthority !== false || descriptor.directMainlinePublisherAuthority !== false || descriptor.forcePushAvailable !== false) {
    throw new Error("Unsupported or over-authorized Creative Asset Publisher distribution descriptor.");
  }
  const bundleSha256 = exactSha(descriptor.bundleSha256, "bundleSha256");
  const archiveSha256 = exactSha(descriptor.archiveSha256, "archiveSha256");
  const checksumsSha256 = exactSha(descriptor.checksumsSha256, "checksumsSha256");
  const bundleBytes = safeInteger(descriptor.bundleBytes, "bundleBytes", 1, 512 * 1024 * 1024);
  const archiveBytes = safeInteger(descriptor.archiveBytes, "archiveBytes", 1024, 1024 * 1024 * 1024);
  const encodedCharacters = safeInteger(descriptor.encodedCharacters, "encodedCharacters", 4, 1024 * 1024 * 1024);
  const entryCount = safeInteger(descriptor.entryCount, "entryCount", 1, 100000);
  const fileCount = safeInteger(descriptor.fileCount, "fileCount", 2, 100000);
  const totalFileBytes = safeInteger(descriptor.totalFileBytes, "totalFileBytes", 1, 1024 * 1024 * 1024);
  const runtimeFiles = descriptorRuntimeFiles(descriptor.runtimeFiles);
  if (runtimeFiles.size !== fileCount) throw new Error("runtimeFiles length does not match fileCount.");
  if (runtimeFiles.get("checksums.sha256").sha256 !== checksumsSha256) throw new Error("checksums.sha256 identity differs between descriptor fields.");
  if ([...runtimeFiles.values()].reduce((sum, item) => sum + item.bytes, 0) !== totalFileBytes) throw new Error("runtimeFiles byte total does not match totalFileBytes.");
  const parts = Array.isArray(descriptor.parts) ? descriptor.parts : [];
  if (parts.length < 1 || parts.length > 999) throw new Error("Distribution parts are invalid.");
  const encodedRows = [];
  const seenParts = new Set();
  for (const [index, raw] of parts.entries()) {
    const item = plainObject(raw, `parts[${index}]`);
    const partName = cleanText(item.path, `parts[${index}].path`);
    const expectedName = `runtime.part-${String(index).padStart(3, "0")}.base64`;
    if (!PART_NAME.test(partName) || partName !== expectedName || seenParts.has(partName)) throw new Error("Distribution parts must be unique, contiguous and ordered.");
    seenParts.add(partName);
    const expectedPartSha = exactSha(item.sha256, `parts[${index}].sha256`);
    const expectedPartCharacters = safeInteger(item.encodedCharacters, `parts[${index}].encodedCharacters`, 4, 16 * 1024 * 1024);
    const partPath = path.join(distributionRoot, partName);
    const partMetadata = fs.lstatSync(partPath);
    if (!partMetadata.isFile() || partMetadata.isSymbolicLink()) throw new Error(`Distribution part ${partName} is not an ordinary file.`);
    const rawText = fs.readFileSync(partPath, "utf8");
    const encodedPart = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
    if (/[\r\n]/u.test(encodedPart) || encodedPart.length !== expectedPartCharacters) throw new Error(`Distribution part ${partName} has non-canonical text or length.`);
    if (sha256(Buffer.from(encodedPart, "utf8")) !== expectedPartSha) throw new Error(`Distribution part ${partName} SHA-256 verification failed.`);
    if (index < parts.length - 1 && (encodedPart.includes("=") || encodedPart.length % 4 !== 0)) throw new Error(`Distribution part ${partName} has premature base64 padding.`);
    encodedRows.push(encodedPart);
  }
  const encoded = encodedRows.join("");
  if (encoded.length !== encodedCharacters || !BASE64.test(encoded)) throw new Error("Runtime bundle is not canonical padded base64 or has the wrong length.");
  const compressed = Buffer.from(encoded, "base64");
  if (compressed.length !== bundleBytes || sha256(compressed) !== bundleSha256) throw new Error("Runtime bundle size or SHA-256 verification failed.");
  let archive;
  try { archive = brotliDecompressSync(compressed, { maxOutputLength: archiveBytes }); }
  catch (error) { throw new Error(`Runtime Brotli decompression failed: ${error instanceof Error ? error.message : String(error)}`); }
  if (archive.length !== archiveBytes || sha256(archive) !== archiveSha256) throw new Error("Runtime archive size or SHA-256 verification failed.");
  return Object.freeze({ packageIdentity, entrypoints, bundleSha256, archiveSha256, archive, entryCount, fileCount, totalFileBytes, expectedRuntime: Object.freeze({ checksumsSha256, runtimeFiles, totalFileBytes }) });
}
