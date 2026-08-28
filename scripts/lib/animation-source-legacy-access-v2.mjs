import { createRequire } from "node:module";
import { extname } from "node:path";

import { codePointCompare } from "./animation-source-legacy-common-v2.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const LEGACY_HELPERS = Object.freeze(["readJson", "writeJsonAtomic"]);
const STANDARD_SCRIPT_KINDS = new Map([
  [".cjs", ts.ScriptKind.JS],
  [".cts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".mjs", ts.ScriptKind.JS],
  [".mts", ts.ScriptKind.TS],
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

function searchBoundary(value) {
  const query = value.indexOf("?");
  const fragment = value.indexOf("#", value.startsWith("#") ? 1 : 0);
  const candidates = [query, fragment].filter((entry) => entry >= 0);
  return candidates.length ? Math.min(...candidates) : value.length;
}

function isLegacyModuleSpecifier(value) {
  if (typeof value !== "string" || !value) return false;
  const pathname = value.slice(0, searchBoundary(value));
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const portable = decoded
    .replaceAll("\\", "/")
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
  return (
    portable === "animation-source-bundle.mjs" ||
    portable === "#animation-source-bundle.mjs" ||
    portable.endsWith("/animation-source-bundle.mjs")
  );
}

function unwrapStaticExpression(node) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    (typeof ts.isSatisfiesExpression === "function" &&
      ts.isSatisfiesExpression(node))
  ) {
    return node.expression;
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "href" &&
    ts.isNewExpression(node.expression)
  ) {
    return node.expression;
  }
  return node;
}

function staticString(input) {
  if (!input) return undefined;
  const node = unwrapStaticExpression(input);
  if (node !== input) return staticString(node);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left === undefined || right === undefined ? undefined : `${left}${right}`;
  }
  if (ts.isTemplateExpression(node)) {
    let output = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression);
      if (expression === undefined) return undefined;
      output += expression;
      output += span.literal.text;
    }
    return output;
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "URL"
  ) {
    return staticString(node.arguments?.[0]);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ["String", "pathToFileURL", "fileURLToPath"].includes(node.expression.text)
  ) {
    return staticString(node.arguments[0]);
  }
  return undefined;
}

function staticFragments(input) {
  if (!input) return [];
  const node = unwrapStaticExpression(input);
  if (node !== input) return staticFragments(node);
  const exact = staticString(node);
  if (exact !== undefined) return [exact];
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        ...staticFragments(span.expression),
        span.literal.text,
      ]),
    ];
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return [...staticFragments(node.left), ...staticFragments(node.right)];
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "URL"
  ) {
    return staticFragments(node.arguments?.[0]);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ["String", "pathToFileURL", "fileURLToPath"].includes(node.expression.text)
  ) {
    return staticFragments(node.arguments[0]);
  }
  return [];
}

function expressionTargetsLegacyModule(node) {
  const exact = staticString(node);
  if (exact !== undefined) return isLegacyModuleSpecifier(exact);
  const fragments = staticFragments(node).join("");
  return fragments ? isLegacyModuleSpecifier(fragments) : false;
}

function scriptKindForLanguage(value, fallback) {
  const language = value?.toLocaleLowerCase("en-US");
  if (language === "tsx") return ts.ScriptKind.TSX;
  if (language === "jsx") return ts.ScriptKind.JSX;
  if (language === "ts" || language === "typescript") return ts.ScriptKind.TS;
  if (language === "js" || language === "javascript") return ts.ScriptKind.JS;
  return fallback;
}

function scriptBlocks(source, fallbackKind) {
  const units = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;
  for (const match of source.matchAll(pattern)) {
    const attributes = match[1];
    const language = /\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/iu.exec(attributes);
    units.push({
      source: match[2],
      scriptKind: scriptKindForLanguage(
        language?.[1] ?? language?.[2] ?? language?.[3],
        fallbackKind,
      ),
      mode: "script",
    });
  }
  return units;
}

function astroUnits(source) {
  const units = [];
  const frontmatter = /^(?:\uFEFF)?---[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)---[^\S\r\n]*(?=\r?\n|$)/u.exec(source);
  if (frontmatter) {
    units.push({
      source: frontmatter[1],
      scriptKind: ts.ScriptKind.TS,
      mode: "script",
    });
  }
  units.push(...scriptBlocks(source, ts.ScriptKind.JS));
  return units;
}

function maskMdxFences(source) {
  return source.replace(
    /(^|\n)([ \t]*)(`{3,}|~{3,})[^\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)\2\3(?=\r?\n|$)/gu,
    (match) => match.replace(/[^\r\n]/gu, " "),
  );
}

function sourceUnits(source, trackedPath) {
  const extension = extname(trackedPath).toLocaleLowerCase("en-US");
  const standard = STANDARD_SCRIPT_KINDS.get(extension);
  if (standard !== undefined) {
    return [{ source, scriptKind: standard, mode: "script" }];
  }
  if (extension === ".astro") return astroUnits(source);
  if (extension === ".vue" || extension === ".svelte") {
    return scriptBlocks(source, ts.ScriptKind.JS);
  }
  if (extension === ".mdx") {
    return [{
      source: maskMdxFences(source),
      scriptKind: ts.ScriptKind.TSX,
      mode: "mdx",
    }];
  }
  return [];
}

function topLevelNode(node, sourceFile) {
  let current = node;
  while (current.parent && current.parent !== sourceFile) {
    current = current.parent;
  }
  return current.parent === sourceFile ? current : undefined;
}

function linePrefix(sourceFile, position) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  const lineStart = sourceFile.getPositionOfLineAndCharacter(line, 0);
  return sourceFile.text.slice(lineStart, position);
}

function isMdxTopLevelEsm(node, sourceFile) {
  const topLevel = topLevelNode(node, sourceFile);
  if (!topLevel) return false;
  const start = topLevel.getStart(sourceFile);
  if (!/^[ ]{0,3}$/u.test(linePrefix(sourceFile, start))) return false;
  return /^(?:import|export)\b/u.test(topLevel.getText(sourceFile));
}

function isMdxExecutableExpression(node, sourceFile) {
  if (isMdxTopLevelEsm(node, sourceFile)) return true;
  let current = node.parent;
  while (current && current !== sourceFile) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isBlock(current) && current.parent === sourceFile) return true;
    current = current.parent;
  }
  return false;
}

function namedExportsLegacy(elements, accesses) {
  for (const element of elements) {
    const imported = element.propertyName?.text ?? element.name.text;
    if (LEGACY_HELPERS.includes(imported)) accesses.add(imported);
  }
}

function inspectSourceFile(sourceFile, accesses, mode) {
  const governed = (node, expression = false) =>
    mode !== "mdx" ||
    (expression
      ? isMdxExecutableExpression(node, sourceFile)
      : isMdxTopLevelEsm(node, sourceFile));

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      governed(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      isLegacyModuleSpecifier(node.moduleSpecifier.text)
    ) {
      const clause = node.importClause;
      if (clause?.name) accesses.add("default-import");
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          accesses.add("namespace-import");
        } else {
          namedExportsLegacy(clause.namedBindings.elements, accesses);
        }
      }
    } else if (
      ts.isExportDeclaration(node) &&
      governed(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      isLegacyModuleSpecifier(node.moduleSpecifier.text)
    ) {
      if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
        accesses.add("star-reexport");
      } else if (ts.isNamedExports(node.exportClause)) {
        namedExportsLegacy(node.exportClause.elements, accesses);
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      governed(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      expressionTargetsLegacyModule(node.moduleReference.expression)
    ) {
      accesses.add("require-import");
    } else if (ts.isCallExpression(node) && governed(node, true)) {
      const argument = node.arguments[0];
      if (argument && expressionTargetsLegacyModule(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          accesses.add("dynamic-import");
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require"
        ) {
          accesses.add("require-import");
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "require"
        ) {
          accesses.add("require-import");
        } else if (
          ts.isCallExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "createRequire"
        ) {
          accesses.add("require-import");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

export function legacyAnimationSourceAccesses(source, trackedPath = "source.ts") {
  const accesses = new Set();
  const units = sourceUnits(source, trackedPath);
  for (const [index, unit] of units.entries()) {
    const sourceFile = ts.createSourceFile(
      `${trackedPath}#${index}`,
      unit.source,
      ts.ScriptTarget.Latest,
      true,
      unit.scriptKind,
    );
    inspectSourceFile(sourceFile, accesses, unit.mode);
  }
  return Object.freeze([...accesses].sort(codePointCompare));
}
