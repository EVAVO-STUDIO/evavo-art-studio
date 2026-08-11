"""EVAVO Pixel Font Studio v2.2 implementation package."""

from . import build as _build
from . import cli as _cli
from .render_proof import install as _install_render_proof
from .schema import validate_face_document, validate_family_document

_install_render_proof(_build, _cli)

build_family = _build.build_family
validate_output = _build.validate_output
command_main = _cli.command_main

__all__ = [
    "build_family",
    "validate_output",
    "command_main",
    "validate_face_document",
    "validate_family_document",
]
