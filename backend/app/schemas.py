from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, field_validator, AfterValidator
from email_validator import validate_email, EmailNotValidError


def valid_email(value: str) -> str:
    try:
        return validate_email(
            value, check_deliverability=False, test_environment=True
        ).normalized
    except EmailNotValidError as exc:
        raise ValueError("Некорректный email") from exc


EmailStr = Annotated[str, AfterValidator(valid_email)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: EmailStr
    password: str
    role: Literal["school", "university"]


class EmailInput(Input):
    email: EmailStr


class AcceptToken(Input):
    token: str
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default="Менеджер вуза", min_length=2, max_length=120)


class UniversityInput(Input):
    name: str = Field(min_length=2, max_length=250)
    region: str = ""
    profile: str = ""
    accreditation: str = "Не указана"
    details: dict[str, str] = Field(default_factory=dict)


class ContactInput(Input):
    name: str = Field(min_length=2)
    position: str = ""
    email: EmailStr
    phone: str = ""


class ProgramInput(Input):
    name: str = Field(min_length=2)
    direction: str = Field(min_length=2)
    competencies: str = ""
    tools: str = ""


class DealInput(Input):
    university_id: int
    program_id: int
    title: str = Field(min_length=2)
    deadline: str = ""

    @field_validator("deadline")
    @classmethod
    def valid_deadline(cls, value):
        from datetime import date

        if value:
            date.fromisoformat(value)
        return value


class DealEdit(Input):
    title: str = Field(min_length=2)
    deadline: str = ""
    qualification: dict[str, str] = Field(default_factory=dict)
    preparation: dict[str, str] = Field(default_factory=dict)
    notes: str = ""

    @field_validator("deadline")
    @classmethod
    def valid_deadline(cls, value):
        return DealInput.valid_deadline(value)


class Transition(Input):
    stage: Literal[
        "new",
        "qualification",
        "approval",
        "contract",
        "preparation",
        "training",
        "evaluation",
        "completed",
        "rejected",
    ]
    reason: str = ""


class Content(Input):
    content: str = Field(min_length=2, max_length=20000)


class Decision(Input):
    status: Literal["approved", "changes", "rejected"]
    comment: str = ""


class TextInput(Input):
    text: str = Field(min_length=2, max_length=10000)


class TaskInput(Input):
    title: str = Field(min_length=2)
    due: str
    audience: Literal["school", "university"] = "school"

    @field_validator("due")
    @classmethod
    def date_valid(cls, value):
        from datetime import date

        date.fromisoformat(value)
        return value


class Communication(TaskInput):
    kind: Literal["call", "meeting", "message", "email"]
    text: str = Field(min_length=2)
    recipient: EmailStr | None = None


class TaskStatus(Input):
    status: Literal["open", "done"]


class NameInput(Input):
    name: str = Field(min_length=2, max_length=250)


class ParticipantInput(Input):
    name: str = Field(min_length=2)
    email: EmailStr
    phone: str = ""
    kind: Literal["student", "teacher"] = "student"


class ExpansionAccept(Input):
    program_id: int
    title: str = Field(min_length=2)


class WebsiteApplication(Input):
    external_id: str = Field(min_length=3, max_length=200)
    group_id: int
    course: str
    participant: ParticipantInput
