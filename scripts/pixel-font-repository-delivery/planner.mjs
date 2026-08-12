import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  HEAD40,
  canonicalDirectory,
  canonicalFile,
  fileIdentity,
  hashJsonLine,
  hashObject,
  pathInside,
  posixRelative,
  readJson,
  runFixed,
  safeStem,
  sha256,
  text,
  writeJsonCreateOnly,
} from "./common.mjs";
import {
  BUILD_SCHEMA,
  TEXT_BUILD_SCHEMA,
  INSTALL_SCHEMA,
  PLAN_SCHEMA,
  normalizeJob,
} from "./schema.mjs";

function verifyBuildManifest(value, root, expectedBuildSha256) {
  if (!value || typeof value !== "object" || value.schema !== BUILD_SCHEMA) {
    throw new Error(`Build manifest in ${root} has an unsupported schema.`);
  }
  const stored = text(value.buildSha256, "build.buildSha256", {
    maximum: 64,
    pattern: /^[0-9a-f]{64}$/u,
  });
  const unsigned = { ...value };
  delete unsigned.buildSha256;
  if (hashJsonLine(unsigned) !== stored) {
    throw new Error(`Build manifest in ${root} has an invalid buildSha256.`);
  }
  if (expectedBuildSha256 && stored !== expectedBuildSha256) {
    throw new Error(`Build ${root} differs from expectedBuildSha256.`);
  }
  if (!Array.isArray(value.files) || !value.files.length) {
    throw new Error(`Build manifest in ${root} has no retained file records.`);
  }
  if (!Array.isArray(value.strikes) || !value.strikes.length) {
    throw new Error(`Build manifest in ${root} has no strike records.`);
  }
  const seen = new Set();
  for (const record of value.files) {
    if (!record || typeof record !== "object") {
      throw new Error(`Build ${root} contains an invalid file record.`);
    }
    const relative = posixRelative(record.path, "build.files.path", {
      deniedParts: [".git", ".env", "node_modules", "credentials", "secrets"],
    });
    if (seen.has(relative)) {
      throw new Error(`Build ${root} contains duplicate file record ${relative}.`);
    }
    seen.add(relative);
    if (
      !/^[0-9a-f]{64}$/u.test(record.sha256)
      || !Number.isSafeInteger(record.bytes)
      || record.bytes < 0
    ) {
      throw new Error(`Build ${root} contains an invalid identity for ${relative}.`);
    }
  }
  return value;
}

async function validateBuildFiles(manifest, root) {
  for (const record of manifest.files) {
    const relative = posixRelative(record.path, "build.files.path", {
      deniedParts: [".git", ".env", "node_modules", "credentials", "secrets"],
    });
    const source = path.resolve(root, relative);
    if (!pathInside(source, root)) {
      throw new Error(`Build file escapes root: ${relative}.`);
    }
    const metadata = await fileIdentity(
      await canonicalFile(source, `build file ${relative}`),
    );
    if (metadata.sha256 !== record.sha256 || metadata.bytes !== record.bytes) {
      throw new Error(`Build file identity changed: ${relative}.`);
    }
  }
}

function verifyTextBuildManifest(value, root, expectedBuildSha256 = null) {
  if (!value || typeof value !== "object" || value.schema !== TEXT_BUILD_SCHEMA) {
    throw new Error(`Pixel Text Studio build in ${root} has an unsupported schema.`);
  }
  const stored = text(value.buildSha256, "pixel-text-build.buildSha256", {
    maximum: 64,
    pattern: /^[0-9a-f]{64}$/u,
  });
  const unsigned = { ...value };
  delete unsigned.buildSha256;
  if (hashJsonLine(unsigned) !== stored) {
    throw new Error(`Pixel Text Studio build in ${root} has an invalid buildSha256.`);
  }
  if (expectedBuildSha256 && stored !== expectedBuildSha256) {
    throw new Error(`Pixel Text Studio build ${root} differs from expectedBuildSha256.`);
  }
  if (!Array.isArray(value.files) || !value.files.length) {
    throw new Error(`Pixel Text Studio build in ${root} has no retained file records.`);
  }
  if (!Array.isArray(value.frames) || !value.frames.length) {
    throw new Error(`Pixel Text Studio build in ${root} has no frame records.`);
  }
  const seen = new Set();
  for (const record of value.files) {
    if (!record || typeof record !== "object") {
      throw new Error(`Pixel Text Studio build ${root} contains an invalid file record.`);
    }
    const relative = posixRelative(record.path, "pixel-text-build.files.path", {
      deniedParts: [".git", ".env", "node_modules", "credentials", "secrets"],
    });
    if (seen.has(relative)) {
      throw new Error(`Pixel Text Studio build ${root} contains duplicate file ${relative}.`);
    }
    seen.add(relative);
    if (!/^[0-9a-f]{64}$/u.test(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes < 0) {
      throw new Error(`Pixel Text Studio build ${root} has an invalid identity for ${relative}.`);
    }
  }
  return value;
}

async function validateTextBuildFiles(manifest, root) {
  for (const record of manifest.files) {
    const relative = posixRelative(record.path, "pixel-text-build.files.path", {
      deniedParts: [".git", ".env", "node_modules", "credentials", "secrets"],
    });
    const source = path.resolve(root, relative);
    if (!pathInside(source, root)) throw new Error(`Pixel Text Studio file escapes root: ${relative}.`);
    const identity = await fileIdentity(await canonicalFile(source, `pixel-text file ${relative}`));
    if (identity.sha256 !== record.sha256 || identity.bytes !== record.bytes) {
      throw new Error(`Pixel Text Studio file identity changed: ${relative}.`);
    }
  }
}

async function materializeTitle(entry, buildById, workspace, python, textCompilerPath, job) {
  let root;
  if (entry.mode === "render") {
    if (!textCompilerPath) throw new Error(`Title ${entry.titleId} requires the Pixel Text Studio compiler.`);
    const fontBuild = buildById.get(entry.fontBuildId);
    if (!fontBuild) throw new Error(`Title ${entry.titleId} references unavailable font build ${entry.fontBuildId}.`);
    const fontDescriptor = await canonicalFile(
      path.join(fontBuild.root, fontBuild.strike.bmfont.path),
      `title ${entry.titleId} font descriptor`,
    );
    const styleFile = await readJson(entry.stylePath, `title ${entry.titleId} style`);
    const style = structuredClone(styleFile.value);
    if (!style || typeof style !== "object" || Array.isArray(style)) {
      throw new Error(`Title ${entry.titleId} style must be an object.`);
    }
    if (!style.output || typeof style.output !== "object" || Array.isArray(style.output)) style.output = {};
    style.output.individualFrames = true;
    if (job.target.adapter === "godot-4.6.2") {
      const stem = safeStem(entry.targetStem, job.target.filenameCase);
      style.output.godotResourceRoot = `res://${job.target.destinationRoot}/titles/${stem}`;
    } else {
      style.output.godotResourceRoot = "";
    }
    const stylePath = path.join(workspace, `${entry.titleId}.style.json`);
    await writeFile(stylePath, `${JSON.stringify(style, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    root = path.join(workspace, entry.titleId);
    runFixed(
      python,
      [textCompilerPath, "render", "--font", fontDescriptor, "--text", entry.text, "--style", stylePath, "--output", root],
      { cwd: path.dirname(textCompilerPath), timeout: 900_000, label: `render title ${entry.titleId}` },
    );
  } else {
    root = await canonicalDirectory(entry.buildRoot, `title ${entry.titleId}.buildRoot`);
  }
  if (textCompilerPath) {
    runFixed(
      python,
      [textCompilerPath, "validate-output", "--output", root],
      { cwd: path.dirname(textCompilerPath), timeout: 900_000, label: `validate title ${entry.titleId}` },
    );
  }
  const manifestFile = await readJson(path.join(root, "pixel-text-build.json"), `title ${entry.titleId} manifest`);
  const manifest = verifyTextBuildManifest(manifestFile.value, root, entry.expectedBuildSha256);
  await validateTextBuildFiles(manifest, root);
  return Object.freeze({ entry, root, manifest, manifestFile });
}

async function materializeV2Family(entry) {
  const root = await canonicalDirectory(entry.buildRoot, `build ${entry.buildId}.buildRoot`);
  const familyFile = await readJson(
    path.join(root, "pixel-font-family.json"),
    `Pixel Font Studio v2 family ${entry.buildId}`,
  );
  if (familyFile.sha256 !== entry.expectedBuildSha256) {
    throw new Error(`Pixel Font Studio v2 family ${entry.buildId} differs from expectedBuildSha256.`);
  }
  const family = familyFile.value;
  if (family.schema !== "evavo.pixel-font-family.v2" || !Array.isArray(family.faces)) {
    throw new Error(`Pixel Font Studio v2 family ${entry.buildId} has an unsupported manifest.`);
  }
  const face = family.faces.find((candidate) => candidate.faceId === entry.sourceFaceId);
  if (!face || !face.files || typeof face.files !== "object") {
    throw new Error(`Pixel Font Studio v2 family ${entry.buildId} does not contain ${entry.sourceFaceId}.`);
  }
  const records = [];
  const byName = new Map();
  for (const [name, expectedSha256] of Object.entries(face.files).sort(([left], [right]) => left.localeCompare(right))) {
    const relative = posixRelative(`fonts/${face.faceId}/${name}`, `v2 ${face.faceId} file`);
    const source = await canonicalFile(path.join(root, relative), `v2 ${face.faceId} file ${name}`);
    const identity = await fileIdentity(source);
    if (identity.sha256 !== expectedSha256) {
      throw new Error(`Pixel Font Studio v2 file identity changed: ${relative}.`);
    }
    const record = { path: relative, sha256: identity.sha256, bytes: identity.bytes };
    records.push(record);
    byName.set(name, record);
  }
  function required(suffix) {
    const name = `${face.faceId}${suffix}`;
    const record = byName.get(name);
    if (!record) throw new Error(`Pixel Font Studio v2 face ${face.faceId} is missing ${name}.`);
    return record;
  }
  const bmfont = required(".fnt");
  const atlas = required(".png");
  const master = required(".master.json");
  const strike = {
    strike: 1,
    bmfont,
    atlas: { pageCount: 1, pages: [atlas] },
    atlasJson: byName.get(`${face.faceId}.atlas.json`) ?? null,
    bdf: byName.get(`${face.faceId}.bdf`) ?? null,
    ttf: byName.get(`${face.faceId}.ttf`) ?? null,
    grid: byName.get(`${face.faceId}.grid.png`) ?? null,
    gridMap: byName.get(`${face.faceId}.grid.json`) ?? null,
  };
  const manifest = {
    schema: BUILD_SCHEMA,
    engineVersion: "pixel-font-studio-v2",
    familyId: family.familyId,
    faceId: face.faceId,
    profileId: "pixel-font-v2-authored-master",
    buildSha256: familyFile.sha256,
    files: records,
    strikes: [strike],
  };
  return Object.freeze({
    entry,
    root,
    manifest,
    strike,
    sourceFaceRecord: master,
    sourceProfileRecord: null,
    sourceFormat: "pixel-font-family-v2",
  });
}

async function materializeBuild(entry, workspace, python, compilerPath) {
  if (entry.mode === "v2-family") return materializeV2Family(entry);
  let root;
  if (entry.mode === "compile") {
    if (!compilerPath) throw new Error(`Build ${entry.buildId} requires the universal compiler.`);
    root = path.join(workspace, entry.buildId);
    runFixed(
      python,
      [
        compilerPath,
        "compile",
        "--face",
        entry.facePath,
        "--profile",
        entry.profilePath,
        "--output",
        root,
      ],
      {
        cwd: path.dirname(compilerPath),
        timeout: 900_000,
        label: `compile ${entry.buildId}`,
      },
    );
  } else {
    root = await canonicalDirectory(entry.buildRoot, `build ${entry.buildId}.buildRoot`);
  }
  if (compilerPath) {
    runFixed(
      python,
      [compilerPath, "validate-output", "--output", root],
      {
        cwd: path.dirname(compilerPath),
        timeout: 900_000,
        label: `validate build ${entry.buildId}`,
      },
    );
  }
  const manifestFile = await readJson(
    path.join(root, "pixel-font-style-build.json"),
    `build ${entry.buildId} manifest`,
  );
  const manifest = verifyBuildManifest(
    manifestFile.value,
    root,
    entry.expectedBuildSha256,
  );
  await validateBuildFiles(manifest, root);
  const strike = manifest.strikes.find(
    (candidate) => candidate.strike === entry.strike,
  );
  if (!strike) {
    throw new Error(`Build ${entry.buildId} does not contain strike ${entry.strike}.`);
  }
  if (!strike.atlas || !Array.isArray(strike.atlas.pages)) {
    throw new Error(`Build ${entry.buildId} strike ${entry.strike} has no atlas pages.`);
  }
  if (strike.atlas.pageCount !== strike.atlas.pages.length) {
    throw new Error(`Build ${entry.buildId} strike ${entry.strike} has inconsistent pageCount.`);
  }
  return Object.freeze({
    entry,
    root,
    manifest,
    strike,
    sourceFaceRecord: manifest.files.find((record) => record.path === "source/normalised-face.json") ?? null,
    sourceProfileRecord: manifest.files.find((record) => record.path === "source/style-profile.json") ?? null,
    sourceFormat: "universal-v3",
  });
}

function sourceAction(targetPath, sourcePath, record, category, ownerBuildId) {
  return Object.freeze({
    targetPath,
    category,
    ownerBuildId,
    source: Object.freeze({
      path: path.resolve(sourcePath),
      sha256: record.sha256,
      bytes: record.bytes,
    }),
    generated: null,
  });
}

function generatedAction(targetPath, bytes, category, ownerBuildId = null) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  return Object.freeze({
    targetPath,
    category,
    ownerBuildId,
    source: null,
    generated: Object.freeze({
      encoding: "base64",
      content: buffer.toString("base64"),
      sha256: sha256(buffer),
      bytes: buffer.length,
    }),
  });
}

function rewriteBmfont(source, displayName, pageNames) {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const output = [];
  const observedPages = new Set();
  for (const line of lines) {
    if (line.startsWith("info ")) {
      output.push(
        line
          .replace(/face="[^"]*"/u, `face="${displayName.replaceAll('"', "")}"`)
          .replace(/smooth=\d+/u, "smooth=0")
          .replace(/aa=\d+/u, "aa=0"),
      );
      continue;
    }
    if (line.startsWith("page ")) {
      const match = /id=(\d+)/u.exec(line);
      if (!match) throw new Error("BMFont page line is missing an id.");
      const pageId = Number(match[1]);
      if (!Number.isSafeInteger(pageId) || !pageNames[pageId]) {
        throw new Error(`BMFont page id ${pageId} is outside the target page set.`);
      }
      observedPages.add(pageId);
      output.push(`page id=${pageId} file="${pageNames[pageId]}"`);
      continue;
    }
    output.push(line);
  }
  if (observedPages.size !== pageNames.length) {
    throw new Error("BMFont page count does not match the selected strike.");
  }
  return Buffer.from(`${output.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function godotVariation(resourcePath) {
  return Buffer.from(
    `[gd_resource type="FontVariation" load_steps=2 format=3]\n\n`
      + `[ext_resource type="FontFile" path="res://${resourcePath}" id="1_font"]\n\n`
      + `[resource]\nbase_font = ExtResource("1_font")\n`,
    "utf8",
  );
}

function godotLoader(job, faces) {
  const className = job.target.godot.loaderClass;
  const faceRows = faces
    .map((face) => `\t"${face.stem}": "res://${face.runtimeFnt}"`)
    .join(",\n");
  const roleRows = faces
    .flatMap((face) => face.roles.map((role) => `\t"${role}": "${face.stem}"`))
    .join(",\n");
  return Buffer.from(
    `class_name ${className}\nextends RefCounted\n\n`
      + `const FACE_PATHS := {\n${faceRows}\n}\n\n`
      + `const ROLE_TO_FACE := {\n${roleRows}\n}\n\n`
      + `static func load_face(face_id: String) -> FontFile:\n`
      + `\tassert(FACE_PATHS.has(face_id), "Unknown pixel-font face: %s" % face_id)\n`
      + `\tvar font := FontFile.new()\n`
      + `\tvar error := font.load_bitmap_font(FACE_PATHS[face_id])\n`
      + `\tassert(error == OK, "Failed to load pixel-font face %s: %s" % [face_id, error])\n`
      + `\tfont.allow_system_fallback = false\n`
      + `\tfont.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED\n`
      + `\tfont.generate_mipmaps = false\n`
      + `\treturn font\n\n`
      + `static func load_role(role: String) -> FontFile:\n`
      + `\tassert(ROLE_TO_FACE.has(role), "Unknown pixel-font role: %s" % role)\n`
      + `\treturn load_face(ROLE_TO_FACE[role])\n\n`
      + `static func apply_to_control(control: Control, role: String, font_size: int) -> void:\n`
      + `\tassert(font_size > 0, "font_size must be positive")\n`
      + `\tcontrol.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST\n`
      + `\tcontrol.add_theme_font_override("font", load_role(role))\n`
      + `\tcontrol.add_theme_font_size_override("font_size", font_size)\n`,
    "utf8",
  );
}

function roleMap(job, faces) {
  return {
    schema: "evavo.pixel-font-role-map.v1",
    familyId: job.family.familyId,
    displayName: job.family.displayName,
    version: job.family.version,
    adapter: job.target.adapter,
    policy: job.target.godot,
    faces: Object.fromEntries(
      faces.map((face) => [
        face.stem,
        {
          displayName: face.displayName,
          roles: face.roles,
          bmfont: `res://${face.runtimeFnt}`,
          fontVariation: `res://${face.roleResource}`,
          strike: face.strike,
        },
      ]),
    ),
    roles: Object.fromEntries(
      faces.flatMap((face) => face.roles.map((role) => [role, face.stem])),
    ),
  };
}

function titleRoleMap(job, titles) {
  return {
    schema: "evavo.pixel-text-role-map.v1",
    familyId: job.family.familyId,
    displayName: job.family.displayName,
    version: job.family.version,
    titles: Object.fromEntries(
      titles.map((title) => [
        title.stem,
        {
          displayName: title.displayName,
          roles: title.roles,
          frameCount: title.frameCount,
          fps: title.fps,
          loop: title.loop,
          title: title.titlePath ? `res://${title.titlePath}` : null,
          sheet: title.sheetPath ? `res://${title.sheetPath}` : null,
          spriteFrames: title.godotResource ? `res://${title.godotResource}` : null,
        },
      ]),
    ),
    roles: Object.fromEntries(titles.flatMap((title) => title.roles.map((role) => [role, title.stem]))),
  };
}

function godotTitleCatalog(job, titles) {
  const className = `${job.family.namespace}Titles`;
  const frameRows = titles
    .flatMap((title) => title.roles.map((role) => title.godotResource ? `\t"${role}": "res://${title.godotResource}"` : null))
    .filter(Boolean)
    .join(",\n");
  const staticRows = titles
    .flatMap((title) => title.roles.map((role) => title.titlePath ? `\t"${role}": "res://${title.titlePath}"` : null))
    .filter(Boolean)
    .join(",\n");
  return Buffer.from(
    `class_name ${className}\nextends RefCounted\n\n`
      + `const ROLE_TO_SPRITE_FRAMES := {\n${frameRows}\n}\n\n`
      + `const ROLE_TO_STATIC_TEXTURE := {\n${staticRows}\n}\n\n`
      + `static func load_frames(role: String) -> SpriteFrames:\n`
      + `\tassert(ROLE_TO_SPRITE_FRAMES.has(role), "Unknown pixel-text animation role: %s" % role)\n`
      + `\treturn load(ROLE_TO_SPRITE_FRAMES[role]) as SpriteFrames\n\n`
      + `static func load_static(role: String) -> Texture2D:\n`
      + `\tassert(ROLE_TO_STATIC_TEXTURE.has(role), "Unknown pixel-text static role: %s" % role)\n`
      + `\treturn load(ROLE_TO_STATIC_TEXTURE[role]) as Texture2D\n`,
    "utf8",
  );
}

function titleRecordIncluded(relative, include, retainSourceEvidence) {
  if (relative.startsWith("frames/") || relative === "title.png") return include.frames;
  if (relative === "sheet.png") return include.sheet;
  if (relative.startsWith("web/")) return include.web;
  if (relative.startsWith("godot/")) return include.godot;
  if (relative.startsWith("source/")) return include.source && retainSourceEvidence;
  return false;
}

function deliveryReadme(job, faces, titles = []) {
  const faceRows = faces
    .map((face) => `- **${face.displayName}** (\`${face.stem}\`) — strike ${face.strike}×; roles: ${face.roles.join(", ")}.`)
    .join("\n");
  const titleRows = titles.length
    ? `\n\n## Pixel text and titles\n\n${titles.map((title) => `- **${title.displayName}** (\`${title.stem}\`) — ${title.frameCount} frame(s) at ${title.fps} FPS; roles: ${title.roles.join(", ") || "none"}.`).join("\n")}`
    : "";
  const runtime = job.target.adapter === "godot-4.6.2"
    ? `Use the generated font role map, \`.tres\` font resources and \`${job.target.godot.loaderClass}\`. Pixel-title builds include SpriteFrames resources and a generated ${job.family.namespace}Titles catalog when title roles are present. Font loading disables system fallback, subpixel positioning and mipmaps and applies nearest filtering to target controls.`
    : "Use each matching `.fnt` plus every referenced PNG atlas page as the canonical pixel-perfect font runtime. Pixel-title frames, sheets and web bundles remain raster assets.";
  return `# ${job.family.displayName}\n\nAutomated EVAVO Pixel Font Studio repository installation.\n\n## Font faces\n\n${faceRows}${titleRows}\n\n## Runtime\n\n${runtime}\n\nTTF and BDF are optional interchange outputs. BMFont plus PNG remains authoritative for exact font pixels and colour presentation; rendered title PNGs remain authoritative for title treatments.\n\n## Ownership\n\n\`pixel-font-installation.json\` records every owned path and SHA-256 identity. Future replace-owned updates refuse to overwrite files whose installed bytes no longer match that manifest.\n`;
}

function findFileRecord(manifest, relative) {
  const record = manifest.files.find((candidate) => candidate.path === relative);
  if (!record) throw new Error(`Build manifest is missing file record ${relative}.`);
  return record;
}

function targetRootPath(job, suffix) {
  return posixRelative(`${job.target.destinationRoot}/${suffix}`, "target path");
}

function cloneJobForOverrides(normalized, overrides) {
  const job = structuredClone(normalized);
  delete job.jobSha256;
  if (overrides.repositoryOverride) job.target.repository = overrides.repositoryOverride;
  if (overrides.branchOverride) job.target.branch = overrides.branchOverride;
  if (overrides.publishModeOverride) job.publish.mode = overrides.publishModeOverride;
  if (overrides.publishBranchOverride) job.publish.branchName = overrides.publishBranchOverride;
  return job;
}

export async function compilePlan({
  jobDocument,
  jobBaseDirectory = process.cwd(),
  jobSource = null,
  workspaceRoot,
  expectedHead,
  python = process.platform === "win32" ? "python" : "python3",
  compilerPath = null,
  textCompilerPath = null,
  repositoryOverride,
  branchOverride,
  publishModeOverride,
  publishBranchOverride,
}) {
  const normalized = normalizeJob(jobDocument, { baseDirectory: jobBaseDirectory });
  const finalJob = normalizeJob(
    cloneJobForOverrides(normalized, {
      repositoryOverride,
      branchOverride,
      publishModeOverride,
      publishBranchOverride,
    }),
  );
  if (!HEAD40.test(expectedHead)) {
    throw new Error("expectedHead must be a 40-character lowercase Git SHA.");
  }
  const workspace = await canonicalDirectory(workspaceRoot, "workspaceRoot", {
    create: true,
  });
  const needsCompiler = finalJob.builds.some((entry) => entry.mode === "compile");
  const compiler = compilerPath
    ? await canonicalFile(compilerPath, "universal compiler path")
    : null;
  if (needsCompiler && !compiler) {
    throw new Error("At least one compile-mode build requires compilerPath.");
  }
  const needsTextCompiler = finalJob.titles.some((entry) => entry.mode === "render");
  const textCompiler = textCompilerPath
    ? await canonicalFile(textCompilerPath, "Pixel Text Studio compiler path")
    : null;
  if (needsTextCompiler && !textCompiler) {
    throw new Error("At least one render-mode title requires textCompilerPath.");
  }
  const buildWorkspace = await mkdtemp(
    path.join(workspace, `.pixel-font-builds-${finalJob.jobId}-`),
  );
  const materialized = [];
  for (const entry of finalJob.builds) {
    materialized.push(
      await materializeBuild(entry, buildWorkspace, python, compiler),
    );
  }
  const buildById = new Map(materialized.map((build) => [build.entry.buildId, build]));
  const titleWorkspace = await mkdtemp(
    path.join(workspace, `.pixel-text-builds-${finalJob.jobId}-`),
  );
  const materializedTitles = [];
  for (const entry of finalJob.titles) {
    materializedTitles.push(
      await materializeTitle(entry, buildById, titleWorkspace, python, textCompiler, finalJob),
    );
  }

  const actions = [];
  const faceRecords = [];
  for (const build of materialized) {
    const { entry, root, manifest, strike } = build;
    if (manifest.familyId !== finalJob.family.familyId) {
      throw new Error(
        `Build ${entry.buildId} familyId ${manifest.familyId} differs from job family ${finalJob.family.familyId}.`,
      );
    }
    const stem = safeStem(entry.targetStem, finalJob.target.filenameCase);
    const runtimeDir = targetRootPath(finalJob, "runtime");
    const pageNames = strike.atlas.pages.map((_record, pageIndex) => (
      strike.atlas.pageCount === 1
        ? `${stem}.png`
        : `${stem}-page-${pageIndex}.png`
    ));
    let runtimeFnt = null;
    let runtimePages = [];
    if (entry.include.runtime) {
      runtimeFnt = `${runtimeDir}/${stem}.fnt`;
      const bmfontSource = path.join(root, strike.bmfont.path);
      const bmfontBytes = rewriteBmfont(
        await readFile(bmfontSource, "utf8"),
        entry.displayName,
        pageNames,
      );
      actions.push(
        generatedAction(runtimeFnt, bmfontBytes, "runtime-bmfont", entry.buildId),
      );
      runtimePages = pageNames.map((name) => `${runtimeDir}/${name}`);
      for (let pageIndex = 0; pageIndex < strike.atlas.pages.length; pageIndex += 1) {
        const record = strike.atlas.pages[pageIndex];
        actions.push(
          sourceAction(
            runtimePages[pageIndex],
            path.join(root, record.path),
            record,
            "runtime-atlas",
            entry.buildId,
          ),
        );
      }
    }
    if (entry.include.atlasJson && strike.atlasJson) {
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `metadata/${stem}.atlas.json`),
          path.join(root, strike.atlasJson.path),
          strike.atlasJson,
          "atlas-json",
          entry.buildId,
        ),
      );
    }
    if (entry.include.bdf && strike.bdf) {
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `interchange/${stem}.bdf`),
          path.join(root, strike.bdf.path),
          strike.bdf,
          "bdf",
          entry.buildId,
        ),
      );
    }
    if (entry.include.ttf && strike.ttf) {
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `interchange/${stem}.ttf`),
          path.join(root, strike.ttf.path),
          strike.ttf,
          "ttf",
          entry.buildId,
        ),
      );
    }
    if (finalJob.policy.retainSourceEvidence && entry.include.source && build.sourceFaceRecord) {
      const sourceFace = build.sourceFaceRecord;
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `source/${stem}.face.json`),
          path.join(root, sourceFace.path),
          sourceFace,
          "source-face",
          entry.buildId,
        ),
      );
    }
    if (finalJob.policy.retainSourceEvidence && entry.include.profile && build.sourceProfileRecord) {
      const sourceProfile = build.sourceProfileRecord;
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `source/${stem}.profile.json`),
          path.join(root, sourceProfile.path),
          sourceProfile,
          "source-profile",
          entry.buildId,
        ),
      );
    }
    if (entry.include.review && strike.grid) {
      actions.push(
        sourceAction(
          targetRootPath(finalJob, `review/${stem}.grid.png`),
          path.join(root, strike.grid.path),
          strike.grid,
          "review-grid",
          entry.buildId,
        ),
      );
      if (strike.gridMap) {
        actions.push(
          sourceAction(
            targetRootPath(finalJob, `review/${stem}.grid.json`),
            path.join(root, strike.gridMap.path),
            strike.gridMap,
            "review-grid-map",
            entry.buildId,
          ),
        );
      }
    }
    let roleResource = null;
    if (finalJob.target.adapter === "godot-4.6.2" && entry.include.godot) {
      if (!runtimeFnt) {
        throw new Error(`Godot build ${entry.buildId} cannot generate resources without runtime BMFont output.`);
      }
      roleResource = targetRootPath(
        finalJob,
        `${finalJob.target.godot.roleResourceRoot}/${stem}.tres`,
      );
      actions.push(
        generatedAction(
          roleResource,
          godotVariation(runtimeFnt),
          "godot-font-variation",
          entry.buildId,
        ),
      );
    }
    faceRecords.push(
      Object.freeze({
        buildId: entry.buildId,
        sourceBuildSha256: manifest.buildSha256,
        sourceFaceId: manifest.faceId,
        sourceProfileId: manifest.profileId,
        stem,
        displayName: entry.displayName,
        roles: entry.roles,
        strike: entry.strike,
        runtimeFnt,
        runtimePages,
        roleResource,
      }),
    );
  }

  const titleRecords = [];
  for (const titleBuild of materializedTitles) {
    const { entry, root, manifest, manifestFile } = titleBuild;
    const stem = safeStem(entry.targetStem, finalJob.target.filenameCase);
    const titleRoot = targetRootPath(finalJob, `titles/${stem}`);
    const selected = [];
    for (const record of manifest.files) {
      const relative = posixRelative(record.path, `title ${entry.titleId} file`);
      if (!titleRecordIncluded(relative, entry.include, finalJob.policy.retainSourceEvidence)) continue;
      const target = `${titleRoot}/${relative}`;
      actions.push(sourceAction(target, path.join(root, relative), record, `pixel-text-${relative.split("/")[0]}`, entry.titleId));
      selected.push({ relative, target });
    }
    let manifestPath = null;
    if (entry.include.manifest) {
      const identity = await fileIdentity(manifestFile.path);
      const record = { path: "pixel-text-build.json", sha256: identity.sha256, bytes: identity.bytes };
      manifestPath = targetRootPath(finalJob, `metadata/titles/${stem}.build.json`);
      actions.push(sourceAction(manifestPath, manifestFile.path, record, "pixel-text-manifest", entry.titleId));
    }
    const targetFor = (relative) => selected.find((item) => item.relative === relative)?.target ?? null;
    const frameTargets = selected.filter((item) => item.relative.startsWith("frames/")).map((item) => item.target);
    const godotResource = targetFor("godot/pixel-text-spriteframes.tres");
    titleRecords.push(Object.freeze({
      titleId: entry.titleId,
      sourceBuildSha256: manifest.buildSha256,
      sourceStyleId: manifest.styleId,
      stem,
      displayName: entry.displayName,
      roles: entry.roles,
      width: manifest.width,
      height: manifest.height,
      frameCount: manifest.frameCount,
      fps: manifest.fps,
      loop: manifest.loop,
      frames: frameTargets,
      titlePath: targetFor("title.png"),
      sheetPath: targetFor("sheet.png"),
      webCss: targetFor("web/pixel-text.css"),
      webJs: targetFor("web/pixel-text.js"),
      godotResource,
      manifestPath,
    }));
  }

  if (titleRecords.length) {
    actions.push(
      generatedAction(
        targetRootPath(finalJob, "metadata/title-role-map.json"),
        `${JSON.stringify(titleRoleMap(finalJob, titleRecords), null, 2)}\n`,
        "pixel-text-role-map",
      ),
    );
  }

  if (finalJob.target.adapter === "godot-4.6.2") {
    const roleMapPath = targetRootPath(
      finalJob,
      finalJob.target.godot.roleMapPath,
    );
    actions.push(
      generatedAction(
        roleMapPath,
        `${JSON.stringify(roleMap(finalJob, faceRecords), null, 2)}\n`,
        "godot-role-map",
      ),
    );
    actions.push(
      generatedAction(
        finalJob.target.godot.loaderPath,
        godotLoader(finalJob, faceRecords),
        "godot-loader",
      ),
    );
    if (titleRecords.length) {
      actions.push(
        generatedAction(
          targetRootPath(finalJob, "godot/pixel_text_catalog.gd"),
          godotTitleCatalog(finalJob, titleRecords),
          "godot-pixel-text-catalog",
        ),
      );
    }
  }
  actions.push(
    generatedAction(
      finalJob.target.readmePath,
      deliveryReadme(finalJob, faceRecords, titleRecords),
      "documentation",
    ),
  );

  const targetPaths = actions.map((action) => action.targetPath.toLowerCase());
  if (new Set(targetPaths).size !== targetPaths.length) {
    throw new Error("Delivery actions contain duplicate target paths.");
  }
  actions.sort((left, right) => left.targetPath.localeCompare(right.targetPath));

  const installationBody = {
    schema: INSTALL_SCHEMA,
    familyId: finalJob.family.familyId,
    displayName: finalJob.family.displayName,
    version: finalJob.family.version,
    namespace: finalJob.family.namespace,
    repository: finalJob.target.repository,
    branch: finalJob.target.branch,
    destinationRoot: finalJob.target.destinationRoot,
    adapter: finalJob.target.adapter,
    jobSha256: finalJob.jobSha256,
    faces: faceRecords,
    titles: titleRecords,
    files: actions.map((action) => ({
      path: action.targetPath,
      sha256: action.source?.sha256 ?? action.generated.sha256,
      bytes: action.source?.bytes ?? action.generated.bytes,
      category: action.category,
      ownerBuildId: action.ownerBuildId,
    })),
    policy: {
      installationMode: finalJob.target.installationMode,
      canonicalRuntime: "AngelCode BMFont plus matching RGBA PNG page(s), with rendered pixel-title PNG frames as title authority",
      nearestFiltering: finalJob.target.adapter === "godot-4.6.2" ? true : null,
      integerScaleOnly: finalJob.target.adapter === "godot-4.6.2" ? true : null,
      systemFallback: finalJob.target.adapter === "godot-4.6.2" ? false : null,
      subpixelPositioning: finalJob.target.adapter === "godot-4.6.2" ? false : null,
      mipmaps: finalJob.target.adapter === "godot-4.6.2" ? false : null,
    },
  };
  const installation = {
    ...installationBody,
    installationSha256: hashObject(installationBody),
  };
  actions.push(
    generatedAction(
      finalJob.target.installationManifestPath,
      `${JSON.stringify(installation, null, 2)}\n`,
      "installation-manifest",
    ),
  );
  actions.sort((left, right) => left.targetPath.localeCompare(right.targetPath));

  const planBody = {
    schema: PLAN_SCHEMA,
    version: "1.1.0",
    job: finalJob,
    jobSource,
    expectedHead,
    target: finalJob.target,
    publish: finalJob.publish,
    builds: materialized.map((build) => ({
      buildId: build.entry.buildId,
      root: build.root,
      buildSha256: build.manifest.buildSha256,
      familyId: build.manifest.familyId,
      faceId: build.manifest.faceId,
      profileId: build.manifest.profileId,
      sourceFormat: build.sourceFormat,
      strike: build.entry.strike,
    })),
    titleBuilds: materializedTitles.map((title) => ({
      titleId: title.entry.titleId,
      root: title.root,
      buildSha256: title.manifest.buildSha256,
      styleId: title.manifest.styleId,
      frameCount: title.manifest.frameCount,
      fps: title.manifest.fps,
    })),
    faces: faceRecords,
    titles: titleRecords,
    actions,
    receiptPath: finalJob.target.receiptPath,
    installationManifestPath: finalJob.target.installationManifestPath,
    authority: {
      targetRepositoryMutation: true,
      gitCommit: finalJob.publish.mode !== "install-only",
      gitPush: finalJob.publish.mode !== "install-only" && finalJob.publish.push,
      publication: finalJob.publish.mode !== "install-only" && finalJob.publish.push,
      forcePush: false,
      creativeApproval: false,
      sourceMutation: false,
    },
    status: "planned",
  };
  const planSha256 = hashObject(planBody);
  return Object.freeze({
    ...planBody,
    planSha256,
    runId: planSha256.slice(0, 20),
  });
}

export async function compilePlanFile(options) {
  const jobFile = await readJson(options.jobPath, "pixel-font repository job");
  const plan = await compilePlan({
    ...options,
    jobDocument: jobFile.value,
    jobBaseDirectory: path.dirname(jobFile.path),
    jobSource: {
      path: jobFile.path,
      sha256: jobFile.sha256,
      bytes: jobFile.bytes.length,
    },
  });
  const output = path.resolve(options.outputPath);
  const outputRoot = await canonicalDirectory(
    path.dirname(output),
    "plan output directory",
    { create: true },
  );
  await writeJsonCreateOnly(output, plan, outputRoot);
  return Object.freeze({ plan, planPath: output });
}
