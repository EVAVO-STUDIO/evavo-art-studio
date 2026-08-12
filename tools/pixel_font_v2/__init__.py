"""EVAVO Pixel Font Studio v2.2 plus the universal style compiler."""

from . import build as _build
from . import cli as _cli
from .render_proof import install as _install_render_proof
from .schema import validate_face_document, validate_family_document

try:
    # The supported CLI entrypoints place ``tools`` on sys.path.
    from pixel_font_universal import (
        BUILTIN_OPERATIONS,
        BUILTIN_PRESETS,
        ENGINE_VERSION as UNIVERSAL_ENGINE_VERSION,
        FACE_SCHEMA as UNIVERSAL_FACE_SCHEMA,
        PROFILE_SCHEMA as UNIVERSAL_PROFILE_SCHEMA,
        compare_builds as compare_universal_builds,
        compile_face as compile_universal_face,
        normalise_face as normalise_universal_face,
        normalise_profile as normalise_universal_profile,
        profile_from_preset as universal_profile_from_preset,
        style_catalog as universal_style_catalog,
        validate_build as validate_universal_build,
    )
except ModuleNotFoundError:
    # Library callers may import the namespace package as ``tools.pixel_font_v2``.
    from ..pixel_font_universal import (
        BUILTIN_OPERATIONS,
        BUILTIN_PRESETS,
        ENGINE_VERSION as UNIVERSAL_ENGINE_VERSION,
        FACE_SCHEMA as UNIVERSAL_FACE_SCHEMA,
        PROFILE_SCHEMA as UNIVERSAL_PROFILE_SCHEMA,
        compare_builds as compare_universal_builds,
        compile_face as compile_universal_face,
        normalise_face as normalise_universal_face,
        normalise_profile as normalise_universal_profile,
        profile_from_preset as universal_profile_from_preset,
        style_catalog as universal_style_catalog,
        validate_build as validate_universal_build,
    )

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
    "UNIVERSAL_ENGINE_VERSION",
    "UNIVERSAL_FACE_SCHEMA",
    "UNIVERSAL_PROFILE_SCHEMA",
    "BUILTIN_OPERATIONS",
    "BUILTIN_PRESETS",
    "universal_style_catalog",
    "normalise_universal_face",
    "normalise_universal_profile",
    "universal_profile_from_preset",
    "compile_universal_face",
    "validate_universal_build",
    "compare_universal_builds",
]
