"""
Pillar 1: Continuous Post-Login Behavioral Sequence Modeling (Markov & Temporal Sequence Expert).
Evaluates ordered post-authentication clickstream/navigation trajectories, action velocity,
paste-injection events, and rapid privilege/financial escalation patterns to detect
post-login Account Takeover (ATO) behavior.
"""

from typing import Any, Dict, List, Tuple

# Empirical transition probabilities for legitimate property sellers: P(next_state | current_state)
LEGITIMATE_TRANSITION_MATRIX: Dict[str, Dict[str, float]] = {
    "LOGIN": {
        "LISTINGS_VIEW": 0.62,
        "ANALYTICS_VIEW": 0.18,
        "MESSAGES_VIEW": 0.12,
        "PROFILE_VIEW": 0.05,
        "FINANCIALS_VIEW": 0.02,
        "FINANCIALS_EDIT": 0.005,
        "ACCOUNT_DELETE": 0.001,
    },
    "LISTINGS_VIEW": {
        "LISTINGS_VIEW": 0.35,
        "LISTING_CREATE": 0.22,
        "LISTING_EDIT": 0.18,
        "MESSAGES_VIEW": 0.12,
        "ANALYTICS_VIEW": 0.08,
        "PROFILE_VIEW": 0.03,
        "FINANCIALS_VIEW": 0.02,
    },
    "FINANCIALS_VIEW": {
        "LISTINGS_VIEW": 0.45,
        "PROFILE_VIEW": 0.25,
        "FINANCIALS_EDIT": 0.20,
        "ANALYTICS_VIEW": 0.10,
    },
    "MESSAGES_VIEW": {
        "MESSAGE_SEND": 0.45,
        "LISTINGS_VIEW": 0.35,
        "PROFILE_VIEW": 0.10,
        "FINANCIALS_VIEW": 0.05,
    },
}

HIGH_RISK_TARGETS = {
    "FINANCIALS_EDIT",
    "ACCOUNT_DELETE",
    "PROFILE_EDIT",
    "LISTING_DELETE",
    "PASSCODE_RESET",
}


class PostLoginSequenceScorer:
    """
    Scores a session's post-authentication navigation sequence and temporal interaction signals
    to identify malicious post-ATO operator trajectories.
    """

    @classmethod
    def evaluate_sequence(
        cls,
        navigation_sequence: List[str],
        seconds_since_login: float = 45.0,
        paste_detected_on_sensitive_field: bool = False,
        webdriver_detected: bool = False,
        rapid_tab_switches: int = 0,
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Returns:
            - sequence_anomaly_score (float in 0.0 - 1.0)
            - sequence_diagnostics (Dict with Markov log-likelihood, detected patterns, and intent)
        """
        if not navigation_sequence:
            navigation_sequence = ["LOGIN", "LISTINGS_VIEW"]

        normalized_seq = [str(step).upper().strip() for step in navigation_sequence if step]
        if normalized_seq[0] != "LOGIN":
            normalized_seq = ["LOGIN"] + normalized_seq

        transition_penalties: List[float] = []
        suspicious_transitions: List[str] = []

        for idx in range(len(normalized_seq) - 1):
            curr_state = normalized_seq[idx]
            next_state = normalized_seq[idx + 1]
            row = LEGITIMATE_TRANSITION_MATRIX.get(curr_state, {})
            prob = row.get(next_state, 0.04)
            # Rare transition penalty in [0.0, 1.0]
            penalty = max(0.0, min(1.0, 1.0 - (prob * 2.5)))
            transition_penalties.append(penalty)
            if prob <= 0.03 or next_state in HIGH_RISK_TARGETS:
                suspicious_transitions.append(f"{curr_state} -> {next_state} (p={prob:.3f})")

        mean_transition_penalty = (
            sum(transition_penalties) / len(transition_penalties)
            if transition_penalties
            else 0.10
        )

        # Check for immediate beeline to sensitive financial/security settings after login
        direct_escalation_bonus = 0.0
        first_three = normalized_seq[:3]
        if any(t in HIGH_RISK_TARGETS for t in first_three) and seconds_since_login < 25.0:
            direct_escalation_bonus += 0.38
            suspicious_transitions.append(
                f"Rapid Post-Login Escalation to Sensitive Target in {seconds_since_login:.1f}s"
            )

        if paste_detected_on_sensitive_field:
            direct_escalation_bonus += 0.25
            suspicious_transitions.append(
                "Clipboard Paste Injection Detected on Sensitive Credential/Payout Field"
            )

        if webdriver_detected:
            direct_escalation_bonus += 0.35
            suspicious_transitions.append("Headless Browser / WebDriver Automation Flag Detected")

        if rapid_tab_switches >= 6:
            direct_escalation_bonus += 0.12
            suspicious_transitions.append(f"High-Velocity Reconnaissance ({rapid_tab_switches} rapid tab switches)")

        raw_score = (0.55 * mean_transition_penalty) + direct_escalation_bonus
        sequence_score = round(max(0.0, min(1.0, raw_score)), 3)

        if sequence_score >= 0.70:
            intent_classification = "MALICIOUS_POST_ATO_ESCALATION"
        elif sequence_score >= 0.40:
            intent_classification = "ANOMALOUS_RECONNAISSANCE_TRAJECTORY"
        else:
            intent_classification = "NORMAL_SELLER_PORTFOLIO_WORKFLOW"

        diagnostics = {
            "sequence_anomaly_score": sequence_score,
            "intent_classification": intent_classification,
            "evaluated_sequence": normalized_seq,
            "seconds_since_login": round(seconds_since_login, 1),
            "paste_detected_on_sensitive_field": bool(paste_detected_on_sensitive_field),
            "webdriver_detected": bool(webdriver_detected),
            "suspicious_transitions": suspicious_transitions,
        }
        return sequence_score, diagnostics
