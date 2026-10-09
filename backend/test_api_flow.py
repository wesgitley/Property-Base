import json
import time
from fastapi.testclient import TestClient

from app.main import app


def test_system_flow():
    with TestClient(app) as client:
        # Reset seller status to ACTIVE in case locked by previous test run
        from app.core.database import SessionLocal
        from app.models import User, UserStatus
        with SessionLocal() as db:
            s = db.query(User).filter(User.email == "seller@realestate.com").first()
            if s:
                s.status = UserStatus.ACTIVE
                db.commit()

        print(">>> 1. Testing Health Check...")
        r = client.get("/health")
        assert r.status_code == 200, r.text
        print("Health check OK:", r.json())

        print("\n>>> 2. Testing Seller Registration...")
        reg_email = f"seller_test_{int(time.time())}@example.com"
        r = client.post("/api/v1/auth/register", json={
            "email": reg_email,
            "password": "Password123!",
            "role": "SELLER",
        })
        assert r.status_code == 201, r.text
        user_data = r.json()
        assert "backup_codes" in user_data
        assert len(user_data["backup_codes"]) == 8
        print(f"Registered user: {reg_email}, Backup codes count: {len(user_data['backup_codes'])}")

        print("\n>>> 3. Testing Low Risk Login (Genuine Seller)...")
        r = client.post("/api/v1/auth/login", json={
            "email": "seller@realestate.com",
            "password": "SellerPass123!",
            "device": {
                "device_hash": "demo_trusted_device_hash_12345",
                "canvas_hash": "canvas_hash_genuine_44321",
                "webgl_hash": "webgl_hash_genuine_88990",
                "fonts_hash": "fonts_hash_genuine_11223",
                "os_platform": "MacIntel",
                "browser_engine": "Chrome",
            },
            "telemetry": {
                "keystroke": {
                    "mean_flight_time": 122.0,
                    "mean_dwell_time": 84.0,
                    "speed_wpm": 64.0,
                },
                "mouse": {
                    "mean_velocity": 425.0,
                    "curvature": 1.34,
                    "jitter": 10.5,
                },
                "action_velocity": 2.1,
            },
            "location": {"city": "Nairobi", "country": "KE"},
            "login_hour": 10,
        })
        assert r.status_code == 200, r.text
        login_data = r.json()
        assert login_data["challenge_required"] is False
        assert login_data["access_token"] is not None
        assert login_data["risk_assessment"]["risk_tier"] == "LOW"
        assert login_data["risk_assessment"]["total_risk_score"] < 0.30
        print(f"Low risk login successful! Risk Score: {login_data['risk_assessment']['total_risk_score']}, Tier: {login_data['risk_assessment']['risk_tier']}")
        seller_token = login_data["access_token"]

        print("\n>>> 4. Testing Medium Risk Login (Step-Up MFA required)...")
        # Moderate deviation: Traveling seller on genuine trusted laptop from a new IP and city
        r = client.post("/api/v1/auth/login", json={
            "email": "seller@realestate.com",
            "password": "SellerPass123!",
            "device": {
                "device_hash": "demo_trusted_device_hash_12345",
                "canvas_hash": "canvas_hash_genuine_44321",
                "webgl_hash": "webgl_hash_genuine_88990",
                "fonts_hash": "fonts_hash_genuine_11223",
                "os_platform": "MacIntel",
                "browser_engine": "Chrome",
            },
            "telemetry": {
                "keystroke": {
                    "mean_flight_time": 125.0,
                    "mean_dwell_time": 88.0,
                    "speed_wpm": 62.0,
                },
                "mouse": {
                    "mean_velocity": 435.0,
                    "curvature": 1.36,
                    "jitter": 11.0,
                },
                "action_velocity": 2.2,
            },
            "location": {"city": "Mombasa (Hotel Wi-Fi)", "country": "KE"},
            "login_hour": 22,
        })
        assert r.status_code == 200, r.text
        med_login = r.json()
        print("Med login result:", med_login["risk_assessment"])
        assert med_login["challenge_required"] is True
        assert med_login["risk_assessment"]["risk_tier"] == "MEDIUM"
        assert med_login["risk_assessment"]["action_taken"] == "STEP_UP_MFA"
        print(f"Adaptive Step-up triggered! Risk Score: {med_login['risk_assessment']['total_risk_score']}, Tier: {med_login['risk_assessment']['risk_tier']}")

        print("\n>>> 5. Testing Simulated Mailbox Preview & MFA OTP Verification...")
        r = client.get("/api/v1/auth/mailbox/preview?email=seller@realestate.com")
        assert r.status_code == 200
        messages = r.json()
        assert len(messages) > 0
        latest_msg = messages[0]
        otp_code = latest_msg["payload"].get("otp_code")
        print(f"Retrieved OTP code from simulated mailbox: {otp_code}")

        if otp_code:
            r = client.post("/api/v1/auth/mfa/verify", json={
                "user_id": med_login["user"]["user_id"],
                "otp_code": otp_code,
                "session_id": med_login["session_id"],
            })
            assert r.status_code == 200, r.text
            assert r.json()["access_token"] is not None
            print("MFA OTP Verified successfully! Token received.")

        print("\n>>> 6. Testing High Risk Account Takeover Attempt (Account Lock)...")
        # Attacker attempting to take over established seller from unrecognized bot device
        r = client.post("/api/v1/auth/login", json={
            "email": "seller@realestate.com",
            "password": "SellerPass123!",
            "device": {
                "device_hash": "malicious_bot_fingerprint_666",
                "canvas_hash": "headless_canvas_hash_0000",
                "webgl_hash": "mesa_llvmpipe_headless_gl",
                "fonts_hash": "minimal_fonts_headless",
                "os_platform": "Linux",
                "browser_engine": "HeadlessChrome",
            },
            "telemetry": {
                "keystroke": {
                    "mean_flight_time": 380.0,
                    "mean_dwell_time": 240.0,
                    "speed_wpm": 18.0,
                },
                "mouse": {
                    "mean_velocity": 1100.0,
                    "curvature": 3.5,
                    "jitter": 40.0,
                },
                "action_velocity": 8.0,
            },
            "location": {"city": "Unknown / TOR Exit Node", "country": "RU"},
            "login_hour": 3,
        })
        assert r.status_code == 200, r.text
        high_login = r.json()
        assert high_login["risk_assessment"]["risk_tier"] == "HIGH"
        assert high_login["risk_assessment"]["action_taken"] == "TEMPORARILY_LOCK"
        print(f"High risk ATO locked! Score: {high_login['risk_assessment']['total_risk_score']}, Tier: {high_login['risk_assessment']['risk_tier']}")

        print("\n>>> 7. Testing Admin Security Operations & Overrides...")
        # Login as admin
        r = client.post("/api/v1/auth/login", json={
            "email": "admin@propertybase.com",
            "password": "AdminPass123!",
            "device": {"device_hash": "admin_console_workstation_1"},
        })
        assert r.status_code == 200
        admin_token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Fetch flagged sessions
        r = client.get("/api/v1/admin/flagged-sessions", headers=headers)
        assert r.status_code == 200, r.text
        flagged = r.json()
        assert len(flagged) > 0
        print(f"Admin retrieved {len(flagged)} flagged sessions.")
        target_flagged = flagged[0]

        # Test Admin Override
        r = client.post("/api/v1/admin/override", headers=headers, json={
            "risk_log_id": target_flagged["risk_id"],
            "action_taken": "APPROVE_SESSION",
            "reason": "Verified seller phone identity out-of-band via administrative override protocol.",
        })
        assert r.status_code == 200, r.text
        print("Admin override executed:", r.json()["action_taken"])

        # Fetch model metrics (NFR-04, NFR-05)
        r = client.get("/api/v1/admin/model-metrics", headers=headers)
        assert r.status_code == 200, r.text
        metrics = r.json()
        print("Model Metrics:")
        print(f"  TPR: {metrics['true_positive_rate']*100:.1f}%, FPR: {metrics['false_positive_rate']*100:.1f}%, F1: {metrics['f1_score']}")

        print("\n>>> 8. Testing Property Listings (Real Estate Seller Portal)...")
        seller_headers = {"Authorization": f"Bearer {seller_token}"}
        r = client.get("/api/v1/properties")
        assert r.status_code == 200
        properties = r.json()
        assert len(properties) >= 3
        print(f"Public property listings count: {len(properties)}")

        # Create new property
        r = client.post("/api/v1/properties", headers=seller_headers, json={
            "title": "Riverside Modern Apartment",
            "description": "Stunning river views, high ceiling, fitness center.",
            "price": 275000.0,
            "property_type": "Apartment",
            "location": "Riverside Drive, Nairobi",
            "bedrooms": 2,
            "bathrooms": 2,
            "square_feet": 1400,
        })
        assert r.status_code == 201, r.text
        new_prop = r.json()
        print(f"Created property listing: '{new_prop['title']}' ID: {new_prop['property_id']}")

        print("\nALL BACKEND REQUIREMENTS TESTED AND PASSED!")


if __name__ == "__main__":
    test_system_flow()
