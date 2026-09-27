from email.message import EmailMessage
import ssl
from unittest.mock import MagicMock
import pytest
from app.worker import send_email


def test_smtp_credentials_require_tls(monkeypatch):
    monkeypatch.setenv("SMTP_SECURITY", "none")
    monkeypatch.setenv("SMTP_USERNAME", "sender@example.org")
    connect = MagicMock()
    monkeypatch.setattr("app.worker.smtplib.SMTP", connect)
    with pytest.raises(ValueError):
        send_email(EmailMessage())
    connect.assert_not_called()


@pytest.mark.parametrize("mode", ["ssl", "starttls"])
def test_smtp_verifies_certificate_and_authenticates(monkeypatch, mode):
    monkeypatch.setenv("SMTP_SECURITY", mode)
    monkeypatch.setenv("SMTP_USERNAME", "sender@example.org")
    monkeypatch.setenv("SMTP_PASSWORD", "test-application-password")
    connect = MagicMock()
    monkeypatch.setattr("app.worker.smtplib.SMTP_SSL" if mode == "ssl" else "app.worker.smtplib.SMTP", connect)
    message = EmailMessage()
    send_email(message)
    smtp = connect.return_value.__enter__.return_value
    context = connect.call_args.kwargs["context"] if mode == "ssl" else smtp.starttls.call_args.kwargs["context"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname
    smtp.login.assert_called_once_with("sender@example.org", "test-application-password")
    smtp.send_message.assert_called_once_with(message)
