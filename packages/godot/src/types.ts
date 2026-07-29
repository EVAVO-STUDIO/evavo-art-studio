export const GODOT_SPRITE_PACKAGE_VERSION = "2026-07-29.1" as const;

export interface GodotSpriteFramesDescriptor {
  readonly schemaVersion: "1.0";
  readonly generatorVersion: typeof GODOT_SPRITE_PACKAGE_VERSION;
  readonly targetEngine: "Godot 4.6.2";
  readonly atlasId: string;
  readonly atlasTexturePath: string;
  readonly outputResourcePath: string;
  readonly textureFiltering: "nearest" | "linear";
  readonly frames: readonly Readonly<{
    id: string;
    region: Readonly<{ x: number; y: number; width: number; height: number }>;
    trim: Readonly<{ x: number; y: number; width: number; height: number }>;
    sourceSize: Readonly<{ width: number; height: number }>;
    pivot: Readonly<{ x: number; y: number }>;
    empty: boolean;
  }>[];
  readonly animations: readonly Readonly<{
    name: string;
    loopMode: "none" | "linear" | "ping-pong";
    loopModeValue: 0 | 1 | 2;
    framesPerSecond: number;
    totalDurationMs: number;
    frames: readonly Readonly<{
      frameId: string;
      durationMs: number;
      relativeDuration: number;
    }>[];
  }>[];
}

export interface GodotSpriteFramesWriteOptions {
  readonly resourceFileName?: string;
  readonly descriptorFileName?: string;
  readonly importerFileName?: string;
}

export interface GodotSpriteFramesWriteResult {
  readonly descriptor: GodotSpriteFramesDescriptor;
  readonly descriptorPath: string;
  readonly importerPath: string;
  readonly resourcePath: string;
  readonly headlessCommand: readonly string[];
}

export interface RunGodotSpriteFramesImportOptions {
  readonly godotExecutable: string;
  readonly projectPath: string;
  readonly importerPath: string;
  readonly descriptorResourcePath: string;
  readonly timeoutMs?: number;
}

export interface RunGodotSpriteFramesImportResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export class GodotSpritePackageError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "GodotSpritePackageError";
    this.code = code;
  }
}
