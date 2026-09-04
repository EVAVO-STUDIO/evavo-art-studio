from pathlib import Path
import importlib.util

import pytest
from PIL import Image, ImageDraw


MODULE_PATH = Path(__file__).parents[1] / "tools" / "recover_painted_checkerboard.py"
SPEC = importlib.util.spec_from_file_location("recover_painted_checkerboard", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def checker_sprite() -> Image.Image:
    image = Image.new("RGB", (32, 32))
    draw = ImageDraw.Draw(image)
    for y in range(0, 32, 4):
        for x in range(0, 32, 4):
            value = 220 if (x // 4 + y // 4) % 2 else 180
            draw.rectangle((x, y, x + 3, y + 3), fill=(value, value, value))
    draw.rectangle((9, 7, 22, 25), fill=(30, 80, 150))
    return image


def test_checker_recovery_validates_alpha_and_writes_hostile_proofs(tmp_path: Path) -> None:
    output, _ = MODULE.recover(checker_sprite(), border_band=4, threshold=8, fringe_threshold=12)
    validation = MODULE.validate_alpha(output)
    proofs = MODULE.write_proofs(output, tmp_path / "proofs")

    assert validation["meaningful_alpha"] is True
    assert validation["canvas_edge_fully_transparent"] is True
    assert proofs == [
        "plate-black.png", "plate-white.png", "plate-grey.png",
        "plate-green.png", "plate-magenta.png", "alpha-mask.png",
    ]
    assert all((tmp_path / "proofs" / name).is_file() for name in proofs)


def test_alpha_validation_rejects_opaque_and_nontransparent_edges() -> None:
    with pytest.raises(ValueError, match="both transparent and opaque"):
        MODULE.validate_alpha(Image.new("RGBA", (8, 8), (1, 2, 3, 255)))

    image = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle((0, 2, 4, 5), fill=(255, 0, 0, 255))
    with pytest.raises(ValueError, match="edge is not fully transparent"):
        MODULE.validate_alpha(image)


def test_low_chroma_detection_distinguishes_neutral_from_chroma() -> None:
    assert MODULE.is_low_chroma((0, 0, 0))
    assert MODULE.is_low_chroma((220, 220, 220))
    assert not MODULE.is_low_chroma((0, 255, 0))
    assert not MODULE.is_low_chroma((255, 0, 255))
