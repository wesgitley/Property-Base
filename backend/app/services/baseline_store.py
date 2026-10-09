import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid

import redis
from sqlalchemy.orm import Session

from app.models import User, UserBehaviorBaseline

logger = logging.getLogger(__name__)

# Redis configuration with 30-day TTL (DR-04)
REDIS_HOST = "localhost"
REDIS_PORT = 6379
BASELINE_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days


class BaselineStore:
    _redis_client: Optional[redis.Redis] = None
    _redis_connected: Optional[bool] = None

    @classmethod
    def get_redis_client(cls) -> Optional[redis.Redis]:
        if cls._redis_connected is False:
            return None
        if cls._redis_client is None:
            try:
                client = redis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    socket_connect_timeout=0.1,
                    socket_timeout=0.1,
                    decode_responses=True,
                )
                client.ping()
                cls._redis_client = client
                cls._redis_connected = True
                logger.info("Connected to Redis cache for behavioral baselines.")
            except Exception as e:
                logger.warning(
                    f"Redis unavailable ({e}). Falling back to primary DB for baselines (IR-05, DR-04)."
                )
                cls._redis_connected = False
                cls._redis_client = None
        return cls._redis_client

    @classmethod
    def get_baseline(cls, db: Session, user_id: str) -> Dict[str, Any]:
        """
        Retrieves user baseline from Redis cache first; falls back to SQL DB.
        """
        cache_key = f"baseline:{user_id}"
        r = cls.get_redis_client()
        if r:
            try:
                cached = r.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as err:
                logger.warning(f"Error reading baseline from Redis: {err}. Falling back to DB.")

        # DB Fallback
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        db_record = db.query(UserBehaviorBaseline).filter(UserBehaviorBaseline.user_id == uid).first()

        if not db_record:
            # Create default baseline for user
            db_record = UserBehaviorBaseline(
                user_id=uid,
                keystroke_mean_flight_time=120.0,
                keystroke_std_flight_time=35.0,
                keystroke_mean_dwell_time=85.0,
                keystroke_std_dwell_time=20.0,
                keystroke_mean_speed_wpm=62.0,
                keystroke_std_speed_wpm=12.0,
                mouse_mean_velocity=450.0,
                mouse_std_velocity=140.0,
                mouse_mean_curvature=1.35,
                mouse_std_curvature=0.45,
                mouse_mean_jitter=12.0,
                mouse_std_jitter=6.0,
                action_velocity_mean=2.2,
                action_velocity_std=0.8,
                known_ips=[],
                known_locations=[],
                typical_login_hours=[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
                trusted_device_hashes=[],
                sample_count=1,
            )
            db.add(db_record)
            db.commit()
            db.refresh(db_record)

        data = {
            "user_id": str(db_record.user_id),
            "keystroke_mean_flight_time": db_record.keystroke_mean_flight_time,
            "keystroke_std_flight_time": db_record.keystroke_std_flight_time,
            "keystroke_mean_dwell_time": db_record.keystroke_mean_dwell_time,
            "keystroke_std_dwell_time": db_record.keystroke_std_dwell_time,
            "keystroke_mean_speed_wpm": db_record.keystroke_mean_speed_wpm,
            "keystroke_std_speed_wpm": db_record.keystroke_std_speed_wpm,
            "mouse_mean_velocity": db_record.mouse_mean_velocity,
            "mouse_std_velocity": db_record.mouse_std_velocity,
            "mouse_mean_curvature": db_record.mouse_mean_curvature,
            "mouse_std_curvature": db_record.mouse_std_curvature,
            "mouse_mean_jitter": db_record.mouse_mean_jitter,
            "mouse_std_jitter": db_record.mouse_std_jitter,
            "action_velocity_mean": db_record.action_velocity_mean,
            "action_velocity_std": db_record.action_velocity_std,
            "known_ips": db_record.known_ips or [],
            "known_locations": db_record.known_locations or [],
            "typical_login_hours": db_record.typical_login_hours or [9, 10, 11, 12, 13, 14, 15, 16, 17],
            "trusted_device_hashes": db_record.trusted_device_hashes or [],
            "sample_count": db_record.sample_count,
        }

        # Cache in Redis with 30-day TTL if available
        if r:
            try:
                r.setex(cache_key, BASELINE_TTL_SECONDS, json.dumps(data))
            except Exception as err:
                logger.warning(f"Failed to cache baseline in Redis: {err}")

        return data

    @classmethod
    def update_baseline_with_session(
        cls,
        db: Session,
        user_id: str,
        telemetry: Dict[str, Any],
        device_hash: Optional[str] = None,
        ip_address: Optional[str] = None,
        location: Optional[Dict[str, str]] = None,
        login_hour: Optional[int] = None,
    ):
        """
        Updates user baseline following authentic interaction (online exponential moving average).
        """
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        db_record = db.query(UserBehaviorBaseline).filter(UserBehaviorBaseline.user_id == uid).first()
        if not db_record:
            cls.get_baseline(db, user_id)
            db_record = db.query(UserBehaviorBaseline).filter(UserBehaviorBaseline.user_id == uid).first()

        alpha = 0.2  # Learning rate

        # Update keystroke metrics if provided
        ks = telemetry.get("keystroke", {})
        if ks.get("mean_flight_time"):
            db_record.keystroke_mean_flight_time = round((1 - alpha) * db_record.keystroke_mean_flight_time + alpha * float(ks["mean_flight_time"]), 2)
        if ks.get("mean_dwell_time"):
            db_record.keystroke_mean_dwell_time = round((1 - alpha) * db_record.keystroke_mean_dwell_time + alpha * float(ks["mean_dwell_time"]), 2)
        if ks.get("speed_wpm"):
            db_record.keystroke_mean_speed_wpm = round((1 - alpha) * db_record.keystroke_mean_speed_wpm + alpha * float(ks["speed_wpm"]), 2)

        # Update mouse metrics
        mouse = telemetry.get("mouse", {})
        if mouse.get("mean_velocity"):
            db_record.mouse_mean_velocity = round((1 - alpha) * db_record.mouse_mean_velocity + alpha * float(mouse["mean_velocity"]), 2)
        if mouse.get("curvature"):
            db_record.mouse_mean_curvature = round((1 - alpha) * db_record.mouse_mean_curvature + alpha * float(mouse["curvature"]), 2)

        # Update context
        if ip_address:
            known = list(db_record.known_ips or [])
            if ip_address not in known:
                known.append(ip_address)
                db_record.known_ips = known[-10:]  # Keep last 10

        if location:
            locs = list(db_record.known_locations or [])
            if location not in locs:
                locs.append(location)
                db_record.known_locations = locs[-10:]

        if login_hour is not None:
            hours = set(db_record.typical_login_hours or [])
            hours.add(login_hour)
            db_record.typical_login_hours = sorted(list(hours))

        if device_hash:
            devs = list(db_record.trusted_device_hashes or [])
            if device_hash not in devs:
                devs.append(device_hash)
                db_record.trusted_device_hashes = devs[-5:]

        db_record.sample_count += 1
        db_record.updated_at = datetime.now(timezone.utc)
        db.commit()

        # Invalidate / update Redis
        r = cls.get_redis_client()
        if r:
            try:
                r.delete(f"baseline:{user_id}")
            except Exception:
                pass
