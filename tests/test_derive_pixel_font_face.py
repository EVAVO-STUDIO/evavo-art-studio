from tools.derive_pixel_font_face import chamfer_bitmap


def test_chamfer_cuts_large_convex_corner_without_erasing_two_pixel_stem() -> None:
    assert chamfer_bitmap(["####", "####", "####", "####"], 1) == [
        ".##.",
        "####",
        "####",
        ".##.",
    ]
    assert chamfer_bitmap(["##", "##", "##", "##"], 1) == [
        "##",
        "##",
        "##",
        "##",
    ]


def test_chamfer_preserves_single_pixel_punctuation() -> None:
    assert chamfer_bitmap(["#"], 3) == ["#"]
