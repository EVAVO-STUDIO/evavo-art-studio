import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_MAXIMUM_FILES,
  DEFAULT_MAXIMUM_HASH_BYTES,
  DEFAULT_MAXIMUM_TEXT_BYTES,
  IMAGE_EXTENSIONS,
  SOURCE_ART_EXTENSIONS,
  TEXT_EXTENSIONS,
  boundedInteger,
  boundedString,
  canonicalRelativePath,
  fail,
  forwardSlash,
  hashFileBounded,
  inspectImageFile,
  isRecord,
  readJsonFileBounded,
  requireDirectoryNoSymlink,
  resolveExistingWithinRoot,
  safeId,
  sha256,
  timestamp,
  walkFilesBounded,
  withDocumentHash,
} from './common.mjs';

export const PROJECT_ART_INTELLIGENCE_SCHEMA = 'evavo.project-art-intelligence.v1';
export const PROJECT_ART_QUEUE_SEED_SCHEMA = 'evavo.project-art-queue-seed.v1';
export const PROJECT_ART_CONFIG_SCHEMA = 'evavo.project-art-config.v1';

const IMAGE_REFERENCE_EXTENSION = '(?:png|apng|jpe?g|webp|gif|bmp|tga|svg|dds|ktx2?)';
const QUOTED_IMAGE_REFERENCE = new RegExp(
  String.raw`["']([^"'\r\n]+?\.${IMAGE_REFERENCE_EXTENSION}(?:\?[^"'\r\n]*)?)["']`,
  'giu',
);
const CSS_IMAGE_REFERENCE = new RegExp(
  String.raw`url\(\s*["']?([^"')\r\n]+?\.${IMAGE_REFERENCE_EXTENSION}(?:\?[^"')\r\n]*)?)["']?\s*\)`,
  'giu',
);
const GODOT_REFERENCE = /\b(?:load|preload)\(\s*["'](res:\/\/[^"']+)["']\s*\)|\bpath\s*=\s*["'](res:\/\/[^"']+)["']/giu;
const UNREAL_REFERENCE = /(?:["'])?(\/Game\/[A-Za-z0-9_./-]+)(?:\.[A-Za-z0-9_-]+)?(?:["'])?/gu;
const UNITY_GUID = /\bguid:\s*([a-f0-9]{32})\b/giu;
const PHASER_SPRITESHEET = /(?:load\.)?spritesheet\s*\([^,]+,\s*["']([^"']+)["']\s*,\s*\{([\s\S]{0,800}?)\}\s*\)/giu;

const PLACEHOLDER_PATTERN = /(?:placeholder|temp(?:orary)?|todo|draft|mock|sample|dummy|wip|prototype)/iu;
const GENERATED_PATTERN = /(?:generated|output|export|render|candidate|variation)/iu;

function extensionOf(relativePath) {
  return path.posix.extname(relativePath).toLowerCase();
}

function classifyFile(relativePath) {
  const extension = extensionOf(relativePath);
  if (IMAGE_EXTENSIONS.has(extension)) return 'production-image';
  if (SOURCE_ART_EXTENSIONS.has(extension)) return 'editable-source-art';
  if (extension === '.meta' || extension === '.import') return 'engine-metadata';
  if (['.uasset', '.umap'].includes(extension)) return 'engine-binary-asset';
  if (TEXT_EXTENSIONS.has(extension)) return 'text-or-code';
  return 'other';
}

function inferRole(relativePath, image) {
  const lower = relativePath.toLowerCase();
  const rules = [
    ['normal-map', /(?:^|[/_.-])(?:normal|nrm)(?:[/_.-]|$)/u],
    ['mask', /(?:^|[/_.-])(?:mask|alpha|stencil)(?:[/_.-]|$)/u],
    ['tileset', /(?:tile|tileset|terrain|autotile)/u],
    ['sprite-sheet', /(?:sheet|spritesheet|atlas|strip)/u],
    ['animation', /(?:anim|animation|frame|idle|walk|run|attack|hit|death|cast)/u],
    ['character', /(?:character|portrait|hero|enemy|npc|unit|piece|pawn|knight|bishop|rook|queen|king)/u],
    ['vfx', /(?:vfx|effect|fx|particle|spark|smoke|dust|blood|magic|explosion|impact|ghost)/u],
    ['ui-icon', /(?:ui[/_.-].*icon|icons?[/_.-]|button|cursor|badge)/u],
    ['ui-panel', /(?:panel|window|dialog|hud|menu|frame|border)/u],
    ['logo', /(?:logo|wordmark|brandmark|splash)/u],
    ['map', /(?:map|world|region|minimap)/u],
    ['item', /(?:item|inventory|weapon|armour|armor|potion|loot|cargo)/u],
    ['environment', /(?:environment|background|scene|room|house|docks|wharf|street|interior|exterior|landscape)/u],
    ['texture', /(?:texture|material|surface|albedo|diffuse|roughness|metallic)/u],
  ];
  for (const [role, pattern] of rules) {
    if (pattern.test(lower)) return role;
  }
  if (image?.animated) return 'animation';
  return 'unclassified-art';
}

function roleFamily(relativePath, role) {
  const stem = relativePath
    .replace(/\.[^.]+$/u, '')
    .split('/')
    .filter(Boolean)
    .slice(-4)
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''))
    .filter(Boolean);
  return [role, ...stem].join(':').slice(0, 240);
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '___DOUBLE_WILDCARD___')
    .replace(/\*/gu, '[^/]*')
    .replace(/___DOUBLE_WILDCARD___/gu, '.*');
  return new RegExp(`^${escaped}$`, 'u');
}

function applyRoleRules(rootId, relativePath, inferred, config) {
  const key = rootId === 'project' ? relativePath : `@${rootId}/${relativePath}`;
  for (const rule of config.roleRules || []) {
    if (wildcardToRegExp(rule.pattern).test(key)) return rule.role;
  }
  return inferred;
}

function validateConfig(value) {
  if (value === undefined) {
    return Object.freeze({ roleRules: [], styleAnchors: [], targetPlatforms: [], constraints: {} });
  }
  if (!isRecord(value) || value.schema !== PROJECT_ART_CONFIG_SCHEMA) {
    fail('PROJECT_ART_CONFIG_INVALID', `Project config must use ${PROJECT_ART_CONFIG_SCHEMA}.`);
  }
  const roleRules = Array.isArray(value.roleRules) ? value.roleRules : [];
  const normalizedRoleRules = roleRules.map((rule, index) => {
    if (!isRecord(rule)) fail('PROJECT_ART_CONFIG_INVALID', `roleRules[${index}] must be an object.`);
    return {
      pattern: boundedString(rule.pattern, `roleRules[${index}].pattern`, 1024),
      role: safeId(rule.role, `roleRules[${index}].role`),
    };
  });
  const styleAnchors = Array.isArray(value.styleAnchors)
    ? value.styleAnchors.map((item, index) => boundedString(item, `styleAnchors[${index}]`, 4096))
    : [];
  const targetPlatforms = Array.isArray(value.targetPlatforms)
    ? value.targetPlatforms.map((item, index) => safeId(item, `targetPlatforms[${index}]`))
    : [];
  return Object.freeze({
    projectId: value.projectId === undefined ? undefined : safeId(value.projectId, 'projectId'),
    roleRules: normalizedRoleRules,
    styleAnchors,
    targetPlatforms,
    constraints: isRecord(value.constraints) ? value.constraints : {},
  });
}

function detectSurfaces(projectPaths) {
  const surfaces = [];
  const add = (id, evidence, confidence = 'high') => {
    if (!surfaces.some((surface) => surface.id === id)) {
      surfaces.push({ id, confidence, evidence: [...new Set(evidence)].sort() });
    }
  };
  const has = (value) => projectPaths.has(value);
  const matching = (pattern) => [...projectPaths].filter((item) => pattern.test(item)).slice(0, 20);
  if (has('project.godot')) add('godot', ['project.godot', ...matching(/\.(?:tscn|tres|gd)$/u)]);
  if (has('ProjectSettings/ProjectVersion.txt') || [...projectPaths].some((item) => item.startsWith('Assets/'))) {
    add('unity', [
      ...(has('ProjectSettings/ProjectVersion.txt') ? ['ProjectSettings/ProjectVersion.txt'] : []),
      ...matching(/^(?:Assets\/).+\.(?:unity|prefab|asset|meta|cs)$/u),
    ]);
  }
  const uprojects = matching(/\.uproject$/u);
  if (uprojects.length > 0 || [...projectPaths].some((item) => item.startsWith('Content/'))) {
    add('unreal', [...uprojects, ...matching(/^Content\/.+\.(?:uasset|umap)$/u)]);
  }
  if (has('package.json')) {
    add('web-or-javascript', ['package.json', ...matching(/\.(?:tsx?|jsx?|css|scss|html)$/u)], 'medium');
  }
  if (
    [...projectPaths].some((item) => /(?:phaser|spritesheet|atlas)/iu.test(item)) ||
    [...projectPaths].some((item) => /(?:^|\/)phaser(?:\.min)?\.js$/iu.test(item))
  ) {
    add('phaser', matching(/\.(?:tsx?|jsx?|json)$/u), 'medium');
  }
  if (surfaces.length === 0) add('unknown-or-custom', [...projectPaths].slice(0, 10), 'low');
  return surfaces.sort((left, right) => left.id.localeCompare(right.id));
}

async function gitVisibleFiles(root, maximumFiles) {
  const result = spawnSync(
    'git',
    ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
    { encoding: 'buffer', shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) return null;
  const values = result.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((value) => value.split(path.sep).join('/'))
    .filter((value) => !value.includes('/node_modules/') && !value.startsWith('node_modules/'));
  if (values.length > maximumFiles) {
    fail('PROJECT_ART_SCAN_LIMIT', `Git-visible scan exceeded ${maximumFiles} files.`);
  }
  values.sort();
  return values;
}

async function scanRoot(root) {
  const visible = root.useGit ? await gitVisibleFiles(root.absolutePath, root.maximumFiles) : null;
  const entries = visible
    ? visible.map((relativePath) => ({
        absolutePath: path.join(root.absolutePath, ...relativePath.split('/')),
        relativePath,
      }))
    : await walkFilesBounded(root.absolutePath, { maximumFiles: root.maximumFiles });
  return entries;
}

function cleanReference(value) {
  return value
    .trim()
    .replace(/[?#].*$/u, '')
    .replace(/\\/gu, '/')
    .replace(/^file:\/\//iu, '');
}

function extractImageReferences(text) {
  const results = new Set();
  for (const pattern of [QUOTED_IMAGE_REFERENCE, CSS_IMAGE_REFERENCE]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) results.add(cleanReference(match[1]));
  }
  GODOT_REFERENCE.lastIndex = 0;
  for (const match of text.matchAll(GODOT_REFERENCE)) results.add(cleanReference(match[1] || match[2]));
  return [...results].filter(Boolean).sort();
}

function extractPhaserRequirements(text) {
  const requirements = [];
  PHASER_SPRITESHEET.lastIndex = 0;
  for (const match of text.matchAll(PHASER_SPRITESHEET)) {
    const options = match[2];
    const width = Number(options.match(/\bframeWidth\s*:\s*(\d+)/u)?.[1]);
    const height = Number(options.match(/\bframeHeight\s*:\s*(\d+)/u)?.[1]);
    if (Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0) {
      requirements.push({ raw: cleanReference(match[1]), frameWidth: width, frameHeight: height });
    }
  }
  return requirements;
}

function candidatePathsForReference(reference, sourceRelativePath) {
  const raw = cleanReference(reference);
  const candidates = [];
  if (raw.startsWith('res://')) {
    candidates.push(raw.slice('res://'.length));
  } else if (raw.startsWith('/Game/')) {
    const body = raw.slice('/Game/'.length).replace(/\.[^/]+$/u, '');
    candidates.push(`Content/${body}.uasset`, `Content/${body}.umap`);
  } else if (raw.startsWith('/')) {
    candidates.push(`public/${raw.slice(1)}`, raw.slice(1));
  } else {
    const sourceDirectory = path.posix.dirname(sourceRelativePath);
    candidates.push(path.posix.normalize(path.posix.join(sourceDirectory, raw)));
    candidates.push(path.posix.normalize(raw));
    if (raw.startsWith('Assets/')) candidates.push(raw);
    if (raw.startsWith('public/')) candidates.push(raw);
  }
  return [...new Set(candidates)].filter(
    (candidate) =>
      candidate &&
      candidate !== '.' &&
      !candidate.startsWith('../') &&
      !candidate.startsWith('/') &&
      !candidate.includes('\\'),
  );
}

function technicalStyleSignature(file) {
  const image = file.image;
  if (!image) return `${file.role}:unknown`;
  const widthBucket = image.width ? Math.pow(2, Math.ceil(Math.log2(Math.max(1, image.width)))) : 'unknown';
  const heightBucket = image.height ? Math.pow(2, Math.ceil(Math.log2(Math.max(1, image.height)))) : 'unknown';
  return [
    file.role,
    image.format,
    image.hasAlpha ? 'alpha' : 'opaque',
    image.animated ? 'animated' : 'static',
    `${widthBucket}x${heightBucket}`,
  ].join(':');
}

function workItemId(projectId, action, rootId, relativePath, reason) {
  return `work_${sha256(`${projectId}\0${action}\0${rootId}\0${relativePath}\0${reason}`).slice(0, 32)}`;
}

function makeWorkItem({ projectId, action, file, reason, priority, issues = [], consumers = [], requirements = [], blockers = [] }) {
  const rootId = file?.rootId || 'project';
  const relativePath = file?.relativePath || reason;
  return {
    workItemId: workItemId(projectId, action, rootId, relativePath, reason),
    action,
    priority,
    semanticRole: file?.role || 'unclassified-art',
    roleFamily: file?.roleFamily || 'unclassified-art',
    source: file
      ? {
          rootId: file.rootId,
          relativePath: file.relativePath,
          sha256: file.sha256,
          bytes: file.bytes,
        }
      : null,
    targetPath: file?.relativePath || null,
    reason,
    issues: [...new Set(issues)].sort(),
    consumers: [...new Set(consumers)].sort(),
    requirements,
    blockers: [...new Set(blockers)].sort(),
    requiredNextBoundary:
      action === 'keep' || action === 'reference-only'
        ? 'review-or-mastering'
        : action === 'inspect'
          ? 'visual-review'
          : 'explicit-selection',
  };
}

export async function compileProjectArtIntelligence(options) {
  const projectRoot = await requireDirectoryNoSymlink(options.projectRoot, 'project-root');
  const maximumFiles = boundedInteger(
    options.maximumFiles ?? DEFAULT_MAXIMUM_FILES,
    'maximumFiles',
    1,
    1_000_000,
  );
  const maximumTextBytes = boundedInteger(
    options.maximumTextBytes ?? DEFAULT_MAXIMUM_TEXT_BYTES,
    'maximumTextBytes',
    1,
    128 * 1024 * 1024,
  );
  const maximumHashBytes = boundedInteger(
    options.maximumHashBytes ?? DEFAULT_MAXIMUM_HASH_BYTES,
    'maximumHashBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const generatedAt = timestamp(options.generatedAt ?? new Date().toISOString(), 'generatedAt');

  let configValue;
  let configIdentity = null;
  if (options.configPath) {
    const { value, bytes } = await readJsonFileBounded(path.resolve(options.configPath), 'project config');
    configValue = value;
    configIdentity = { path: path.resolve(options.configPath), sha256: sha256(bytes), bytes: bytes.length };
  }
  const config = validateConfig(configValue);
  const projectId = config.projectId || safeId(options.projectId || path.basename(projectRoot), 'projectId');

  const declaredRoots = [{ id: 'project', absolutePath: projectRoot, useGit: true }];
  for (const binding of options.artRoots || []) {
    const id = safeId(binding.id, 'art root id');
    if (id === 'project' || declaredRoots.some((root) => root.id === id)) {
      fail('PROJECT_ART_ROOT_DUPLICATE', `Duplicate or reserved art root id: ${id}`);
    }
    declaredRoots.push({
      id,
      absolutePath: await requireDirectoryNoSymlink(binding.path, `art root ${id}`),
      useGit: false,
    });
  }

  const roots = declaredRoots.map((root) => ({ ...root, maximumFiles }));
  const files = [];
  const skipped = [];
  for (const root of roots) {
    const entries = await scanRoot(root);
    for (const entry of entries) {
      let resolvedEntry;
      try {
        resolvedEntry = await resolveExistingWithinRoot(root.absolutePath, entry.relativePath, `scan entry ${root.id}`);
      } catch (error) {
        skipped.push({ rootId: root.id, relativePath: entry.relativePath, reason: `unsafe-or-missing:${error.code || 'unknown'}` });
        continue;
      }
      const metadata = resolvedEntry.metadata;
      const absolutePath = resolvedEntry.absolutePath;
      const kind = classifyFile(entry.relativePath);
      const file = {
        rootId: root.id,
        relativePath: entry.relativePath,
        kind,
        bytes: metadata.size,
        extension: extensionOf(entry.relativePath),
        placeholderLikely: PLACEHOLDER_PATTERN.test(entry.relativePath),
        generatedLikely: GENERATED_PATTERN.test(entry.relativePath),
      };
      if (kind === 'production-image' || kind === 'editable-source-art' || kind === 'engine-binary-asset') {
        if (metadata.size <= maximumHashBytes) {
          const identity = await hashFileBounded(absolutePath, maximumHashBytes);
          file.sha256 = identity.sha256;
        } else {
          file.analysisStatus = 'metadata-only-size-limit';
        }
      }
      if (kind === 'production-image') {
        try {
          file.image = await inspectImageFile(absolutePath);
          file.analysisStatus = file.image ? 'header-inspected' : 'unsupported-or-invalid-header';
        } catch (error) {
          file.analysisStatus = `header-error:${error.code || error.name}`;
        }
      }
      const inferred = inferRole(entry.relativePath, file.image);
      file.role = applyRoleRules(root.id, entry.relativePath, inferred, config);
      file.roleFamily = roleFamily(entry.relativePath, file.role);
      file.absolutePath = absolutePath;
      files.push(file);
    }
  }
  files.sort((left, right) => `${left.rootId}:${left.relativePath}`.localeCompare(`${right.rootId}:${right.relativePath}`));

  const projectFiles = files.filter((file) => file.rootId === 'project');
  const projectPaths = new Set(projectFiles.map((file) => file.relativePath));
  const projectByPath = new Map(projectFiles.map((file) => [file.relativePath, file]));
  const engineSurfaces = detectSurfaces(projectPaths);

  const unityGuidOwners = new Map();
  const textRecords = [];
  for (const file of files) {
    if (file.kind !== 'text-or-code' || file.bytes > maximumTextBytes) continue;
    let text;
    try {
      text = await readFile(file.absolutePath, 'utf8');
    } catch (error) {
      skipped.push({ rootId: file.rootId, relativePath: file.relativePath, reason: `text-read-failed:${error.code || 'unknown'}` });
      continue;
    }
    const record = {
      file,
      text,
      imageReferences: extractImageReferences(text),
      phaserRequirements: extractPhaserRequirements(text),
      unrealReferences: [...text.matchAll(UNREAL_REFERENCE)].map((match) => match[1]),
      unityGuids: [...text.matchAll(UNITY_GUID)].map((match) => match[1].toLowerCase()),
    };
    textRecords.push(record);
    if (file.relativePath.endsWith('.meta')) {
      const owner = file.relativePath.slice(0, -'.meta'.length);
      for (const guid of record.unityGuids.slice(0, 1)) unityGuidOwners.set(guid, owner);
    }
  }

  const references = [];
  const referencedPaths = new Set();
  const consumersByPath = new Map();
  const phaserByPath = new Map();
  const addReference = (sourceFile, raw, kind, requirements = null) => {
    const candidates = candidatePathsForReference(raw, sourceFile.relativePath);
    let resolvedPath = null;
    for (const candidate of candidates) {
      if (projectPaths.has(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }
    const record = {
      consumer: sourceFile.relativePath,
      kind,
      raw,
      candidates,
      resolvedPath,
      status: resolvedPath ? 'resolved' : 'missing-or-external',
      ...(requirements ? { requirements } : {}),
    };
    references.push(record);
    if (resolvedPath) {
      referencedPaths.add(resolvedPath);
      consumersByPath.set(resolvedPath, [
        ...(consumersByPath.get(resolvedPath) || []),
        sourceFile.relativePath,
      ]);
      if (requirements) phaserByPath.set(resolvedPath, requirements);
    }
  };

  for (const record of textRecords) {
    if (record.file.rootId !== 'project') continue;
    for (const raw of record.imageReferences) addReference(record.file, raw, 'textual-image-reference');
    for (const requirement of record.phaserRequirements) {
      addReference(record.file, requirement.raw, 'phaser-spritesheet', {
        frameWidth: requirement.frameWidth,
        frameHeight: requirement.frameHeight,
      });
    }
    for (const raw of record.unrealReferences) addReference(record.file, raw, 'unreal-object-path');
    for (const guid of record.unityGuids) {
      const owner = unityGuidOwners.get(guid);
      references.push({
        consumer: record.file.relativePath,
        kind: 'unity-guid',
        raw: guid,
        candidates: owner ? [owner] : [],
        resolvedPath: owner || null,
        status: owner ? 'resolved' : 'engine-index-required',
      });
      if (owner) {
        referencedPaths.add(owner);
        consumersByPath.set(owner, [...(consumersByPath.get(owner) || []), record.file.relativePath]);
      }
    }
  }
  references.sort((left, right) => `${left.consumer}:${left.kind}:${left.raw}`.localeCompare(`${right.consumer}:${right.kind}:${right.raw}`));

  const duplicateGroups = new Map();
  for (const file of files.filter((candidate) => candidate.kind === 'production-image' && candidate.sha256)) {
    duplicateGroups.set(file.sha256, [...(duplicateGroups.get(file.sha256) || []), file]);
  }
  const exactDuplicates = [...duplicateGroups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([digest, members]) => ({
      sha256: digest,
      members: members.map((file) => ({ rootId: file.rootId, relativePath: file.relativePath })).sort((left, right) => `${left.rootId}:${left.relativePath}`.localeCompare(`${right.rootId}:${right.relativePath}`)),
    }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  const duplicateMembers = new Set(exactDuplicates.flatMap((group) => group.members.map((member) => `${member.rootId}:${member.relativePath}`)));

  const styleGroups = new Map();
  for (const file of files.filter((candidate) => candidate.kind === 'production-image')) {
    const signature = technicalStyleSignature(file);
    styleGroups.set(signature, [...(styleGroups.get(signature) || []), file]);
  }
  const styleClusters = [...styleGroups.entries()]
    .map(([signature, members]) => ({
      clusterId: `style_${sha256(signature).slice(0, 20)}`,
      technicalSignature: signature,
      role: members[0]?.role || 'unclassified-art',
      memberCount: members.length,
      anchors: members
        .filter((file) => config.styleAnchors.includes(file.relativePath) || config.styleAnchors.includes(`@${file.rootId}/${file.relativePath}`))
        .map((file) => ({ rootId: file.rootId, relativePath: file.relativePath, sha256: file.sha256 })),
      members: members.slice(0, 250).map((file) => ({ rootId: file.rootId, relativePath: file.relativePath, sha256: file.sha256 })),
      creativeApprovalPerformed: false,
    }))
    .sort((left, right) => left.clusterId.localeCompare(right.clusterId));

  const workItems = [];
  const missingReferenceKeys = new Set();
  for (const reference of references.filter((candidate) => candidate.status !== 'resolved')) {
    const key = `${reference.kind}:${reference.raw}`;
    if (missingReferenceKeys.has(key)) continue;
    missingReferenceKeys.add(key);
    const blockers = reference.status === 'engine-index-required' ? ['engine-index-required'] : [];
    workItems.push(
      makeWorkItem({
        projectId,
        action: reference.status === 'engine-index-required' ? 'inspect' : 'create',
        file: null,
        reason: `Unresolved ${reference.kind}: ${reference.raw}`,
        priority: reference.status === 'engine-index-required' ? 'medium' : 'critical',
        consumers: [reference.consumer],
        requirements: reference.requirements ? [reference.requirements] : [],
        blockers,
      }),
    );
  }

  for (const file of files.filter((candidate) => ['production-image', 'editable-source-art'].includes(candidate.kind))) {
    const key = `${file.rootId}:${file.relativePath}`;
    const consumers = file.rootId === 'project' ? consumersByPath.get(file.relativePath) || [] : [];
    if (file.kind === 'editable-source-art') {
      workItems.push(
        makeWorkItem({
          projectId,
          action: 'reference-only',
          file,
          reason: 'Editable source art is useful production evidence but is not a runtime image.',
          priority: 'low',
        }),
      );
      continue;
    }
    const issues = [];
    let action = consumers.length > 0 ? 'keep' : 'inspect';
    let priority = consumers.length > 0 ? 'medium' : 'low';
    if (file.placeholderLikely) {
      issues.push('placeholder-likely');
      action = consumers.length > 0 ? 'recreate' : 'inspect';
      priority = consumers.length > 0 ? 'high' : 'medium';
    }
    if (!file.image) {
      issues.push('image-header-unreadable');
      action = 'repair';
      priority = 'high';
    }
    const phaser = file.rootId === 'project' ? phaserByPath.get(file.relativePath) : null;
    if (
      phaser &&
      file.image?.width &&
      file.image?.height &&
      (file.image.width % phaser.frameWidth !== 0 || file.image.height % phaser.frameHeight !== 0)
    ) {
      issues.push('spritesheet-frame-grid-incompatible');
      action = 'repair';
      priority = 'critical';
    }
    if (duplicateMembers.has(key)) issues.push('exact-duplicate');
    workItems.push(
      makeWorkItem({
        projectId,
        action,
        file,
        reason:
          action === 'keep'
            ? 'Referenced runtime image exists and its header-level contract is compatible.'
            : action === 'recreate'
              ? 'A referenced runtime image appears to be a placeholder and requires replacement.'
              : action === 'repair'
                ? 'The image exists but technical evidence indicates a repair is required.'
                : 'The image exists but no proven runtime consumer was found; visual inspection is required.',
        priority,
        issues,
        consumers,
        requirements: phaser ? [phaser] : [],
      }),
    );
  }

  const actionOrder = new Map([
    ['create', 0],
    ['recreate', 1],
    ['repair', 2],
    ['inspect', 3],
    ['reference-only', 4],
    ['keep', 5],
  ]);
  workItems.sort(
    (left, right) =>
      (actionOrder.get(left.action) ?? 99) - (actionOrder.get(right.action) ?? 99) ||
      left.workItemId.localeCompare(right.workItemId),
  );

  const publicFiles = files.map(({ absolutePath: _absolutePath, ...file }) => file);
  const queueItems = workItems
    .filter((item) => ['create', 'recreate', 'repair'].includes(item.action))
    .map((item) => ({
      workItemId: item.workItemId,
      action: item.action,
      priority: item.priority,
      semanticRole: item.semanticRole,
      roleFamily: item.roleFamily,
      source: item.source,
      targetPath: item.targetPath,
      issues: item.issues,
      consumers: item.consumers,
      requirements: item.requirements,
      blockers: item.blockers,
      requiresExplicitSelection: true,
      requiresFreshDurableAdmission: true,
      requiresFreshExecutionAuthorization: true,
    }));

  const document = withDocumentHash({
    schema: PROJECT_ART_INTELLIGENCE_SCHEMA,
    projectId,
    generatedAt,
    runId: `project-art-intelligence:${sha256(`${projectId}\0${generatedAt}\0${publicFiles.length}`).slice(0, 24)}`,
    roots: roots.map((root) => ({ id: root.id, path: root.absolutePath, scanMode: root.id === 'project' ? 'git-visible-or-bounded-filesystem' : 'bounded-filesystem' })),
    config: configIdentity,
    targetPlatforms: config.targetPlatforms,
    projectConstraints: config.constraints,
    engineSurfaces,
    inventory: {
      files: publicFiles,
      counts: publicFiles.reduce((counts, file) => ({ ...counts, [file.kind]: (counts[file.kind] || 0) + 1 }), {}),
      skipped,
    },
    references,
    exactDuplicates,
    styleClusters,
    workItems,
    queueSeed: {
      schema: PROJECT_ART_QUEUE_SEED_SCHEMA,
      projectId,
      items: queueItems,
      authority: {
        runtimeSubmission: false,
        providerExecution: false,
        sourceMutation: false,
        sourceDeletion: false,
        targetRepositoryMutation: false,
        candidateApproval: false,
        candidatePromotion: false,
        publication: false,
        deployment: false,
        forcePush: false,
      },
    },
    summary: {
      totalFiles: publicFiles.length,
      productionImages: publicFiles.filter((file) => file.kind === 'production-image').length,
      editableSourceArt: publicFiles.filter((file) => file.kind === 'editable-source-art').length,
      resolvedReferences: references.filter((reference) => reference.status === 'resolved').length,
      unresolvedReferences: references.filter((reference) => reference.status !== 'resolved').length,
      exactDuplicateGroups: exactDuplicates.length,
      actionableItems: queueItems.length,
      workItemsByAction: workItems.reduce((counts, item) => ({ ...counts, [item.action]: (counts[item.action] || 0) + 1 }), {}),
    },
    limits: { maximumFiles, maximumTextBytes, maximumHashBytes },
    authority: {
      projectReading: true,
      imageHeaderAnalysis: true,
      planning: true,
      runtimeSubmission: false,
      providerExecution: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      candidateApproval: false,
      candidatePromotion: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
  });
  return document;
}
