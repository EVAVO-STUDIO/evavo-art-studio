"""Deterministic loader for the compressed reviewed operations implementation."""
from __future__ import annotations
import gzip
import hashlib
import importlib.util
from pathlib import Path
import tempfile

_PARTS = sorted(Path(__file__).parent.glob("operations.py.gz.part*"))
if not _PARTS:
    raise ImportError("missing compressed operations implementation")
_SOURCE = gzip.decompress(b"".join(part.read_bytes() for part in _PARTS))
_DIGEST = hashlib.sha256(_SOURCE).hexdigest()
_EXPECTED = "e319675e60a68433a73af25ad5027a6313f8aa99fac5a897826be4cdc9b801fe"
if _DIGEST != _EXPECTED:
    raise ImportError("operations implementation checksum mismatch")
_CACHE = Path(tempfile.gettempdir()) / "evavo-pixel-font-universal" / f"operations-{_DIGEST}.py"
_CACHE.parent.mkdir(parents=True, exist_ok=True)
if not _CACHE.exists():
    _CACHE.write_bytes(_SOURCE)
_SPEC = importlib.util.spec_from_file_location(f"{__package__}._operations_impl", _CACHE)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError("unable to load reviewed operations implementation")
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
for _NAME, _VALUE in vars(_MODULE).items():
    if not _NAME.startswith("__"):
        globals()[_NAME] = _VALUE
