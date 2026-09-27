"""Render synthetic email previews without sending messages."""
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
os.environ["MAIL_FROM"] = "noreply@vector.sabirov.tech"
from app.emails import build_message, token_payload

output = root / "frontend/test-results/email-preview"
output.mkdir(parents=True, exist_ok=True)
for kind in ("reset", "invite"):
    message = build_message(token_payload(
        "recipient@example.test", kind,
        "https://vector.sabirov.tech/accept?token=preview-not-a-real-token",
    ))
    (output / f"{kind}.html").write_text(message.get_body(preferencelist=("html",)).get_content(), encoding="utf-8")
    (output / f"{kind}.eml").write_bytes(message.as_bytes())
print(output)
