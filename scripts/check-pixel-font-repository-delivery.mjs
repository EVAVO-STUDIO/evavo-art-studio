#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWLIST_SCHEMA,
  BUILD_SCHEMA,
  JOB_SCHEMA,
  compilePlanFile,
  deliveryCatalog,
  installPlan,
  normalizeAllowlist,
  normalizeJob,
  publishPlan,
  verifyInstalled,
} from "./pixel-font-repository-delivery/compiler.mjs";
import {
  hashJsonLine,
  hashObject,
  runFixed,
  sha256,
} from "./pixel-font-repository-delivery/common.mjs";
import {
  TOOLS,
  callTool,
  policy as mcpPolicy,
  toolDefinitions,
} from "./pixel-font-repository-delivery-mcp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
  "base64",
);

function run(executable, args, options = {}) {
  return runFixed(executable, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout ?? 120_000,
    label: `${executable} ${args.join(" ")}`,
  });
}

async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

async function createBuild(root, {
  familyId = "fixture-family",
  faceId = "fixture-ui",
  profileId = "fixture-profile",
  pageCount = 1,
  marker = "A",
  smooth = 1,
  exactPng = false,
} = {}) {
  await mkdir(root, { recursive: true });
  const records = [];
  async function retain(relative, bytes) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const record = { path: relative.replaceAll(path.sep, "/"), sha256: sha256(bytes), bytes: bytes.length };
    records.push(record);
    return record;
  }
  const pageRecords = [];
  for (let index = 0; index < pageCount; index += 1) {
    pageRecords.push(await retain(`runtime/source-page-${index}.png`, exactPng ? png : Buffer.concat([png, Buffer.from(`${marker}${index}`)])));
  }
  const bmfont = await retain(
    "runtime/source.fnt",
    Buffer.from([
      `info face="Source ${marker}" size=8 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=${smooth} aa=${smooth ? 1 : 0} padding=0,0,0,0 spacing=1,1`,
      `common lineHeight=8 base=7 scaleW=16 scaleH=16 pages=${pageCount} packed=0`,
      ...pageRecords.map((_record, index) => `page id=${index} file="source-page-${index}.png"`),
      "chars count=2",
      "char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=4 page=0 chnl=15",
      `char id=65 x=0 y=0 width=1 height=1 xoffset=0 yoffset=0 xadvance=2 page=${pageCount - 1} chnl=15`,
      "kernings count=0",
      "",
    ].join("\n"), "utf8"),
  );
  const atlasJson = await retain("metadata/source.atlas.json", Buffer.from(`{"marker":"${marker}"}\n`, "utf8"));
  const bdf = await retain("interchange/source.bdf", Buffer.from(`STARTFONT 2.1\nCOMMENT ${marker}\nENDFONT\n`, "utf8"));
  const ttf = await retain("interchange/source.ttf", Buffer.from(`FAKE-TTF-${marker}`, "utf8"));
  const face = await retain("source/normalised-face.json", Buffer.from(`{"faceId":"${faceId}","marker":"${marker}"}\n`, "utf8"));
  const profile = await retain("source/style-profile.json", Buffer.from(`{"profileId":"${profileId}","marker":"${marker}"}\n`, "utf8"));
  const grid = await retain("review/source.grid.png", Buffer.concat([png, Buffer.from(`GRID-${marker}`)]));
  const gridMap = await retain("review/source.grid.json", Buffer.from(`{"marker":"${marker}"}\n`, "utf8"));
  records.sort((left, right) => left.path.localeCompare(right.path));
  const body = {
    schema: BUILD_SCHEMA,
    engineVersion: "3.0.0",
    familyId,
    faceId,
    profileId,
    files: records,
    strikes: [
      {
        strike: 1,
        bmfont,
        atlas: { pageCount, pages: pageRecords },
        atlasJson,
        bdf,
        ttf,
        grid,
        gridMap,
      },
    ],
  };
  const manifest = { ...body, buildSha256: hashJsonLine(body) };
  await writeJson(path.join(root, "pixel-font-style-build.json"), manifest);
  return { root, manifest, face, profile };
}

async function createV2FamilyBuild(root, {
  familyId = "fixture-family",
  faceId = "FixtureV2",
  marker = "V2",
} = {}) {
  const faceRoot = path.join(root, "fonts", faceId);
  await mkdir(faceRoot, { recursive: true });
  const files = {};
  async function retain(name, bytes) {
    const target = path.join(faceRoot, name);
    await writeFile(target, bytes);
    files[name] = sha256(bytes);
  }
  await retain(
    `${faceId}.fnt`,
    Buffer.from([
      `info face="${faceId}" size=8 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=0 padding=0,0,0,0 spacing=1,1`,
      "common lineHeight=8 base=7 scaleW=1 scaleH=1 pages=1 packed=0",
      `page id=0 file="${faceId}.png"`,
      "chars count=1",
      "char id=65 x=0 y=0 width=1 height=1 xoffset=0 yoffset=0 xadvance=2 page=0 chnl=15",
      "kernings count=0",
      "",
    ].join("\n"),
    "utf8",
    ),
  );
  await retain(`${faceId}.png`, Buffer.concat([png, Buffer.from(marker)]));
  await retain(`${faceId}.atlas.json`, Buffer.from(`{"marker":"${marker}"}\n`, "utf8"));
  await retain(`${faceId}.bdf`, Buffer.from("STARTFONT 2.1\nENDFONT\n", "utf8"));
  await retain(`${faceId}.ttf`, Buffer.from(`TTF-${marker}`, "utf8"));
  await retain(`${faceId}.grid.png`, Buffer.concat([png, Buffer.from(`GRID-${marker}`)]));
  await retain(`${faceId}.grid.json`, Buffer.from(`{"marker":"${marker}"}\n`, "utf8"));
  await retain(`${faceId}.master.json`, Buffer.from(`{"schema":"evavo.pixel-font-face-master.v2","faceId":"${faceId}"}\n`, "utf8"));
  await retain(`${faceId}.audit.json`, Buffer.from("{}\n", "utf8"));
  await retain(`${faceId}.tres`, Buffer.from("[gd_resource type=\"FontVariation\" format=3]\n", "utf8"));
  const family = {
    schema: "evavo.pixel-font-family.v2",
    toolVersion: "2.2.0",
    familyId,
    displayName: "Fixture v2 Family",
    version: "2.2.0",
    canonicalRuntime: "AngelCode BMFont + RGBA PNG",
    faces: [
      {
        faceId,
        displayName: faceId,
        version: "2.2.0",
        role: "ui",
        glyphCount: 1,
        kerningPairCount: 0,
        files,
      },
    ],
  };
  const familyPath = await writeJson(path.join(root, "pixel-font-family.json"), family);
  return {
    root,
    manifest: { buildSha256: sha256(await readFile(familyPath)) },
    mode: "v2-family",
    sourceFaceId: faceId,
  };
}

function job({
  builds,
  titles = [],
  repository = "EVAVO-STUDIO/fixture-game",
  adapter = "godot-4.6.2",
  installationMode = "replace-owned",
  publishMode = "install-only",
  publishBranch = "agent/pixel-font/fixture-family",
  allowDirectMain = false,
  requireExactRemote = publishMode === "install-only" ? false : true,
  destinationRoot = "assets/fonts/fixture_family",
} = {}) {
  return {
    schema: JOB_SCHEMA,
    jobId: `fixture-${publishMode}-${builds.length}`,
    family: {
      familyId: "fixture-family",
      displayName: "Fixture Pixel Family",
      version: "1.0.0",
      namespace: "FixturePixelFonts",
    },
    builds: builds.map((build, index) => ({
      buildId: build.buildId ?? `face-${index}`,
      mode: build.mode ?? "existing",
      buildRoot: build.root,
      sourceFaceId: build.sourceFaceId,
      expectedBuildSha256: build.manifest.buildSha256,
      strike: 1,
      targetStem: build.targetStem ?? `Fixture_${index}`,
      displayName: build.displayName ?? `Fixture ${index}`,
      roles: build.roles ?? [`role-${index}`],
      include: {
        runtime: true,
        atlasJson: true,
        ttf: true,
        bdf: true,
        source: true,
        profile: true,
        review: true,
        godot: adapter === "godot-4.6.2",
      },
    })),
    titles,
    target: {
      repository,
      branch: "main",
      adapter,
      destinationRoot,
      filenameCase: "pascal",
      installationMode,
      godot: adapter === "godot-4.6.2"
        ? {
          resourceRoot: destinationRoot,
          loaderClass: "FixturePixelFonts",
          loaderPath: `${destinationRoot}/godot/FixturePixelFonts.gd`,
          roleMapPath: "metadata/role-map.json",
          roleResourceRoot: "godot/roles",
          systemFallback: false,
          subpixelPositioning: false,
          mipmaps: false,
          integerScaleOnly: true,
          nearestFiltering: true,
        }
        : undefined,
    },
    publish: {
      mode: publishMode,
      remote: "origin",
      branchName: publishMode === "branch" ? publishBranch : undefined,
      allowDirectMain,
      commitMessage: "feat(fonts): install fixture pixel family",
      push: publishMode !== "install-only",
    },
    policy: {
      requireClean: true,
      requireExactHead: true,
      requireExactRemote,
      removeStaleOwnedFiles: true,
      retainSourceEvidence: true,
    },
  };
}

function allowlist(...repositories) {
  const value = {
    schema: ALLOWLIST_SCHEMA,
    version: 1,
    repositories,
  };
  normalizeAllowlist(value);
  return value;
}

function rule(repository, publishModes = ["install-only", "branch", "direct-main"]) {
  return {
    repository,
    branches: ["main"],
    destinationRoots: ["assets/fonts"],
    publishModes,
  };
}

async function planJob({ jobDocument, root, expectedHead = "a".repeat(40), name = "plan", textCompilerPath = null }) {
  const jobPath = await writeJson(path.join(root, `${name}.job.json`), jobDocument);
  const workspace = path.join(root, `${name}.workspace`);
  await mkdir(workspace, { recursive: true });
  const planPath = path.join(workspace, `${name}.plan.json`);
  return compilePlanFile({
    jobPath,
    workspaceRoot: workspace,
    expectedHead,
    outputPath: planPath,
    compilerPath: null,
    textCompilerPath,
  });
}

async function initGitFixture(root, repository) {
  const bare = path.join(root, "origin.git");
  const work = path.join(root, "work");
  run("git", ["init", "--bare", "--initial-branch=main", bare]);
  run("git", ["init", "--initial-branch=main", work]);
  run("git", ["config", "user.name", "EVAVO Test"], { cwd: work });
  run("git", ["config", "user.email", "test@evavo.invalid"], { cwd: work });
  await writeFile(path.join(work, "README.md"), "# Fixture\n", "utf8");
  run("git", ["add", "README.md"], { cwd: work });
  run("git", ["commit", "-m", "Initial fixture"], { cwd: work });
  const remoteUrl = `https://github.com/${repository}.git`;
  run("git", ["remote", "add", "origin", remoteUrl], { cwd: work });
  const instead = `file://${bare.replaceAll("\\", "/")}`;
  run("git", ["config", `url.${instead}.insteadOf`, remoteUrl], { cwd: work });
  run("git", ["push", "-u", "origin", "main"], { cwd: work });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: work }).stdout.trim();
  return { bare, work, head, remoteUrl, instead };
}

async function advanceRemote(fixture) {
  const clone = `${fixture.work}-advance`;
  run("git", ["clone", fixture.bare, clone]);
  run("git", ["config", "user.name", "EVAVO Advance"], { cwd: clone });
  run("git", ["config", "user.email", "advance@evavo.invalid"], { cwd: clone });
  await writeFile(path.join(clone, "ADVANCE.md"), "advanced\n", "utf8");
  run("git", ["add", "ADVANCE.md"], { cwd: clone });
  run("git", ["commit", "-m", "Advance remote"], { cwd: clone });
  run("git", ["push", "origin", "main"], { cwd: clone });
  return run("git", ["rev-parse", "HEAD"], { cwd: clone }).stdout.trim();
}

const tests = [];
function test(name, callback) {
  tests.push([name, callback]);
}

test("catalog and schema expose bounded automated delivery", async () => {
  const catalog = deliveryCatalog();
  assert.equal(catalog.version, "1.1.0");
  assert.ok(catalog.adapters.includes("godot-4.6.2"));
  assert.equal(catalog.workflow.manualOnlyCrossRepositoryPublisher, true);
  assert.equal(catalog.workflow.forcePush, false);
});

test("Godot plan normalizes naming, pages, roles and source evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-plan-"));
  try {
    const ui = await createBuild(path.join(root, "builds", "ui"), {
      faceId: "fixture-ui",
      profileId: "dos-mono",
      pageCount: 1,
      marker: "UI",
    });
    const herald = await createBuild(path.join(root, "builds", "herald"), {
      faceId: "fixture-herald",
      profileId: "arcade-outline",
      pageCount: 2,
      marker: "HERALD",
    });
    const result = await planJob({
      root,
      jobDocument: job({
        builds: [
          { ...ui, buildId: "ui", targetStem: "fixture ui", displayName: "Fixture UI", roles: ["menu", "hud"] },
          { ...herald, buildId: "herald", targetStem: "fixture herald", displayName: "Fixture Herald", roles: ["title", "victory"] },
        ],
      }),
    });
    const targets = result.plan.actions.map((action) => action.targetPath);
    assert.ok(targets.includes("assets/fonts/fixture_family/runtime/FixtureUi.fnt"));
    assert.ok(targets.includes("assets/fonts/fixture_family/runtime/FixtureUi.png"));
    assert.ok(targets.includes("assets/fonts/fixture_family/runtime/FixtureHerald-page-0.png"));
    assert.ok(targets.includes("assets/fonts/fixture_family/runtime/FixtureHerald-page-1.png"));
    assert.ok(targets.includes("assets/fonts/fixture_family/godot/FixturePixelFonts.gd"));
    assert.ok(targets.includes("assets/fonts/fixture_family/metadata/role-map.json"));
    const fntAction = result.plan.actions.find((action) => action.targetPath.endsWith("FixtureHerald.fnt"));
    const fnt = Buffer.from(fntAction.generated.content, "base64").toString("utf8");
    assert.match(fnt, /smooth=0/u);
    assert.match(fnt, /aa=0/u);
    assert.match(fnt, /page id=0 file="FixtureHerald-page-0.png"/u);
    assert.match(fnt, /page id=1 file="FixtureHerald-page-1.png"/u);
    assert.equal(result.plan.authority.forcePush, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Pixel Text Studio renders animated title treatments into the same Godot delivery transaction", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-title-plan-"));
  try {
    const font = await createBuild(path.join(root, "builds", "ui"), {
      faceId: "fixture-title-font",
      profileId: "dos-mono",
      pageCount: 1,
      marker: "TITLE",
      smooth: 0,
      exactPng: true,
    });
    const stylePath = await writeJson(path.join(root, "title.style.json"), {
      schema: "evavo.pixel-text-style.v1",
      styleId: "fixture-90s-title",
      displayName: "Fixture 90s Title",
      background: "#00000000",
      padding: 2,
      layout: { align: "center", tracking: 1, lineGap: 0, tabSpaces: 4, missingGlyph: "error", replacementCodepoint: 65533 },
      canvas: { width: 0, height: 0, anchor: "center" },
      operations: [
        { op: "bands", axis: "vertical", colours: ["#fff0b0ff", "#c7843fff", "#753224ff"] },
        { op: "outline", radius: 1, connectivity: 8, colour: "#130913ff" },
        { op: "extrude", depth: 2, dx: 1, dy: 1, colours: ["#5a3223ff", "#24111cff"] },
      ],
      animation: {
        frames: 4,
        fps: 8,
        loop: true,
        motions: [{ op: "shine", colour: "#ffffffff", width: 1, slope: 1, alpha: 224 }],
      },
      output: { individualFrames: true, sheet: true, webBundle: true, godotResourceRoot: "" },
    });
    const result = await planJob({
      root,
      textCompilerPath: path.join(repositoryRoot, "tools", "pixel_text_studio.py"),
      jobDocument: job({
        builds: [{ ...font, buildId: "title-font", targetStem: "fixture title font", displayName: "Fixture Title Font", roles: ["title-font"] }],
        titles: [{
          titleId: "battle-title",
          mode: "render",
          fontBuildId: "title-font",
          text: "AAA",
          stylePath,
          targetStem: "battle title",
          displayName: "Battle Title",
          roles: ["title-logo"],
          include: { frames: true, sheet: true, web: true, godot: true, source: true, manifest: true },
        }],
      }),
    });
    const targets = result.plan.actions.map((action) => action.targetPath);
    for (const expected of [
      "assets/fonts/fixture_family/titles/BattleTitle/frames/frame-000.png",
      "assets/fonts/fixture_family/titles/BattleTitle/sheet.png",
      "assets/fonts/fixture_family/titles/BattleTitle/web/pixel-text.css",
      "assets/fonts/fixture_family/titles/BattleTitle/web/pixel-text.js",
      "assets/fonts/fixture_family/titles/BattleTitle/godot/pixel-text-spriteframes.tres",
      "assets/fonts/fixture_family/metadata/titles/BattleTitle.build.json",
      "assets/fonts/fixture_family/metadata/title-role-map.json",
      "assets/fonts/fixture_family/godot/pixel_text_catalog.gd",
    ]) assert.ok(targets.includes(expected), `missing ${expected}`);
    assert.equal(result.plan.titles.length, 1);
    assert.equal(result.plan.titles[0].frameCount, 4);
    assert.deepEqual(result.plan.titles[0].roles, ["title-logo"]);
    const manifestAction = result.plan.actions.find((action) => action.targetPath === "assets/fonts/fixture_family/pixel-font-installation.json");
    assert.ok(manifestAction?.generated?.content);
    const installation = JSON.parse(Buffer.from(manifestAction.generated.content, "base64").toString("utf8"));
    assert.equal(installation.titles.length, 1);
    assert.equal(installation.titles[0].stem, "BattleTitle");
    const targetRoot = path.join(root, "target");
    await mkdir(targetRoot);
    const allowlistPath = await writeJson(
      path.join(root, "title-allowlist.json"),
      allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])),
    );
    const installed = await installPlan({ planPath: result.planPath, targetRoot, allowlistPath });
    assert.equal((await verifyInstalled({ receiptPath: installed.receiptPath, targetRoot })).status, "passed");
    assert.ok((await readFile(path.join(targetRoot, "assets/fonts/fixture_family/titles/BattleTitle/frames/frame-000.png"))).length > 0);
    assert.match(await readFile(path.join(targetRoot, "assets/fonts/fixture_family/godot/pixel_text_catalog.gd"), "utf8"), /title-logo/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Pixel Font Studio v2 family builds install through the same naming and ownership path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-v2-family-"));
  try {
    const v2 = await createV2FamilyBuild(path.join(root, "v2"), {
      faceId: "FixtureLegacy",
      marker: "LEGACY",
    });
    const result = await planJob({
      root,
      jobDocument: job({
        builds: [
          {
            ...v2,
            buildId: "legacy",
            targetStem: "Legacy_UI",
            displayName: "Legacy UI",
            roles: ["ui"],
          },
        ],
      }),
    });
    assert.equal(result.plan.builds[0].sourceFormat, "pixel-font-family-v2");
    const targets = result.plan.actions.map((action) => action.targetPath);
    assert.ok(targets.includes("assets/fonts/fixture_family/runtime/LegacyUI.fnt"));
    assert.ok(targets.includes("assets/fonts/fixture_family/interchange/LegacyUI.ttf"));
    assert.ok(targets.includes("assets/fonts/fixture_family/source/LegacyUI.face.json"));
    assert.ok(!targets.includes("assets/fonts/fixture_family/source/LegacyUI.profile.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("install is transactional, verifiable and idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-install-"));
  try {
    const build = await createBuild(path.join(root, "build"), { marker: "INSTALL" });
    const target = path.join(root, "target");
    await mkdir(target);
    const allowlistPath = await writeJson(
      path.join(root, "allowlist.json"),
      allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])),
    );
    const planned = await planJob({ root, jobDocument: job({ builds: [{ ...build, targetStem: "Fixture_UI", roles: ["ui"] }] }) });
    const first = await installPlan({ planPath: planned.planPath, targetRoot: target, allowlistPath });
    assert.equal(first.status, "installed");
    assert.equal((await verifyInstalled({ receiptPath: first.receiptPath, targetRoot: target })).status, "passed");
    const second = await installPlan({ planPath: planned.planPath, targetRoot: target, allowlistPath });
    assert.equal(second.status, "up-to-date");
    assert.deepEqual(second.changedPaths, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replace-owned rejects changed files and unowned collisions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-owned-"));
  try {
    const build = await createBuild(path.join(root, "build"), { marker: "OWNED" });
    const target = path.join(root, "target");
    await mkdir(target);
    const allowlistPath = await writeJson(
      path.join(root, "allowlist.json"),
      allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])),
    );
    const planned = await planJob({ root, jobDocument: job({ builds: [{ ...build, targetStem: "Owned", roles: ["ui"] }] }) });
    await installPlan({ planPath: planned.planPath, targetRoot: target, allowlistPath });
    const owned = path.join(target, "assets", "fonts", "fixture_family", "runtime", "Owned.png");
    await writeFile(owned, Buffer.from("changed"));
    await assert.rejects(
      installPlan({ planPath: planned.planPath, targetRoot: target, allowlistPath }),
      /changed outside delivery control/u,
    );
    await writeFile(owned, Buffer.concat([png, Buffer.from("OWNED0")]));
    const newBuild = await createBuild(path.join(root, "new-build"), { marker: "NEW" });
    const newPlan = await planJob({
      root,
      name: "new",
      jobDocument: job({
        builds: [
          { ...build, buildId: "owned", targetStem: "Owned", roles: ["ui"] },
          { ...newBuild, buildId: "new", targetStem: "Unowned", roles: ["title"] },
        ],
      }),
    });
    const collision = path.join(target, "assets", "fonts", "fixture_family", "runtime", "Unowned.fnt");
    await mkdir(path.dirname(collision), { recursive: true });
    await writeFile(collision, "unowned\n", "utf8");
    await assert.rejects(
      installPlan({ planPath: newPlan.planPath, targetRoot: target, allowlistPath }),
      /refuses unowned file/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale owned files are removed only when unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-stale-"));
  try {
    const one = await createBuild(path.join(root, "one"), { faceId: "one", marker: "ONE" });
    const two = await createBuild(path.join(root, "two"), { faceId: "two", marker: "TWO" });
    const target = path.join(root, "target");
    await mkdir(target);
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])));
    const first = await planJob({
      root,
      name: "two-faces",
      jobDocument: job({ builds: [
        { ...one, buildId: "one", targetStem: "One", roles: ["ui"] },
        { ...two, buildId: "two", targetStem: "Two", roles: ["title"] },
      ] }),
    });
    await installPlan({ planPath: first.planPath, targetRoot: target, allowlistPath });
    const second = await planJob({
      root,
      name: "one-face",
      jobDocument: job({ builds: [{ ...one, buildId: "one", targetStem: "One", roles: ["ui"] }] }),
    });
    const result = await installPlan({ planPath: second.planPath, targetRoot: target, allowlistPath });
    assert.ok(result.stalePaths.some((entry) => entry.includes("Two")));
    await assert.rejects(readFile(path.join(target, "assets/fonts/fixture_family/runtime/Two.fnt")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("late source failure rolls all target changes back", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-rollback-"));
  try {
    const build = await createBuild(path.join(root, "build"), { marker: "ROLLBACK" });
    const target = path.join(root, "target");
    await mkdir(target);
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])));
    const planned = await planJob({ root, jobDocument: job({ builds: [{ ...build, targetStem: "Rollback", roles: ["ui"] }] }) });
    const sourceActions = planned.plan.actions.filter((action) => action.source);
    const last = sourceActions[sourceActions.length - 1];
    await writeFile(last.source.path, Buffer.from("tampered"));
    await assert.rejects(
      installPlan({ planPath: planned.planPath, targetRoot: target, allowlistPath }),
      /identity changed/u,
    );
    const files = [];
    async function walk(directory) {
      try {
        for (const entry of await import("node:fs/promises").then(({ readdir }) => readdir(directory, { withFileTypes: true }))) {
          const child = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(child);
          else files.push(child);
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    await walk(target);
    assert.deepEqual(files, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("branch publication creates one normal remote commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-branch-"));
  try {
    const repository = "EVAVO-STUDIO/fixture-branch";
    const fixture = await initGitFixture(root, repository);
    const build = await createBuild(path.join(root, "build"), { marker: "BRANCH" });
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule(repository, ["branch"])));
    const planned = await planJob({
      root,
      expectedHead: fixture.head,
      jobDocument: job({
        repository,
        builds: [{ ...build, targetStem: "Branch", roles: ["ui"] }],
        publishMode: "branch",
        publishBranch: "agent/pixel-font/fixture-branch",
      }),
    });
    const publication = await publishPlan({ planPath: planned.planPath, targetRoot: fixture.work, allowlistPath, confirmPublish: true });
    assert.equal(publication.status, "published");
    assert.equal(publication.parentSha, fixture.head);
    assert.equal(publication.forcePush, false);
    const remote = run("git", ["--git-dir", fixture.bare, "rev-parse", "refs/heads/agent/pixel-font/fixture-branch"]).stdout.trim();
    assert.equal(remote, publication.commitSha);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct-main publication fast-forwards exact main", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-main-"));
  try {
    const repository = "EVAVO-STUDIO/fixture-direct";
    const fixture = await initGitFixture(root, repository);
    const build = await createBuild(path.join(root, "build"), { marker: "MAIN" });
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule(repository, ["direct-main"])));
    const planned = await planJob({
      root,
      expectedHead: fixture.head,
      jobDocument: job({
        repository,
        builds: [{ ...build, targetStem: "Direct", roles: ["ui"] }],
        publishMode: "direct-main",
        allowDirectMain: true,
      }),
    });
    const publication = await publishPlan({ planPath: planned.planPath, targetRoot: fixture.work, allowlistPath, confirmPublish: true });
    assert.equal(publication.status, "published");
    assert.equal(publication.branch, "main");
    const remote = run("git", ["--git-dir", fixture.bare, "rev-parse", "refs/heads/main"]).stdout.trim();
    assert.equal(remote, publication.commitSha);
    assert.equal(publication.parentSha, fixture.head);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote advancement fails before installation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-advanced-"));
  try {
    const repository = "EVAVO-STUDIO/fixture-advanced";
    const fixture = await initGitFixture(root, repository);
    const build = await createBuild(path.join(root, "build"), { marker: "ADVANCE" });
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule(repository, ["direct-main"])));
    const planned = await planJob({
      root,
      expectedHead: fixture.head,
      jobDocument: job({
        repository,
        builds: [{ ...build, targetStem: "Advance", roles: ["ui"] }],
        publishMode: "direct-main",
        allowDirectMain: true,
      }),
    });
    await advanceRemote(fixture);
    await assert.rejects(
      publishPlan({ planPath: planned.planPath, targetRoot: fixture.work, allowlistPath, confirmPublish: true }),
      /Target head mismatch/u,
    );
    await assert.rejects(readFile(path.join(fixture.work, "assets/fonts/fixture_family/runtime/Advance.fnt")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP gates planning, installation and publication independently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-mcp-"));
  try {
    const build = await createBuild(path.join(root, "build"), { marker: "MCP" });
    const target = path.join(root, "target");
    const workspace = path.join(root, "workspace");
    await mkdir(target);
    await mkdir(workspace);
    const jobPath = await writeJson(path.join(root, "job.json"), job({ builds: [{ ...build, targetStem: "Mcp", roles: ["ui"] }] }));
    const allowlistPath = await writeJson(path.join(root, "allowlist.json"), allowlist(rule("EVAVO-STUDIO/fixture-game", ["install-only"])));
    const compiler = path.join(root, "compiler.py");
    await writeFile(compiler, "import sys\nsys.exit(0)\n", "utf8");
    const baseEnv = {
      EVAVO_PIXEL_FONT_DELIVERY_SOURCE_ROOTS: root,
      EVAVO_PIXEL_FONT_DELIVERY_TARGET_ROOTS: root,
      EVAVO_PIXEL_FONT_DELIVERY_ALLOWLIST: allowlistPath,
      EVAVO_PIXEL_FONT_DELIVERY_COMPILER: compiler,
      EVAVO_PIXEL_FONT_DELIVERY_PYTHON: process.platform === "win32" ? "python" : "python3",
    };
    const readOnly = mcpPolicy({ ...baseEnv, EVAVO_PIXEL_FONT_DELIVERY_MODE: "read-only" });
    const readNames = toolDefinitions(readOnly).map((entry) => entry.name);
    assert.ok(readNames.includes(TOOLS.validateJob));
    assert.ok(!readNames.includes(TOOLS.plan));
    assert.ok(!readNames.includes(TOOLS.publish));
    assert.equal((await callTool(TOOLS.validateJob, { jobPath }, { policy: readOnly })).status, "passed");

    const write = mcpPolicy({
      ...baseEnv,
      EVAVO_PIXEL_FONT_DELIVERY_MODE: "read-write",
      EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES: "true",
    });
    const writeNames = toolDefinitions(write).map((entry) => entry.name);
    assert.ok(writeNames.includes(TOOLS.plan));
    assert.ok(writeNames.includes(TOOLS.install));
    assert.ok(!writeNames.includes(TOOLS.publish));
    const deniedJobPath = await writeJson(
      path.join(root, "denied-job.json"),
      job({
        repository: "OTHER/not-allowlisted",
        builds: [{ ...build, targetStem: "Denied", roles: ["ui"] }],
      }),
    );
    const deniedPlanPath = path.join(workspace, "denied.plan.json");
    await assert.rejects(
      callTool(
        TOOLS.plan,
        {
          jobPath: deniedJobPath,
          workspaceRoot: workspace,
          planPath: deniedPlanPath,
          expectedHead: "a".repeat(40),
          confirmWrite: true,
        },
        { policy: write },
      ),
      /not allowlisted/u,
    );
    await assert.rejects(readFile(deniedPlanPath), /ENOENT/u);

    const planPath = path.join(workspace, "mcp.plan.json");
    const planned = await callTool(
      TOOLS.plan,
      {
        jobPath,
        workspaceRoot: workspace,
        planPath,
        expectedHead: "a".repeat(40),
        confirmWrite: true,
      },
      { policy: write },
    );
    assert.equal(planned.status, "planned");
    const installed = await callTool(
      TOOLS.install,
      { planPath, targetRoot: target, confirmWrite: true },
      { policy: write },
    );
    assert.equal(installed.status, "installed");

    const publish = mcpPolicy({
      ...baseEnv,
      EVAVO_PIXEL_FONT_DELIVERY_MODE: "read-write",
      EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES: "true",
      EVAVO_PIXEL_FONT_DELIVERY_ALLOW_GIT_PUBLISH: "true",
    });
    assert.ok(toolDefinitions(publish).some((entry) => entry.name === TOOLS.publish));
    const link = path.join(root, "job-link.json");
    await symlink(jobPath, link);
    await assert.rejects(
      callTool(TOOLS.validateJob, { jobPath: link }, { policy: readOnly }),
      /must not be a symlink/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source contains no force-push or arbitrary-shell publication surface", async () => {
  const paths = [
    "scripts/pixel-font-repository-delivery.mjs",
    "scripts/pixel-font-repository-delivery-mcp.mjs",
    "scripts/pixel-font-repository-delivery/common.mjs",
    "scripts/pixel-font-repository-delivery/installer.mjs",
  ];
  const source = (await Promise.all(paths.map((relative) => readFile(path.join(repositoryRoot, relative), "utf8")))).join("\n");
  for (const prohibited of ["shell: true", "--force", "force-with-lease", "push --force", "creativeApproval: true"]) {
    assert.equal(source.includes(prohibited), false, `Found prohibited token ${prohibited}`);
  }
});

let passed = 0;
for (const [name, callback] of tests) {
  try {
    await callback();
    passed += 1;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok ${passed + 1} - ${name}\n${error?.stack ?? error}\n`);
    process.exitCode = 1;
    break;
  }
}
if (passed === tests.length) {
  process.stdout.write(`1..${tests.length}\n`);
  process.stdout.write(`Pixel-font repository delivery checks passed (${passed}/${tests.length}).\n`);
}
