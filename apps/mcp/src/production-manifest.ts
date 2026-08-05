import { createHash } from "node:crypto";
import fs from "node:fs";
import { TextDecoder } from "node:util";

import {
  validateDeliveryBatchManifest,
  type DeliveryBatchManifest,
} from "@evavo/art-delivery-optimizer";

import {
  BRASS_ART_PRODUCTION_MAXIMUM_MANIFEST_BYTES,
  BrassArtProductionMcpError,
  brassArtProductionFileIdentity,
  sameBrassArtProductionFileIdentity,
  type BrassArtProductionManifestFile,
} from "./production-contract.js";

class StrictJsonScanner {
  private index = 0;

  public constructor(private readonly source: string) {}

  public scan(): void {
    this.skipWhitespace();
    this.value();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_MANIFEST_JSON_INVALID",
        "Manifest contains trailing JSON content.",
      );
    }
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private value(): void {
    this.skipWhitespace();
    const token = this.source[this.index];
    if (token === "{") this.object();
    else if (token === "[") this.array();
    else if (token === '"') this.string();
    else this.scalar();
  }

  private object(): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key)) {
        throw new BrassArtProductionMcpError(
          "ART_PRODUCTION_MANIFEST_DUPLICATE_KEY",
          `Manifest contains duplicate JSON key ${JSON.stringify(key)}.`,
        );
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") this.invalid();
      this.index += 1;
      this.value();
      this.skipWhitespace();
      const token = this.source[this.index];
      if (token === "}") {
        this.index += 1;
        return;
      }
      if (token !== ",") this.invalid();
      this.index += 1;
    }
  }

  private array(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }
    for (;;) {
      this.value();
      this.skipWhitespace();
      const token = this.source[this.index];
      if (token === "]") {
        this.index += 1;
        return;
      }
      if (token !== ",") this.invalid();
      this.index += 1;
    }
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const token = this.source[this.index];
      if (token === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.source.slice(start, this.index)) as string;
        } catch {
          this.invalid();
        }
      }
      if (token === "\\") {
        this.index += 1;
        const escaped = this.source[this.index];
        if (escaped === "u") {
          const digits = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(digits)) this.invalid();
          this.index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped ?? "")) {
          this.invalid();
        }
      } else if ((token?.charCodeAt(0) ?? 0) < 0x20) {
        this.invalid();
      }
      this.index += 1;
    }
    this.invalid();
  }

  private scalar(): void {
    const start = this.index;
    while (
      this.index < this.source.length &&
      !/[\s,}\]]/u.test(this.source[this.index] ?? "")
    ) {
      this.index += 1;
    }
    if (this.index === start) this.invalid();
  }

  private invalid(): never {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_JSON_INVALID",
      `Manifest JSON is invalid near character ${this.index}.`,
    );
  }
}

export function parseStrictJson(source: string): unknown {
  if (source.charCodeAt(0) === 0xfeff) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_BOM_FORBIDDEN",
      "Manifest must be UTF-8 without a byte-order mark.",
    );
  }
  new StrictJsonScanner(source).scan();
  try {
    return JSON.parse(source) as unknown;
  } catch (error: unknown) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_JSON_INVALID",
      `Manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function changedManifest(message: string): BrassArtProductionMcpError {
  return new BrassArtProductionMcpError(
    "ART_PRODUCTION_MANIFEST_CHANGED_DURING_READ",
    message,
  );
}

function pathIdentity(manifestFile: BrassArtProductionManifestFile) {
  let state: ReturnType<typeof fs.lstatSync>;
  try {
    state = fs.lstatSync(manifestFile.path);
  } catch (error: unknown) {
    throw changedManifest(
      `Manifest path became unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  if (!state.isFile() || state.isSymbolicLink()) {
    throw changedManifest(
      "Manifest path no longer identifies the resolved regular file.",
    );
  }
  return brassArtProductionFileIdentity(state);
}

function readExactManifestBytes(
  manifestFile: BrassArtProductionManifestFile,
): Buffer {
  let descriptor: number;
  try {
    descriptor = fs.openSync(manifestFile.path, "r");
  } catch (error: unknown) {
    throw changedManifest(
      `Manifest could not be opened after identity resolution: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  try {
    const openedState = fs.fstatSync(descriptor);
    if (!openedState.isFile()) {
      throw changedManifest("Opened manifest descriptor is not a regular file.");
    }
    const openedIdentity = brassArtProductionFileIdentity(openedState);
    if (
      !sameBrassArtProductionFileIdentity(
        manifestFile.identity,
        openedIdentity,
      )
    ) {
      throw changedManifest(
        "Manifest identity changed after path validation and before descriptor open.",
      );
    }
    if (
      openedIdentity.size < 1 ||
      openedIdentity.size > BRASS_ART_PRODUCTION_MAXIMUM_MANIFEST_BYTES
    ) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_MANIFEST_SIZE_INVALID",
        "Manifest has an invalid byte length.",
      );
    }

    const bytes = Buffer.allocUnsafe(openedIdentity.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = fs.readSync(
        descriptor,
        bytes,
        offset,
        Math.min(64 * 1024, bytes.byteLength - offset),
        offset,
      );
      if (count <= 0) {
        throw changedManifest("Manifest became shorter during descriptor read.");
      }
      offset += count;
    }
    const extra = Buffer.allocUnsafe(1);
    if (fs.readSync(descriptor, extra, 0, 1, bytes.byteLength) !== 0) {
      throw changedManifest("Manifest grew during descriptor read.");
    }

    const afterReadIdentity = brassArtProductionFileIdentity(
      fs.fstatSync(descriptor),
    );
    if (
      !sameBrassArtProductionFileIdentity(
        openedIdentity,
        afterReadIdentity,
      ) ||
      !sameBrassArtProductionFileIdentity(
        openedIdentity,
        pathIdentity(manifestFile),
      )
    ) {
      throw changedManifest("Manifest changed during descriptor read.");
    }
    return bytes;
  } catch (error: unknown) {
    if (error instanceof BrassArtProductionMcpError) throw error;
    throw changedManifest(
      `Manifest descriptor read failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
  } finally {
    fs.closeSync(descriptor);
  }
}

export function loadDeliveryManifestStrict(
  manifestFile: BrassArtProductionManifestFile,
): Readonly<{
  manifest: DeliveryBatchManifest;
  manifestSha256: string;
  bytes: number;
  descriptorBoundRead: true;
  manifestIdentityRechecked: true;
}> {
  const bytes = readExactManifestBytes(manifestFile);
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_BOM_FORBIDDEN",
      "Manifest must be UTF-8 without a byte-order mark.",
    );
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error: unknown) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_UTF8_INVALID",
      `Manifest is not strict UTF-8: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const manifest = validateDeliveryBatchManifest(parseStrictJson(source));
  if (
    !sameBrassArtProductionFileIdentity(
      manifestFile.identity,
      pathIdentity(manifestFile),
    )
  ) {
    throw changedManifest("Manifest path changed while JSON was validated.");
  }
  return Object.freeze({
    manifest,
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
    descriptorBoundRead: true,
    manifestIdentityRechecked: true,
  });
}
