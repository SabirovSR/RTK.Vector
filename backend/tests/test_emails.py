import pytest
from email import policy
from email.parser import BytesParser
from app.emails import build_message, html_body, token_payload


@pytest.mark.parametrize("kind,expiry", [("reset", "1 час"), ("invite", "72 часа")])
def test_account_email_has_matching_html_and_plain_text(monkeypatch, kind, expiry):
    monkeypatch.setenv("MAIL_FROM", "noreply@vector.example.test")
    url = "https://vector.example.test/accept?token=secret&source=email"
    message = build_message(token_payload("recipient@example.test", kind, url))
    parsed = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
    text = parsed.get_body(preferencelist=("plain",)).get_content()
    html = parsed.get_body(preferencelist=("html",)).get_content()
    assert parsed.get_content_type() == "multipart/alternative"
    assert parsed["From"].addresses[0].display_name == "РТК Вектор"
    assert parsed["From"].addresses[0].addr_spec == "noreply@vector.example.test"
    assert url in text and "token=secret&amp;source=email" in html
    assert expiry in text and expiry in html
    assert parsed["Date"] and parsed["Message-ID"]
    assert "<script" not in html and "<img" not in html


def test_email_escapes_untrusted_content():
    html = html_body(
        {
            "subject": '<script>alert("x")</script>',
            "body": "<img src=x onerror=alert(1)> & text",
        }
    )
    assert "<script>" not in html and "<img src=x" not in html
    assert "&lt;script&gt;" in html and "&amp; text" in html


def test_email_rejects_unsafe_action_url():
    with pytest.raises(ValueError):
        html_body(
            {"subject": "Notice", "body": "Open", "action_url": "javascript:alert(1)"}
        )
