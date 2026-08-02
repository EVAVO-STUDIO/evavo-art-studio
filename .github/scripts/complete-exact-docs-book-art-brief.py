from __future__ import annotations

from pathlib import Path
import re


def replace_once(path: Path, before: str, after: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source block in {path}, found {count}"
        )
    path.write_text(text.replace(before, after, 1), encoding="utf-8")


def add_fingerprint_import(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "  fingerprintBookArtBrief,\n" in text:
        return
    anchor = "  compileBookArtProductionWorkOrder,\n"
    if text.count(anchor) != 1:
        raise SystemExit(f"Expected one work-order import anchor in {path}")
    path.write_text(
        text.replace(anchor, anchor + "  fingerprintBookArtBrief,\n", 1),
        encoding="utf-8",
    )


def seal_brief_function(path: Path) -> None:
    add_fingerprint_import(path)
    text = path.read_text(encoding="utf-8")
    matches = list(re.finditer(r"(?m)^function brief(\([^\n]*\)) \{\n", text))
    if len(matches) != 1:
        raise SystemExit(
            f"Expected one synchronous brief fixture in {path}, found {len(matches)}"
        )
    match = matches[0]
    text = (
        text[: match.start()]
        + "async function brief"
        + match.group(1)
        + " {\n"
        + text[match.end() :]
    )
    start = match.start()
    return_index = text.find("  return {\n", start)
    if return_index < 0:
        raise SystemExit(f"Expected brief return object in {path}")
    text = (
        text[:return_index]
        + "  const value = {\n"
        + text[return_index + len("  return {\n") :]
    )
    placeholder = '    briefFingerprint: sha("e"),\n'
    fingerprint_index = text.find(placeholder, start)
    if fingerprint_index < 0:
        raise SystemExit(f"Expected placeholder brief fingerprint in {path}")
    text = (
        text[:fingerprint_index]
        + '    briefFingerprint: "",\n'
        + text[fingerprint_index + len(placeholder) :]
    )
    tail = "    publicationPerformed: false,\n  };\n}\n"
    tail_index = text.find(tail, start)
    if tail_index < 0:
        raise SystemExit(f"Expected brief fixture tail in {path}")
    sealed_tail = (
        "    publicationPerformed: false,\n"
        "  };\n"
        "  value.briefFingerprint = await fingerprintBookArtBrief(value);\n"
        "  return value;\n"
        "}\n"
    )
    text = text[:tail_index] + sealed_tail + text[tail_index + len(tail) :]
    replacements = {
        "compileBookArtProductionWorkOrder(brief(":
            "compileBookArtProductionWorkOrder(await brief(",
        "const value = brief(": "const value = await brief(",
        "brief: brief(": "brief: await brief(",
        "structuredClone(brief(": "structuredClone(await brief(",
    }
    for before, after in replacements.items():
        text = text.replace(before, after)
    unawaited = []
    for number, line in enumerate(text.splitlines(), start=1):
        if (
            "brief(" in line
            and "function brief(" not in line
            and "await brief(" not in line
        ):
            unawaited.append(f"{number}: {line.strip()}")
    if unawaited:
        raise SystemExit(
            f"Unawaited brief fixture calls remain in {path}:\n"
            + "\n".join(unawaited)
        )
    path.write_text(text, encoding="utf-8")


def main() -> None:
    profile = Path("packages/contracts/src/book-production-profile.ts")
    source = profile.read_text(encoding="utf-8")
    if "export async function fingerprintBookArtBrief" in source:
        print("Exact Book Art brief verification is already applied.")
        return

    marker = "export async function compileBookArtProductionWorkOrder(\n"
    helper = '''export async function fingerprintBookArtBrief(
  value: Omit<BookArtBriefV1, "briefFingerprint"> | BookArtBriefV1,
): Promise<string> {
  const { briefFingerprint: _discarded, ...unsigned } =
    value as BookArtBriefV1;
  return `sha256:${await sha256(canonicalJson(unsigned))}`;
}

'''
    if source.count(marker) != 1:
        raise SystemExit("Expected one work-order compiler marker.")
    profile.write_text(source.replace(marker, helper + marker, 1), encoding="utf-8")
    replace_once(
        profile,
        "  blockers.push(...validation.issues);\n  validateProfileFields(brief, blockers);\n",
        '''  blockers.push(...validation.issues);
  if (validation.valid) {
    const expectedBriefFingerprint = await fingerprintBookArtBrief(brief);
    if (
      normalizeSha(brief.briefFingerprint) !==
      normalizeSha(expectedBriefFingerprint)
    ) {
      blockers.push(
        "Book Art production brief fingerprint differs from its exact canonical contents.",
      );
    }
  }
  validateProfileFields(brief, blockers);
''',
        "receiver fingerprint verification",
    )
    replace_once(
        profile,
        "    sourceBriefFingerprint: brief.briefFingerprint,\n    providerRequest,\n",
        "    sourceBriefFingerprint: normalizeSha(brief.briefFingerprint)!,\n    providerRequest,\n",
        "normalized work-order brief fingerprint",
    )
    replace_once(
        profile,
        "      artDirectionSha256: brief.manuscript.artDirectionSha256,\n      sourceBriefFingerprint: brief.briefFingerprint,\n      conceptTerritoryId: brief.conceptTerritoryId,\n",
        "      artDirectionSha256: brief.manuscript.artDirectionSha256,\n      sourceBriefFingerprint: sourceSha,\n      conceptTerritoryId: brief.conceptTerritoryId,\n",
        "normalized provider brief fingerprint",
    )

    contracts_test = Path("packages/contracts/test/book-production-profile.test.mjs")
    add_fingerprint_import(contracts_test)
    replace_once(
        contracts_test,
        'function brief(purpose = "front_cover_art") {\n',
        'function unsignedBrief(purpose = "front_cover_art") {\n',
        "profile unsigned fixture",
    )
    replace_once(
        contracts_test,
        '    briefFingerprint: sha("e"),\n',
        '    briefFingerprint: "",\n',
        "profile placeholder fingerprint",
    )
    replace_once(
        contracts_test,
        "}\nfunction legacyPlan() {\n",
        '''}
async function brief(purpose = "front_cover_art") {
  const value = unsignedBrief(purpose);
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}
function legacyPlan() {
''',
        "profile sealed fixture",
    )
    source = contracts_test.read_text(encoding="utf-8")
    source = source.replace(
        "compileBookArtProductionWorkOrder(brief())",
        "compileBookArtProductionWorkOrder(await brief())",
    )
    source = source.replace(
        'compileBookArtProductionWorkOrder(brief("interior_full_page_illustration"))',
        'compileBookArtProductionWorkOrder(await brief("interior_full_page_illustration"))',
    )
    source = source.replace(
        'compileBookArtProductionWorkOrder(brief("ornament"))',
        'compileBookArtProductionWorkOrder(await brief("ornament"))',
    )
    source = source.replace("const value = brief();", "const value = await brief();")
    source = source.replace("brief: brief(),", "brief: await brief(),")
    contracts_test.write_text(source, encoding="utf-8")
    replace_once(
        contracts_test,
        '  assert.equal(result.workOrder?.assetClass, "cover_background");\n',
        '''  assert.equal(result.workOrder?.assetClass, "cover_background");
  assert.match(result.workOrder?.sourceBriefFingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.equal(
    result.workOrder?.providerRequest.metadata.sourceBriefFingerprint,
    result.workOrder?.sourceBriefFingerprint,
  );
''',
        "normalized fingerprint assertion",
    )
    insert_before = 'test("blocks Docs Suite-owned typography and publication fields at the Art Studio boundary", async () => {\n'
    stale_test = '''test("rejects a structurally valid Book Art brief whose exact fingerprint is stale", async () => {
  const value = await brief();
  value.creativeThesis += " Tampered after sealing.";
  const result = await compileBookArtProductionWorkOrder(value);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockers.some((item) =>
      item.includes("fingerprint differs from its exact canonical contents"),
    ),
  );
  assert.equal(result.workOrder, undefined);
});

'''
    source = contracts_test.read_text(encoding="utf-8")
    if source.count(insert_before) != 1:
        raise SystemExit("Expected contracts test insertion marker once.")
    contracts_test.write_text(
        source.replace(insert_before, stale_test + insert_before, 1),
        encoding="utf-8",
    )

    legacy_test = Path(
        "packages/contracts/test/book-production-legacy-illustration-plan.test.mjs"
    )
    add_fingerprint_import(legacy_test)
    replace_once(
        legacy_test,
        'function brief(purpose = "interior_full_page_illustration") {\n  return {\n',
        'async function brief(purpose = "interior_full_page_illustration") {\n  const value = {\n',
        "legacy illustration async fixture",
    )
    replace_once(
        legacy_test,
        '    briefFingerprint: sha("e"),\n',
        '    briefFingerprint: "",\n',
        "legacy illustration placeholder fingerprint",
    )
    replace_once(
        legacy_test,
        "  };\n}\n\nasync function styleAuthority",
        '''  };
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

async function styleAuthority''',
        "legacy illustration sealed fixture",
    )
    replace_once(
        legacy_test,
        '  return { brief: brief(purpose), candidateId, plan: await seal(without, "planDigestSha256") };\n',
        '  return { brief: await brief(purpose), candidateId, plan: await seal(without, "planDigestSha256") };\n',
        "legacy illustration awaited fixture",
    )

    runtime_test = Path("packages/book-art-runtime/test/runtime.test.mjs")
    add_fingerprint_import(runtime_test)
    replace_once(
        runtime_test,
        "function brief() {\n  return {\n",
        "async function brief() {\n  const value = {\n",
        "runtime async fixture",
    )
    replace_once(
        runtime_test,
        '      approvedEvidenceIds: ["evidence-1"],\n',
        '''      approvedEvidenceIds: [
        "docs-main-966e240f03a0912a0ff0c0c890bf0fe0e9a6dd77",
        "docs-writing-art-link-evidence",
        "docs-website-mutation-receipt-evidence",
      ],
''',
        "runtime Docs evidence",
    )
    replace_once(
        runtime_test,
        '    briefFingerprint: sha("e"),\n',
        '    briefFingerprint: "",\n',
        "runtime placeholder fingerprint",
    )
    replace_once(
        runtime_test,
        "    publicationPerformed: false,\n  };\n}\n\nasync function shadowInput() {\n  const compiled = await compileBookArtProductionWorkOrder(brief());\n",
        '''    publicationPerformed: false,
  };
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

async function shadowInput() {
  const compiled = await compileBookArtProductionWorkOrder(await brief());
''',
        "runtime sealed fixture",
    )
    marker = 'test("shared Book Art runtime compiles the exact no-fallback one-attempt contract", async () => {\n'
    attack = '''test("rejects a tampered final Docs Suite brief before work-order or provider-job compilation", async () => {
  const value = await brief();
  value.primarySubject += " altered after Docs release";
  const compiled = await compileBookArtProductionWorkOrder(value);
  assert.equal(compiled.status, "blocked");
  assert.ok(
    compiled.blockers.some((item) =>
      item.includes("fingerprint differs from its exact canonical contents"),
    ),
  );
  assert.equal(compiled.workOrder, undefined);
});

'''
    source = runtime_test.read_text(encoding="utf-8")
    if source.count(marker) != 1:
        raise SystemExit("Expected runtime test insertion marker once.")
    runtime_test.write_text(source.replace(marker, attack + marker, 1), encoding="utf-8")

    fixture_paths = [
        Path("packages/book-art-runtime/test/parity.test.mjs"),
        Path("apps/worker/test/book-art-provider-jobs.test.mjs"),
        Path("apps/worker/test/book-art-provider-inspection.test.mjs"),
        Path("apps/worker/test/book-art-provider-parity.test.mjs"),
        Path("apps/api/test/book-art-api.test.mjs"),
        Path("apps/api/test/book-art-api-inspection.test.mjs"),
        Path("apps/api/test/book-art-api-parity.test.mjs"),
        Path("apps/cli/test/book-art-cli.test.mjs"),
        Path("apps/cli/test/book-art-cli-parity.test.mjs"),
    ]
    for fixture_path in fixture_paths:
        seal_brief_function(fixture_path)

    inline_fixture = Path("apps/cli/test/book-art-cli-inspection.test.mjs")
    add_fingerprint_import(inline_fixture)
    replace_once(
        inline_fixture,
        '    briefFingerprint: sha("e"),\n',
        '    briefFingerprint: "",\n',
        "CLI inspection placeholder fingerprint",
    )
    replace_once(
        inline_fixture,
        "  const compiled = await compileBookArtProductionWorkOrder(brief);\n",
        "  brief.briefFingerprint = await fingerprintBookArtBrief(brief);\n"
        "  const compiled = await compileBookArtProductionWorkOrder(brief);\n",
        "CLI inspection sealed fixture",
    )

    leftovers = []
    for root in (Path("packages"), Path("apps")):
        for path in root.rglob("*.test.mjs"):
            source = path.read_text(encoding="utf-8")
            if (
                "compileBookArtProductionWorkOrder" in source
                and 'briefFingerprint: sha("e")' in source
            ):
                leftovers.append(str(path))
    if leftovers:
        raise SystemExit(
            "Unsealed Book Art work-order fixtures remain:\n" + "\n".join(leftovers)
        )

    print("Applied exact Docs Book Art receiver verification and sealed all fixtures.")


if __name__ == "__main__":
    main()
