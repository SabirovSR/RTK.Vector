"""Run from backend: python -m app.export_openapi."""

import json
from pathlib import Path
from .main import app

Path("openapi.json").write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
