import hashlib
import secrets
from fastapi import Depends, HTTPException, Request
from argon2 import PasswordHasher
from sqlalchemy import select
from .db import get_db, now
from .models import Session, User, Audit, Notification, Job
import os

hasher = PasswordHasher()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fail(detail, code=400):
    raise HTTPException(code, detail)


def current_user(request: Request, db=Depends(get_db, scope="function")):
    raw = request.cookies.get("vector_session", "")
    session = db.scalar(
        select(Session).where(Session.token == digest(raw), Session.expires > now())
    )
    if not session:
        fail("Войдите в систему", 401)
    user = db.get(User, session.user_id)
    if not user or not user.active or user.role not in ("school", "university"):
        fail("Доступ запрещён", 403)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not secrets.compare_digest(
            request.headers.get("X-CSRF-Token", ""), session.csrf
        ):
            fail("Недействительный CSRF-токен", 403)
    request.state.session = session
    return user


def school(user):
    if user.role != "school":
        fail("Доступно менеджеру ИТ-школы", 403)


def university_role(user):
    if user.role != "university":
        fail("Персональные данные доступны только своему вузу", 403)


def audit(db, user, action, obj):
    db.flush()
    db.add(
        Audit(
            actor_id=user.id if user else None,
            action=action,
            entity=obj.__tablename__,
            entity_id=obj.id,
        )
    )


def notify(db, deal, text, role):
    query = select(User).where(User.active.is_(True))
    query = (
        query.where(User.id == deal.owner_id)
        if role == "school"
        else query.where(
            User.university_id == deal.university_id, User.role == "university"
        )
    )
    for user in db.scalars(query):
        db.add(Notification(user_id=user.id, text=text, deal_id=deal.id))
        db.add(
            Job(
                kind="email",
                owner_id=user.id,
                deal_id=deal.id,
                payload={
                    "to": user.email,
                    "subject": "РТК Вектор — обновление сотрудничества",
                    "title": "Новости сотрудничества",
                    "paragraphs": [
                        text,
                        "Откройте карточку сотрудничества, чтобы посмотреть изменения и следующие действия.",
                    ],
                    "action_label": "Открыть сотрудничество",
                    "action_url": os.getenv(
                        "FRONTEND_URL", "http://localhost:5173"
                    ).rstrip("/")
                    + f"/deals/{deal.id}",
                    "body": text
                    + "\n"
                    + os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
                    + f"/deals/{deal.id}",
                },
            )
        )
