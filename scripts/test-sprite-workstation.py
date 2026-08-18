from __future__ import annotations
import hashlib,json,struct,subprocess,tempfile,unittest,zlib
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'tools'/'sprite_workstation.py'
def png(c):
    s=b'\x89PNG\r\n\x1a\n';w=h=2
    def ch(k,p):return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',w,h,8,6,0,0,0);raw=b''.join(b'\x00'+bytes(c)*2 for _ in range(2));return s+ch(b'IHDR',ih)+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
class SpriteWorkstationTests(unittest.TestCase):
    def build_fixture(self,r,with_reserved=False):
        frames=[]
        for i,c in enumerate(((255,0,0,255),(0,0,255,255),(0,255,0,255))):
            p=r/f'f{i}.png';p.write_bytes(png(c));frames.append({'id':f'run_{i}','animation':'run','path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'durationMs':125})
        if with_reserved:
            frames.insert(1,{'id':'reserved_1','animation':'reserved','reserved':True,'runtime':False})
        plan={'schema':'evavo.sprite-workstation-plan.v1','repositoryMutation':False,'automaticApproval':False,'cell':{'width':8,'height':8},'columns':2,'hardAlpha':True,'frames':frames,'animations':{'run':{'fps':8,'loop':True}},'godotAtlasPath':'res://assets/run.png'}
        plan_path=r/'plan.json';plan_path.write_text(json.dumps(plan));return plan,plan_path
    def run_plan(self,r,plan_path,digest=None):
        digest=digest or hashlib.sha256(plan_path.read_bytes()).hexdigest()
        return subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(plan_path),'--plan-sha256',digest,'--output-root',str(r/'out')],capture_output=True,text=True)
    def test_build(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);_,plan_path=self.build_fixture(r);result=self.run_plan(r,plan_path)
            self.assertEqual(result.returncode,0,result.stderr);receipt=json.loads(result.stdout);self.assertEqual(receipt['frameCount'],3);self.assertEqual(receipt['runtimeFrameCount'],3);self.assertEqual(receipt['reservedFrameCount'],0);self.assertEqual(receipt['animationCount'],1);self.assertRegex(receipt['planSha256'],r'^[0-9a-f]{64}$');self.assertFalse(receipt['repositoryMutation']);self.assertFalse(receipt['automaticApproval'])
            manifest=json.loads((r/'out'/'atlas.json').read_text());self.assertEqual(manifest['schema'],'evavo.sprite-workstation-manifest.v2');self.assertEqual(manifest['planSha256'],receipt['planSha256'])
            tres=(r/'out'/'sprite_frames.tres').read_text();self.assertTrue(tres.startswith('[gd_resource type="SpriteFrames"'));self.assertIn('AtlasTexture_0000',tres);self.assertIn('&"run"',tres)
    def test_reserved_cell_preserves_index_and_is_not_runtime_animation(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);_,plan_path=self.build_fixture(r,True);result=self.run_plan(r,plan_path)
            self.assertEqual(result.returncode,0,result.stderr);receipt=json.loads(result.stdout);self.assertEqual(receipt['frameCount'],4);self.assertEqual(receipt['runtimeFrameCount'],3);self.assertEqual(receipt['reservedFrameCount'],1)
            manifest=json.loads((r/'out'/'atlas.json').read_text());reserved=manifest['frames'][1];self.assertEqual(reserved['cellIndex'],1);self.assertTrue(reserved['reserved']);self.assertFalse(reserved['runtime']);self.assertIsNone(reserved['sourceSha256']);self.assertEqual(reserved['region'],[8,0,8,8])
            tres=(r/'out'/'sprite_frames.tres').read_text();self.assertNotIn('&"reserved"',tres);self.assertIn('AtlasTexture_0002',tres)
    def test_create_only_output(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);_,plan_path=self.build_fixture(r);(r/'out').mkdir();result=self.run_plan(r,plan_path);self.assertEqual(result.returncode,2);self.assertIn('create-only',result.stderr)
    def test_plan_hash_rejects_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);plan,plan_path=self.build_fixture(r);digest=hashlib.sha256(plan_path.read_bytes()).hexdigest();plan['columns']=3;plan_path.write_text(json.dumps(plan));result=self.run_plan(r,plan_path,digest);self.assertEqual(result.returncode,2);self.assertIn('plan SHA-256 mismatch',result.stderr)
    def test_reserved_frame_cannot_smuggle_source_or_runtime(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);plan,plan_path=self.build_fixture(r);plan['frames']=[{'id':'bad','animation':'reserved','reserved':True,'runtime':True}];plan_path.write_text(json.dumps(plan));result=self.run_plan(r,plan_path);self.assertEqual(result.returncode,2);self.assertIn('runtime=false',result.stderr)
if __name__=='__main__':unittest.main()
