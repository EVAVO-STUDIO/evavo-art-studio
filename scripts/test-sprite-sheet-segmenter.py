from __future__ import annotations
import hashlib, json, struct, subprocess, tempfile, unittest, zlib
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'sprite_sheet_segmenter.py'

def png(width=8, height=4):
    sig=b'\x89PNG\r\n\x1a\n'
    def chunk(k,p): return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',width,height,8,6,0,0,0)
    rows=[]
    for y in range(height):
        row=[]
        for x in range(width):
            visible=(1<=x<3 and 1<=y<3) or (5<=x<7 and 1<=y<3)
            row.extend((255,0,0,255 if visible else 0))
        rows.append(b'\x00'+bytes(row))
    return sig+chunk(b'IHDR',ih)+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')

def uneven_grid_png(width=24, height=10):
    sig=b'\x89PNG\r\n\x1a\n'
    def chunk(k,p): return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',width,height,8,6,0,0,0)
    ranges=[(1,4),(6,11),(13,16),(18,23)]
    rows=[]
    for y in range(height):
        row=[]
        for x in range(width):
            visible=any(left<=x<right for left,right in ranges) and 1<=y<9
            row.extend((180,80,30,255 if visible else 0))
        rows.append(b'\x00'+bytes(row))
    return sig+chunk(b'IHDR',ih)+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')

class SegmenterTests(unittest.TestCase):
    def run_plan(self, root: Path, plan: dict, digest_override: str | None = None):
        source = root / 'sheet.png'; source.write_bytes(png())
        plan['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
        plan_path=root/'plan.json'; plan_path.write_text(json.dumps(plan), encoding='utf-8')
        digest=digest_override or hashlib.sha256(plan_path.read_bytes()).hexdigest()
        return subprocess.run(['python',str(SCRIPT),'--workspace-root',str(root),'--plan',str(plan_path),'--plan-sha256',digest,'--output-root',str(root/'out')],capture_output=True,text=True)

    def test_component_segmentation_is_create_only_and_unapproved(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d)
            plan={'schema':'evavo.sprite-sheet-segmentation-plan.v1','input':'sheet.png','mode':'components','alphaThreshold':128,'minimumComponentPixels':2,'maximumComponents':8,'padding':0,'hardAlpha':True,'trimAlpha':True,'createOnlyOutput':True,'sourceOverwrite':False}
            result=self.run_plan(r,plan)
            self.assertEqual(result.returncode,0,result.stderr)
            receipt=json.loads(result.stdout); self.assertEqual(receipt['frameCount'],2); self.assertFalse(receipt['automaticApproval']); self.assertFalse(receipt['repositoryMutation'])
            manifest=json.loads((r/'out'/'segmentation-manifest.json').read_text())
            self.assertEqual([f['id'] for f in manifest['frames']],['frame_000','frame_001'])
            self.assertTrue(all(f['productionApproved'] is False for f in manifest['frames']))

    def test_rectangle_segmentation_uses_declared_boxes(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d)
            plan={'schema':'evavo.sprite-sheet-segmentation-plan.v1','input':'sheet.png','mode':'rectangles','rectangles':[{'id':'pose_a','x':0,'y':0,'width':3,'height':4},{'id':'pose_b','x':5,'y':0,'width':3,'height':3}],'hardAlpha':True,'trimAlpha':True,'createOnlyOutput':True,'sourceOverwrite':False}
            result=self.run_plan(r,plan); self.assertEqual(result.returncode,0,result.stderr)
            manifest=json.loads((r/'out'/'segmentation-manifest.json').read_text()); self.assertEqual([x['id'] for x in manifest['frames']],['pose_a','pose_b'])

    def test_grid_auto_finds_uneven_alpha_mass_cells_in_named_order(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d); source=r/'sheet.png'; source.write_bytes(uneven_grid_png())
            plan={'schema':'evavo.sprite-sheet-segmentation-plan.v1','input':'sheet.png','mode':'grid-auto','rows':1,'columns':4,'frameIds':['front','front-right','right','back-right'],'alphaThreshold':128,'padding':0,'hardAlpha':False,'trimAlpha':True,'createOnlyOutput':True,'sourceOverwrite':False,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
            plan_path=r/'plan.json'; plan_path.write_text(json.dumps(plan),encoding='utf-8'); digest=hashlib.sha256(plan_path.read_bytes()).hexdigest()
            result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(plan_path),'--plan-sha256',digest,'--output-root',str(r/'out')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            manifest=json.loads((r/'out'/'segmentation-manifest.json').read_text())
            self.assertEqual([frame['id'] for frame in manifest['frames']],plan['frameIds'])
            self.assertEqual([frame['metrics']['width'] for frame in manifest['frames']],[3,5,3,5])

    def test_plan_hash_tamper_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d); source=r/'sheet.png'; source.write_bytes(png())
            plan={'schema':'evavo.sprite-sheet-segmentation-plan.v1','input':'sheet.png','mode':'components','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'createOnlyOutput':True,'sourceOverwrite':False}
            plan_path=r/'plan.json'; plan_path.write_text(json.dumps(plan)); digest=hashlib.sha256(plan_path.read_bytes()).hexdigest(); plan['padding']=3; plan_path.write_text(json.dumps(plan))
            result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(plan_path),'--plan-sha256',digest,'--output-root',str(r/'out')],capture_output=True,text=True)
            self.assertEqual(result.returncode,2); self.assertIn('plan SHA-256 mismatch',result.stderr)

if __name__=='__main__': unittest.main()
