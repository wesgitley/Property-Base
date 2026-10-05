from app.models import Device, RiskLevel
from sqlalchemy.orm import Session


class RiskEngine:
    @staticmethod
    def evaluate_login_risk(
        db: Session, user_id: str, device: Device, ip_address: str
    ) -> tuple[float, float, RiskLevel]:
        """
        Calculates device_score, behavior_score, and risk_level.
        Normalized Score Range: 0.0 (Lowest Risk) to 1.0 (Highest Risk).
        """
        device_score = 0.0
        behavior_score = 0.10  # Baseline behavior score (0.0 - 1.0)

        # 1. Device Trust Check
        if not device.is_trusted:
            device_score += 0.50  # Untrusted device penalty

        # 2. Weighted Total Risk Calculation
        total_score = (device_score * 0.6) + (behavior_score * 0.4)

        # 3. Categorize Risk Level based on updated thresholds
        if total_score >= 0.7:
            risk_level = RiskLevel.HIGH
        elif total_score >= 0.3:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW

        return round(behavior_score, 2), round(device_score, 2), risk_level
