#!/usr/bin/env python3
"""Build and validate deterministic Pixel Typography release packs.

A release pack retains the authoritative Pixel Typography Review beside the
non-authoritative CRT Presentation derived from it. It never redraws, approves,
installs, commits, pushes, deploys, or publishes art.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence

TOOL_VERSION = "1.0.0"
SCHEMA = "evavo.pixel-typography-release-pack.v1"
MANIFEST_NAME = "pixel-typography-release-pack.json"
REVIEW_MANIFEST_NAME = "pixel-typography-review.json"
CRT_MANIFEST_NAME = "pixel-typography-crt.json"
MAX_FILES = 100_000
MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
HASH_CHUNK_BYTES = 1024 * 1024
VALIDATOR_TIMEOUT_SECONDS = 600
_PREVIEW_SCALE_SUFFIX = re.compile(r"-(?:[1-9][0-9]*)x$")
_CONTROL_CHARACTER = re.compile(r"[\x00-\x1f\x7f]")


class ReleasePackError(RuntimeError):
    pass


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _pretty_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(HASH_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def _absolute(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path.expanduser())))


def _path_key(path: Path) -> str:
    return os.path.normcase(os.path.normpath(os.fspath(_absolute(path))))


def _is_within(candidate: Path, parent: Path) -> bool:
    try:
        return os.path.commonpath([_path_key(candidate), _path_key(parent)]) == _path_key(parent)
    except ValueError:
        return False


def _assert_non_overlapping(paths: Sequence[tuple[str, Path]]) -> None:
    for index, (left_label, left) in enumerate(paths):
        for right_label, right in paths[index + 1:]:
            if _is_within(left, right) or _is_within(right, left):
                raise ReleasePackError(f"{left_label} and {right_label} must not overlap")


def _assert_no_symlink_chain(path: Path, *, allow_missing_leaf: bool = False) -> None:
    absolute = _absolute(path)
    parts = absolute.parts
    if not parts:
        raise ReleasePackError(f"Invalid empty path: {path}")
    current = Path(parts[0])
    for index, part in enumerate(parts[1:], start=1):
        current = current / part
        is_leaf = index == len(parts) - 1
        if not current.exists() and not current.is_symlink():
            if allow_missing_leaf and is_leaf:
                return
            raise ReleasePackError(f"Path component does not exist: {current}")
        if current.is_symlink():
            raise ReleasePackError(f"Symlink paths are not permitted: {current}")


def _existing_directory(raw: str | Path, label: str) -> Path:
    path = _absolute(Path(raw))
    _assert_no_symlink_chain(path)
    if not path.is_dir():
        raise ReleasePackError(f"{label} is not a directory: {path}")
    return path


def _new_output_path(raw: str | Path) -> Path:
    output = _absolute(Path(raw))
    _assert_no_symlink_chain(output.parent)
    if output.exists() or output.is_symlink():
        raise ReleasePackError(f"Output must not already exist: {output}")
    if not output.parent.is_dir():
        raise ReleasePackError(f"Output parent is not a directory: {output.parent}")
    return output


def _validate_relative_path(value: str) -> None:
    pure = PurePosixPath(value)
    if not value or pure.is_absolute() or ".." in pure.parts:
        raise ReleasePackError(f"Unsafe relative path: {value!r}")
    if "\\" in value or _CONTROL_CHARACTER.search(value) or pure.as_posix() != value:
        raise ReleasePackError(f"Non-portable relative path: {value!r}")


def _walk_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for directory, dir_names, file_names in os.walk(root, topdown=True, followlinks=False):
        directory_path = Path(directory)
        dir_names.sort()
        file_names.sort()
        for name in dir_names:
            candidate = directory_path / name
            if candidate.is_symlink() or not candidate.is_dir():
                raise ReleasePackError(f"Unsafe directory entry: {candidate}")
        for name in file_names:
            candidate = directory_path / name
            if candidate.is_symlink() or not candidate.is_file():
                raise ReleasePackError(f"Unsafe file entry: {candidate}")
            files.append(candidate)
            if len(files) > MAX_FILES:
                raise ReleasePackError(f"Package exceeds the {MAX_FILES:,}-file safety limit")
    return files


def _inventory(root: Path, *, exclude: Iterable[str] = ()) -> dict[str, Any]:
    excluded = set(exclude)
    records: list[dict[str, Any]] = []
    total_bytes = 0
    for path in _walk_files(root):
        relative = path.relative_to(root).as_posix()
        _validate_relative_path(relative)
        if relative in excluded:
            continue
        size = path.stat().st_size
        total_bytes += size
        if total_bytes > MAX_TOTAL_BYTES:
            raise ReleasePackError(f"Package exceeds the {MAX_TOTAL_BYTES:,}-byte safety limit")
        records.append({"path": relative, "bytes": size, "sha256": _sha256_file(path)})
    records.sort(key=lambda item: item["path"])
    basis = {"files": records, "fileCount": len(records), "totalBytes": total_bytes}
    return {**basis, "treeSha256": _sha256_bytes(_canonical_json(basis))}


def _load_json_object(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise ReleasePackError(f"Missing {label}: {path}")
    try:
        value = json.loads(path.read_text("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleasePackError(f"Invalid {label}: {path}: {error}") from error
    if not isinstance(value, dict):
        raise ReleasePackError(f"{label} must contain a JSON object: {path}")
    return value


def _repo_root() -> Path:
    root = Path(__file__).resolve().parent.parent
    if not (root / "tools").is_dir():
        raise ReleasePackError("Could not locate the Art Studio repository root")
    return root


def _run_validator(name: str, argv: Sequence[str]) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            list(argv), cwd=_repo_root(), stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            encoding="utf-8", errors="replace", shell=False,
            timeout=VALIDATOR_TIMEOUT_SECONDS, check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ReleasePackError(f"Could not execute {name}: {error}") from error
    if completed.returncode != 0:
        diagnostic = (completed.stderr or completed.stdout or "validator returned no output").strip()
        raise ReleasePackError(f"{name} failed: {diagnostic[-2000:]}")
    return {"name": name, "status": "passed"}


def _validate_source_packages(review: Path, crt: Path) -> list[dict[str, Any]]:
    root = _repo_root()
    review_script = root / "tools" / "pixel_typography_review.py"
    crt_script = root / "tools" / "pixel_typography_crt_preview.py"
    for script in (review_script, crt_script):
        if not script.is_file() or script.is_symlink():
            raise ReleasePackError(f"Required fixed validator is missing: {script}")
    return [
        _run_validator("Pixel Typography Review validator", [sys.executable, os.fspath(review_script), "validate-output", "--output", os.fspath(review)]),
        _run_validator("Pixel Typography CRT validator", [sys.executable, os.fspath(crt_script), "validate-output", "--review", os.fspath(review), "--output", os.fspath(crt)]),
    ]


def _copy_tree(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    for file_path in _walk_files(source):
        target = destination / file_path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file_path, target)
        try:
            target.chmod(0o644)
        except OSError:
            pass


def _page_key(path: PurePosixPath, *, preview: bool) -> str:
    stem = path.with_suffix("").as_posix()
    return _PREVIEW_SCALE_SUFFIX.sub("", stem) if preview else stem


def _discover_pages(root: Path) -> list[dict[str, Any]]:
    role_roots = (
        ("native", PurePosixPath("review/pages"), False),
        ("display", PurePosixPath("review/display"), False),
        ("nativeInspection", PurePosixPath("review/previews"), True),
        ("displayInspection", PurePosixPath("review/display-previews"), True),
        ("crt", PurePosixPath("crt/pages"), False),
        ("crtInspection", PurePosixPath("crt/previews"), True),
    )
    groups: dict[str, dict[str, Any]] = {}
    for path in _walk_files(root):
        relative = PurePosixPath(path.relative_to(root).as_posix())
        if relative.suffix.lower() != ".png":
            continue
        for role, role_root, preview in role_roots:
            try:
                within_role = relative.relative_to(role_root)
            except ValueError:
                continue
            key = _page_key(within_role, preview=preview)
            group = groups.setdefault(key, {"id": key, **{item[0]: [] for item in role_roots}})
            group[role].append(relative.as_posix())
            break
    result = []
    for key in sorted(groups):
        group = groups[key]
        for role, _, _ in role_roots:
            group[role].sort()
        result.append(group)
    return result


def _source_record(root: Path, manifest_name: str, label: str) -> dict[str, Any]:
    manifest_path = root / manifest_name
    _load_json_object(manifest_path, f"{label} manifest")
    inventory = _inventory(root)
    return {
        "manifest": manifest_name,
        "manifestSha256": _sha256_file(manifest_path),
        "fileCount": inventory["fileCount"],
        "totalBytes": inventory["totalBytes"],
        "treeSha256": inventory["treeSha256"],
    }


def _policy() -> dict[str, bool]:
    return {
        "authoritativeReviewEvidence": False,
        "creativeApproval": False,
        "sourceReviewMutation": False,
        "crtSourceMutation": False,
        "fontMasterMutation": False,
        "targetRepositoryMutation": False,
        "gitCommit": False,
        "gitPush": False,
        "deployment": False,
        "publication": False,
        "forcePush": False,
        "historyRewrite": False,
        "offlinePresentationOnly": True,
    }


def _release_basis(manifest: Mapping[str, Any]) -> dict[str, Any]:
    return {key: manifest[key] for key in ("schema", "toolVersion", "label", "sources", "validators", "policy", "pageGroups", "inventory")}


def _manifest_self_hash(manifest: Mapping[str, Any]) -> str:
    value = copy.deepcopy(dict(manifest))
    value["manifestSha256"] = None
    return _sha256_bytes(_canonical_json(value))


def _new_manifest(*, label: str, sources: Mapping[str, Any], validators: Sequence[Mapping[str, Any]], page_groups: Sequence[Mapping[str, Any]], inventory: Mapping[str, Any]) -> dict[str, Any]:
    manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "toolVersion": TOOL_VERSION,
        "label": label,
        "sources": dict(sources),
        "validators": [dict(item) for item in validators],
        "policy": _policy(),
        "pageGroups": [dict(item) for item in page_groups],
        "inventory": dict(inventory),
        "releaseDigestSha256": "",
        "manifestSha256": None,
    }
    manifest["releaseDigestSha256"] = _sha256_bytes(_canonical_json(_release_basis(manifest)))
    manifest["manifestSha256"] = _manifest_self_hash(manifest)
    return manifest


def _render_index(label: str, groups: Sequence[Mapping[str, Any]], manifest: Mapping[str, Any]) -> str:
    roles = (
        ("native", "Native authoritative page", "authoritative"),
        ("display", "Display-aspect authoritative page", "authoritative"),
        ("crt", "CRT presentation", "presentation"),
        ("nativeInspection", "Native integer inspection", "inspection"),
        ("displayInspection", "Display-aspect integer inspection", "inspection"),
        ("crtInspection", "CRT integer inspection", "inspection"),
    )
    cards = []
    for group in groups:
        figures = []
        for role, title, authority in roles:
            for path in group.get(role, []):
                safe_path = html.escape(path, quote=True)
                figures.append(f'<figure><div><span>{html.escape(title)}</span><b class="{authority}">{authority}</b></div><a href="{safe_path}"><img src="{safe_path}" alt="{html.escape(title)} for {html.escape(str(group["id"]))}" loading="lazy"></a><code>{safe_path}</code></figure>')
        cards.append(f'<section><h2>{html.escape(str(group["id"]))}</h2><div class="grid">{"".join(figures)}</div></section>')
    safe_label = html.escape(label)
    review_hash = html.escape(str(manifest["sources"]["review"]["treeSha256"]))
    crt_hash = html.escape(str(manifest["sources"]["crt"]["treeSha256"]))
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{safe_label}</title><style>
:root{{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:#090909;color:#f5f5f5}}header{{padding:clamp(2rem,5vw,5rem);border-bottom:1px solid #2b2b2b;background:#111}}h1{{font-size:clamp(2rem,6vw,5.5rem);line-height:.95;letter-spacing:-.045em}}p{{max-width:75ch;color:#c8c8c8;line-height:1.6}}.hashes{{display:grid;gap:.4rem;font:12px ui-monospace,monospace;overflow-wrap:anywhere}}main{{max-width:108rem;margin:auto;padding:clamp(1rem,3vw,3rem)}}section{{margin-bottom:4rem}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,28rem),1fr));gap:1rem}}figure{{margin:0;padding:.75rem;border:1px solid #2c2c2c;background:#121212}}figure div{{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.75rem}}b{{border:1px solid;border-radius:999px;padding:.2rem .5rem;font-size:.68rem;text-transform:uppercase}}.authoritative{{color:#84efb1}}.presentation{{color:#ff9eb1}}.inspection{{color:#a9c7ff}}img{{display:block;width:100%;height:auto;background:#000;image-rendering:pixelated}}code{{display:block;margin-top:.75rem;color:#9d9d9d;font-size:.72rem;overflow-wrap:anywhere}}
</style></head><body><header><p>EVAVO deterministic handoff</p><h1>{safe_label}</h1><p>Authoritative native and display-aspect evidence remains visibly separate from CRT presentation and inspection imagery. The package manifest binds every retained byte.</p><div class="hashes"><span>Review tree: {review_hash}</span><span>CRT tree: {crt_hash}</span><span>Final release identity: see {MANIFEST_NAME}</span></div></header><main>{''.join(cards) if cards else '<p>No recognised review-page PNGs were retained.</p>'}</main></body></html>\n'''


def _render_readme(manifest: Mapping[str, Any]) -> str:
    sources = manifest["sources"]
    return f'''# Pixel Typography release pack

Open `index.html` for the offline visual index.

```text
schema:              {manifest['schema']}
review tree SHA-256: {sources['review']['treeSha256']}
CRT tree SHA-256:    {sources['crt']['treeSha256']}
final release SHA:   see {MANIFEST_NAME}
```

`review/` retains authoritative native/display evidence. `crt/` retains presentation-only CRT output. This package grants no creative approval, target-repository mutation, Git commit or push, deployment, publication, force push, or history rewrite.
'''


def _validate_release_root(root: Path, *, run_validators: bool = True) -> dict[str, Any]:
    root = _existing_directory(root, "release pack")
    manifest_path = root / MANIFEST_NAME
    manifest = _load_json_object(manifest_path, "release-pack manifest")
    if manifest.get("schema") != SCHEMA or manifest.get("toolVersion") != TOOL_VERSION:
        raise ReleasePackError("Unsupported release-pack schema or tool version")
    if manifest.get("policy") != _policy():
        raise ReleasePackError("Release-pack authority policy was changed")
    if manifest_path.read_bytes() != _pretty_json(manifest):
        raise ReleasePackError("Release-pack manifest is not canonical")
    if manifest.get("manifestSha256") != _manifest_self_hash(manifest):
        raise ReleasePackError("Release-pack manifest self-hash mismatch")
    actual_inventory = _inventory(root, exclude={MANIFEST_NAME})
    if manifest.get("inventory") != actual_inventory:
        raise ReleasePackError("Release-pack file inventory mismatch")
    review = _existing_directory(root / "review", "retained review package")
    crt = _existing_directory(root / "crt", "retained CRT package")
    actual_sources = {
        "review": _source_record(review, REVIEW_MANIFEST_NAME, "review"),
        "crt": _source_record(crt, CRT_MANIFEST_NAME, "CRT"),
    }
    if manifest.get("sources") != actual_sources:
        raise ReleasePackError("Retained source-package identity mismatch")
    groups = _discover_pages(root)
    if manifest.get("pageGroups") != groups:
        raise ReleasePackError("Release-pack page map mismatch")
    digest = _sha256_bytes(_canonical_json(_release_basis(manifest)))
    if manifest.get("releaseDigestSha256") != digest:
        raise ReleasePackError("Release-pack digest mismatch")
    validators = _validate_source_packages(review, crt) if run_validators else [
        {"name": "Pixel Typography Review validator", "status": "passed"},
        {"name": "Pixel Typography CRT validator", "status": "passed"},
    ]
    if manifest.get("validators") != validators:
        raise ReleasePackError("Release-pack validator contract mismatch")
    return {"status": "passed", "schema": SCHEMA, "toolVersion": TOOL_VERSION, "releaseDigestSha256": digest, "manifestSha256": manifest["manifestSha256"], "fileCount": actual_inventory["fileCount"], "totalBytes": actual_inventory["totalBytes"], "pageGroupCount": len(groups), "validators": validators}


def build_release_pack(*, review: str | Path, crt: str | Path, output: str | Path, label: str = "Pixel Typography release pack", _run_source_validators: bool = True) -> dict[str, Any]:
    review_root = _existing_directory(review, "review package")
    crt_root = _existing_directory(crt, "CRT package")
    output_root = _new_output_path(output)
    _assert_non_overlapping((("review package", review_root), ("CRT package", crt_root), ("output package", output_root)))
    label = str(label).strip()
    if not label or len(label) > 200 or _CONTROL_CHARACTER.search(label):
        raise ReleasePackError("Release-pack label is empty, too long, or contains control characters")
    _load_json_object(review_root / REVIEW_MANIFEST_NAME, "review manifest")
    _load_json_object(crt_root / CRT_MANIFEST_NAME, "CRT manifest")
    validators = _validate_source_packages(review_root, crt_root) if _run_source_validators else [
        {"name": "Pixel Typography Review validator", "status": "passed"},
        {"name": "Pixel Typography CRT validator", "status": "passed"},
    ]
    sources = {"review": _source_record(review_root, REVIEW_MANIFEST_NAME, "review"), "crt": _source_record(crt_root, CRT_MANIFEST_NAME, "CRT")}
    temporary = output_root.parent / f".{output_root.name}.tmp-{secrets.token_hex(8)}"
    try:
        temporary.mkdir(mode=0o755)
        _copy_tree(review_root, temporary / "review")
        _copy_tree(crt_root, temporary / "crt")
        groups = _discover_pages(temporary)
        shell = _new_manifest(label=label, sources=sources, validators=validators, page_groups=groups, inventory={"files": [], "fileCount": 0, "totalBytes": 0, "treeSha256": ""})
        (temporary / "index.html").write_text(_render_index(label, groups, shell), "utf-8", newline="\n")
        (temporary / "README.md").write_text(_render_readme(shell), "utf-8", newline="\n")
        inventory = _inventory(temporary, exclude={MANIFEST_NAME})
        manifest = _new_manifest(label=label, sources=sources, validators=validators, page_groups=groups, inventory=inventory)
        (temporary / "index.html").write_text(_render_index(label, groups, manifest), "utf-8", newline="\n")
        (temporary / "README.md").write_text(_render_readme(manifest), "utf-8", newline="\n")
        inventory = _inventory(temporary, exclude={MANIFEST_NAME})
        manifest = _new_manifest(label=label, sources=sources, validators=validators, page_groups=groups, inventory=inventory)
        (temporary / MANIFEST_NAME).write_bytes(_pretty_json(manifest))
        validation = _validate_release_root(temporary, run_validators=_run_source_validators)
        os.replace(temporary, output_root)
        return {**validation, "output": os.fspath(output_root)}
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def validate_release_pack(output: str | Path) -> dict[str, Any]:
    return _validate_release_root(Path(output), run_validators=True)


def compare_release_packs(first: str | Path, second: str | Path) -> dict[str, Any]:
    a = validate_release_pack(first)
    b = validate_release_pack(second)
    matched = a["manifestSha256"] == b["manifestSha256"] and a["releaseDigestSha256"] == b["releaseDigestSha256"]
    return {"status": "matched" if matched else "different", "matched": matched, "first": {"manifestSha256": a["manifestSha256"], "releaseDigestSha256": a["releaseDigestSha256"]}, "second": {"manifestSha256": b["manifestSha256"], "releaseDigestSha256": b["releaseDigestSha256"]}}


def catalog() -> dict[str, Any]:
    return {"schema": SCHEMA, "toolVersion": TOOL_VERSION, "commands": ["catalog", "build", "validate-output", "compare", "self-test"], "inputs": {"review": REVIEW_MANIFEST_NAME, "crt": CRT_MANIFEST_NAME}, "outputs": ["review/", "crt/", "index.html", "README.md", MANIFEST_NAME], "safety": {"transactionalCreateOnlyOutput": True, "symlinksRejected": True, "regularFilesOnly": True, "maximumFiles": MAX_FILES, "maximumTotalBytes": MAX_TOTAL_BYTES, "offlineIndex": True, "externalNetwork": False}, "policy": _policy()}


def _expect_failure(action: Any, label: str) -> str:
    try:
        action()
    except ReleasePackError:
        return label
    raise AssertionError(f"Expected failure did not occur: {label}")


def self_test() -> dict[str, Any]:
    checks: list[str] = []
    with tempfile.TemporaryDirectory(prefix="evavo-release-pack-test-") as text:
        root = Path(text)
        review, crt = root / "review-source", root / "crt-source"
        for path in (review / "pages", review / "display", crt / "pages", crt / "previews"):
            path.mkdir(parents=True, exist_ok=True)
        (review / REVIEW_MANIFEST_NAME).write_text('{"schema":"review-test"}\n', "utf-8")
        (crt / CRT_MANIFEST_NAME).write_text('{"schema":"crt-test"}\n', "utf-8")
        (review / "pages/menu.png").write_bytes(b"native")
        (review / "display/menu.png").write_bytes(b"display")
        (crt / "pages/menu.png").write_bytes(b"crt")
        (crt / "previews/menu-2x.png").write_bytes(b"preview")
        first, second = root / "release-a", root / "release-b"
        label = "Arcade <script>alert(1)</script>"
        for output in (first, second):
            build_release_pack(review=review, crt=crt, output=output, label=label, _run_source_validators=False)
        a = _validate_release_root(first, run_validators=False)
        b = _validate_release_root(second, run_validators=False)
        assert a["manifestSha256"] == b["manifestSha256"]
        checks.append("deterministic rebuild")
        index = (first / "index.html").read_text("utf-8")
        assert "<script>alert(1)</script>" not in index and "&lt;script&gt;alert(1)&lt;/script&gt;" in index
        checks.append("HTML escaping")
        checks.append(_expect_failure(lambda: build_release_pack(review=review, crt=crt, output=first, _run_source_validators=False), "create-only output"))
        target = first / "crt/pages/menu.png"
        target.write_bytes(target.read_bytes() + b"tamper")
        checks.append(_expect_failure(lambda: _validate_release_root(first, run_validators=False), "retained-file tamper rejection"))
        (second / "unexpected.txt").write_text("unexpected", "utf-8")
        checks.append(_expect_failure(lambda: _validate_release_root(second, run_validators=False), "unexpected-file rejection"))
        if hasattr(os, "symlink"):
            linked = root / "linked-review"
            shutil.copytree(review, linked)
            try:
                os.symlink(linked / "pages/menu.png", linked / "pages/linked.png")
            except (OSError, NotImplementedError):
                pass
            else:
                checks.append(_expect_failure(lambda: build_release_pack(review=linked, crt=crt, output=root / "linked-output", _run_source_validators=False), "symlink rejection"))
    return {"status": "passed", "schema": SCHEMA, "toolVersion": TOOL_VERSION, "checkCount": len(checks), "checks": checks}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create deterministic handoffs from validated Pixel Typography review and CRT packages.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("catalog")
    build = commands.add_parser("build")
    build.add_argument("--review", required=True)
    build.add_argument("--crt", required=True)
    build.add_argument("--output", required=True)
    build.add_argument("--label", default="Pixel Typography release pack")
    validate = commands.add_parser("validate-output")
    validate.add_argument("--output", required=True)
    compare = commands.add_parser("compare")
    compare.add_argument("--first", required=True)
    compare.add_argument("--second", required=True)
    commands.add_parser("self-test")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "catalog": result = catalog()
        elif args.command == "build": result = build_release_pack(review=args.review, crt=args.crt, output=args.output, label=args.label)
        elif args.command == "validate-output": result = validate_release_pack(args.output)
        elif args.command == "compare": result = compare_release_packs(args.first, args.second)
        elif args.command == "self-test": result = self_test()
        else: raise ReleasePackError(f"Unhandled command: {args.command}")
    except (ReleasePackError, AssertionError) as error:
        print(json.dumps({"status": "failed", "schema": SCHEMA, "toolVersion": TOOL_VERSION, "error": str(error)}, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if args.command == "compare" and not result["matched"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
