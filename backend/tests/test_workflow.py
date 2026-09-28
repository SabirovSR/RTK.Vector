import io
import json
from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from openpyxl import Workbook
from app.main import app
from app.db import SessionLocal, now
from app.models import *
from app.worker import run_once

P = "/api/v1"


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def new_deal(school):
    return ok(
        school.post(
            P + "/deals",
            json={
                "title": "Новая программа",
                "university_id": 1,
                "program_id": 1,
                "deadline": "2026-12-01",
            },
        )
    )


def qualify(school, deal):
    return ok(
        school.put(
            P + f"/deals/{deal['id']}",
            json={
                "title": deal["title"],
                "qualification": {
                    "contact": "Ирина",
                    "interest": "Практика",
                    "budget": "Согласован",
                    "window": "Осень",
                },
                "preparation": {
                    k: "done"
                    for k in ("materials", "licenses", "teachers", "curriculum")
                },
            },
        )
    )


def transition(school, ident, stage, reason=""):
    return school.post(
        P + f"/deals/{ident}/transition", json={"stage": stage, "reason": reason}
    )


def test_entire_cycle(school, university):
    deal = new_deal(school)
    ident = deal["id"]
    qualify(school, deal)
    ok(transition(school, ident, "qualification"))
    ok(transition(school, ident, "approval"))
    proposal = ok(
        school.post(
            P + f"/deals/{ident}/proposals",
            json={"content": "Учебная программа 72 часа"},
        )
    )
    ok(
        university.post(
            P + f"/proposals/{proposal['id']}/decision",
            json={"status": "changes", "comment": "Добавьте практику"},
        )
    )
    assert transition(school, ident, "contract").status_code == 400
    proposal = ok(
        school.post(
            P + f"/deals/{ident}/proposals",
            json={"content": "Учебная программа 72 часа с практикой"},
        )
    )
    ok(
        university.post(
            P + f"/proposals/{proposal['id']}/decision", json={"status": "approved"}
        )
    )
    assert ok(school.get(P + f"/deals/{ident}"))["stage"] == "contract"
    ok(transition(school, ident, "preparation"))
    assert transition(school, ident, "training").status_code == 400
    document = ok(
        university.post(
            P + f"/deals/{ident}/documents",
            data={"kind": "signed_contract"},
            files={
                "file": (
                    "agreement.pdf",
                    b"%PDF-1.4\nDemo agreement",
                    "application/pdf",
                )
            },
        )
    )
    assert school.get(P + f"/documents/{document['id']}/download").status_code == 200
    group = ok(
        university.post(P + f"/deals/{ident}/groups", json={"name": "Тестовый поток"})
    )
    participant = ok(
        university.post(
            P + f"/groups/{group['id']}/participants",
            json={"name": "Тестовый Студент", "email": "student@example.test"},
        )
    )
    ok(university.post(P + f"/groups/{group['id']}/confirm"))
    ok(transition(school, ident, "training"))
    assert (
        university.post(
            P + f"/groups/{group['id']}/participants",
            json={"name": "Поздний Студент", "email": "late@example.test"},
        ).status_code
        == 409
    )
    assert (
        university.put(
            P + f"/participants/{participant['id']}",
            json={"name": "Изменение", "email": "student@example.test"},
        ).status_code
        == 409
    )
    assert transition(school, ident, "evaluation").status_code == 400
    ok(university.post(P + f"/groups/{group['id']}/sync"))
    assert run_once("lms")
    ok(transition(school, ident, "evaluation"))
    ok(transition(school, ident, "completed"))
    certificate = university.get(P + f"/participants/{participant['id']}/certificate")
    assert certificate.status_code == 200 and certificate.content.startswith(b"%PDF")
    ok(
        university.post(
            P + f"/deals/{ident}/feedback", json={"text": "Полезная программа"}
        )
    )
    expansion = ok(
        university.post(
            P + f"/deals/{ident}/expansions", json={"text": "Хотим новую группу"}
        )
    )
    next_deal = ok(
        school.post(
            P + f"/expansions/{expansion['id']}/accept",
            json={"title": "Продолжение", "program_id": 2},
        )
    )
    assert next_deal["parent_id"] == ident
    assert (
        school.post(
            P + f"/expansions/{expansion['id']}/accept",
            json={"title": "Дубликат", "program_id": 2},
        ).status_code
        == 409
    )


def test_ownership_and_personal_data(school, university, other, colleague):
    deals = ok(university.get(P + "/deals"))
    assert all(d["university_id"] == 1 for d in deals)
    detail = ok(university.get(P + "/deals/1"))
    assert (
        "notes" not in detail
        and "qualification" not in detail
        and "owner_id" not in detail
    )
    assert all(t["audience"] == "university" for t in detail["tasks"])
    assert all(a["shared"] for a in detail["activities"])
    assert other.get(P + "/deals/1").status_code == 404
    assert colleague.get(P + "/deals/1").status_code == 404
    assert other.get(P + "/universities/1/contacts").status_code == 404
    assert other.get(P + "/groups/1/participants").status_code == 404
    assert school.get(P + "/groups/1/participants").status_code == 403
    assert school.get(P + "/participants/1/certificate").status_code == 403
    assert other.get(P + "/documents/1/download").status_code == 404
    assert other.post(P + "/groups/1/confirm").status_code == 404
    assert university.get(P + "/reports").status_code == 403
    assert university.get(P + "/reports/export").status_code == 403
    assert (
        university.post(
            P + "/deals", json={"title": "Test", "university_id": 1, "program_id": 1}
        ).status_code
        == 403
    )


def test_school_only_own_edits(school, colleague):
    uni = ok(school.get(P + "/universities"))[-1]
    assert (
        school.put(
            P + "/universities/4", json={"name": "Changed", "region": "X"}
        ).status_code
        == 403
    )
    tasks = ok(school.get(P + "/tasks"))
    other = next(t for t in tasks if t["owner_id"] != 1)
    assert (
        school.patch(P + f"/tasks/{other['id']}", json={"status": "done"}).status_code
        == 403
    )
    assert any(not u["editable"] for u in ok(school.get(P + "/universities")))


def test_csrf_login_role_logout(school):
    c = TestClient(app)
    assert (
        c.post(
            P + "/auth/login",
            json={
                "email": "school@demo.test",
                "password": "VectorDemo2026!",
                "role": "university",
            },
        ).status_code
        == 401
    )
    assert c.get(P + "/deals").status_code == 401
    csrf = school.headers.pop("X-CSRF-Token")
    assert school.post(P + "/universities", json={"name": "Bad"}).status_code == 403
    school.headers["X-CSRF-Token"] = csrf
    assert (
        school.post(
            P + "/universities",
            json={"name": "Bad"},
            headers={"Origin": "https://evil.test"},
        ).status_code
        == 403
    )
    ok(school.post(P + "/auth/logout"))
    assert school.get(P + "/auth/me").status_code == 401


def test_rate_limit():
    c = TestClient(app)
    for _ in range(10):
        assert (
            c.post(
                P + "/auth/login",
                json={
                    "email": "missing@example.test",
                    "password": "wrong",
                    "role": "school",
                },
            ).status_code
            == 401
        )
    assert (
        c.post(
            P + "/auth/login",
            json={
                "email": "missing@example.test",
                "password": "wrong",
                "role": "school",
            },
        ).status_code
        == 429
    )


def extract_token(db):
    job = db.scalar(select(Job).order_by(Job.id.desc()))
    return job.payload["action_url"].split("token=")[1]


def test_invitation_and_reset(school):
    ok(school.post(P + "/universities/1/invite", json={"email": "invite@example.test"}))
    with SessionLocal() as db:
        raw = extract_token(db)
    c = TestClient(app)
    ok(
        c.post(
            P + "/auth/accept",
            json={
                "token": raw,
                "name": "Новый Менеджер",
                "password": "SecurePassword123!",
            },
        )
    )
    assert (
        c.post(
            P + "/auth/accept", json={"token": raw, "password": "SecurePassword123!"}
        ).status_code
        == 400
    )
    response = ok(
        c.post(
            P + "/auth/login",
            json={
                "email": "invite@example.test",
                "password": "SecurePassword123!",
                "role": "university",
            },
        )
    )
    assert response["user"]["university_id"] == 1
    ok(c.post(P + "/auth/forgot", json={"email": "invite@example.test"}))
    with SessionLocal() as db:
        raw = extract_token(db)
    ok(c.post(P + "/auth/accept", json={"token": raw, "password": "NewPassword123!"}))
    assert c.get(P + "/auth/me").status_code == 401
    ok(
        c.post(
            P + "/auth/login",
            json={
                "email": "invite@example.test",
                "password": "NewPassword123!",
                "role": "university",
            },
        )
    )


def test_expired_invite(school):
    ok(
        school.post(
            P + "/universities/1/invite", json={"email": "expired@example.test"}
        )
    )
    with SessionLocal() as db:
        raw = extract_token(db)
        token = db.scalar(select(Token))
        token.expires = now() - timedelta(seconds=1)
        db.commit()
    assert (
        TestClient(app)
        .post(P + "/auth/accept", json={"token": raw, "password": "Password12345!"})
        .status_code
        == 400
    )


def test_old_version_and_stage_bypass(school, university):
    proposal = ok(
        school.post(
            P + "/deals/1/proposals", json={"content": "Новая версия программы"}
        )
    )
    assert (
        university.post(
            P + "/proposals/1/decision", json={"status": "approved"}
        ).status_code
        == 409
    )
    assert transition(school, 1, "contract").status_code == 400
    assert (
        school.put(
            P + "/deals/1", json={"title": "Attempt", "stage": "completed"}
        ).status_code
        == 422
    )
    assert transition(school, 1, "completed").status_code == 400
    assert transition(school, 1, "new").status_code == 400
    ok(transition(school, 1, "new", "Повторная квалификация"))


def test_required_qualification(school):
    deal = new_deal(school)
    ok(transition(school, deal["id"], "qualification"))
    assert transition(school, deal["id"], "approval").status_code == 400


def test_document_validation(school, other):
    for filename, data in [
        ("evil.exe", b"x"),
        ("fake.pdf", b"not pdf"),
        ("fake.docx", b"not zip"),
    ]:
        assert (
            school.post(
                P + "/deals/1/documents", files={"file": (filename, data)}
            ).status_code
            == 400
        )
    assert (
        other.post(
            P + "/deals/1/documents", files={"file": ("ok.pdf", b"%PDF-1.4\n")}
        ).status_code
        == 404
    )
    a = ok(
        school.post(P + "/deals/1/documents", files={"file": ("ok.pdf", b"%PDF-1.4\n")})
    )
    b = ok(
        school.post(P + "/deals/1/documents", files={"file": ("ok.pdf", b"%PDF-1.4\n")})
    )
    assert b["version"] == a["version"] + 1 and "path" not in b


def xlsx(rows):
    b = Workbook()
    s = b.active
    s.append(["Фамилия", "Имя", "Email", "Номер телефона", "СНИЛС", "Номер паспорта"])
    for row in rows:
        s.append(row)
    out = io.BytesIO()
    b.save(out)
    return out.getvalue()


def test_import_preview_commit_idempotency(university, school):
    payload = xlsx(
        [
            [
                "Проверочный",
                "Студент",
                "TEST@EXAMPLE.TEST",
                "8 (999) 111-22-33",
                "DO NOT STORE",
                "SECRET",
            ]
        ]
    )
    url = P + "/groups/1/import"
    p = ok(university.post(url, files={"file": ("people.xlsx", payload)}))
    assert not p["committed"] and p["rows"][0]["email"] == "test@example.test"
    assert p["rows"][0]["phone"] == "+79991112233" and "СНИЛС" in p["ignored_columns"]
    assert "SECRET" not in json.dumps(p)
    with SessionLocal() as db:
        assert not db.scalar(
            select(Participant).where(Participant.email == "test@example.test")
        )
    result = ok(
        university.post(
            url, data={"commit": "true"}, files={"file": ("people.xlsx", payload)}
        )
    )
    assert result["created"] == 1
    again = ok(
        university.post(
            url, data={"commit": "true"}, files={"file": ("people.xlsx", payload)}
        )
    )
    assert again["created"] == 0
    assert school.post(url, files={"file": ("people.xlsx", payload)}).status_code == 403


def test_ambiguous_import_atomic(university):
    payload = xlsx(
        [
            ["Первый", "Студент", "duplicate@example.test"],
            ["Другой", "Студент", "duplicate@example.test"],
        ]
    )
    response = ok(
        university.post(
            P + "/groups/1/import", files={"file": ("people.xlsx", payload)}
        )
    )
    assert response["errors"][0]["row"] == 3
    assert (
        university.post(
            P + "/groups/1/import",
            data={"commit": "true"},
            files={"file": ("people.xlsx", payload)},
        ).status_code
        == 409
    )
    with SessionLocal() as db:
        assert not db.scalar(
            select(Participant).where(Participant.email == "duplicate@example.test")
        )


def test_json_applications_and_website(university):
    payload = [
        None,
        {
            "Номер заявки": "ORD-001",
            "Курс": "Аналитика",
            "Фамилия": "Тестовый",
            "Имя": "Студент",
            "Email": "order@example.test",
            "Телефон": "79991112233",
            "Номер потока": 99,
        },
    ]
    url = P + "/groups/1/import"
    assert (
        ok(
            university.post(
                url,
                data={"commit": "true"},
                files={"file": ("orders.json", json.dumps(payload).encode())},
            )
        )["created"]
        == 1
    )
    assert (
        ok(
            university.post(
                url,
                data={"commit": "true"},
                files={"file": ("orders.json", json.dumps(payload).encode())},
            )
        )["created"]
        == 0
    )
    c = TestClient(app)
    body = {
        "external_id": "WEB-001",
        "group_id": 1,
        "course": "Аналитика",
        "participant": {"name": "Сайт Студент", "email": "web@example.test"},
    }
    assert (
        c.post(P + "/integrations/website/applications", json=body).status_code == 401
    )
    assert (
        ok(
            c.post(
                P + "/integrations/website/applications",
                json=body,
                headers={"X-Service-Key": "test-service-key"},
            )
        )["created"]
        == 1
    )
    assert (
        ok(
            c.post(
                P + "/integrations/website/applications",
                json=body,
                headers={"X-Service-Key": "test-service-key"},
            )
        )["created"]
        == 0
    )
    body["participant"]["name"] = "Чужая запись"
    assert (
        c.post(
            P + "/integrations/website/applications",
            json=body,
            headers={"X-Service-Key": "test-service-key"},
        ).status_code
        == 409
    )


def test_communication_next_task_and_private_history(school, university):
    ok(
        school.post(
            P + "/deals/1/communications",
            json={
                "kind": "call",
                "text": "Внутренний звонок",
                "title": "Перезвонить",
                "due": "2026-12-01",
            },
        )
    )
    d = ok(school.get(P + "/deals/1"))
    assert any(t["title"] == "Перезвонить" for t in d["tasks"])
    assert "Внутренний звонок" not in university.get(P + "/deals/1").text
    assert (
        school.post(
            P + "/deals/1/tasks", json={"title": "Test", "due": "bad-date"}
        ).status_code
        == 422
    )


def test_demo_sync_repeat(school, university):
    for _ in range(2):
        ok(school.post(P + "/groups/2/sync"))
        run_once("lms")
    people = ok(university.get(P + "/groups/2/participants"))
    assert all(p["result"]["progress"] == 100 for p in people)
    with SessionLocal() as db:
        ids = [p["id"] for p in people]
        assert db.scalar(
            select(func.count())
            .select_from(Result)
            .where(Result.participant_id.in_(ids))
        ) == len(ids)


def test_failed_job_retry_and_payload_hidden(school, colleague, monkeypatch):
    import smtplib

    def broken(*a, **kw):
        raise OSError("sensitive error")

    monkeypatch.setattr(smtplib, "SMTP", broken)
    ok(school.post(P + "/universities/1/invite", json={"email": "failed@example.test"}))
    run_once()
    jobs = ok(school.get(P + "/jobs"))
    assert (
        jobs[0]["status"] == "failed"
        and "payload" not in jobs[0]
        and "sensitive" not in jobs[0]["error"]
    )
    assert colleague.post(P + f"/jobs/{jobs[0]['id']}/retry").status_code == 404
    ok(school.post(P + f"/jobs/{jobs[0]['id']}/retry"))


def test_report_csv_scope(school, colleague):
    report = ok(school.get(P + "/reports"))
    assert report["total"] == 6
    assert ok(colleague.get(P + "/reports"))["total"] == 1
    csv = school.get(P + "/reports/export")
    assert csv.status_code == 200
    assert "Аналитика · новый партнёр" not in csv.text


def test_restart_persists(school):
    new = new_deal(school)
    with SessionLocal() as db:
        assert db.get(Deal, new["id"]).title == new["title"]


def test_comment_edit_delete_and_initials(school, university, other):
    created = ok(
        university.post(P + "/deals/1/comments", json={"text": "Уточните практику"})
    )
    assert created["author_initials"] == "ИЛ"
    assert created["mine"] is True
    assert created["edited"] is False
    assert "actor_id" not in created
    school_view = ok(school.get(P + "/deals/1"))
    visible = next(a for a in school_view["activities"] if a["id"] == created["id"])
    assert visible["author_initials"] == "ИЛ" and visible["mine"] is False
    own = next(
        a for a in school_view["activities"] if a["kind"] == "comment" and a["mine"]
    )
    assert own["author_initials"] == "АС"
    assert (
        school.put(
            P + f"/comments/{created['id']}", json={"text": "Чужая правка"}
        ).status_code
        == 403
    )
    assert other.delete(P + f"/comments/{created['id']}").status_code == 404
    assert university.delete(P + f"/comments/{own['id']}").status_code == 403
    edited = ok(
        university.put(
            P + f"/comments/{created['id']}", json={"text": "Практика в сентябре"}
        )
    )
    assert edited["edited"] is True and edited["text"] == "Практика в сентябре"
    ok(university.delete(P + f"/comments/{created['id']}"))
    assert all(
        a["id"] != created["id"] for a in ok(school.get(P + "/deals/1"))["activities"]
    )
