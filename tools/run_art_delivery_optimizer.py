#!/usr/bin/env python3
"""Run the repository-owned Sharp delivery optimizer without shell strings."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

WRAPPER_SCHEMA = "evavo.art-delivery-optimizer-wrapper-receipt.v2"
MANIFEST_SCHEMA = "evavo.art-delivery-optimization.v1"
OPTIMIZER_RECEIPT_SCHEMA = "evavo.art-delivery-optimization-receipt.v1"
MAXIMUM_CAPTURE_BYTES = 8 * 1024 * 1024
MAXIMUM_MANIFEST_BYTES = 16 * 1024 * 1024


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fail(message: str) -> None:
    raise ValueError(message)


def within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def require_workspace_root(value: Path) -> Path:
    lexical = Path(os.path.abspath(value))
    if lexical.is_symlink() or not lexical.is_dir():
        fail(f"workspace-root must be an existing non-symbolic directory: {lexical}")
    return lexical.resolve(strict=True)


def secure_path(root: Path, value: Path, label: str) -> Path:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    if not within(root, lexical):
        fail(f"{label} escaped workspace-root")
    current = root
    for segment in lexical.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"{label} contains a symbolic path component: {current}")
        if not current.exists():
            break
    return lexical


def regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be a regular file: {path}")


def regular_directory(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_dir():
        fail(f"{label} must be a regular directory: {path}")


def clean_environment() -> dict[str, str]:
    allowed = {
        "PATH",
        "Path",
        "PATHEXT",
        "SystemRoot",
        "SYSTEMROOT",
        "WINDIR",
        "HOME",
        "USERPROFILE",
        "TMP",
        "TEMP",
        "CI",
    }
    return {key: value for key, value in os.environ.items() if key in allowed}


def run(command: list[str], cwd: Path, timeout: int) -> dict[str, Any]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=clean_environment(),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
        timeout=timeout,
        check=False,
    )
    stdout = completed.stdout[:MAXIMUM_CAPTURE_BYTES]
    stderr = completed.stderr[:MAXIMUM_CAPTURE_BYTES]
    return {
        "command": command,
        "exitCode": completed.returncode,
        "stdoutSha256": sha256_bytes(stdout),
        "stderrSha256": sha256_bytes(stderr),
        "stdoutBytes": len(completed.stdout),
        "stderrBytes": len(completed.stderr),
        "stdoutTruncated": len(completed.stdout) > len(stdout),
        "stderrTruncated": len(completed.stderr) > len(stderr),
        "diagnostic": (stderr or stdout).decode("utf-8", errors="replace")[-4000:],
    }


def canonical_relative(value: str, label: str) -> str:
    candidate = Path(value)
    if not value or candidate.is_absolute() or ".." in candidate.parts or "\\" in value:
        fail(f"{label} must be a forward-slash relative path")
    if candidate.as_posix() != value or value in {".", ".."}:
        fail(f"{label} is not canonical")
    return value


def scan_output_tree(root: Path) -> dict[str, Any]:
    regular_directory(root, "output-root")
    digest = hashlib.sha256()
    files: dict[str, dict[str, Any]] = {}
    directories = 1
    total_bytes = 0
    for candidate in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = candidate.relative_to(root).as_posix()
        if candidate.is_symlink():
            fail(f"optimizer output contains a symbolic link: {candidate}")
        if candidate.is_dir():
            directories += 1
            digest.update(f"D\0{relative}\n".encode("utf-8"))
            continue
        if not candidate.is_file():
            fail(f"optimizer output contains a non-regular entry: {candidate}")
        content = candidate.read_bytes()
        content_sha256 = sha256_bytes(content)
        total_bytes += len(content)
        files[relative] = {"sha256": content_sha256, "bytes": len(content)}
        digest.update(
            f"F\0{relative}\0{len(content)}\0{content_sha256}\n".encode("utf-8")
        )
    return {
        "treeSha256": digest.hexdigest(),
        "files": files,
        "fileCount": len(files),
        "directoryCount": directories,
        "bytes": total_bytes,
    }


def validate_optimizer_output(
    output_root: Path,
    manifest_value: dict[str, Any],
) -> dict[str, Any]:
    receipt_path = output_root / "optimization-receipt.json"
    regular_file(receipt_path, "optimization receipt")
    receipt_bytes = receipt_path.read_bytes()
    receipt = json.loads(receipt_bytes.decode("utf-8"))
    if receipt.get("schema") != OPTIMIZER_RECEIPT_SCHEMA:
        fail("optimizer wrote an unexpected receipt schema")
    manifest_items = manifest_value.get("items")
    receipt_items = receipt.get("items")
    if not isinstance(manifest_items, list) or not isinstance(receipt_items, list):
        fail("optimizer manifest or receipt items are invalid")
    expected = {
        (
            item.get("id"),
            canonical_relative(str(item.get("sourcePath", "")), "manifest sourcePath"),
            canonical_relative(str(item.get("targetPath", "")), "manifest targetPath"),
            item.get("sourceSha256"),
        )
        for item in manifest_items
    }
    observed = {
        (
            item.get("id"),
            canonical_relative(str(item.get("sourcePath", "")), "receipt sourcePath"),
            canonical_relative(str(item.get("targetPath", "")), "receipt targetPath"),
            item.get("sourceSha256"),
        )
        for item in receipt_items
    }
    if expected != observed:
        fail("optimizer receipt does not cover the exact manifest items")
    tree = scan_output_tree(output_root)
    exact_paths = receipt.get("exactOutputPaths")
    if not isinstance(exact_paths, list) or any(not isinstance(item, str) for item in exact_paths):
        fail("optimizer receipt exactOutputPaths are invalid")
    if sorted(tree["files"]) != sorted(exact_paths):
        fail("optimizer output tree differs from exactOutputPaths")
    by_target = {item["targetPath"]: item for item in receipt_items}
    for target_path, item in by_target.items():
        evidence = tree["files"].get(target_path)
        if evidence is None:
            fail(f"optimizer target is missing: {target_path}")
        if evidence["sha256"] != item.get("outputSha256"):
            fail(f"optimizer target SHA-256 differs from receipt: {target_path}")
        if evidence["bytes"] != item.get("outputBytes"):
            fail(f"optimizer target byte length differs from receipt: {target_path}")
    return {
        "receipt": {
            "path": str(receipt_path),
            "sha256": sha256_bytes(receipt_bytes),
            "bytes": len(receipt_bytes),
            "batchSha256": receipt.get("batchSha256"),
            "files": receipt.get("totals", {}).get("files"),
        },
        "tree": {
            key: value for key, value in tree.items() if key != "files"
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--wrapper-receipt", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    args = parser.parse_args()

    output_root: Path | None = None
    wrapper_receipt: Path | None = None
    receipt: dict[str, Any] = {
        "schema": WRAPPER_SCHEMA,
        "status": "failed",
        "commands": [],
        "apply": args.apply,
    }
    try:
        workspace = require_workspace_root(args.workspace_root)
        repo = secure_path(workspace, args.repo, "repo")
        source_root = secure_path(workspace, args.source_root, "source-root")
        manifest = secure_path(workspace, args.manifest, "manifest")
        output_root = secure_path(workspace, args.output_root, "output-root")
        wrapper_receipt = secure_path(
            workspace,
            args.wrapper_receipt,
            "wrapper-receipt",
        )
        regular_directory(repo, "repo")
        regular_directory(source_root, "source-root")
        regular_file(manifest, "manifest")
        if output_root.exists():
            fail("output-root must not already exist")
        if wrapper_receipt.exists():
            fail("wrapper-receipt must be create-only")
        if within(output_root, wrapper_receipt) or within(wrapper_receipt, output_root):
            fail("output-root and wrapper-receipt must be disjoint")
        if args.timeout_seconds < 10 or args.timeout_seconds > 14400:
            fail("timeout-seconds must be between 10 and 14400")
        manifest_bytes = manifest.read_bytes()
        if len(manifest_bytes) > MAXIMUM_MANIFEST_BYTES:
            fail("manifest exceeds 16 MiB")
        manifest_value = json.loads(manifest_bytes.decode("utf-8-sig"))
        if manifest_value.get("schema") != MANIFEST_SCHEMA:
            fail(f"manifest must use {MANIFEST_SCHEMA}")
        pnpm = shutil.which("pnpm.cmd" if os.name == "nt" else "pnpm") or shutil.which("pnpm")
        if not pnpm:
            fail("pnpm is unavailable")
        cli = repo / "packages" / "delivery-optimizer" / "dist" / "cli.js"
        regular_file(cli, "built delivery optimizer CLI")
        command = [
            pnpm,
            "--filter",
            "@evavo/art-delivery-optimizer",
            "start",
            "--",
            "batch",
            "--manifest",
            str(manifest),
            "--source-root",
            str(source_root),
            "--output-root",
            str(output_root),
        ]
        if args.apply:
            command.append("--apply")
        execution = run(command, repo, args.timeout_seconds)
        receipt["commands"].append(execution)
        if execution["exitCode"] != 0:
            fail("delivery optimizer execution failed")
        output_evidence = None
        if args.apply:
            output_evidence = validate_optimizer_output(output_root, manifest_value)
        receipt.update(
            {
                "status": "passed",
                "workspaceRoot": str(workspace),
                "repo": str(repo),
                "manifest": {
                    "path": str(manifest),
                    "sha256": sha256_bytes(manifest_bytes),
                    "bytes": len(manifest_bytes),
                },
                "sourceRoot": str(source_root),
                "outputRoot": str(output_root),
                "outputEvidence": output_evidence,
                "sourceMutation": False,
                "providerExecution": False,
                "publication": False,
            }
        )
    except (
        OSError,
        ValueError,
        json.JSONDecodeError,
        subprocess.TimeoutExpired,
    ) as exc:
        receipt["failure"] = str(exc)
        if output_root is not None and output_root.exists() and not output_root.is_symlink():
            shutil.rmtree(output_root, ignore_errors=True)
    if wrapper_receipt is None:
        print(
            f"Art delivery optimizer wrapper failed before a secure receipt path was admitted: {receipt.get('failure')}",
            file=sys.stderr,
        )
        return 2
    wrapper_receipt.parent.mkdir(parents=True, exist_ok=True)
    with wrapper_receipt.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(receipt, indent=2) + "\n")
    if receipt["status"] != "passed":
        print(
            f"Art delivery optimizer wrapper failed: {receipt.get('failure')}",
            file=sys.stderr,
        )
        return 2
    print(
        json.dumps(
            {
                "status": "passed",
                "wrapperReceipt": str(wrapper_receipt),
                "outputRoot": receipt["outputRoot"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
