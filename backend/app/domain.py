from fastapi import HTTPException
from sqlalchemy import select, func
from .models import *
from .security import fail, school

STAGES = [
    "new",
    "qualification",
    "approval",
    "contract",
    "preparation",
    "training",
    "evaluation",
    "completed",
]
LABELS = dict(
    zip(
        STAGES,
        [
            "Новый контакт",
            "Квалификация",
            "Согласование",
            "Договор",
            "Подготовка",
            "Обучение",
            "Результаты",
            "Завершено",
        ],
    )
) | {"rejected": "Отказ"}
PREPARATION = {
    "materials": "Материалы",
    "licenses": "Лицензии",
    "teachers": "Обучение преподавателей",
    "curriculum": "Учебная программа",
}


def record(db, cls, ident, lock=False):
    q = select(cls).where(cls.id == ident)
    obj = db.scalar(q.with_for_update() if lock else q)
    if obj is None:
        fail("Запись не найдена", 404)
    return obj


def uni_access(db, user, ident, write=False):
    obj = record(db, University, ident, lock=write)
    if user.role == "university" and obj.id != user.university_id:
        fail("Запись не найдена", 404)
    if write and user.role == "school" and obj.owner_id != user.id:
        fail("Редактировать можно только закреплённый вуз", 403)
    return obj


def deal_access(db, user, ident, write=False, lock=False):
    obj = record(db, Deal, ident, lock)
    allowed = (
        obj.owner_id == user.id
        if user.role == "school"
        else obj.university_id == user.university_id
    )
    if not allowed:
        fail("Сделка не найдена", 404)
    if write:
        school(user)
    return obj


def group_access(db, user, ident, editable=False, personal=False):
    obj = record(db, Group, ident, lock=editable)
    deal_access(db, user, obj.deal_id)
    if personal and user.role != "university":
        fail("Списки участников доступны только вузу", 403)
    if editable and obj.started:
        fail("После начала обучения состав группы заблокирован", 409)
    return obj


def public(obj, exclude=()):
    return {
        col.name: getattr(obj, col.name)
        for col in obj.__table__.columns
        if col.name not in exclude
    }


def latest_proposal(db, deal):
    return db.scalar(
        select(Proposal)
        .where(Proposal.deal_id == deal.id)
        .order_by(Proposal.version.desc())
    )


def aggregate(db, group):
    people = list(
        db.scalars(
            select(Participant).where(
                Participant.group_id == group.id, Participant.kind == "student"
            )
        )
    )
    ids = [p.id for p in people]
    results = (
        list(db.scalars(select(Result).where(Result.participant_id.in_(ids))))
        if ids
        else []
    )
    return public(group) | {
        "students": len(people),
        "results": len(results),
        "progress": round(sum(r.progress for r in results) / len(people))
        if people
        else 0,
        "attendance": round(sum(r.attendance for r in results) / len(people))
        if people
        else 0,
        "completed": sum(r.progress == 100 for r in results),
        "source": "Демонстрационная LMS",
    }


def deal_view(db, user, deal):
    groups = list(db.scalars(select(Group).where(Group.deal_id == deal.id)))
    uni = db.get(University, deal.university_id)
    program = db.get(Program, deal.program_id)
    proposal = latest_proposal(db, deal)
    excluded = (
        ("qualification", "notes", "owner_id") if user.role == "university" else ()
    )
    return public(deal, excluded) | {
        "university_name": uni.name,
        "program_name": program.name,
        "stage_label": LABELS[deal.stage],
        "proposal_status": proposal.status if proposal else "none",
        "groups": [aggregate(db, g) for g in groups],
    }


def validate_transition(db, deal, target, reason):
    if target == deal.stage:
        fail("Сделка уже на этом этапе", 409)
    if target == "rejected":
        if not reason.strip():
            fail("Укажите причину отказа")
        return
    if deal.stage == "rejected" or STAGES.index(target) < STAGES.index(deal.stage):
        if not reason.strip():
            fail("Укажите причину возврата")
    elif STAGES.index(target) != STAGES.index(deal.stage) + 1:
        fail("Переходите последовательно по этапам")
    index = STAGES.index(target)
    if index >= 2 and not all(
        deal.qualification.get(k, "").strip()
        for k in ("contact", "interest", "budget", "window")
    ):
        fail("Заполните квалификацию: ответственный, интерес, бюджет, учебное окно")
    proposal = latest_proposal(db, deal)
    if index >= 3 and (not proposal or proposal.status != "approved"):
        fail("Нужна согласованная актуальная версия программы")
    groups = list(
        db.scalars(select(Group).where(Group.deal_id == deal.id).with_for_update())
    )
    if index >= 5:
        if not db.scalar(
            select(Document.id).where(
                Document.deal_id == deal.id, Document.kind == "signed_contract"
            )
        ):
            fail("Загрузите подписанный договор")
        if not groups or any(not g.confirmed for g in groups):
            fail("Подтвердите списки всех групп")
        if any(
            not (
                deal.preparation.get(k) == "done"
                or (
                    deal.preparation.get(k, "").startswith("na:")
                    and len(deal.preparation[k][3:].strip()) >= 3
                )
            )
            for k in PREPARATION
        ):
            fail("Завершите контрольные пункты подготовки или объясните неприменимость")
    if index >= 6 and any(
        aggregate(db, g)["results"] < aggregate(db, g)["students"] for g in groups
    ):
        fail("Дождитесь результатов всех студентов")
    if index >= 7 and any(
        aggregate(db, g)["completed"] < aggregate(db, g)["students"] for g in groups
    ):
        fail("Не все студенты завершили обучение")


def advance_approved(db, deal):
    steps = []
    while deal.stage in ("new", "qualification", "approval"):
        target = STAGES[STAGES.index(deal.stage) + 1]
        try:
            validate_transition(db, deal, target, "Программа согласована вузом")
        except HTTPException:
            break
        previous = deal.stage
        deal.stage = target
        steps.append((previous, target))
        if target == "contract":
            break
    return steps
