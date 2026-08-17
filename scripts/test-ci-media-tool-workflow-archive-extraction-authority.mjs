import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const SHELL_EXTRACTION_PRIMITIVES = Object.freeze([
  {
    kind: "unzip-cli",
    pattern: /(?:^|[\s;&|()])unzip(?:\.exe)?(?:\s|$)/iu,
  },
  {
    kind: "tar-extract-cli",
    pattern:
      /(?:^|[\s;&|()])(?:tar|bsdtar)(?:\.exe)?\b[^;\n]*(?:\s-(?:[A-Za-z]*x[A-Za-z]*|x[A-Za-z]*)\b|\s--extract\b)/iu,
  },
  {
    kind: "sevenzip-extract-cli",
    pattern: /(?:^|[\s;&|()])(?:7z|7za|7zr)(?:\.exe)?\s+(?:x|e)\b/iu,
  },
  {
    kind: "rar-extract-cli",
    pattern: /(?:^|[\s;&|()])(?:unrar|rar)(?:\.exe)?\s+(?:x|e)\b/iu,
  },
  {
    kind: "jar-extract-cli",
    pattern:
      /(?:^|[\s;&|()])jar(?:\.exe)?\s+(?:x[fv]*|-[A-Za-z]*x[A-Za-z]*)\b/iu,
  },
  {
    kind: "ditto-archive-extract-cli",
    pattern: /(?:^|[\s;&|()])ditto\b[^;\n]*\s-x\b[^;\n]*\s-k\b/iu,
  },
  {
    kind: "cpio-extract-cli",
    pattern: /(?:^|[\s;&|()])cpio\b[^;\n]*\s-(?:[A-Za-z]*i[A-Za-z]*)\b/iu,
  },
  {
    kind: "ar-extract-cli",
    pattern: /(?:^|[\s;&|()])ar\s+x[vf]*\b/iu,
  },
  {
    kind: "dpkg-extract-cli",
    pattern: /(?:^|[\s;&|()])dpkg-deb\s+(?:-x|--extract)\b/iu,
  },
  {
    kind: "cabextract-cli",
    pattern: /(?:^|[\s;&|()])cabextract(?:\s|$)/iu,
  },
  {
    kind: "powershell-expand-archive",
    pattern: /\bExpand-Archive\b/iu,
  },
  {
    kind: "python-module-archive-extract",
    pattern:
      /(?:^|[\s;&|()])(?:python(?:3(?:\.\d+)?)?|py)(?:\.exe)?\b[^;\n]*\s-m\s+(?:zipfile|tarfile)\s+(?:-e|--extract)\b/iu,
  },
]);

const RUNTIME_EXTRACTION_PRIMITIVES = Object.freeze([
  {
    kind: "python-extractall-api",
    pattern: /\.extractall\s*\(/u,
  },
  {
    kind: "python-unpack-archive-api",
    pattern: /\bshutil\.unpack_archive\s*\(/u,
  },
  {
    kind: "node-extract-zip-api",
    pattern: /\b(?:extractZip|extract_zip)\s*\(/u,
  },
  {
    kind: "node-tar-extract-api",
    pattern: /\b(?:tar|nodeTar)\.(?:x|extract)\s*\(/u,
  },
  {
    kind: "node-unzipper-extract-api",
    pattern: /\bunzipper\.Extract\s*\(/u,
  },
  {
    kind: "node-admzip-extract-api",
    pattern: /\.extractAllTo(?:Async)?\s*\(/u,
  },
  {
    kind: "dotnet-zip-extract-api",
    pattern: /\bZipFile\.ExtractToDirectory\s*\(/u,
  },
]);

// Direct archive extraction remains zero-authority. Workflows must call the
// repository's reviewed bounded extractor rather than invoke an archive tool or
// extraction API directly.
const APPROVED_DIRECT_EXTRACTION = new Set([]);

async function workflowSources() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true });
  const workflowPaths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry) => path.join(WORKFLOW_ROOT, entry.name))
    .sort();

  return Promise.all(
    workflowPaths.map(async (workflowPath) => ({
      path: path.relative(ROOT, workflowPath).replaceAll(path.sep, "/"),
      source: await readFile(workflowPath, "utf8"),
    })),
  );
}

function workflowSteps(source) {
  const lines = source.split(/\r?\n/u);
  const steps = [];

  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^(\s*)-\s+(?:name|id|uses|run):/u);
    if (!start) continue;
    const indentation = start[1].length;
    let end = index + 1;

    while (end < lines.length) {
      const line = lines[end];
      const nextStep = line.match(/^(\s*)-\s+(?:name|id|uses|run):/u);
      if (nextStep && nextStep[1].length === indentation) break;
      const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
      if (line.trim().length > 0 && leading < indentation) break;
      end += 1;
    }

    steps.push({
      startLine: index + 1,
      source: lines.slice(index, end).join("\n"),
    });
    index = end - 1;
  }

  return steps;
}

function stepName(step) {
  const name = step.source.match(
    /^\s*-\s+name:\s*["']?(.+?)["']?\s*$/mu,
  )?.[1];
  if (name) return name.trim();
  return `unnamed-line-${step.startLine}`;
}

function unwrapYamlInlineRun(source) {
  const trimmed = source.trim();
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith("'") &&
    trimmed.endsWith("'")
  ) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"')
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return source;
}

function runFields(step) {
  const lines = step.source.split(/\r?\n/u);
  const fields = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(-\s+)?run:\s*(.*)$/u);
    if (!match) continue;

    const keyIndentation = match[1].length + (match[2]?.length ?? 0);
    const inline = match[3];
    const blockIndicator = /^[>|][+-]?\d?\s*(?:#.*)?$/u.test(inline.trim());

    if (!blockIndicator) {
      fields.push({
        startLine: step.startLine + index,
        source: unwrapYamlInlineRun(inline),
      });
      continue;
    }

    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
      if (line.trim().length > 0 && leading <= keyIndentation) break;
      end += 1;
    }

    fields.push({
      startLine: step.startLine + index + 1,
      source: lines.slice(index + 1, end).join("\n"),
    });
    index = end - 1;
  }

  return fields;
}

function stripQuotedContentAndComment(source) {
  let output = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote !== null) {
      if (quote === '"' && escaped) {
        escaped = false;
        output += " ";
        continue;
      }
      if (quote === '"' && character === "\\") {
        escaped = true;
        output += " ";
        continue;
      }
      if (character === quote) quote = null;
      output += " ";
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      output += " ";
      continue;
    }

    if (
      character === "#" &&
      (index === 0 || /\s/u.test(source[index - 1] ?? ""))
    ) {
      output += " ".repeat(source.length - index);
      break;
    }

    output += character;
  }

  return output;
}

function extractionKinds(source) {
  const kinds = [];
  const structural = stripQuotedContentAndComment(source);

  for (const primitive of SHELL_EXTRACTION_PRIMITIVES) {
    if (primitive.pattern.test(structural)) kinds.push(primitive.kind);
  }
  for (const primitive of RUNTIME_EXTRACTION_PRIMITIVES) {
    if (primitive.pattern.test(source)) kinds.push(primitive.kind);
  }

  return [...new Set(kinds)];
}

function archiveExtractionSurfaces(workflow) {
  const findings = [];

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    for (const run of runFields(step)) {
      const lines = run.source.split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const source = lines[index].trim();
        if (source.length === 0 || source.startsWith("#")) continue;

        for (const kind of extractionKinds(source)) {
          findings.push({
            key: `${workflow.path}#${name}::${kind}`,
            kind,
            line: run.startLine + index,
            path: workflow.path,
            source,
            step: name,
          });
        }
      }
    }
  }

  return findings;
}

function exactSorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test("workflow archive extraction surfaces are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(archiveExtractionSurfaces)
    .sort((left, right) =>
      left.key === right.key
        ? left.line - right.line
        : left.key.localeCompare(right.key),
    );
  const observedKeys = new Set(observed.map((surface) => surface.key));
  const violations = [];

  for (const surface of observed) {
    if (APPROVED_DIRECT_EXTRACTION.has(surface.key)) continue;
    violations.push(`${surface.key} at line ${surface.line}: ${surface.source}`);
  }

  for (const approved of exactSorted(APPROVED_DIRECT_EXTRACTION)) {
    if (!observedKeys.has(approved)) {
      violations.push(`${approved}: approved extraction surface is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow archive extraction authority is unreviewed:\n${violations.join("\n")}`,
  );
});

test("archive extraction primitives remain visible to the inventory", () => {
  const workflow = {
    path: ".github/workflows/adversarial-archive-extraction.yml",
    source: [
      "name: adversarial",
      "on: workflow_dispatch",
      "jobs:",
      "  probe:",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - name: Unzip",
      "        run: unzip -q \"$ARCHIVE\" -d \"$DEST\"",
      "      - name: Tar",
      "        run: tar -xzf \"$ARCHIVE\" -C \"$DEST\"",
      "      - name: Seven Zip",
      "        run: 7z x \"$ARCHIVE\" -o\"$DEST\"",
      "      - name: Rar",
      "        run: unrar x \"$ARCHIVE\" \"$DEST\"",
      "      - name: Jar",
      "        run: jar xf \"$ARCHIVE\"",
      "      - name: Ditto",
      "        run: ditto -x -k \"$ARCHIVE\" \"$DEST\"",
      "      - name: Cpio",
      "        run: cpio -idmv < \"$ARCHIVE\"",
      "      - name: Ar",
      "        run: ar x \"$ARCHIVE\"",
      "      - name: Dpkg",
      "        run: dpkg-deb -x \"$ARCHIVE\" \"$DEST\"",
      "      - name: Cabextract",
      "        run: cabextract \"$ARCHIVE\" -d \"$DEST\"",
      "      - name: PowerShell",
      "        shell: pwsh",
      "        run: Expand-Archive -Path $env:ARCHIVE -DestinationPath $env:DEST",
      "      - name: Python module",
      "        run: python -m zipfile -e \"$ARCHIVE\" \"$DEST\"",
      "      - name: Python API",
      "        run: archive.extractall(destination)",
      "      - name: Python shutil",
      "        run: shutil.unpack_archive(archive, destination)",
      "      - name: Node extract zip",
      "        run: await extractZip(archive, { dir: destination })",
      "      - name: Node tar",
      "        run: await tar.x({ file: archive, cwd: destination })",
      "      - name: Node unzipper",
      "        run: stream.pipe(unzipper.Extract({ path: destination }))",
      "      - name: Node AdmZip",
      "        run: zip.extractAllTo(destination, true)",
      "      - name: Dotnet ZipFile",
      "        run: ZipFile.ExtractToDirectory(archive, destination)",
      "",
    ].join("\n"),
  };

  const observed = archiveExtractionSurfaces(workflow)
    .map((surface) => `${surface.step}::${surface.kind}`)
    .sort();

  assert.deepEqual(observed, [
    "Ar::ar-extract-cli",
    "Cabextract::cabextract-cli",
    "Cpio::cpio-extract-cli",
    "Ditto::ditto-archive-extract-cli",
    "Dotnet ZipFile::dotnet-zip-extract-api",
    "Dpkg::dpkg-extract-cli",
    "Jar::jar-extract-cli",
    "Node AdmZip::node-admzip-extract-api",
    "Node extract zip::node-extract-zip-api",
    "Node tar::node-tar-extract-api",
    "Node unzipper::node-unzipper-extract-api",
    "PowerShell::powershell-expand-archive",
    "Python API::python-extractall-api",
    "Python module::python-module-archive-extract",
    "Python shutil::python-unpack-archive-api",
    "Rar::rar-extract-cli",
    "Seven Zip::sevenzip-extract-cli",
    "Tar::tar-extract-cli",
    "Unzip::unzip-cli",
  ]);
});

test("direct archive extraction exception inventory remains empty", () => {
  assert.deepEqual([...APPROVED_DIRECT_EXTRACTION], []);
});
