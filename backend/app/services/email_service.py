import hashlib
import logging
import random
import secrets
import string
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class SimulatedMailbox:
    """
    Simulated local email service (IR-04).
    Stores simulated outbound emails in memory and local logs for testing & demo,
    and supports standard local SMTP fallback.
    """
    _inbox: List[Dict[str, Any]] = []

    @classmethod
    def send_email(
        cls,
        to_email: str,
        subject: str,
        body_text: str,
        category: str,
        payload_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        email_record = {
            "id": secrets.token_hex(6),
            "to": to_email,
            "subject": subject,
            "body": body_text,
            "category": category,  # "MFA_OTP" or "OUT_OF_BAND_RECOVERY"
            "payload": payload_data or {},
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._inbox.insert(0, email_record)
        # Keep latest 50 messages
        cls._inbox = cls._inbox[:50]

        logger.info(f"[SIMULATED SMTP] Sent {category} to {to_email}: {subject}")
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
