"""
Upgrade 6: Automated Attack Campaign Clustering & Threat Actor Fingerprinting.
Groups flagged security incidents across the platform into coordinated Attack Campaigns
based on target resource, behavioral cadence signature, IP subnet, and attack vector.
"""

import hashlib
from typing import Any, Dict, List
from sqlalchemy.orm import Session

from app.models import RiskLog, RiskTier


class ThreatCampaignClusterEngine:
    """
    Fingerprints individual ATO incidents and clusters multi-account attack waves
    into actionable SOC Threat Campaigns.
    """

    @classmethod
    def fingerprint_event_campaign(
        cls,
        log: RiskLog,
        total_score: float,
        beh_score: float,
        ctx_score: float,
        dev_score: float,
        fc: Dict[str, Any],
    ) -> Dict[str, Any]:
        triggered = str(fc.get("triggered_activity") or "").lower()
        target = str(fc.get("target_resource") or "").lower()
        ip_str = str(log.ip_address or "127.0.0.1")
        subnet = ".".join(ip_str.split(".")[:3]) if "." in ip_str else ip_str

        if "financial" in triggered or "payout" in triggered or "financial" in target or "mule" in triggered:
            campaign_id = "CAMPAIGN-FIN-PAYOUT-HIJACK"
            campaign_name = "Post-ATO Financial Payout Redirection Wave"
            mitre_ttp = "T1098 / Account Manipulation & Payout Redirection"
        elif "listing" in triggered or "listing" in target or "price" in triggered:
            campaign_id = "CAMPAIGN-LISTING-MANIPULATION"
            campaign_name = "Real-Estate Bait Pricing & Listing Hijack Wave"
            mitre_ttp = "T1565 / Stored Data Manipulation (Property Listings)"
        elif "message" in triggered or "buyer" in triggered:
            campaign_id = "CAMPAIGN-BUYER-ESCROW-PHISHING"
            campaign_name = "Off-Platform Buyer Deposit Redirection Wave"
            mitre_ttp = "T1566 / Internal Spearphishing via Seller Inbox"
        elif "password" in triggered or "login" in triggered or "push" in triggered:
            campaign_id = "CAMPAIGN-CREDENTIAL-STUFFING-MFA-FATIGUE"
            campaign_name = "Automated Credential Replay & MFA Fatigue Wave"
            mitre_ttp = "T1110.004 / Credential Stuffing & Push Bombing"
        elif total_score >= 0.30:
            campaign_id = "CAMPAIGN-POST-LOGIN-RECON-ANOMALY"
            campaign_name = "Anomalous Post-Login Reconnaissance Cluster"
            mitre_ttp = "T1078 / Valid Accounts Behavioral Deviation"
        else:
            campaign_id = "BENIGN-ORGANIC-SELLER-TRAFFIC"
            campaign_name = "Verified Legitimate Seller Baseline Cluster"
            mitre_ttp = "N/A (Benign Traffic)"

        actor_seed = f"{campaign_id}:{subnet}:{round(beh_score, 1)}:{round(dev_score, 1)}"
        actor_fp = hashlib.sha256(actor_seed.encode("utf-8")).hexdigest()[:12].upper()

        return {
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "threat_actor_fingerprint": f"TA-{actor_fp}",
            "mitre_attack_ttp": mitre_ttp,
            "origin_subnet": f"{subnet}.0/24" if "." in ip_str else ip_str,
            "cluster_confidence": round(min(0.99, max(0.65, total_score + 0.12)), 2),
        }

    @classmethod
    def cluster_active_campaigns(cls, db: Session, limit: int = 100) -> List[Dict[str, Any]]:
        logs: List[RiskLog] = (
            db.query(RiskLog)
            .filter(RiskLog.risk_tier.in_([RiskTier.HIGH, RiskTier.MEDIUM]))
            .order_by(RiskLog.created_at.desc())
            .limit(limit)
            .all()
        )

        clusters: Dict[str, Dict[str, Any]] = {}
        for log in logs:
            fc = dict(log.feature_contributions or {})
            score = float(log.total_risk_score or 0.5)
            if score > 1.0:
                score = round(score / 100.0, 3)
            info = cls.fingerprint_event_campaign(
                log=log,
                total_score=score,
                beh_score=float(log.behavior_deviation_score or 0.5),
                ctx_score=float(log.context_deviation_score or 0.5),
                dev_score=float(log.device_deviation_score or 0.5),
                fc=fc,
            )
            cid = info["campaign_id"]
            if cid not in clusters:
                clusters[cid] = {
                    "campaign_id": cid,
                    "campaign_name": info["campaign_name"],
                    "mitre_attack_ttp": info["mitre_attack_ttp"],
                    "event_count": 0,
                    "targeted_accounts": set(),
                    "actor_fingerprints": set(),
                    "max_risk_score": 0.0,
                }
            c = clusters[cid]
            c["event_count"] += 1
            if log.user and log.user.email:
                c["targeted_accounts"].add(log.user.email)
            c["actor_fingerprints"].add(info["threat_actor_fingerprint"])
            c["max_risk_score"] = max(c["max_risk_score"], score)

        output = []
        for cid, data in clusters.items():
            output.append(
                {
                    "campaign_id": cid,
                    "campaign_name": data["campaign_name"],
                    "mitre_attack_ttp": data["mitre_attack_ttp"],
                    "event_count": data["event_count"],
                    "targeted_accounts": sorted(list(data["targeted_accounts"])),
                    "actor_fingerprints": sorted(list(data["actor_fingerprints"]))[:5],
                    "max_risk_score": round(data["max_risk_score"], 3),
                }
            )
        return sorted(output, key=lambda x: (x["max_risk_score"], x["event_count"]), reverse=True)
