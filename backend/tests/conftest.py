import os
from pathlib import Path
import tempfile

test_root = Path(tempfile.mkdtemp(prefix="rtk-vector-tests-"))
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", "sqlite:///" + str(test_root / "test.db")
)
os.environ["STORAGE_PATH"] = str(test_root / "files")
os.environ["WEBSITE_API_KEY"] = "test-service-key"
os.environ["PYTHONIOENCODING"] = "utf-8"

import pytest
from fastapi.testclient import TestClient
from app.db import Base, engine, SessionLocal
from app.main import app
from app.cli import seed


@pytest.fixture(autouse=True)
def database():
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            conn.commit()
        Base.metadata.drop_all(conn)
        Base.metadata.create_all(conn)
        conn.commit()
        if engine.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            conn.commit()
    with SessionLocal() as db:
        seed(db)
        db.commit()
    yield


def client_for(email, role):
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "VectorDemo2026!", "role": role},
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return client


@pytest.fixture
def school():
    return client_for("school@demo.test", "school")


@pytest.fixture
def university():
    return client_for("university@demo.test", "university")


@pytest.fixture
def other():
    return client_for("other@demo.test", "university")


@pytest.fixture
def colleague():
    return client_for("colleague@demo.test", "school")
