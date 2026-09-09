from pathlib import Path
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from sprite_sheet_subject_scale import normalize


def test_subject_scale_preserves_bottom_centre_anchor(tmp_path):
    source=tmp_path/"source.png"; output=tmp_path/"output.png"
    image=Image.new("RGB",(100,100),(0,240,8)); ImageDraw.Draw(image).rectangle((30,20,69,89),fill=(180,30,20)); image.save(source)
    report=normalize(source,output,1,1,0.5,4,30)
    cell=report["cells"][0]
    assert cell["before_bbox"] == [26,16,66,86]
    assert cell["after_bbox"] == [36,51,56,86]
    assert output.is_file() and output.with_suffix(".png.subject-scale.json").is_file()


def test_subject_scale_refuses_enlargement(tmp_path):
    source=tmp_path/"source.png"; Image.new("RGB",(20,20),(0,240,8)).save(source)
    try: normalize(source,tmp_path/"out.png",1,1,1.1,2,30)
    except ValueError as error: assert "enlargement is forbidden" in str(error)
    else: raise AssertionError("enlargement should fail")
