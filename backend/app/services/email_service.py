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


def build_contextual_push_email_html(
    subject: str,
    to_email: str,
    location: str,
    device_info: str,
    ip_address: str,
    timestamp_str: str,
    number_options: List[Dict[str, str]],
    deny_url: str,
) -> str:
    """
    Renders a Contextual Number-Matching Push Notification email for Gmail.
    Displays the login location, device, and IP address, and presents 3 different
    2-digit numbers (including the correct number shown on the web login screen)
    so the user can tap the matching number directly in the email.
    """
    buttons_td_html = ""
    for opt in number_options:
        num_str = opt.get("number", "--")
        tap_url = opt.get("url", "#")
        buttons_td_html += f"""
        <td width="33.33%" align="center" style="padding: 0 6px;">
            <a href="{tap_url}"
               style="display: block; background: linear-gradient(135deg, #4F46E5 0%, #3730A3 100%); background-color: #4F46E5; color: #FFFFFF; text-decoration: none; font-size: 28px; font-weight: 900; font-family: 'Courier New', Courier, monospace; padding: 18px 0; border-radius: 14px; border: 2px solid #312E81; box-shadow: 0 6px 14px rgba(79, 70, 229, 0.28); text-align: center; letter-spacing: 2px;">
                {num_str}
            </a>
        </td>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 28px 14px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); padding: 24px 28px; text-align: left;">
                            <table role="presentation" width="100%">
                                <tr>
                                    <td>
                                        <div style="display: inline-block; background-color: #4F46E5; border-radius: 8px; padding: 6px 12px; vertical-align: middle;">
                                            <span style="color: #FFFFFF; font-weight: 800; font-size: 15px;">PB</span>
                                        </div>
                                        <span style="color: #FFFFFF; font-size: 18px; font-weight: 800; vertical-align: middle; margin-left: 10px;">Property Base Authenticator</span>
                                    </td>
                                    <td align="right">
                                        <span style="background-color: rgba(16, 185, 129, 0.2); color: #6EE7B7; border: 1px solid rgba(110, 231, 183, 0.4); font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700; text-transform: uppercase;">Number Match</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 30px 28px;">
                            <h2 style="margin: 0 0 8px 0; color: #0F172A; font-size: 21px; font-weight: 800;">Are you trying to sign in?</h2>
                            <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 21px;">
                                A sign-in attempt requires <strong>Contextual Number-Matching Push Verification</strong> for your Property Base account (<strong>{to_email}</strong>). Review the login context below:
                            </p>

                            <!-- Contextual Telemetry Box -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 14px 18px; border-bottom: 1px solid #E2E8F0;">
                                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Login Location</div>
                                        <div style="font-size: 15px; font-weight: 800; color: #0F172A; margin-top: 3px;">&#128205; {location}</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 14px 18px; border-bottom: 1px solid #E2E8F0;">
                                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Device &amp; Browser</div>
                                        <div style="font-size: 15px; font-weight: 800; color: #0F172A; margin-top: 3px;">&#128187; {device_info}</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 14px 18px; border-bottom: 1px solid #E2E8F0;">
                                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">IP Address</div>
                                        <div style="font-size: 15px; font-weight: 800; color: #4F46E5; font-family: monospace; margin-top: 3px;">&#127760; {ip_address}</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 14px 18px;">
                                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Time of Attempt</div>
                                        <div style="font-size: 13px; font-weight: 600; color: #334155; margin-top: 3px;">&#128338; {timestamp_str}</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- 3-Number Tap Selection Box -->
                            <div style="background-color: #EEF2FF; border: 2px solid #6366F1; border-radius: 14px; padding: 22px 16px; text-align: center; margin-bottom: 22px;">
                                <div style="font-size: 13px; font-weight: 800; color: #312E81; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                                    Tap the Matching Number to Approve Sign-In
                                </div>
                                <p style="margin: 0 0 18px 0; font-size: 13.5px; color: #4338CA; line-height: 20px;">
                                    Press the <strong>2-digit number</strong> below that matches the number shown on your Property Base login screen:
                                </p>

                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                    <tr>
                                        {buttons_td_html}
                                    </tr>
                                </table>
                            </div>

                            <!-- Deny / Report ATO Button -->
                            <div style="text-align: center;">
                                <a
                                    href="{deny_url}"
                                    style="display: inline-block; background-color: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; text-decoration: none; font-size: 13px; font-weight: 700; padding: 11px 18px; border-radius: 8px;"
                                >
                                    No, It Wasn't Me — Deny Sign-In &amp; Report ATO
                                </a>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 28px; text-align: center;">
                            <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748B;">
                                Never tap a number if you are not actively signing in to Property Base right now.
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #94A3B8;">&copy; {datetime.now(timezone.utc).year} Property Base Zero-Trust Security.</p>
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
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                    server.login(smtp_user, smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                    server.ehlo()
                    if use_tls:
                        server.starttls()
                        server.ehlo()
                    server.login(smtp_user, smtp_password)
                    server.send_message(msg)

            logger.info(f"[SMTP SUCCESS] Successfully sent email to {to_email} via {smtp_host}:{smtp_port}")
            return True
        except Exception as e:
            logger.error(f"[SMTP ERROR] Failed to send email via SMTP to {to_email}: {e}")
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
        if category == "MFA_CONTEXTUAL_PUSH":
            body_html = build_contextual_push_email_html(
                subject=subject,
                to_email=to_email,
                location=payload.get("location", "Nairobi, Kenya (EAT)"),
                device_info=payload.get("device_info", "Windows • Chrome Browser"),
                ip_address=payload.get("ip_address", "127.0.0.1"),
                timestamp_str=payload.get("timestamp", datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M UTC")),
                number_options=payload.get("number_options", []),
                deny_url=payload.get("deny_url", "http://localhost:8000"),
            )
        else:
            heading = "Verification Code" if otp_code else subject
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

        # Always log prominent notification in server terminal for transparency
        if category == "MFA_CONTEXTUAL_PUSH":
            logger.info(
                f"[CONTEXTUAL PUSH DISPATCH] To: {to_email} | Match Number: [{payload.get('expected_number')}] "
                f"| Location: {payload.get('location')} | IP: {payload.get('ip_address')} | SMTP Sent: {smtp_success}"
            )
        elif otp_code:
            logger.info(f"[SECURITY CODE DISPATCH] To: {to_email} | CODE: [{otp_code}] | SMTP Sent: {smtp_success}")
        else:
            logger.info(f"[EMAIL DISPATCH] To: {to_email} | Subject: {subject} | SMTP Sent: {smtp_success}")

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


def dispatch_suspicious_activity_emails(
    db: Any,
    user: Any,
    risk_log: Any,
    triggered_activity: str,
    detection_reason: str,
    target_resource: str = "Account Session",
    device_info: str = "Web Browser Session",
) -> Dict[str, Any]:
    """
    Dispatches real-time email notifications whenever suspicious activity is detected:
    1) To the Property Seller (`user.email`) anytime suspicious activity is detected in their account.
    2) To the System Administrator (`baseadmin99@gmail.com` and any ADMIN users in DB) with full
       forensic details about what led to the session being flagged, risk score (0.0 - 1.0),
       location, and post-ATO behavioral indicators.
    """
    import threading
    from app.models import User, UserRole

    now_eat = datetime.now(timezone.utc)
    timestamp_str = now_eat.strftime("%Y-%m-%d %H:%M:%S UTC")

    raw_score = float(getattr(risk_log, "total_risk_score", 0.75) or 0.75)
    norm_score = round(raw_score / 100.0 if raw_score > 1.0 else raw_score, 3)
    tier_str = (
        risk_log.risk_tier.value
        if hasattr(risk_log.risk_tier, "value")
        else str(getattr(risk_log, "risk_tier", "HIGH"))
    )
    action_str = (
        risk_log.action_taken.value
        if hasattr(risk_log.action_taken, "value")
        else str(getattr(risk_log, "action_taken", "STEP_UP_MFA"))
    )
    bio_score = round(float(getattr(risk_log, "behavior_deviation_score", 0.0) or 0.0), 3)
    ctx_score = round(float(getattr(risk_log, "context_deviation_score", 0.0) or 0.0), 3)
    dev_score = round(float(getattr(risk_log, "device_deviation_score", 0.0) or 0.0), 3)

    geo = getattr(risk_log, "geolocation", None) or {}
    city = geo.get("city") or "Nairobi"
    country = geo.get("country") or "Kenya"
    ip_addr = getattr(risk_log, "ip_address", None) or "127.0.0.1"
    location_str = f"{city}, {country} (IP: {ip_addr})"

    seller_email = getattr(user, "email", None) or "seller@realestate.com"
    seller_name = (
        f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
        or getattr(user, "username", None)
        or seller_email
    )

    # Collect Admin emails (always include baseadmin99@gmail.com + any ADMIN accounts in DB)
    admin_emails = {"baseadmin99@gmail.com"}
    try:
        if db is not None:
            admins = db.query(User).filter(User.role == UserRole.ADMIN).all()
            for adm in admins:
                if adm.email:
                    admin_emails.add(adm.email.strip().lower())
    except Exception:
        pass

    seller_subject = f"Property Base Security Alert: Suspicious Activity Detected ({norm_score:.2f} {tier_str})"
    seller_body = (
        f"Hello {seller_name},\n\n"
        f"Our Multi-Expert Account Takeover (ATO) Defense System detected suspicious activity on your Property Base seller account ({seller_email}).\n\n"
        f"• What Triggered This Alert: {triggered_activity}\n"
        f"• Reason Flagged: {detection_reason}\n"
        f"• Targeted Resource: {target_resource}\n"
        f"• MoE Risk Score (0.0 - 1.0): {norm_score:.2f} ({tier_str} RISK)\n"
        f"• Automated Protection Enforced: {action_str}\n"
        f"• Event Location & IP: {location_str}\n"
        f"• Device / Session Context: {device_info}\n"
        f"• Timestamp: {timestamp_str}\n\n"
        f"If this was not you, your account is protected by Step-Up MFA and Zero-Trust session controls. Please review your account security settings immediately."
    )

    admin_subject = (
        f"[SOC {tier_str} RISK ALERT] Score {norm_score:.2f} — {seller_email} ({triggered_activity})"
    )
    admin_body = (
        f"SOC ADMINISTRATOR LIVE ATO ALERT\n\n"
        f"A suspicious session/activity has been flagged by the Mixture-of-Experts (MoE) ATO Engine:\n\n"
        f"1. TARGET USER IDENTITY:\n"
        f"   • User: {seller_name} ({seller_email})\n"
        f"   • User ID: {getattr(user, 'user_id', 'N/A')}\n"
        f"   • Role: {getattr(user.role, 'value', str(getattr(user, 'role', 'SELLER')))}\n\n"
        f"2. WHAT TRIGGERED THE SUSPICIOUS ACTIVITY DETECTION:\n"
        f"   • Triggered Action: {triggered_activity}\n"
        f"   • Target Resource: {target_resource}\n"
        f"   • Diagnostic Reason: {detection_reason}\n"
        f"   • Automated Engine Decision: {action_str}\n\n"
        f"3. RISK SCORE (0.0 - 1.0) & STREAM DEVIATIONS:\n"
        f"   • Total Risk Score: {norm_score:.2f} ({tier_str})\n"
        f"   • Behavioral Biometrics Deviation: {bio_score:.2f}\n"
        f"   • Contextual / Geo-Velocity Deviation: {ctx_score:.2f}\n"
        f"   • Device Fingerprint Deviation: {dev_score:.2f}\n\n"
        f"4. LOCATION & NETWORK TELEMETRY:\n"
        f"   • Location: {city}, {country}\n"
        f"   • IP Address: {ip_addr}\n"
        f"   • Device Context: {device_info}\n"
        f"   • Timestamp: {timestamp_str}\n\n"
        f"Open the Property Base Admin Dashboard -> System Audit Trail and click on this event to inspect the full Post-ATO Malicious Interaction & Model Learning telemetry."
    )

    def _send_async():
        try:
            SimulatedMailbox.send_email(
                to_email=seller_email,
                subject=seller_subject,
                body_text=seller_body,
                category="SELLER_SUSPICIOUS_ACTIVITY_ALERT",
                payload_data={
                    "risk_id": str(getattr(risk_log, "risk_id", "")),
                    "risk_score": norm_score,
                    "risk_tier": tier_str,
                    "triggered_activity": triggered_activity,
                    "location": location_str,
                },
            )
        except Exception as exc:
            logger.warning(f"Failed to send seller suspicious activity email to {seller_email}: {exc}")

        for adm_email in admin_emails:
            try:
                SimulatedMailbox.send_email(
                    to_email=adm_email,
                    subject=admin_subject,
                    body_text=admin_body,
                    category="ADMIN_SOC_HIGH_RISK_ALERT",
                    payload_data={
                        "risk_id": str(getattr(risk_log, "risk_id", "")),
                        "target_user": seller_email,
                        "risk_score": norm_score,
                        "risk_tier": tier_str,
                        "triggered_activity": triggered_activity,
                        "detection_reason": detection_reason,
                        "location": location_str,
                    },
                )
            except Exception as exc:
                logger.warning(f"Failed to send admin SOC alert email to {adm_email}: {exc}")

    threading.Thread(target=_send_async, daemon=True).start()

    return {
        "seller_notified": seller_email,
        "admins_notified": sorted(list(admin_emails)),
        "notified_at": timestamp_str,
    }
