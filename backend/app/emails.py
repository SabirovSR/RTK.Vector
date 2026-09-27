"""Provider-independent, escaped HTML emails with a complete plain-text alternative."""

import os
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr
from html import escape
from urllib.parse import urlparse


def token_payload(recipient: str, kind: str, url: str) -> dict:
    if kind == "invite":
        title = "Добро пожаловать в РТК Вектор"
        intro = "Вас приглашают в кабинет университета — единое пространство сотрудничества с ИТ-школой."
        detail = "Согласовывайте программы, обменивайтесь документами и управляйте учебными группами. Чтобы начать, задайте пароль для своего аккаунта."
        button = "Принять приглашение"
        expiry = "Приглашение действует 72 часа и может быть использовано один раз."
        note = "Если вы не ожидали приглашения, уточните его у представителя ИТ-школы. Никому не передавайте эту персональную ссылку."
        subject = "Вас приглашают в РТК Вектор"
    else:
        title = "Восстановление доступа"
        intro = "Мы получили запрос на смену пароля вашего аккаунта в РТК Вектор."
        detail = "Нажмите кнопку ниже и задайте новый пароль. После смены пароля потребуется снова войти в систему на ваших устройствах."
        button = "Задать новый пароль"
        expiry = "Ссылка действует 1 час и может быть использована один раз."
        note = "Если вы не запрашивали смену пароля, просто проигнорируйте письмо. Ваш пароль останется прежним. Никому не передавайте эту ссылку."
        subject = "РТК Вектор — восстановление доступа"
    return {
        "to": recipient,
        "subject": subject,
        "title": title,
        "paragraphs": [intro, detail],
        "action_url": url,
        "action_label": button,
        "expiry": expiry,
        "note": note,
        "body": f"{title}\n\n{intro}\n\n{detail}\n\n{button}:\n{url}\n\n{expiry}\n\n{note}\n\nРТК Вектор · Пространство сотрудничества",
    }


def html_body(payload: dict) -> str:
    title = escape(payload.get("title", payload["subject"]))
    paragraphs = payload.get("paragraphs") or [payload["body"]]
    content = "".join(
        '<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#514b64">'
        + escape(text).replace("\n", "<br>")
        + "</p>"
        for text in paragraphs
    )
    action = ""
    url = payload.get("action_url", "")
    if url:
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("Email action requires an HTTP(S) URL")
        href = escape(url, quote=True)
        label = escape(payload.get("action_label", "Открыть РТК Вектор"))
        action = f'''<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 24px"><tr><td bgcolor="#6c3ce4" style="border-radius:10px;text-align:center"><a href="{href}" style="display:inline-block;padding:16px 26px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;line-height:22px">{label} &rarr;</a></td></tr></table>'''
        action += (
            '<p style="margin:0 0 22px;color:#756b87;font-size:13px;line-height:21px">'
            + escape(
                payload.get("expiry", "Откройте кабинет, чтобы посмотреть подробности.")
            )
            + "</p>"
        )
        action += f'''<div style="border-top:1px solid #ede8f5;padding-top:22px"><p style="margin:0 0 8px;color:#756b87;font-size:12px;line-height:19px">Если кнопка не открывается, скопируйте ссылку в браузер:</p><a href="{href}" style="font-size:12px;line-height:19px;color:#6c3ce4;word-break:break-all;overflow-wrap:anywhere">{href}</a></div>'''
    note = escape(
        payload.get(
            "note",
            "Это письмо отправлено из РТК Вектор в рамках вашего сотрудничества с ИТ-школой.",
        )
    )
    preheader = escape(str(paragraphs[0]))
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f5f3fa;font-family:Arial,Helvetica,sans-serif;color:#282039">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f3fa">{preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f5f3fa"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
<tr><td style="padding:0 8px 24px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px;color:#f28a46;font-size:34px;font-weight:bold;line-height:38px">/</td><td style="font-size:25px;line-height:32px;color:#312349">РТК <strong>Вектор</strong><br><span style="font-size:10px;line-height:16px;letter-spacing:1.4px;color:#8a7f9e">ПРОСТРАНСТВО СОТРУДНИЧЕСТВА</span></td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="border:1px solid #e8e1f2;border-radius:18px;overflow:hidden">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="#6c3ce4" height="5" style="height:5px;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:32px 28px">
<p style="margin:0 0 14px;font-size:11px;line-height:16px;letter-spacing:1.5px;font-weight:bold;color:#8b75b5">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
<h1 style="margin:0 0 22px;font-size:27px;line-height:35px;color:#282039">{title}</h1>
{content}{action}
</td></tr></table></td></tr>
<tr><td style="padding:22px 16px 8px"><p style="margin:0;color:#756b87;font-size:12px;line-height:20px">{note}</p></td></tr>
<tr><td style="padding:16px;color:#958ba6;font-size:11px;line-height:18px">РТК Вектор &nbsp;·&nbsp; ИТ-школа и университеты<br>У каждого партнёрства есть будущее.</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>"""


def build_message(payload: dict) -> EmailMessage:
    sender = parseaddr(os.getenv("MAIL_FROM", "vector@example.test"))[1]
    if not sender or "@" not in sender:
        raise ValueError("MAIL_FROM must be a valid sender address")
    message = EmailMessage()
    message["From"] = formataddr(("РТК Вектор", sender))
    message["To"] = payload["to"]
    message["Subject"] = payload["subject"]
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[1])
    message.set_content(payload["body"])
    message.add_alternative(html_body(payload), subtype="html")
    return message
