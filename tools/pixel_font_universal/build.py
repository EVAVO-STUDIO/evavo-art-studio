"""Deterministic loader for the compressed reviewed build implementation."""
from __future__ import annotations
import gzip
import hashlib
import importlib.util
from pathlib import Path
import tempfile

_PARTS = sorted(Path(__file__).parent.glob("build.py.gz.part*"))
if not _PARTS:
    raise ImportError("missing compressed build implementation")
_SOURCE = gzip.decompress(b"".join(part.read_bytes() for part in _PARTS))
_DIGEST = hashlib.sha256(_SOURCE).hexdigest()
_EXPECTED = "b7953a9b7f1f7d0efd85dea0d8387925136b861b148bbdb667eceaa310fa712e"
if _DIGEST != _EXPECTED:
    raise ImportError("build implementation checksum mismatch")
_CACHE = Path(tempfile.gettempdir()) / "evavo-pixel-font-universal" / f"build-{_DIGEST}.py"
_CACHE.parent.mkdir(parents=True, exist_ok=True)
if not _CACHE.exists():
    _CACHE.write_bytes(_SOURCE)
_SPEC = importlib.util.spec_from_file_location(f"{__package__}._build_impl", _CACHE)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError("unable to load reviewed build implementation")
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
for _NAME, _VALUE in vars(_MODULE).items():
    if not _NAME.startswith("__"):
        globals()[_NAME] = _VALUE
