"""Validate the production boundary using disposable configuration values."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
environment = os.environ | {
    "POSTGRES_PASSWORD": "ci-app-password",
    "POSTGRES_ADMIN_PASSWORD": "ci-bootstrap-password",
    "BACKEND_IMAGE": "example/backend:ci",
    "FRONTEND_IMAGE": "example/frontend:ci",
    "FRONTEND_URL": "https://vector.example.test",
    "WEBSITE_API_KEY": "ci-service-key",
}
result = subprocess.run(
    ["docker", "compose", "-f", str(root / "infra/compose.production.yaml"),
     "config", "--format", "json"],
    env=environment, capture_output=True, text=True, check=True,
)
services = json.loads(result.stdout)["services"]
for name in ("backend", "worker"):
    env = services[name]["environment"]
    assert "POSTGRES_ADMIN_PASSWORD" not in env
    assert "ci-bootstrap-password" not in json.dumps(env)
    assert "vector_bootstrap" not in env["DATABASE_URL"]
    assert env["COOKIE_SECURE"] == "true"
    assert not services[name].get("ports")
assert not services["db"].get("ports")
assert services["db"]["environment"]["POSTGRES_USER"] == "vector_bootstrap"
for name, service in services.items():
    assert service["read_only"], name
    assert service["cap_drop"] == ["ALL"], name
    for port in service.get("ports", []):
        assert port["host_ip"] == "127.0.0.1", name
print("Production config: isolated database credentials, secure cookies, private ports and restricted containers PASS")
