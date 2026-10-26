"""
Pillar 5: Semantic Content & Listing/Message Anomaly Intelligence (Anti-Scam NLP).
Detects post-ATO real-estate fraud patterns:
1. Sudden extreme price drops (> 35% below previous price) used to bait buyers into urgent deposits.
2. Off-platform advance-fee / wire / M-Pesa deposit redirection language in listing descriptions
   or seller-to-buyer messages.
"""

import re
from typing import Any, Dict, List, Optional

SCAM_PHRASE_PATTERNS: List[tuple] = [
    (r"\b(urgent\s+deposit|pay\s+deposit\s+before\s+viewing|reservation\s+fee)\b", "Advance-Fee Viewing Deposit Demand", 0.45),
    (r"\b(send\s+to\s+this\s+new\s+m-?pesa|new\s+bank\s+account|alternate\s+account)\b", "Unverified Payout Redirection Phrase", 0.50),
    (r"\b(whatsapp\s+me\s+directly|contact\s+off\s+platform|do\s+not\s+pay\s+through)\b", "Off-Platform Escrow Bypass Attempt", 0.40),
    (r"\b(wire\s+transfer\s+immediately|western\s+union|crypto\s+wallet|usdt)\b", "High-Risk Unrecoverable Wire Request", 0.52),
]


class RealEstateSemanticGuard:
    """
    Domain-specific NLP & pricing anomaly evaluator for real-estate listings and buyer messages.
    """

    @classmethod
    def evaluate_listing_anomaly(
        cls,
        title: str,
        description: Optional[str],
        new_price: float,
        previous_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        text_blob = f"{title or ''} {description or ''}".lower()
        matched_signals: List[str] = []
        semantic_score = 0.0

        # 1. Check for extreme price drop (> 35% drop from previous price)
        price_drop_ratio = 0.0
        if previous_price and previous_price > 0 and new_price < previous_price:
            price_drop_ratio = round((previous_price - new_price) / previous_price, 3)
            if price_drop_ratio >= 0.35:
                semantic_score += min(0.65, price_drop_ratio * 1.1)
                matched_signals.append(
                    f"Extreme Price Drop Detected (-{price_drop_ratio * 100:.0f}% from {previous_price:,.0f} to {new_price:,.0f})"
                )

        # 2. Scan description & title for off-platform deposit / scam phrases
        for pattern, label, weight in SCAM_PHRASE_PATTERNS:
            if re.search(pattern, text_blob, flags=re.IGNORECASE):
                semantic_score += weight
                matched_signals.append(label)

        final_score = round(max(0.0, min(1.0, semantic_score)), 3)
        return {
            "is_anomalous": final_score >= 0.40,
            "semantic_risk_score": final_score,
            "price_drop_ratio": price_drop_ratio,
            "matched_signals": matched_signals,
        }

    @classmethod
    def evaluate_message_anomaly(
        cls,
        message_text: str,
        buyer_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        text_blob = (message_text or "").lower()
        matched_signals: List[str] = []
        semantic_score = 0.0

        for pattern, label, weight in SCAM_PHRASE_PATTERNS:
            if re.search(pattern, text_blob, flags=re.IGNORECASE):
                semantic_score += weight
                matched_signals.append(label)

        # Detect raw bank account or phone number injection paired with payment keywords
        if re.search(r"\b(pay|send|deposit|transfer|mpesa|m-pesa|account)\b", text_blob) and re.search(
            r"\b(\+?254\d{9}|07\d{8}|\d{10,16})\b", text_blob
        ):
            semantic_score += 0.42
            matched_signals.append("Unverified Payment Account/Phone Number Injected in Buyer Message")

        final_score = round(max(0.0, min(1.0, semantic_score)), 3)
        return {
            "is_anomalous": final_score >= 0.40,
            "semantic_risk_score": final_score,
            "buyer_name": buyer_name or "Prospective Buyer",
            "matched_signals": matched_signals,
        }
