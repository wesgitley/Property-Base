import hashlib
import logging
import os
import secrets
import smtplib
import string
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Ensure .env is loaded
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
load_dotenv(dotenv_path=BASE_DIR.parent / ".env", override=False)

logger = logging.getLogger(__name__)


def build_email_html(subject: str, heading: str, body_intro: str, code: Optional[str] = None, footer_note: Optional[str] = None) -> str:
    """Renders a clean, modern, responsive HTML email for Property Base security alerts and OTPs."""
    code_block = ""
    if code:
        code_block = f"""
        <div style="margin: 28px 0; text-align: center;">
            <div style="display: inline-block; background-color: #EEF2FF; border: 2px dashed #6366F1; border-radius: 12px; padding: 18px 36px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #3730A3; font-family: monospace;">
                {code}
            </div>
            <p style="margin-top: 10px; font-size: 13px; color: #6B7280;">Valid for 10 minutes. Do not share this code with anyone.</p>
        </div>
        """

    footer_content = footer_note or "If you did not request this verification code, please ignore this email or review your account security immediately."

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 30px 15px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1E1B4B; padding: 28px 32px; text-align: left;">
                            <table role="presentation" width="100%">
                                <tr>
                                    <td>
                                        <div style="display: inline-block; background-color: #4F46E5; border-radius: 8px; padding: 6px 12px; vertical-align: middle;">
                                            <span style="color: #FFFFFF; font-weight: 800; font-size: 16px; letter-spacing: 0.5px;">PB</span>
                                        </div>
                                        <span style="color: #FFFFFF; font-size: 20px; font-weight: 700; vertical-align: middle; margin-left: 10px;">Property Base</span>
                                    </td>
                                    <td align="right">
                                        <span style="background-color: rgba(255,255,255,0.12); color: #C7D2FE; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 600; text-transform: uppercase;">Security Service</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 36px 32px;">
                            <h2 style="margin: 0 0 12px 0; color: #0F172A; font-size: 22px; font-weight: 700;">{heading}</h2>
                            <p style="margin: 0 0 16px 0; color: #475569; font-size: 15px; line-height: 24px;">{body_intro}</p>
                            
                            {code_block}
                            
                            <div style="background-color: #F1F5F9; border-left: 4px solid #4F46E5; border-radius: 4px; padding: 12px 16px; margin-top: 24px;">
                                <p style="margin: 0; font-size: 13px; color: #475569; line-height: 20px;">
                                    <strong>Property Base Security Protocol:</strong> Our team will never ask you for your verification code or password via phone or email.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; text-align: center;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; color: #94A3B8;">{footer_content}</p>
                            <p style="margin: 0; font-size: 11px; color: #CBD5E1;">&copy; {datetime.now(timezone.utc).year} Property Base Security. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


class SimulatedMailbox:
    """
    Unified Email Service for Property Base (IR-04 & SMTP).
    Dispatches outbound security emails and verification codes via real SMTP (e.g., Gmail, SendGrid, Mailgun)
    when configured in .env, with automated in-memory tracking & server log fallback.
    """
    _inbox: List[Dict[str, Any]] = []

    @classmethod
    def send_smtp(
        cls,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
    ) -> bool:
        """Attempts sending email via configured SMTP server."""
        smtp_host = os.getenv("SMTP_HOST", "").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "").strip()
        smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
        from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user or "noreply@propertybase.com").strip()
        use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes") or smtp_port == 465
        use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

        if not smtp_host or not smtp_user or not smtp_password:
            logger.warning(
                f"[SMTP SKIPPED - NOT FULLY CONFIGURED] Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD in backend/.env to send real emails to {to_email}."
            )
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"Property Base Security <{from_email}>"
            msg["To"] = to_email

            # Attach plain text
            msg.attach(MIMEText(body_text, "plain", "utf-8"))

            # Attach HTML if provided
            if body_html:
                msg.attach(MIMEText(body_html, "html", "utf-8"))

            if use_ssl:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as server:
                    server.login(smtp_user, smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                    if use_tls:
                        server.starttls()
                    server.login(smtp_user, smtp_password)
                    server.send_message(msg)

            logger.info(f"✅ [SMTP SUCCESS] Successfully sent email to {to_email} via {smtp_host}:{smtp_port}")
            return True
        except Exception as e:
            logger.error(f"❌ [SMTP ERROR] Failed to send email via SMTP to {to_email}: {e}")
            return False

    @classmethod
    def send_email(
        cls,
        to_email: str,
        subject: str,
        body_text: str,
        category: str,
        payload_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Dispatches an email via SMTP and records in in-memory mailbox."""
        payload = payload_data or {}
        otp_code = payload.get("otp_code")

        # Prepare rich HTML body
        heading = "Verification Code" if otp_code else subject
        body_intro = body_text.split(".")[0] + "." if "." in body_text else body_text
        body_html = build_email_html(
            subject=subject,
            heading=heading,
            body_intro=body_text,
            code=otp_code,
        )

        # Attempt real SMTP transmission
        smtp_success = cls.send_smtp(
            to_email=to_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )

        email_record = {
            "id": secrets.token_hex(6),
            "to": to_email,
            "subject": subject,
            "body": body_text,
            "category": category,
            "payload": payload,
            "smtp_sent": smtp_success,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._inbox.insert(0, email_record)
        cls._inbox = cls._inbox[:50]

        # Always log prominent notification with OTP code in server terminal for transparency
        if otp_code:
            logger.info(f"🔑 [SECURITY CODE DISPATCH] To: {to_email} | CODE: [{otp_code}] | SMTP Sent: {smtp_success}")
        else:
            logger.info(f"📧 [EMAIL DISPATCH] To: {to_email} | Subject: {subject} | SMTP Sent: {smtp_success}")

        return email_record

    @classmethod
    def get_messages(cls, email: Optional[str] = None) -> List[Dict[str, Any]]:
        if email:
            return [m for m in cls._inbox if m["to"].lower() == email.lower()]
        return cls._inbox

    @classmethod
    def clear_messages(cls):
        cls._inbox.clear()


def generate_otp_code(length: int = 6) -> str:
    """Generates a secure numeric OTP code."""
    return "".join(secrets.choice(string.digits) for _ in range(length))


def generate_backup_codes(count: int = 8) -> List[str]:
    """Generates readable single-use 8-character backup recovery codes."""
    codes = []
    for _ in range(count):
        part1 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        part2 = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        codes.append(f"{part1}-{part2}")
    return codes


def hash_secret_code(code: str) -> str:
    """Hashes an OTP or backup code using SHA-256 for secure storage (NFR-02)."""
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()
