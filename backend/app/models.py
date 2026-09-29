from datetime import datetime
from sqlalchemy import String, ForeignKey, JSON, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, now


class Identity:
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=now)


class User(Identity, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str]
    password: Mapped[str]
    role: Mapped[str]
    university_id: Mapped[int | None] = mapped_column(ForeignKey("universities.id"))
    active: Mapped[bool] = mapped_column(default=True)


class University(Identity, Base):
    __tablename__ = "universities"
    name: Mapped[str]
    region: Mapped[str] = mapped_column(default="")
    profile: Mapped[str] = mapped_column(default="")
    accreditation: Mapped[str] = mapped_column(default="Не указана")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", use_alter=True, name="fk_university_owner")
    )


class Session(Identity, Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(unique=True)
    csrf: Mapped[str]
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires: Mapped[datetime]


class Token(Identity, Base):
    __tablename__ = "tokens"
    token: Mapped[str] = mapped_column(unique=True)
    kind: Mapped[str]
    email: Mapped[str]
    university_id: Mapped[int | None] = mapped_column(ForeignKey("universities.id"))
    expires: Mapped[datetime]
    used: Mapped[bool] = mapped_column(default=False)


class LoginAttempt(Identity, Base):
    __tablename__ = "login_attempts"
    key: Mapped[str] = mapped_column(index=True)


class Contact(Identity, Base):
    __tablename__ = "contacts"
    university_id: Mapped[int] = mapped_column(ForeignKey("universities.id"))
    name: Mapped[str]
    position: Mapped[str] = mapped_column(default="")
    email: Mapped[str] = mapped_column(default="")
    phone: Mapped[str] = mapped_column(default="")


class Program(Identity, Base):
    __tablename__ = "programs"
    name: Mapped[str]
    direction: Mapped[str]
    competencies: Mapped[str] = mapped_column(Text, default="")
    tools: Mapped[str] = mapped_column(default="")


class Vendor(Identity, Base):
    __tablename__ = "vendors"
    company: Mapped[str]
    product: Mapped[str]
    contact: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("company", "product"),)


class Deal(Identity, Base):
    __tablename__ = "deals"
    university_id: Mapped[int] = mapped_column(ForeignKey("universities.id"))
    program_id: Mapped[int] = mapped_column(ForeignKey("programs.id"))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str]
    stage: Mapped[str] = mapped_column(default="new")
    deadline: Mapped[str] = mapped_column(default="")
    qualification: Mapped[dict] = mapped_column(JSON, default=dict)
    preparation: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))
    closed_at: Mapped[datetime | None]


class Proposal(Identity, Base):
    __tablename__ = "proposals"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    version: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(default="pending")
    comment: Mapped[str] = mapped_column(Text, default="")
    __table_args__ = (UniqueConstraint("deal_id", "version"),)


class Activity(Identity, Base):
    __tablename__ = "activities"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str]
    text: Mapped[str] = mapped_column(Text)
    shared: Mapped[bool] = mapped_column(default=False)
    edited: Mapped[bool] = mapped_column(default=False, server_default=false())


class Task(Identity, Base):
    __tablename__ = "tasks"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str]
    due: Mapped[str]
    status: Mapped[str] = mapped_column(default="open")
    audience: Mapped[str] = mapped_column(default="school")


class Document(Identity, Base):
    __tablename__ = "documents"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    name: Mapped[str]
    path: Mapped[str]
    kind: Mapped[str]
    version: Mapped[int]
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Group(Identity, Base):
    __tablename__ = "groups"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    name: Mapped[str]
    confirmed: Mapped[bool] = mapped_column(default=False)
    started: Mapped[bool] = mapped_column(default=False)


class Participant(Identity, Base):
    __tablename__ = "participants"
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str]
    email: Mapped[str]
    phone: Mapped[str] = mapped_column(default="")
    kind: Mapped[str] = mapped_column(default="student")
    __table_args__ = (UniqueConstraint("group_id", "email"),)


class Result(Identity, Base):
    __tablename__ = "results"
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id"), unique=True
    )
    progress: Mapped[int]
    attendance: Mapped[int]
    score: Mapped[int]
    source: Mapped[str] = mapped_column(default="Демонстрационная LMS")


class Application(Identity, Base):
    __tablename__ = "applications"
    external_id: Mapped[str] = mapped_column(unique=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    course: Mapped[str]
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id"))


class Expansion(Identity, Base):
    __tablename__ = "expansions"
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    text: Mapped[str]
    status: Mapped[str] = mapped_column(default="pending")
    new_deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))


class Notification(Identity, Base):
    __tablename__ = "notifications"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str]
    deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))
    read: Mapped[bool] = mapped_column(default=False)


class Audit(Identity, Base):
    __tablename__ = "audit"
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str]
    entity: Mapped[str]
    entity_id: Mapped[int]


class Job(Identity, Base):
    __tablename__ = "jobs"
    kind: Mapped[str]
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(default="pending")
    error: Mapped[str] = mapped_column(default="")
    attempts: Mapped[int] = mapped_column(default=0)
    deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
