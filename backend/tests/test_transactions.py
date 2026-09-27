from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.main import app
from app.db import SessionLocal
from app.models import University


def test_mutation_is_committed_before_success_headers(school):
    # Observe the real route before any response-buffering middleware.
    probe = FastAPI()
    probe.include_router(app.router)
    observed = []

    async def application(scope, receive, send):
        async def capture(message):
            if message["type"] == "http.response.start" and message["status"] == 200:
                with SessionLocal() as reader:
                    observed.append(
                        reader.scalar(
                            select(University.id).where(
                                University.name == "Commit before response"
                            )
                        )
                        is not None
                    )
            await send(message)

        await probe(scope, receive, capture)

    client = TestClient(application)
    client.cookies.update(school.cookies)
    client.headers.update(school.headers)
    response = client.post(
        "/api/v1/universities", json={"name": "Commit before response"}
    )
    assert response.status_code == 200
    assert observed == [True], "Successful response preceded transaction commit"


def test_commit_failure_returns_error_and_rolls_back(school, monkeypatch):
    def fail_commit(session):
        raise IntegrityError("commit", None, RuntimeError("simulated commit failure"))

    monkeypatch.setattr(SessionLocal.class_, "commit", fail_commit)
    response = school.post("/api/v1/universities", json={"name": "Must roll back"})
    assert response.status_code == 409
    with SessionLocal() as reader:
        assert (
            reader.scalar(
                select(University.id).where(University.name == "Must roll back")
            )
            is None
        )
