from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "handwriting-document-export.v1.schema.json"
BRIDGE = ROOT / "tools" / "handwriting_document_bridge.py"


class HandwritingExportContractTests(unittest.TestCase):
    def test_contract_requires_governed_handoff_fields(self) -> None:
        schema = json.loads(CONTRACT.read_text(encoding="utf-8"))
        required = set(schema["required"])
        self.assertTrue({"sourceAtlasSha256", "assetRoot", "marks", "dateGlyphs", "textGlyphs", "truthBoundary"}.issubset(required))
        self.assertEqual(schema["properties"]["marks"]["required"], ["signature", "name"])

    def test_contract_preserves_truth_boundary(self) -> None:
        schema = json.loads(CONTRACT.read_text(encoding="utf-8"))
        truth = schema["properties"]["truthBoundary"]["properties"]
        self.assertIs(truth["imageBytesCopied"]["const"], False)
        self.assertIs(truth["fontFallbackUsed"]["const"], False)
        self.assertIs(truth["syntheticHandwritingGenerated"]["const"], False)
        self.assertIs(truth["signatureSynthesizedFromGlyphs"]["const"], False)
        self.assertIs(truth["requiresDocumentStudioApprovalForPdfExecution"]["const"], True)

    def test_bridge_uses_contract_schema_identity(self) -> None:
        schema = json.loads(CONTRACT.read_text(encoding="utf-8"))
        source = BRIDGE.read_text(encoding="utf-8")
        expected = schema["properties"]["schema"]["const"]
        self.assertIn(f'EXPORT_SCHEMA = "{expected}"', source)


if __name__ == "__main__":
    unittest.main()
