import numpy as np
import pandas as pd
from typing import Tuple
from pathlib import Path


def generate_synthetic_ato_dataset(
    n_samples: int = 5000,
    fraud_ratio: float = 0.25,
    random_state: int = 42,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list]:
    """Generates realistic multi‑stream telemetry dataset for Account Takeover (ATO) detection.
    Returns three feature matrices (behavior, context, device), a label vector, and the list of
    feature names. This function is kept for backward compatibility and for quick prototyping.
    """
    np.random.seed(random_state)
    n_fraud = int(n_samples * fraud_ratio)
    n_genuine = n_samples - n_fraud

    feature_names = [
        # Behavioral
        "z_flight_time", "z_dwell_time", "z_typing_speed",
        "z_mouse_velocity", "z_mouse_curvature", "z_mouse_jitter",
        "z_action_velocity", "raw_flight_time", "raw_dwell_time", "behavior_deviation_score",
        # Context
        "is_new_ip", "is_new_location", "login_hour_deviation",
        "action_velocity_deviation", "raw_login_hour", "context_deviation_score",
        # Device
        "device_hash_match", "consistency_scalar", "canvas_present",
        "webgl_present", "fonts_present", "device_deviation_score",
    ]

    # --- Genuine Seller Sessions (Label = 0) ---
    b_gen_z = np.random.normal(loc=0.0, scale=0.6, size=(n_genuine, 7))
    b_gen_raw_flight = np.random.normal(loc=120.0, scale=15.0, size=(n_genuine, 1))
    b_gen_raw_dwell = np.random.normal(loc=85.0, scale=10.0, size=(n_genuine, 1))
    b_gen_dev = np.clip(np.mean(np.abs(b_gen_z) / 3.0, axis=1, keepdims=True), 0.05, 0.28)
    b_genuine = np.hstack([b_gen_z, b_gen_raw_flight, b_gen_raw_dwell, b_gen_dev])

    c_gen_new_ip = np.random.binomial(n=1, p=0.08, size=(n_genuine, 1)).astype(float)
    c_gen_new_loc = np.random.binomial(n=1, p=0.04, size=(n_genuine, 1)).astype(float)
    c_gen_hour_dev = np.random.beta(a=1, b=5, size=(n_genuine, 1)) * 0.3
    c_gen_vel_dev = np.random.beta(a=2, b=4, size=(n_genuine, 1)) * 0.4
    c_gen_raw_hour = np.random.choice(range(8, 20), size=(n_genuine, 1)).astype(float)
    c_gen_dev = np.clip(
        0.35 * c_gen_new_ip + 0.35 * c_gen_new_loc + 0.2 * c_gen_hour_dev + 0.1 * c_gen_vel_dev,
        0.02, 0.28,
    )
    c_genuine = np.hstack([c_gen_new_ip, c_gen_new_loc, c_gen_hour_dev, c_gen_vel_dev, c_gen_raw_hour, c_gen_dev])

    d_gen_match = np.random.binomial(n=1, p=0.94, size=(n_genuine, 1)).astype(float)
    d_gen_cons = np.where(d_gen_match == 1.0, np.random.uniform(0.90, 1.0, (n_genuine, 1)), np.random.uniform(0.40, 0.65, (n_genuine, 1)))
    d_gen_canvas = np.ones((n_genuine, 1))
    d_gen_webgl = np.ones((n_genuine, 1))
    d_gen_fonts = np.ones((n_genuine, 1))
    d_gen_dev = np.clip(1.0 - d_gen_cons, 0.0, 0.3)
    d_genuine = np.hstack([d_gen_match, d_gen_cons, d_gen_canvas, d_gen_webgl, d_gen_fonts, d_gen_dev])

    y_genuine = np.zeros(n_genuine)

    # --- ATO Fraud Sessions (Label = 1) ---
    b_frd_z = np.random.normal(loc=2.8, scale=1.1, size=(n_fraud, 7)) * np.random.choice([-1, 1], size=(n_fraud, 7))
    b_frd_raw_flight = np.random.normal(loc=280.0, scale=60.0, size=(n_fraud, 1))
    b_frd_raw_dwell = np.random.normal(loc=160.0, scale=35.0, size=(n_fraud, 1))
    b_frd_dev = np.clip(np.mean(np.abs(b_frd_z) / 3.0, axis=1, keepdims=True), 0.55, 0.98)
    b_fraud = np.hstack([b_frd_z, b_frd_raw_flight, b_frd_raw_dwell, b_frd_dev])

    c_frd_new_ip = np.random.binomial(n=1, p=0.92, size=(n_fraud, 1)).astype(float)
    c_frd_new_loc = np.random.binomial(n=1, p=0.85, size=(n_fraud, 1)).astype(float)
    c_frd_hour_dev = np.random.beta(a=3, b=2, size=(n_fraud, 1)) * 0.9
    c_frd_vel_dev = np.random.beta(a=4, b=2, size=(n_fraud, 1)) * 0.9
    c_frd_raw_hour = np.random.choice([1, 2, 3, 4, 23], size=(n_fraud, 1)).astype(float)
    c_frd_dev = np.clip(
        0.35 * c_frd_new_ip + 0.35 * c_frd_new_loc + 0.2 * c_frd_hour_dev + 0.1 * c_frd_vel_dev,
        0.58, 0.99,
    )
    c_fraud = np.hstack([c_frd_new_ip, c_frd_new_loc, c_frd_hour_dev, c_frd_vel_dev, c_frd_raw_hour, c_frd_dev])

    d_frd_match = np.random.binomial(n=1, p=0.03, size=(n_fraud, 1)).astype(float)
    d_frd_cons = np.where(d_frd_match == 1.0, np.random.uniform(0.70, 0.85, (n_fraud, 1)), np.random.uniform(0.05, 0.25, (n_fraud, 1)))
    d_frd_canvas = np.random.binomial(n=1, p=0.4, size=(n_fraud, 1)).astype(float)
    d_frd_webgl = np.random.binomial(n=1, p=0.4, size=(n_fraud, 1)).astype(float)
    d_frd_fonts = np.random.binomial(n=1, p=0.5, size=(n_fraud, 1)).astype(float)
    d_frd_dev = np.clip(1.0 - d_frd_cons, 0.65, 0.98)
    d_fraud = np.hstack([d_frd_match, d_frd_cons, d_frd_canvas, d_frd_webgl, d_frd_fonts, d_frd_dev])

    y_fraud = np.ones(n_fraud)

    # Combine datasets
    X_b = np.vstack([b_genuine, b_fraud])
    X_c = np.vstack([c_genuine, c_fraud])
    X_d = np.vstack([d_genuine, d_fraud])
    y = np.concatenate([y_genuine, y_fraud])

    # Shuffle
    indices = np.arange(len(y))
    np.random.shuffle(indices)

    return X_b[indices], X_c[indices], X_d[indices], y[indices], feature_names


def load_real_ato_dataset(
    behavioral_path: str = "Keystroke dynamics and Mouse movements.csv",
    context_path: str = "sessions_data.csv",
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list]:
    """Load real ATO telemetry, falling back to synthetic data if required columns are missing.

    The function attempts to read the two CSV files. If they lack the engineered feature columns
    expected by the model, it falls back to generating a synthetic dataset via
    ``generate_synthetic_ato_dataset`` so the training pipeline can still run.
    """
    # Resolve relative paths based on this file's location
    base_dir = Path(__file__).resolve().parent
    behavioral_path = str(base_dir / behavioral_path)
    context_path = str(base_dir / context_path)

    try:
        beh_df = pd.read_csv(behavioral_path)
        ctx_df = pd.read_csv(context_path)
    except Exception as exc:
        logger.error(f"Failed to read CSV files: {exc}")
        logger.info("Falling back to synthetic dataset generation.")
        return generate_synthetic_ato_dataset()

    feature_names = [
        "z_flight_time", "z_dwell_time", "z_typing_speed",
        "z_mouse_velocity", "z_mouse_curvature", "z_mouse_jitter",
        "z_action_velocity", "raw_flight_time", "raw_dwell_time", "behavior_deviation_score",
        "is_new_ip", "is_new_location", "login_hour_deviation",
        "action_velocity_deviation", "raw_login_hour", "context_deviation_score",
        "device_hash_match", "consistency_scalar", "canvas_present",
        "webgl_present", "fonts_present", "device_deviation_score",
    ]

    # Verify required columns exist
    beh_cols = feature_names[:10]
    ctx_cols = feature_names[10:16]
    dev_cols = feature_names[16:]
    if not set(beh_cols).issubset(set(beh_df.columns)) or not set(ctx_cols + dev_cols).issubset(set(ctx_df.columns)):
        logger.warning("CSV files missing expected feature columns – using synthetic data.")
        return generate_synthetic_ato_dataset()

    X_b = beh_df[beh_cols].to_numpy(dtype=np.float32)
    X_c = ctx_df[ctx_cols].to_numpy(dtype=np.float32)
    X_d = ctx_df[dev_cols].to_numpy(dtype=np.float32)

    # Labels – optional column named 'label'; if missing, infer from ordering (first half genuine)
    if "label" in beh_df.columns:
        y = beh_df["label"].to_numpy(dtype=np.float32)
    elif "label" in ctx_df.columns:
        y = ctx_df["label"].to_numpy(dtype=np.float32)
    else:
        n = X_b.shape[0]
        y = np.concatenate([np.zeros(n // 2), np.ones(n - n // 2)], dtype=np.float32)

    return X_b, X_c, X_d, y, feature_names
