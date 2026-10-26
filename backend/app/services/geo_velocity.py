"""
Upgrade 1: Impossible-Travel Geodesic Velocity & ASN / VPN / Tor Threat Intelligence.
Computes Haversine physical travel speed (km/h) between consecutive seller sessions
and classifies IP/ASN network reputation (Residential ISP vs. VPN / Tor / Datacenter Proxy).
"""

from datetime import datetime, timezone
import math
from typing import Any, Dict, Optional, Tuple
import uuid
from sqlalchemy.orm import Session

from app.models import RiskLog

# Reference coordinates (lat, lon) for common East African & global cities
CITY_COORDINATES: Dict[str, Tuple[float, float]] = {
    "nairobi": (-1.2921, 36.8219),
    "mombasa": (-4.0435, 39.6682),
    "kisumu": (-0.0917, 34.7680),
    "nakuru": (-0.3031, 36.0800),
    "eldoret": (0.5143, 35.2698),
    "kampala": (0.3476, 32.5825),
    "dar es salaam": (-6.7924, 39.2083),
    "kigali": (-1.9441, 30.0619),
    "lagos": (6.5244, 3.3792),
    "johannesburg": (-26.2041, 28.0473),
    "london": (51.5074, -0.1278),
    "new york": (40.7128, -74.0060),
    "dubai": (25.2048, 55.2708),
    "amsterdam": (52.3676, 4.9041),
    "frankfurt": (50.1109, 8.6821),
}

SUSPICIOUS_DATACENTER_SUBNET_PREFIXES = (
    "185.220.",  # Tor Exit Nodes
    "104.244.",  # Tor / Anonymizer
    "45.133.",   # Anonymous VPN pool
    "198.98.",   # Hosting / VPS proxy
    "159.89.",   # Cloud droplet range
    "167.99.",   # Cloud droplet range
)


class GeodesicVelocityIntelligence:
    """
    Computes Haversine geodesic distance and travel velocity (km/h) between a seller's
    previous recorded session and current session, plus ASN/proxy risk classification.
    """

    @staticmethod
    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r_earth_km = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(d_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lambda / 2.0) ** 2)
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
        return round(r_earth_km * c, 2)

    @classmethod
    def resolve_coordinates(cls, location: Optional[Dict[str, Any]]) -> Tuple[float, float]:
        if not location:
            return CITY_COORDINATES["nairobi"]
        if location.get("lat") is not None and location.get("lon") is not None:
            try:
                return float(location["lat"]), float(location["lon"])
            except Exception:
                pass
        city_key = str(location.get("city") or "nairobi").strip().lower()
        return CITY_COORDINATES.get(city_key, CITY_COORDINATES["nairobi"])

    @classmethod
    def classify_ip_asn(cls, ip_address: Optional[str]) -> Dict[str, Any]:
        ip_str = (ip_address or "127.0.0.1").strip()
        if any(ip_str.startswith(prefix) for prefix in SUSPICIOUS_DATACENTER_SUBNET_PREFIXES):
            return {
                "asn_category": "ANONYMOUS_VPN_OR_TOR_EXIT_NODE",
                "is_anonymizer_proxy": True,
                "asn_risk_score": 0.65,
                "provider_label": "High-Risk Anonymizer / Cloud Proxy ASN",
            }
        if ip_str in ("127.0.0.1", "localhost", "::1") or ip_str.startswith(("192.168.", "10.", "197.", "102.", "41.")):
            return {
                "asn_category": "RESIDENTIAL_OR_LOCAL_ISP",
                "is_anonymizer_proxy": False,
                "asn_risk_score": 0.0,
                "provider_label": "Safaricom / East Africa Residential Broadband",
            }
        return {
            "asn_category": "EXTERNAL_TRANSIT_ASN",
            "is_anonymizer_proxy": False,
            "asn_risk_score": 0.12,
            "provider_label": "International Carrier ASN",
        }

    @classmethod
    def evaluate_geodesic_velocity(
        cls,
        db: Session,
        user_id: Any,
        ip_address: Optional[str],
        current_location: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        uid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
        curr_lat, curr_lon = cls.resolve_coordinates(current_location)
        asn_info = cls.classify_ip_asn(ip_address)

        prev_log: Optional[RiskLog] = (
            db.query(RiskLog)
            .filter(RiskLog.user_id == uid)
            .order_by(RiskLog.created_at.desc())
            .first()
        )

        distance_km = 0.0
        elapsed_hours = 24.0
        velocity_kmh = 0.0
        impossible_travel = False

        if prev_log and prev_log.geolocation:
            prev_lat, prev_lon = cls.resolve_coordinates(prev_log.geolocation)
            distance_km = cls.haversine_km(prev_lat, prev_lon, curr_lat, curr_lon)

            now_utc = datetime.now(timezone.utc)
            prev_time = prev_log.created_at
            if prev_time:
                if prev_time.tzinfo is None:
                    prev_time = prev_time.replace(tzinfo=timezone.utc)
                elapsed_seconds = max(30.0, (now_utc - prev_time).total_seconds())
                elapsed_hours = round(elapsed_seconds / 3600.0, 4)
                if distance_km > 25.0:
                    velocity_kmh = round(distance_km / elapsed_hours, 1)
                    if velocity_kmh > 900.0:
                        impossible_travel = True

        geo_velocity_boost = 0.0
        if impossible_travel:
            geo_velocity_boost += 0.48
        geo_velocity_boost += float(asn_info["asn_risk_score"]) * 0.50

        return {
            "impossible_travel_detected": impossible_travel,
            "distance_from_last_session_km": distance_km,
            "required_velocity_kmh": velocity_kmh,
            "max_commercial_aircraft_kmh": 900.0,
            "current_coordinates": f"{curr_lat:.4f}, {curr_lon:.4f}",
            "asn_intelligence": asn_info,
            "geodesic_risk_boost": round(min(0.60, geo_velocity_boost), 3),
        }
