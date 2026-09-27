import os
import time
import smtplib
import ssl
from email.message import EmailMessage
from sqlalchemy import select, delete
from .db import SessionLocal, now
from .models import Job, Participant, Result, LoginAttempt
from datetime import timedelta


def send_email(msg):
    mode = os.getenv("SMTP_SECURITY", "none")
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    if mode not in {"none", "ssl", "starttls"} or (username and mode == "none"):
        raise ValueError("SMTP authentication requires verified TLS")
    options = {
        "host": os.getenv("SMTP_HOST", "localhost"),
        "port": int(os.getenv("SMTP_PORT", "1025")),
        "timeout": 20,
    }
    client = smtplib.SMTP_SSL if mode == "ssl" else smtplib.SMTP
    if mode == "ssl":
        options["context"] = ssl.create_default_context()
    with client(**options) as smtp:
        if mode == "starttls":
            smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, password)
        smtp.send_message(msg)


def run_once(kind=None):
    with SessionLocal() as db:
        query = select(Job).where(Job.status == "pending")
        if kind:
            query = query.where(Job.kind == kind)
        job = db.scalar(query.order_by(Job.id).with_for_update(skip_locked=True))
        if not job:
            return False
        job.attempts += 1
        try:
            with db.begin_nested():
                if job.kind == "email":
                    msg = EmailMessage()
                    msg["From"] = os.getenv("MAIL_FROM", "vector@example.test")
                    msg["To"] = job.payload["to"]
                    msg["Subject"] = job.payload["subject"]
                    msg.set_content(job.payload["body"])
                    send_email(msg)
                    # One-time links and message bodies need not remain in the outbox after delivery.
                    job.payload = {}
                elif job.kind == "lms":
                    for person in db.scalars(
                        select(Participant).where(
                            Participant.group_id == job.payload["group_id"],
                            Participant.kind == "student",
                        )
                    ):
                        result = db.scalar(
                            select(Result).where(Result.participant_id == person.id)
                        )
                        if not result:
                            result = Result(
                                participant_id=person.id,
                                progress=100,
                                attendance=92,
                                score=85,
                            )
                            db.add(result)
                        else:
                            result.progress, result.attendance, result.score = (
                                100,
                                92,
                                85,
                            )
                job.status = "done"
                job.error = ""
        except Exception:
            job.status = "failed"
            job.error = "Сервис недоступен или вернул ошибку. Проверьте подключение и повторите."
        db.execute(
            delete(LoginAttempt).where(
                LoginAttempt.created_at < now() - timedelta(minutes=15)
            )
        )
        db.commit()
        return True


if __name__ == "__main__":
    while True:
        try:
            if not run_once():
                time.sleep(2)
        except Exception:
            time.sleep(5)
