import csv
import io
import os
import secrets
import zipfile
from datetime import timedelta
from pathlib import Path
from fastapi import FastAPI, Depends, Request, Response, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, func, delete, text
from sqlalchemy.exc import IntegrityError
from .db import get_db, now
from .models import *
from .schemas import *
from .security import *
from .domain import *
from .imports import parse_import, prepare_import, apply_import, phone
from .emails import token_payload

app = FastAPI(
    title="РТК Вектор API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
    redoc_url=None,
)
PREFIX = "/api/v1"
STORAGE = Path(os.getenv("STORAGE_PATH", "./storage")).resolve()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


@app.exception_handler(IntegrityError)
async def conflict_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=409,
        content={
            "detail": "Запись уже существует или была изменена. Обновите страницу."
        },
    )


@app.middleware("http")
async def security_headers(request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin != FRONTEND_URL:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=403, content={"detail": "Недопустимый источник запроса"}
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get(PREFIX + "/health")
def health(db=Depends(get_db, scope="function")):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


def limit(db, key, maximum=10):
    count = db.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.key == key,
            LoginAttempt.created_at > now() - timedelta(minutes=15),
        )
    )
    if count >= maximum:
        fail("Слишком много попыток. Повторите через 15 минут", 429)
    db.add(LoginAttempt(key=key))
    db.commit()


@app.post(PREFIX + "/auth/login")
def login(
    body: Login,
    request: Request,
    response: Response,
    db=Depends(get_db, scope="function"),
):
    limit(db, "login:" + digest(body.email.lower()))
    client_ip = request.client.host
    # Enable only behind the private nginx listener and trusted Caddy ingress.
    if os.getenv("TRUST_PROXY_HEADERS") == "true":
        client_ip = (
            request.headers.get("x-forwarded-for", client_ip).split(",")[0].strip()
        )
    limit(db, "ip:" + digest(client_ip), 100)
    user = db.scalar(
        select(User).where(User.email == body.email.lower(), User.active.is_(True))
    )
    valid = False
    try:
        valid = hasher.verify(user.password if user else DUMMY_HASH, body.password)
    except Exception:
        pass
    if not valid or not user or user.role != body.role:
        fail("Неверные данные входа или выбранная роль", 401)
    db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.key == "login:" + digest(body.email.lower())
        )
    )
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    session = Session(
        user_id=user.id,
        token=digest(token),
        csrf=csrf,
        expires=now() + timedelta(hours=12),
    )
    db.add(session)
    response.set_cookie(
        "vector_session",
        token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false") == "true",
        max_age=43200,
    )
    return {"user": public(user, ("password",)), "csrf": csrf}


DUMMY_HASH = hasher.hash("unused-timing-comparison-secret")


@app.get(PREFIX + "/auth/me")
def me(request: Request, user=Depends(current_user)):
    return {"user": public(user, ("password",)), "csrf": request.state.session.csrf}


@app.post(PREFIX + "/auth/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    db.delete(request.state.session)
    response.delete_cookie("vector_session")
    return {"ok": True}


def send_token(db, email, kind, university_id=None, owner_id=None):
    raw = secrets.token_urlsafe(32)
    for old in db.scalars(
        select(Token).where(
            Token.email == email, Token.kind == kind, Token.used.is_(False)
        )
    ):
        old.used = True
    db.add(
        Token(
            token=digest(raw),
            email=email,
            kind=kind,
            university_id=university_id,
            expires=now() + timedelta(hours=72 if kind == "invite" else 1),
        )
    )
    db.add(
        Job(
            kind="email",
            owner_id=owner_id,
            payload=token_payload(email, kind, f"{FRONTEND_URL}/accept?token={raw}"),
        )
    )


@app.post(PREFIX + "/auth/forgot")
def forgot(body: EmailInput, db=Depends(get_db, scope="function")):
    email = body.email.lower()
    limit(db, "reset:" + digest(email), 5)
    if db.scalar(select(User).where(User.email == email, User.active.is_(True))):
        send_token(db, email, "reset")
    return {"message": "Если аккаунт существует, письмо отправлено"}


@app.post(PREFIX + "/auth/accept")
def accept(body: AcceptToken, db=Depends(get_db, scope="function")):
    token = db.scalar(
        select(Token).where(Token.token == digest(body.token)).with_for_update()
    )
    if not token or token.used or token.expires < now():
        fail("Ссылка недействительна или срок её действия истёк")
    user = db.scalar(select(User).where(User.email == token.email))
    if token.kind == "invite":
        if user:
            fail("Пользователь уже существует. Используйте восстановление пароля", 409)
        user = User(
            email=token.email,
            name=body.name,
            password=hasher.hash(body.password),
            role="university",
            university_id=token.university_id,
        )
        db.add(user)
    else:
        if not user or not user.active:
            fail("Ссылка недействительна")
        user.password = hasher.hash(body.password)
        db.execute(delete(Session).where(Session.user_id == user.id))
    token.used = True
    audit(db, user, "account." + token.kind, user)
    return {"ok": True}


@app.get(PREFIX + "/universities")
def universities(
    q: str = "",
    region: str = "",
    profile: str = "",
    accreditation: str = "",
    direction: str = "",
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    query = select(University).order_by(University.name)
    if user.role == "university":
        query = query.where(University.id == user.university_id)
    for col, value in [
        (University.name, q),
        (University.region, region),
        (University.profile, profile),
        (University.accreditation, accreditation),
    ]:
        if value:
            query = query.where(col.ilike("%" + value + "%"))
    items = [
        public(u) | {"editable": user.role == "university" or u.owner_id == user.id}
        for u in db.scalars(query)
    ]
    return [
        u
        for u in items
        if not direction
        or direction.casefold() in u["details"].get("directions", "").casefold()
    ]


@app.post(PREFIX + "/universities")
def create_university(
    body: UniversityInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    school(user)
    obj = University(**body.model_dump(), owner_id=user.id)
    db.add(obj)
    audit(db, user, "create", obj)
    return public(obj)


@app.put(PREFIX + "/universities/{ident}")
def edit_university(
    ident: int,
    body: UniversityInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = uni_access(db, user, ident, True)
    for key, value in body.model_dump().items():
        setattr(obj, key, value)
    audit(db, user, "update", obj)
    return public(obj)


@app.post(PREFIX + "/universities/{ident}/invite")
def invite(
    ident: int,
    body: EmailInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    school(user)
    uni_access(db, user, ident, True)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        fail("Этот email уже зарегистрирован", 409)
    send_token(db, email, "invite", ident, user.id)
    return {"message": "Приглашение поставлено в очередь отправки."}


@app.get(PREFIX + "/universities/{ident}/contacts")
def contacts(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    uni_access(db, user, ident)
    return list(db.scalars(select(Contact).where(Contact.university_id == ident)))


@app.post(PREFIX + "/universities/{ident}/contacts")
def add_contact(
    ident: int,
    body: ContactInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    uni_access(db, user, ident, True)
    email = body.email.lower()
    if db.scalar(
        select(Contact).where(Contact.university_id == ident, Contact.email == email)
    ):
        fail("Контакт с этим email уже существует", 409)
    obj = Contact(
        **(body.model_dump() | {"email": email, "phone": phone(body.phone)}),
        university_id=ident,
    )
    db.add(obj)
    audit(db, user, "create", obj)
    return public(obj)


@app.put(PREFIX + "/contacts/{ident}")
def edit_contact(
    ident: int,
    body: ContactInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = record(db, Contact, ident)
    uni_access(db, user, obj.university_id, True)
    if db.scalar(
        select(Contact).where(
            Contact.university_id == obj.university_id,
            Contact.email == body.email.lower(),
            Contact.id != ident,
        )
    ):
        fail("Контакт с этим email уже существует", 409)
    for k, v in (
        body.model_dump() | {"email": body.email.lower(), "phone": phone(body.phone)}
    ).items():
        setattr(obj, k, v)
    audit(db, user, "update", obj)
    return public(obj)


@app.get(PREFIX + "/programs")
def programs(user=Depends(current_user), db=Depends(get_db, scope="function")):
    return list(db.scalars(select(Program).order_by(Program.id)))


@app.post(PREFIX + "/programs")
def create_program(
    body: ProgramInput, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    school(user)
    obj = Program(**body.model_dump())
    db.add(obj)
    audit(db, user, "create", obj)
    return public(obj)


@app.get(PREFIX + "/vendors")
def vendors(user=Depends(current_user), db=Depends(get_db, scope="function")):
    school(user)
    return list(db.scalars(select(Vendor)))


@app.get(PREFIX + "/deals")
def deals(user=Depends(current_user), db=Depends(get_db, scope="function")):
    query = (
        select(Deal).where(Deal.owner_id == user.id)
        if user.role == "school"
        else select(Deal).where(Deal.university_id == user.university_id)
    )
    return [
        deal_view(db, user, d)
        for d in db.scalars(query.order_by(Deal.created_at.desc()))
    ]


@app.post(PREFIX + "/deals")
def create_deal(
    body: DealInput, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    school(user)
    uni_access(db, user, body.university_id, True)
    record(db, Program, body.program_id)
    obj = Deal(**body.model_dump(), owner_id=user.id)
    db.add(obj)
    audit(db, user, "create", obj)
    return deal_view(db, user, obj)


@app.get(PREFIX + "/deals/{ident}")
def deal_detail(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    obj = deal_access(db, user, ident)
    activities = select(Activity).where(Activity.deal_id == ident)
    tasks = select(Task).where(Task.deal_id == ident)
    if user.role == "university":
        activities = activities.where(Activity.shared.is_(True))
        tasks = tasks.where(Task.audience == "university")
    return deal_view(db, user, obj) | {
        "proposals": [
            public(p)
            for p in db.scalars(
                select(Proposal)
                .where(Proposal.deal_id == ident)
                .order_by(Proposal.version.desc())
            )
        ],
        "activities": [
            public(a)
            for a in db.scalars(activities.order_by(Activity.created_at.desc()))
        ],
        "tasks": [public(t) for t in db.scalars(tasks)],
        "documents": [
            public(d, ("path",))
            for d in db.scalars(select(Document).where(Document.deal_id == ident))
        ],
        "expansions": [
            public(e)
            for e in db.scalars(select(Expansion).where(Expansion.deal_id == ident))
        ],
    }


@app.put(PREFIX + "/deals/{ident}")
def edit_deal(
    ident: int,
    body: DealEdit,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = deal_access(db, user, ident, True, True)
    if obj.stage in ("completed", "rejected"):
        fail("Сначала верните сделку в работу", 409)
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    audit(db, user, "update", obj)
    return deal_view(db, user, obj)


@app.post(PREFIX + "/deals/{ident}/transition")
def transition(
    ident: int,
    body: Transition,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = deal_access(db, user, ident, True, True)
    validate_transition(db, obj, body.stage, body.reason)
    previous = obj.stage
    obj.stage = body.stage
    obj.closed_at = now() if obj.stage in ("completed", "rejected") else None
    if body.stage == "training":
        for g in db.scalars(select(Group).where(Group.deal_id == ident)):
            g.started = True
    db.add(
        Activity(
            deal_id=ident,
            actor_id=user.id,
            kind="stage",
            text=f"{LABELS[previous]} → {LABELS[body.stage]}. {body.reason}",
            shared=True,
        )
    )
    notify(db, obj, "Этап сотрудничества: " + LABELS[body.stage], "university")
    audit(db, user, "transition." + body.stage, obj)
    return deal_view(db, user, obj)


@app.post(PREFIX + "/deals/{ident}/proposals")
def proposal(
    ident: int,
    body: Content,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal = deal_access(db, user, ident, True, True)
    if deal.stage not in ("new", "qualification", "approval"):
        fail("Верните сделку на согласование перед новой версией", 409)
    old = latest_proposal(db, deal)
    obj = Proposal(
        deal_id=ident, content=body.content, version=old.version + 1 if old else 1
    )
    db.add(obj)
    audit(db, user, "proposal.publish", obj)
    notify(db, deal, "Новая версия программы ожидает согласования", "university")
    return public(obj)


@app.post(PREFIX + "/proposals/{ident}/decision")
def decide(
    ident: int,
    body: Decision,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    university_role(user)
    obj = record(db, Proposal, ident)
    deal = deal_access(db, user, obj.deal_id, lock=True)
    obj = record(db, Proposal, ident, True)
    if latest_proposal(db, deal).id != ident or deal.stage not in (
        "new",
        "qualification",
        "approval",
    ):
        fail("Эта версия больше не принимает решения", 409)
    if body.status != "approved" and not body.comment.strip():
        fail("Добавьте комментарий к решению")
    obj.status, obj.comment = body.status, body.comment
    decision_label = {
        "approved": "Согласовано",
        "changes": "Нужны изменения",
        "rejected": "Отклонено",
    }[body.status]
    db.add(
        Activity(
            deal_id=deal.id,
            actor_id=user.id,
            kind="decision",
            text=f"Версия {obj.version}: {decision_label}. {body.comment}",
            shared=True,
        )
    )
    notify(db, deal, "Вуз принял решение по программе: " + decision_label, "school")
    if body.status == "approved":
        db.flush()
        for previous, target in advance_approved(db, deal):
            db.add(
                Activity(
                    deal_id=deal.id,
                    actor_id=user.id,
                    kind="stage",
                    text=f"{LABELS[previous]} → {LABELS[target]}. Программа согласована вузом",
                    shared=True,
                )
            )
            audit(db, user, "transition." + target, deal)
        if deal.stage == "contract":
            notify(db, deal, "Этап сотрудничества: " + LABELS["contract"], "university")
    audit(db, user, "proposal." + body.status, obj)
    return public(obj)


@app.post(PREFIX + "/deals/{ident}/comments")
def comment(
    ident: int,
    body: TextInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal = deal_access(db, user, ident)
    obj = Activity(
        deal_id=ident, actor_id=user.id, kind="comment", text=body.text, shared=True
    )
    db.add(obj)
    audit(db, user, "comment", obj)
    notify(
        db,
        deal,
        "Новый комментарий к программе",
        "school" if user.role == "university" else "university",
    )
    return public(obj)


@app.post(PREFIX + "/deals/{ident}/communications")
def communication(
    ident: int,
    body: Communication,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal = deal_access(db, user, ident, True)
    obj = Activity(
        deal_id=ident, actor_id=user.id, kind=body.kind, text=body.text, shared=False
    )
    db.add(obj)
    if deal.stage not in ("completed", "rejected"):
        db.add(
            Task(
                deal_id=ident,
                owner_id=user.id,
                title=body.title,
                due=body.due,
                audience=body.audience,
            )
        )
    if body.kind == "email":
        if not body.recipient:
            fail("Укажите получателя")
        db.add(
            Job(
                kind="email",
                owner_id=user.id,
                deal_id=ident,
                payload={
                    "to": str(body.recipient),
                    "subject": deal.title,
                    "body": body.text,
                },
            )
        )
    audit(db, user, "communication", obj)
    return public(obj)


@app.get(PREFIX + "/tasks")
def tasks(user=Depends(current_user), db=Depends(get_db, scope="function")):
    query = select(Task, Deal.title).join(Deal)
    if user.role == "university":
        query = query.where(
            Deal.university_id == user.university_id, Task.audience == "university"
        )
    return [
        public(t)
        | {
            "deal_title": title,
            "editable": t.owner_id == user.id
            if user.role == "school"
            else t.audience == "university",
        }
        for t, title in db.execute(query.order_by(Task.due))
    ]


@app.post(PREFIX + "/deals/{ident}/tasks")
def create_task(
    ident: int,
    body: TaskInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal = deal_access(db, user, ident, True)
    obj = Task(deal_id=ident, owner_id=user.id, **body.model_dump())
    db.add(obj)
    audit(db, user, "task.create", obj)
    if body.audience == "university":
        notify(db, deal, "Задача для вуза: " + body.title, "university")
    return public(obj)


@app.patch(PREFIX + "/tasks/{ident}")
def task_status(
    ident: int,
    body: TaskStatus,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = record(db, Task, ident)
    if user.role == "school" and obj.owner_id != user.id:
        fail("Изменять можно только свои задачи", 403)
    deal_access(db, user, obj.deal_id)
    if user.role == "university" and obj.audience != "university":
        fail("Задача не найдена", 404)
    obj.status = body.status
    audit(db, user, "task." + body.status, obj)
    return public(obj)


@app.put(PREFIX + "/tasks/{ident}")
def edit_task(
    ident: int,
    body: TaskInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    school(user)
    obj = record(db, Task, ident, True)
    if obj.owner_id != user.id:
        fail("Изменять можно только свои задачи", 403)
    deal_access(db, user, obj.deal_id)
    for key, value in body.model_dump().items():
        setattr(obj, key, value)
    audit(db, user, "task.update", obj)
    return public(obj)


async def read_upload(file):
    data = await file.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        fail("Максимальный размер файла — 20 МБ", 413)
    if not data:
        fail("Файл пуст")
    return data


@app.post(PREFIX + "/deals/{ident}/documents")
async def upload_document(
    ident: int,
    kind: str = Form("material"),
    file: UploadFile = File(...),
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal_access(db, user, ident, lock=True)
    if kind not in ("material", "contract", "signed_contract"):
        fail("Неизвестный тип документа")
    data = await read_upload(file)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".pdf", ".docx", ".xlsx"):
        fail("Разрешены PDF, DOCX и XLSX")
    if ext == ".pdf" and not data.startswith(b"%PDF-"):
        fail("Файл не является PDF")
    if ext in (".docx", ".xlsx"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                expected = "word/document.xml" if ext == ".docx" else "xl/workbook.xml"
                if (
                    expected not in z.namelist()
                    or sum(i.file_size for i in z.infolist()) > 100 * 1024 * 1024
                ):
                    fail("Некорректный или слишком большой документ")
        except zipfile.BadZipFile:
            fail("Некорректный документ Office")
    STORAGE.mkdir(parents=True, exist_ok=True)
    path = secrets.token_hex(20) + ext
    (STORAGE / path).write_bytes(data)
    version = (
        db.scalar(
            select(func.max(Document.version)).where(
                Document.deal_id == ident, Document.kind == kind
            )
        )
        or 0
    )
    obj = Document(
        deal_id=ident,
        name=Path(file.filename).name,
        path=path,
        kind=kind,
        version=version + 1,
        uploader_id=user.id,
    )
    db.add(obj)
    audit(db, user, "document.upload", obj)
    return public(obj, ("path",))


@app.get(PREFIX + "/documents/{ident}/download")
def download(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    obj = record(db, Document, ident)
    deal_access(db, user, obj.deal_id)
    path = STORAGE / obj.path
    if not path.is_file():
        fail("Файл недоступен", 404)
    return FileResponse(path, filename=obj.name, media_type="application/octet-stream")


@app.post(PREFIX + "/deals/{ident}/groups")
def create_group(
    ident: int,
    body: NameInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    deal = deal_access(db, user, ident, lock=True)
    if deal.stage in ("training", "evaluation", "completed", "rejected"):
        fail("Для новой группы создайте продолжение сотрудничества", 409)
    obj = Group(deal_id=ident, name=body.name)
    db.add(obj)
    audit(db, user, "group.create", obj)
    return aggregate(db, obj)


@app.get(PREFIX + "/groups/{ident}/participants")
def participants(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    group_access(db, user, ident, personal=True)
    return [
        public(p)
        | {
            "result": public(r)
            if (r := db.scalar(select(Result).where(Result.participant_id == p.id)))
            else None
        }
        for p in db.scalars(select(Participant).where(Participant.group_id == ident))
    ]


@app.post(PREFIX + "/groups/{ident}/participants")
def add_participant(
    ident: int,
    body: ParticipantInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    group = group_access(db, user, ident, True, True)
    obj = Participant(
        group_id=ident,
        **(
            body.model_dump()
            | {"email": body.email.lower(), "phone": phone(body.phone)}
        ),
    )
    db.add(obj)
    group.confirmed = False
    audit(db, user, "participant.create", obj)
    return public(obj)


@app.put(PREFIX + "/participants/{ident}")
def edit_participant(
    ident: int,
    body: ParticipantInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = record(db, Participant, ident)
    group = group_access(db, user, obj.group_id, True, True)
    for k, v in (
        body.model_dump() | {"email": body.email.lower(), "phone": phone(body.phone)}
    ).items():
        setattr(obj, k, v)
    group.confirmed = False
    audit(db, user, "participant.update", obj)
    return public(obj)


@app.post(PREFIX + "/groups/{ident}/confirm")
def confirm_group(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    group = group_access(db, user, ident, True, True)
    if not db.scalar(
        select(Participant.id).where(
            Participant.group_id == ident, Participant.kind == "student"
        )
    ):
        fail("Добавьте хотя бы одного студента")
    group.confirmed = True
    audit(db, user, "group.confirm", group)
    return aggregate(db, group)


@app.post(PREFIX + "/groups/{ident}/import")
async def import_people(
    ident: int,
    file: UploadFile = File(...),
    commit: bool = Form(False),
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    group = group_access(db, user, ident, True, True)
    data = await read_upload(file)
    if (file.filename or "").lower().endswith(".xlsx"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if sum(i.file_size for i in z.infolist()) > 100 * 1024 * 1024:
                    fail("Слишком большой распакованный файл")
        except zipfile.BadZipFile:
            fail("Некорректный XLSX")
    rows, errors, ignored = parse_import(data, file.filename or "")
    prepare_import(db, group, rows, errors)
    if commit and errors:
        fail("Исправьте ошибки предпросмотра перед импортом", 409)
    count = apply_import(db, group, rows) if commit else 0
    if commit:
        audit(db, user, "participants.import", group)
    return {
        "rows": rows,
        "errors": errors,
        "ignored_columns": ignored,
        "created": count,
        "committed": commit,
    }


@app.post(PREFIX + "/groups/{ident}/sync")
def sync_group(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    group = group_access(db, user, ident)
    group = record(db, Group, ident, True)
    if not group.started:
        fail("Сначала начните обучение", 409)
    existing = db.scalar(
        select(Job).where(
            Job.kind == "lms",
            Job.payload["group_id"].as_integer() == ident,
            Job.status.in_(["pending", "running"]),
        )
    )
    if existing:
        return {"job_id": existing.id, "message": "Синхронизация уже запланирована"}
    job = Job(
        kind="lms", deal_id=group.deal_id, owner_id=user.id, payload={"group_id": ident}
    )
    db.add(job)
    audit(db, user, "lms.sync", group)
    return {
        "job_id": job.id,
        "message": "Демонстрационная синхронизация поставлена в очередь",
    }


@app.get(PREFIX + "/participants/{ident}/certificate")
def certificate(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    person = record(db, Participant, ident)
    group_access(db, user, person.group_id, personal=True)
    result = db.scalar(select(Result).where(Result.participant_id == ident))
    if not result or result.progress != 100 or result.score < 60:
        fail("Сертификат пока недоступен", 404)
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font = next(
        (
            p
            for p in [
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
                Path("C:/Windows/Fonts/arial.ttf"),
            ]
            if p.exists()
        ),
        None,
    )
    buf = io.BytesIO()
    canvas = Canvas(buf)
    if font:
        pdfmetrics.registerFont(TTFont("CertificateFont", str(font)))
        canvas.setFont("CertificateFont", 20)
    canvas.drawString(60, 730, "DEMO / РТК Вектор")
    canvas.drawString(60, 665, "Сертификат об обучении")
    canvas.setFont("CertificateFont" if font else "Helvetica", 14)
    canvas.drawString(60, 605, person.name[:65])
    canvas.drawString(60, 570, f"Результат: {result.score} / 100")
    canvas.drawString(60, 510, "Синтетический документ демонстрационной LMS")
    canvas.save()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="demo-certificate-{ident}.pdf"'
        },
    )


@app.post(PREFIX + "/deals/{ident}/feedback")
def feedback(
    ident: int,
    body: TextInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    university_role(user)
    deal = deal_access(db, user, ident)
    if deal.stage not in ("evaluation", "completed"):
        fail("Обратная связь доступна по итогам обучения")
    obj = Activity(
        deal_id=ident, actor_id=user.id, kind="feedback", text=body.text, shared=True
    )
    db.add(obj)
    audit(db, user, "feedback", obj)
    notify(db, deal, "Вуз оставил обратную связь", "school")
    return public(obj)


@app.post(PREFIX + "/deals/{ident}/expansions")
def expansion(
    ident: int,
    body: TextInput,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    university_role(user)
    deal = deal_access(db, user, ident)
    obj = Expansion(deal_id=ident, text=body.text)
    db.add(obj)
    audit(db, user, "expansion.request", obj)
    notify(db, deal, "Запрос на продолжение сотрудничества", "school")
    return public(obj)


@app.post(PREFIX + "/expansions/{ident}/accept")
def accept_expansion(
    ident: int,
    body: ExpansionAccept,
    user=Depends(current_user),
    db=Depends(get_db, scope="function"),
):
    obj = record(db, Expansion, ident, True)
    old = deal_access(db, user, obj.deal_id, True)
    if obj.status != "pending":
        fail("Запрос уже обработан", 409)
    record(db, Program, body.program_id)
    deal = Deal(
        university_id=old.university_id,
        owner_id=user.id,
        program_id=body.program_id,
        title=body.title,
        parent_id=old.id,
    )
    db.add(deal)
    db.flush()
    obj.status = "accepted"
    obj.new_deal_id = deal.id
    audit(db, user, "expansion.accept", obj)
    return public(deal)


@app.get(PREFIX + "/notifications")
def notifications(user=Depends(current_user), db=Depends(get_db, scope="function")):
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(100)
        )
    )


@app.post(PREFIX + "/notifications/{ident}/read")
def read_notification(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    obj = record(db, Notification, ident)
    if obj.user_id != user.id:
        fail("Запись не найдена", 404)
    obj.read = True
    return {"ok": True}


@app.get(PREFIX + "/jobs")
def jobs(user=Depends(current_user), db=Depends(get_db, scope="function")):
    return [
        public(j, ("payload",))
        for j in db.scalars(
            select(Job).where(Job.owner_id == user.id).order_by(Job.id.desc()).limit(50)
        )
    ]


@app.post(PREFIX + "/jobs/{ident}/retry")
def retry_job(
    ident: int, user=Depends(current_user), db=Depends(get_db, scope="function")
):
    obj = record(db, Job, ident, True)
    if obj.owner_id != user.id:
        fail("Запись не найдена", 404)
    if obj.status != "failed":
        fail("Повтор доступен только для ошибки")
    obj.status = "pending"
    obj.error = ""
    return {"ok": True}


def report_data(db, user):
    school(user)
    deals = list(db.scalars(select(Deal).where(Deal.owner_id == user.id)))
    tasks = list(db.scalars(select(Task).where(Task.owner_id == user.id)))
    stages = {key: sum(d.stage == key for d in deals) for key in LABELS}
    finished = [d for d in deals if d.closed_at]
    return {
        "total": len(deals),
        "stages": stages,
        "overdue": sum(
            t.status == "open" and t.due < now().date().isoformat() for t in tasks
        ),
        "conversion": round(stages["completed"] / len(finished) * 100, 1)
        if finished
        else 0,
        "conversion_definition": "Успешные / все закрытые сделки",
        "average_days": round(
            sum((d.closed_at - d.created_at).total_seconds() / 86400 for d in finished)
            / len(finished),
            1,
        )
        if finished
        else 0,
        "students": sum(
            aggregate(db, g)["students"]
            for d in deals
            for g in db.scalars(select(Group).where(Group.deal_id == d.id))
        ),
    }


@app.get(PREFIX + "/reports")
def reports(user=Depends(current_user), db=Depends(get_db, scope="function")):
    return report_data(db, user)


@app.get(PREFIX + "/reports/export")
def report_export(user=Depends(current_user), db=Depends(get_db, scope="function")):
    school(user)
    stream = io.StringIO()
    writer = csv.writer(stream, delimiter=";")
    writer.writerow(["Сделка", "Вуз", "Программа", "Этап", "Создана", "Закрыта"])

    def safe(value):
        value = str(value or "")
        return (
            "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value
        )

    for deal in db.scalars(select(Deal).where(Deal.owner_id == user.id)):
        writer.writerow(
            [
                safe(v)
                for v in [
                    deal.title,
                    db.get(University, deal.university_id).name,
                    db.get(Program, deal.program_id).name,
                    LABELS[deal.stage],
                    deal.created_at,
                    deal.closed_at,
                ]
            ]
        )
    return Response(
        "\ufeff" + stream.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="vector-deals.csv"'},
    )


@app.post(PREFIX + "/integrations/website/applications")
def website(
    body: WebsiteApplication, request: Request, db=Depends(get_db, scope="function")
):
    expected = os.getenv("WEBSITE_API_KEY", "")
    if not expected or not secrets.compare_digest(
        request.headers.get("X-Service-Key", ""), expected
    ):
        fail("Недействительный сервисный ключ", 401)
    group = record(db, Group, body.group_id, True)
    if group.started:
        fail("Приём участников завершён", 409)
    row = body.participant.model_dump() | {
        "row": 1,
        "email": body.participant.email.lower(),
        "phone": phone(body.participant.phone),
        "external_id": body.external_id,
        "course": body.course,
    }
    errors = []
    prepare_import(db, group, [row], errors)
    if errors:
        fail("Конфликт данных заявки", 409)
    count = apply_import(db, group, [row])
    audit(db, None, "website.import", group)
    return {"created": count, "external_id": body.external_id}
