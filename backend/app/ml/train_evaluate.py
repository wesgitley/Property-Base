import json
import os
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

from app.ml.dataset import generate_synthetic_ato_dataset
from app.ml.moe_architecture import LateFusionNetwork


def train_and_evaluate_model(
    epochs: int = 25,
    batch_size: int = 64,
    learning_rate: float = 0.001,
    save_dir: str = "app/ml/weights",
):
    print("=" * 60)
    print("Multi-Expert Machine Learning Architecture Training Pipeline")
    print("=" * 60)

    # 1. Dataset Generation & Stratified Split (DR-06)
    print("Generating telemetry dataset (5,000 samples)...")
    X_b, X_c, X_d, y, feature_names = generate_synthetic_ato_dataset(n_samples=5000, fraud_ratio=0.25, random_state=42)

    # 80% train, 20% temp
    indices = np.arange(len(y))
    idx_train, idx_temp = train_test_split(indices, test_size=0.20, stratify=y, random_state=42)
    # Split temp into 10% val, 10% test
    idx_val, idx_test = train_test_split(idx_temp, test_size=0.50, stratify=y[idx_temp], random_state=42)

    print(f"Data Split: Train={len(idx_train)} (80%), Val={len(idx_val)} (10%), Test={len(idx_test)} (10%)")

    # PyTorch Tensors
    train_b = torch.tensor(X_b[idx_train], dtype=torch.float32)
    train_c = torch.tensor(X_c[idx_train], dtype=torch.float32)
    train_d = torch.tensor(X_d[idx_train], dtype=torch.float32)
    train_y = torch.tensor(y[idx_train], dtype=torch.float32).unsqueeze(1)

    val_b = torch.tensor(X_b[idx_val], dtype=torch.float32)
    val_c = torch.tensor(X_c[idx_val], dtype=torch.float32)
    val_d = torch.tensor(X_d[idx_val], dtype=torch.float32)
    val_y = torch.tensor(y[idx_val], dtype=torch.float32).unsqueeze(1)

    test_b = torch.tensor(X_b[idx_test], dtype=torch.float32)
    test_c = torch.tensor(X_c[idx_test], dtype=torch.float32)
    test_d = torch.tensor(X_d[idx_test], dtype=torch.float32)
    test_y = y[idx_test]

    # 2. Model Initialization
    model = LateFusionNetwork()
    criterion = nn.BCELoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)

    # 3. Training Loop
    print("\nTraining Late Fusion Multi-Expert Network...")
    best_val_loss = float("inf")
    n_batches = int(np.ceil(len(idx_train) / batch_size))

    for epoch in range(1, epochs + 1):
        model.train()
        permutation = torch.randperm(train_b.size(0))
        epoch_loss = 0.0

        for i in range(n_batches):
            batch_idx = permutation[i * batch_size : (i + 1) * batch_size]
            b_batch = train_b[batch_idx]
            c_batch = train_c[batch_idx]
            d_batch = train_d[batch_idx]
            y_batch = train_y[batch_idx]

            optimizer.zero_grad()
            pred, _ = model(b_batch, c_batch, d_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()

        epoch_loss /= n_batches

        # Validation
        model.eval()
        with torch.no_grad():
            val_preds, _ = model(val_b, val_c, val_d)
            val_loss = criterion(val_preds, val_y).item()

        if epoch % 5 == 0 or epoch == epochs:
            print(f"Epoch [{epoch:02d}/{epochs:02d}] - Train Loss: {epoch_loss:.4f} - Val Loss: {val_loss:.4f}")

    # 4. Final Evaluation on Held-Out Test Set (NFR-04, NFR-05)
    model.eval()
    with torch.no_grad():
        test_preds, _ = model(test_b, test_c, test_d)
        y_prob = test_preds.numpy().flatten()
        y_pred = (y_prob >= 0.5).astype(int)

    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(test_y, y_pred).ravel()
    tpr = tp / (tp + fn)  # True Positive Rate (Recall)
    fpr = fp / (fp + tn)  # False Positive Rate
    precision = precision_score(test_y, y_pred)
    recall = recall_score(test_y, y_pred)
    f1 = f1_score(test_y, y_pred)
    auc_roc = roc_auc_score(test_y, y_prob)
    accuracy = accuracy_score(test_y, y_pred)

    print("\n" + "=" * 60)
    print("Held-Out Test Set Performance Metrics (NFR-04 & NFR-05):")
    print(f"  • True Positive Rate (TPR):   {tpr * 100:.2f}% (Requirement: >= 80%) -> {'PASS' if tpr >= 0.8 else 'FAIL'}")
    print(f"  • False Positive Rate (FPR):  {fpr * 100:.2f}% (Requirement: <= 5%)  -> {'PASS' if fpr <= 0.05 else 'FAIL'}")
    print(f"  • Precision:                  {precision * 100:.2f}%")
    print(f"  • Recall:                     {recall * 100:.2f}%")
    print(f"  • F1-Score:                   {f1:.4f}")
    print(f"  • AUC-ROC:                    {auc_roc:.4f}")
    print(f"  • Accuracy:                   {accuracy * 100:.2f}%")
    print(f"  • Confusion Matrix:           TP={tp}, FP={fp}, TN={tn}, FN={fn}")
    print("=" * 60)

    # Save weights and metrics
    out_path = Path(save_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    weights_file = out_path / "moe_ato_detector.pt"
    torch.save(model.state_dict(), weights_file)
    print(f"\nModel weights saved to: {weights_file}")

    report = {
        "true_positive_rate": round(float(tpr), 4),
        "false_positive_rate": round(float(fpr), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1_score": round(float(f1), 4),
        "auc_roc": round(float(auc_roc), 4),
        "accuracy": round(float(accuracy), 4),
        "confusion_matrix": {"tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)},
        "nfr_04_tpr_pass": bool(tpr >= 0.8),
        "nfr_04_fpr_pass": bool(fpr <= 0.05),
        "test_sample_count": len(test_y),
    }

    report_file = out_path / "metrics_report.json"
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Metrics report saved to: {report_file}")

    return report


if __name__ == "__main__":
    train_and_evaluate_model()
