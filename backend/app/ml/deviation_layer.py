import math
from typing import Any, Dict, List, Tuple


class DeviationLayer:
    """
    Comparison & Deviation Layer (Layer 2 of Conceptual Framework):
    Evaluates raw telemetry against the user's historical baseline:
    - Behavioral Engine: Computes Z-Score vector against past behavior to produce Behavioral Deviation Score.
    - Static Context Engine: Combines Binary Flags with Z-scores/circular metrics to produce Static Context Deviation Score.
    - Device Fingerprinting Engine: Calculates Consistency Scalar comparing hardware traits to past trusted devices, producing Device Deviation Score.
    """

    @staticmethod
    def compute_behavioral_deviation(
        raw_telemetry: Dict[str, Any], baseline: Dict[str, Any]
    ) -> Tuple[Dict[str, float], float]:
        """
        Calculates Z-scores: Z = (x - mu) / (sigma + eps)
        Returns:
            z_scores: dictionary of individual z-scores
            deviation_score: aggregate behavioral deviation score in [0.0, 1.0]
        """
        eps = 1e-5
        ks = raw_telemetry.get("keystroke", {})
        mouse = raw_telemetry.get("mouse", {})
        action_vel = raw_telemetry.get("action_velocity", 2.2)

        # 1. Keystroke dynamics
        flight_time = float(ks.get("mean_flight_time", baseline.get("keystroke_mean_flight_time", 120.0)))
        dwell_time = float(ks.get("mean_dwell_time", baseline.get("keystroke_mean_dwell_time", 85.0)))
        speed_wpm = float(ks.get("speed_wpm", baseline.get("keystroke_mean_speed_wpm", 62.0)))

        z_flight = (flight_time - baseline.get("keystroke_mean_flight_time", 120.0)) / (
            baseline.get("keystroke_std_flight_time", 35.0) + eps
        )
        z_dwell = (dwell_time - baseline.get("keystroke_mean_dwell_time", 85.0)) / (
            baseline.get("keystroke_std_dwell_time", 20.0) + eps
        )
        z_wpm = (speed_wpm - baseline.get("keystroke_mean_speed_wpm", 62.0)) / (
            baseline.get("keystroke_std_speed_wpm", 12.0) + eps
        )

        # 2. Mouse dynamics
        mouse_vel = float(mouse.get("mean_velocity", baseline.get("mouse_mean_velocity", 450.0)))
        mouse_curv = float(mouse.get("curvature", baseline.get("mouse_mean_curvature", 1.35)))
        mouse_jit = float(mouse.get("jitter", baseline.get("mouse_mean_jitter", 12.0)))

        z_mouse_vel = (mouse_vel - baseline.get("mouse_mean_velocity", 450.0)) / (
            baseline.get("mouse_std_velocity", 140.0) + eps
        )
        z_mouse_curv = (mouse_curv - baseline.get("mouse_mean_curvature", 1.35)) / (
            baseline.get("mouse_std_curvature", 0.45) + eps
        )
        z_mouse_jit = (mouse_jit - baseline.get("mouse_mean_jitter", 12.0)) / (
            baseline.get("mouse_std_jitter", 6.0) + eps
        )

        # 3. Action velocity
        z_action_vel = (float(action_vel) - baseline.get("action_velocity_mean", 2.2)) / (
            baseline.get("action_velocity_std", 0.8) + eps
        )

        z_scores = {
            "z_flight_time": round(z_flight, 3),
            "z_dwell_time": round(z_dwell, 3),
            "z_typing_speed": round(z_wpm, 3),
            "z_mouse_velocity": round(z_mouse_vel, 3),
            "z_mouse_curvature": round(z_mouse_curv, 3),
            "z_mouse_jitter": round(z_mouse_jit, 3),
            "z_action_velocity": round(z_action_vel, 3),
        }

        # Aggregate deviation: clip each |z| / 3.0 to [0, 1] and take weighted average
        clipped_devs = [min(abs(z) / 3.0, 1.0) for z in z_scores.values()]
        # Give higher weight to keystroke flight/dwell and mouse curvature (stronger individual signatures)
        weights = [0.20, 0.15, 0.15, 0.15, 0.15, 0.10, 0.10]
        aggregate_dev = sum(d * w for d, w in zip(clipped_devs, weights))

        return z_scores, round(min(max(aggregate_dev, 0.0), 1.0), 3)

    @staticmethod
    def compute_context_deviation(
        context_data: Dict[str, Any], baseline: Dict[str, Any]
    ) -> Tuple[Dict[str, float], float]:
        """
        Combines Binary Flags with circular distance metrics:
        - is_new_ip: binary flag (1.0 if unfamiliar IP)
        - is_new_location: binary flag (1.0 if unfamiliar city/country)
        - hour_deviation: circular distance from typical login hours (0.0 to 1.0)
        - velocity_anomaly: sudden travel or speed anomaly
        """
        ip = context_data.get("ip_address", "127.0.0.1")
        loc = context_data.get("location", {})
        login_hour = context_data.get("login_hour", 14)

        known_ips = baseline.get("known_ips", [])
        known_locs = baseline.get("known_locations", [])
        typical_hours = baseline.get("typical_login_hours", [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

        # New IP flag (if known_ips exists)
        is_new_ip = 1.0 if (known_ips and ip not in known_ips) else 0.0

        # New Location flag
        city = loc.get("city", "")
        country = loc.get("country", "")
        is_new_location = 0.0
        if known_locs and city:
            matched = any(k.get("city") == city and k.get("country") == country for k in known_locs)
            is_new_location = 0.0 if matched else 1.0

        # Circular time difference from closest typical hour: min(|h1 - h2|, 24 - |h1 - h2|)
        if typical_hours:
            min_dist = min(
                min(abs(login_hour - h), 24 - abs(login_hour - h)) for h in typical_hours
            )
            # Normalize: max circular distance is 12 hours
            time_dev = min_dist / 6.0  # >6 hours away gives 1.0
            time_dev = min(max(time_dev, 0.0), 1.0)
        else:
            time_dev = 0.0

        action_vel = float(context_data.get("action_velocity", 2.2))
        vel_anomaly = 1.0 if action_vel > 6.0 else (action_vel / 6.0)

        metrics = {
            "is_new_ip": is_new_ip,
            "is_new_location": is_new_location,
            "login_hour_deviation": round(time_dev, 3),
            "action_velocity_deviation": round(vel_anomaly, 3),
        }

        # Weighted aggregate static context deviation
        agg_dev = (
            (is_new_ip * 0.35)
            + (is_new_location * 0.35)
            + (time_dev * 0.20)
            + (vel_anomaly * 0.10)
        )

        return metrics, round(min(max(agg_dev, 0.0), 1.0), 3)

    @staticmethod
    def compute_device_deviation(
        device_data: Dict[str, Any], baseline: Dict[str, Any]
    ) -> Tuple[Dict[str, float], float]:
        """
        Calculates Consistency Scalar comparing hardware traits to past trusted devices:
        - Consistency scalar in [0, 1]
        - Device Fingerprint Deviation Score = 1.0 - Consistency Scalar
        """
        dev_hash = device_data.get("device_hash", "")
        canvas_hash = device_data.get("canvas_hash", "")
        webgl_hash = device_data.get("webgl_hash", "")
        fonts_hash = device_data.get("fonts_hash", "")
        os_platform = device_data.get("os_platform", "")

        trusted_hashes = baseline.get("trusted_device_hashes", [])

        # If device_hash exactly matches a trusted device
        exact_match = 1.0 if (trusted_hashes and dev_hash in trusted_hashes) else 0.0

        # Trait consistency
        # In a realistic scenario, if baseline is empty (new account), consistency is high (0.8)
        if not trusted_hashes:
            consistency = 0.85
        elif exact_match == 1.0:
            consistency = 0.98
        else:
            # Partial hardware matches: if OS matches or canvas matches
            # Untrusted completely different device:
            score = 0.10
            if os_platform and "windows" in os_platform.lower():
                score += 0.15
            if canvas_hash:
                score += 0.05
            consistency = min(score, 0.40)

        deviation_score = round(1.0 - consistency, 3)

        traits = {
            "device_hash_match": exact_match,
            "consistency_scalar": round(consistency, 3),
            "canvas_signature_present": 1.0 if canvas_hash else 0.0,
            "webgl_signature_present": 1.0 if webgl_hash else 0.0,
            "fonts_signature_present": 1.0 if fonts_hash else 0.0,
        }

        return traits, deviation_score
