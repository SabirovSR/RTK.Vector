"""Send a synthetic website application; repeat the same external-id to test idempotency."""

import argparse
import json
import os
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--group", type=int, required=True)
parser.add_argument("--external-id", default="WEBSITE-DEMO-001")
parser.add_argument("--url", default="http://localhost:5173")
args = parser.parse_args()
payload = {
    "external_id": args.external_id,
    "group_id": args.group,
    "course": "Демонстрационная заявка",
    "participant": {
        "name": "Тестовый Участник",
        "email": "website-demo@example.test",
        "phone": "+70000000000",
    },
}
request = urllib.request.Request(
    args.url + "/api/v1/integrations/website/applications",
    data=json.dumps(payload).encode(),
    headers={
        "Content-Type": "application/json",
        "X-Service-Key": os.getenv(
            "WEBSITE_API_KEY", "local-demo-key-change-before-use"
        ),
    },
)
with urllib.request.urlopen(request) as response:
    print(response.read().decode())
