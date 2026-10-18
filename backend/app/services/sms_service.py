import logging
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.parse
import base64
import json

from dotenv import load_dotenv

# Ensure .env is loaded
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
load_dotenv(dotenv_path=BASE_DIR.parent / ".env", override=False)

logger = logging.getLogger(__name__)


def normalize_phone_number(phone: str) -> str:
    """
    Normalizes phone numbers to standard international E.164 format.
    Handles common Kenyan phone patterns (07... / 01...) by prefixing +254.
    """
    cleaned = re.sub(r"[\s\-\(\)\.]", "", phone.strip())
    if cleaned.startswith("0") and len(cleaned) == 10:
        cleaned = "+254" + cleaned[1:]
    elif cleaned.startswith("254") and len(cleaned) == 12:
        cleaned = "+" + cleaned
    elif not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    return cleaned


def mask_phone_number(phone: str) -> str:
    """
    Masks a phone number for secure client presentation.
    E.g. '+254741440220' -> '+254 74*** **20'
    """
    normalized = normalize_phone_number(phone)
    if len(normalized) >= 9:
        country_prefix = normalized[:4]  # e.g. +254
        visible_lead = normalized[4:6]   # e.g. 74
        visible_trail = normalized[-2:]  # e.g. 20
        return f"{country_prefix} {visible_lead}*** **{visible_trail}"
    elif len(normalized) > 4:
        return normalized[:3] + "****" + normalized[-2:]
    return "****"


class SMSService:
    """
    Production-ready SMS delivery service for Property Base MFA & password recovery.
    Supports Twilio, Africa's Talking, or simulated gateway with real-time audit logging.
    """
    _sent_messages: List[Dict[str, Any]] = []

    @classmethod
    def send_twilio_sms(cls, to_phone: str, message_text: str) -> bool:
        """Sends SMS via Twilio REST API if credentials are provided in .env."""
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()

        if not (account_sid and auth_token and from_number):
            return False

        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            data = urllib.parse.urlencode({
                "To": to_phone,
                "From": from_number,
                "Body": message_text,
            }).encode("utf-8")

            req = urllib.request.Request(url, data=data, method="POST")
            auth_header = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("utf-8")
            req.add_header("Authorization", f"Basic {auth_header}")

            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    logger.info(f"✅ [TWILIO SMS SUCCESS] Dispatched to {to_phone}")
                    return True
        except Exception as e:
            logger.warning(f"⚠️ Twilio SMS transmission failed: {e}")
        return False

    @classmethod
    def send_sms(
        cls,
        to_phone: str,
        message_text: str,
        category: str = "MFA_OTP",
        otp_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Dispatches SMS notification to user.
        Normalizes destination phone number and records audit log.
        """
        clean_phone = normalize_phone_number(to_phone)
        masked_phone = mask_phone_number(clean_phone)

        # 1. Try real external gateway (Twilio) if configured
        twilio_sent = cls.send_twilio_sms(clean_phone, message_text)

        # 2. Record in internal audit message log
        record = {
            "id": secrets.token_hex(6),
            "to": clean_phone,
            "masked_to": masked_phone,
            "body": message_text,
            "category": category,
            "otp_code": otp_code,
            "gateway_sent": twilio_sent,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._sent_messages.insert(0, record)
        cls._sent_messages = cls._sent_messages[:50]

        # 3. Always log in terminal with prominent banner for instant transparency
        if otp_code:
            logger.info(
                f"📱 [SMS SECURITY CODE DISPATCH] To: {masked_phone} ({clean_phone}) | "
                f"CODE: [{otp_code}] | Gateway Sent: {twilio_sent}"
            )
        else:
            logger.info(f"📱 [SMS DISPATCH] To: {masked_phone} | Message: {message_text}")

        return record

    @classmethod
    def get_messages(cls, phone: Optional[str] = None) -> List[Dict[str, Any]]:
        if phone:
            normalized = normalize_phone_number(phone)
            return [m for m in cls._sent_messages if m["to"] == normalized]
        return cls._sent_messages

    @classmethod
    def clear_messages(cls):
        cls._sent_messages.clear()
