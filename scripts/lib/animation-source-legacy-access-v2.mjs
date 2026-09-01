import { createRequire } from "node:module";
import { extname } from "node:path";

import { codePointCompare } from "./animation-source-legacy-common-v2.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const LEGACY_HELPERS = Object.freeze(["readJson", "writeJsonAtomic"]);
const STRING_WRAPPERS = new Set(["String", "pathToFileURL", "fileURLToPath"]);
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

function isConstVariableDeclaration(node) {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function symbolInitializer(identifier, context, seenSymbols) {
  const symbol = context.checker.getSymbolAtLocation(identifier);
  if (!symbol || seenSymbols.has(symbol)) return undefined;
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration || !isConstVariableDeclaration(declaration) || !declaration.initializer) {
    return undefined;
  }
  seenSymbols.add(symbol);
  return { initializer: declaration.initializer, symbol };
}

function objectPropertyInitializer(node, context, seenSymbols) {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) {
    return undefined;
  }
  let property;
  if (ts.isPropertyAccessExpression(node)) {
    property = node.name.text;
  } else {
    property = staticString(node.argumentExpression, context, seenSymbols);
  }
  if (property === undefined) return undefined;

  const expression = unwrapStaticExpression(node.expression);
  let objectLiteral;
  if (ts.isObjectLiteralExpression(expression)) {
    objectLiteral = expression;
  } else if (ts.isIdentifier(expression)) {
    const resolved = symbolInitializer(expression, context, seenSymbols);
    if (resolved) {
      const initializer = unwrapStaticExpression(resolved.initializer);
      if (ts.isObjectLiteralExpression(initializer)) objectLiteral = initializer;
      seenSymbols.delete(resolved.symbol);
    }
  }
  if (!objectLiteral) return undefined;

  for (const member of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(member) && !ts.isShorthandPropertyAssignment(member)) {
      continue;
    }
    const name = member.name && ts.isComputedPropertyName(member.name)
      ? staticString(member.name.expression, context, seenSymbols)
      : member.name?.text;
    if (name !== property) continue;
    if (ts.isPropertyAssignment(member)) return member.initializer;
    return member.name;
  }
  return undefined;
}

function staticString(input, context, seenSymbols = new Set()) {
  if (!input) return undefined;
  const node = unwrapStaticExpression(input);
  if (node !== input) return staticString(node, context, seenSymbols);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const resolved = symbolInitializer(node, context, seenSymbols);
    if (!resolved) return undefined;
    try {
      return staticString(resolved.initializer, context, seenSymbols);
    } finally {
      seenSymbols.delete(resolved.symbol);
    }
  }
  if (ts.isPropertyAccessExpression(node) && node.name.text === "href") {
    const resolvedHref = staticString(node.expression, context, seenSymbols);
    if (resolvedHref !== undefined) return resolvedHref;
  }
  const propertyInitializer = objectPropertyInitializer(node, context, seenSymbols);
  if (propertyInitializer) {
    return staticString(propertyInitializer, context, seenSymbols);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(node.left, context, seenSymbols);
    const right = staticString(node.right, context, seenSymbols);
    return left === undefined || right === undefined ? undefined : `${left}${right}`;
  }
  if (ts.isTemplateExpression(node)) {
    let output = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression, context, seenSymbols);
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
    return staticString(node.arguments?.[0], context, seenSymbols);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    STRING_WRAPPERS.has(node.expression.text)
  ) {
    return staticString(node.arguments[0], context, seenSymbols);
  }
  return undefined;
}

function staticFragments(input, context, seenSymbols = new Set()) {
  if (!input) return [];
  const node = unwrapStaticExpression(input);
  if (node !== input) return staticFragments(node, context, seenSymbols);
  const exact = staticString(node, context, seenSymbols);
  if (exact !== undefined) return [exact];
  if (ts.isIdentifier(node)) {
    const resolved = symbolInitializer(node, context, seenSymbols);
    if (!resolved) return [];
    try {
      return staticFragments(resolved.initializer, context, seenSymbols);
    } finally {
      seenSymbols.delete(resolved.symbol);
    }
  }
  if (ts.isPropertyAccessExpression(node) && node.name.text === "href") {
    const resolvedHref = staticFragments(node.expression, context, seenSymbols);
    if (resolvedHref.length) return resolvedHref;
  }
  const propertyInitializer = objectPropertyInitializer(node, context, seenSymbols);
  if (propertyInitializer) {
    return staticFragments(propertyInitializer, context, seenSymbols);
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        ...staticFragments(span.expression, context, seenSymbols),
        span.literal.text,
      ]),
    ];
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return [
      ...staticFragments(node.left, context, seenSymbols),
      ...staticFragments(node.right, context, seenSymbols),
    ];
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "URL"
  ) {
    return staticFragments(node.arguments?.[0], context, seenSymbols);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    STRING_WRAPPERS.has(node.expression.text)
  ) {
    return staticFragments(node.arguments[0], context, seenSymbols);
  }
  return [];
}

function expressionTargetsLegacyModule(node, context) {
  const exact = staticString(node, context);
  if (exact !== undefined) return isLegacyModuleSpecifier(exact);
  const fragments = staticFragments(node, context).join("");
  return fragments ? isLegacyModuleSpecifier(fragments) : false;
}

function isCreateRequireFactory(node, context, seenSymbols = new Set()) {
  if (!node) return false;
  const expression = unwrapStaticExpression(node);
  if (expression !== node) return isCreateRequireFactory(expression, context, seenSymbols);
  if (ts.isCallExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "createRequire"
    ) {
      return true;
    }
    if (
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === "createRequire"
    ) {
      return true;
    }
  }
  if (ts.isIdentifier(expression)) {
    const resolved = symbolInitializer(expression, context, seenSymbols);
    if (!resolved) return false;
    try {
      return isCreateRequireFactory(resolved.initializer, context, seenSymbols);
    } finally {
      seenSymbols.delete(resolved.symbol);
    }
  }
  return false;
}

function callUsesRequire(node, context) {
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "require"
  ) {
    return true;
  }
  return isCreateRequireFactory(node.expression, context);
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

function virtualExtension(scriptKind) {
  if (scriptKind === ts.ScriptKind.TSX) return ".tsx";
  if (scriptKind === ts.ScriptKind.JSX) return ".jsx";
  if (scriptKind === ts.ScriptKind.JS) return ".js";
  return ".ts";
}

function createAnalysisUnit(source, trackedPath, index, unit) {
  const fileName = `${trackedPath}.__legacy_scan_${index}${virtualExtension(unit.scriptKind)}`;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    unit.scriptKind,
  );
  const options = {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
  };
  const host = {
    fileExists: (candidate) => candidate === fileName,
    getCanonicalFileName: (candidate) => candidate,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getDirectories: () => [],
    getNewLine: () => "\n",
    getSourceFile: (candidate) => candidate === fileName ? sourceFile : undefined,
    readFile: (candidate) => candidate === fileName ? source : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  };
  const program = ts.createProgram([fileName], options, host);
  return {
    checker: program.getTypeChecker(),
    mode: unit.mode,
    sourceFile: program.getSourceFile(fileName) ?? sourceFile,
  };
}

function inspectSourceFile(context, accesses) {
  const { sourceFile, mode } = context;
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
      expressionTargetsLegacyModule(node.moduleReference.expression, context)
    ) {
      accesses.add("require-import");
    } else if (ts.isCallExpression(node) && governed(node, true)) {
      const argument = node.arguments[0];
      if (argument && expressionTargetsLegacyModule(argument, context)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          accesses.add("dynamic-import");
        } else if (callUsesRequire(node, context)) {
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
    const context = createAnalysisUnit(unit.source, trackedPath, index, unit);
    inspectSourceFile(context, accesses);
  }
  return Object.freeze([...accesses].sort(codePointCompare));
}
