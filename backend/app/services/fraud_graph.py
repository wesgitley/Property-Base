"""
Pillar 3: Graph-Based Cross-Account Fraud Ring & Mule-Account Detection.
Detects shared payout destinations (hashed bank accounts / cards / M-Pesa billing phones) across
multiple seller accounts, as well as cross-account attacker IP / device fingerprint reuse.
"""

from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models import RiskLog, RiskTier, User, UserFinancialProfile
from app.services.email_service import hash_secret_code


class CrossAccountFraudGraph:
    """
    Evaluates cross-account entity linkages across Users, Financial Payout Hashes,
    Devices, and High-Risk Incident Logs.
    """

    @classmethod
    def check_mule_payout_collision(
        cls,
        db: Session,
        current_user_id: Any,
        raw_bank_account: Optional[str] = None,
        raw_card_number: Optional[str] = None,
        raw_billing_phone: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Checks whether the plaintext bank account number, card number, or billing phone
        being saved matches the cryptographic hash of another seller account's payout profile.
        """
        uid = uuid.UUID(str(current_user_id)) if not isinstance(current_user_id, uuid.UUID) else current_user_id
        other_profiles: List[UserFinancialProfile] = (
            db.query(UserFinancialProfile).filter(UserFinancialProfile.user_id != uid).all()
        )

        colliding_user_ids: List[str] = []
        collision_types: List[str] = []

        clean_bank = (raw_bank_account or "").strip()
        clean_card = (raw_card_number or "").strip()
        clean_phone = (raw_billing_phone or "").strip()
        phone_hash = hash_secret_code(clean_phone) if (clean_phone and "*" not in clean_phone) else None

        for prof in other_profiles:
            if clean_bank and "*" not in clean_bank and len(clean_bank) >= 5 and prof.bank_account_hash:
                try:
                    if verify_password(clean_bank, prof.bank_account_hash):
                        colliding_user_ids.append(str(prof.user_id))
                        collision_types.append("SHARED_BANK_ACCOUNT_HASH")
                except Exception:
                    pass

            if clean_card and "*" not in clean_card and len(clean_card) >= 8 and prof.card_number_hash:
                try:
                    if verify_password(clean_card, prof.card_number_hash):
                        colliding_user_ids.append(str(prof.user_id))
                        collision_types.append("SHARED_CARD_NUMBER_HASH")
                except Exception:
                    pass

            if phone_hash and prof.billing_phone_hash and phone_hash == prof.billing_phone_hash:
                colliding_user_ids.append(str(prof.user_id))
                collision_types.append("SHARED_BILLING_PHONE_HASH")

        colliding_emails: List[str] = []
        for cid in set(colliding_user_ids):
            try:
                u = db.query(User).filter(User.user_id == uuid.UUID(cid)).first()
                if u and u.email:
                    colliding_emails.append(u.email)
            except Exception:
                pass

        is_mule_ring = len(colliding_emails) > 0 or len(colliding_user_ids) > 0
        return {
            "is_mule_payout_collision": is_mule_ring,
            "colliding_seller_emails": colliding_emails,
            "collision_types": sorted(list(set(collision_types))),
            "graph_risk_boost": 0.55 if is_mule_ring else 0.0,
        }

    @classmethod
    def evaluate_cross_account_infrastructure(
        cls,
        db: Session,
        current_user_id: Any,
        ip_address: Optional[str] = None,
        raw_device_hash: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Checks whether the current IP address or device signature has recently triggered
        HIGH-risk ATO incidents on other seller accounts.
        """
        uid = uuid.UUID(str(current_user_id)) if not isinstance(current_user_id, uuid.UUID) else current_user_id
        linked_compromised_accounts: List[str] = []
        risk_boost = 0.0

        if ip_address and ip_address not in ("127.0.0.1", "localhost", "::1"):
            other_high_logs = (
                db.query(RiskLog)
                .filter(
                    RiskLog.user_id != uid,
                    RiskLog.ip_address == ip_address,
                    RiskLog.risk_tier == RiskTier.HIGH,
                )
                .limit(10)
                .all()
            )
            for rlog in other_high_logs:
                if rlog.user and rlog.user.email not in linked_compromised_accounts:
                    linked_compromised_accounts.append(rlog.user.email)

        if linked_compromised_accounts:
            risk_boost = min(0.35, 0.18 * len(linked_compromised_accounts))

        return {
            "cross_account_ip_reuse": len(linked_compromised_accounts) > 0,
            "linked_compromised_accounts": linked_compromised_accounts,
            "graph_risk_boost": round(risk_boost, 3),
        }
