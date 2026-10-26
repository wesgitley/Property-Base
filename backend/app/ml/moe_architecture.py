import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Tuple


class AttentionBlock(nn.Module):
    """Self-attention mechanism for temporal dynamics in behavioral stream."""

    def __init__(self, d_model: int):
        super().__init__()
        self.query = nn.Linear(d_model, d_model)
        self.key = nn.Linear(d_model, d_model)
        self.value = nn.Linear(d_model, d_model)
        self.scale = 1.0 / (d_model ** 0.5)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch_size, seq_len, d_model) or (batch_size, d_model)
        if x.dim() == 2:
            x = x.unsqueeze(1)  # (batch_size, 1, d_model)

        q = self.query(x)
        k = self.key(x)
        v = self.value(x)

        scores = torch.matmul(q, k.transpose(-2, -1)) * self.scale
        attn = F.softmax(scores, dim=-1)
        out = torch.matmul(attn, v)
        return out.squeeze(1)


class BehavioralEncoder(nn.Module):
    """
    Expert 1: Behavioral Encoder
    Employs a deep temporal / Attention network to process keystroke dynamics,
    mouse trajectories, and action velocities.
    Outputs a 128-dimensional embedding vector.
    """

    def __init__(self, input_dim: int = 10):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, 64)
        self.lstm = nn.LSTM(
            input_size=64,
            hidden_size=64,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
        )
        self.attention = AttentionBlock(d_model=128)
        self.fc = nn.Sequential(
            nn.Linear(128, 128),
            nn.LayerNorm(128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 128),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch_size, input_dim)
        if x.dim() == 2:
            x_seq = x.unsqueeze(1)  # (batch_size, 1, input_dim)
        else:
            x_seq = x
        proj = F.relu(self.input_proj(x_seq))
        lstm_out, _ = self.lstm(proj)
        attn_out = self.attention(lstm_out)
        out = self.fc(attn_out)
        return out  # 128-dim


class StaticContextEncoder(nn.Module):
    """
    Expert 2: Static Context Encoder
    Processes contextual metrics (IP novelty, geographic displacement,
    login time circular deviation, velocity metrics).
    Outputs a 64-dimensional embedding vector.
    """

    def __init__(self, input_dim: int = 6):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.LayerNorm(64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)  # 64-dim


class DeviceFingerprintEncoder(nn.Module):
    """
    Expert 3: Device Fingerprint Encoder
    Processes hardware traits, canvas rendering signatures, WebGL parameters,
    and consistency scalars.
    Outputs a 64-dimensional embedding vector.
    """

    def __init__(self, input_dim: int = 6):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.LayerNorm(64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)  # 64-dim


class LateFusionNetwork(nn.Module):
    """
    Late Fusion Neural Network:
    - Concatenates embeddings: 128 + 64 + 64 = 256-dimensional unified vector
    - Dense cross-stream interaction layers with dimensionality reduction
    - Outputs normalized Risk Score in [0.0, 1.0]
    """

    def __init__(self):
        super().__init__()
        self.behavioral_expert = BehavioralEncoder(input_dim=10)
        self.context_expert = StaticContextEncoder(input_dim=6)
        self.device_expert = DeviceFingerprintEncoder(input_dim=6)

        # 128 + 64 + 64 = 256 unified vector
        self.fusion_layers = nn.Sequential(
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(
        self,
        behavior_feat: torch.Tensor,
        context_feat: torch.Tensor,
        device_feat: torch.Tensor,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        """
        Returns:
            risk_score: (batch_size, 1) in [0.0, 1.0]
            embeddings: dict of individual stream embeddings
        """
        e_b = self.behavioral_expert(behavior_feat)      # 128-dim
        e_c = self.context_expert(context_feat)          # 64-dim
        e_d = self.device_expert(device_feat)            # 64-dim

        # Concatenation layer (256-dim)
        unified = torch.cat([e_b, e_c, e_d], dim=-1)

        # Dense fusion
        risk_score = self.fusion_layers(unified)

        embeddings = {
            "behavior_emb": e_b,
            "context_emb": e_c,
            "device_emb": e_d,
            "unified_emb": unified,
        }
        return risk_score, embeddings

    def predict_with_uncertainty(
        self,
        behavior_feat: torch.Tensor,
        context_feat: torch.Tensor,
        device_feat: torch.Tensor,
        n_samples: int = 10,
    ) -> Dict[str, object]:
        """
        Upgrade 5: Monte Carlo Dropout Epistemic Uncertainty Quantification.
        Runs T stochastic forward passes with Dropout layers active to estimate
        predictive mean and epistemic uncertainty (95% confidence interval).
        """
        self.eval()
        for module in self.modules():
            if isinstance(module, nn.Dropout):
                module.train()

        samples = []
        with torch.no_grad():
            for _ in range(max(2, n_samples)):
                pred, _ = self.forward(behavior_feat, context_feat, device_feat)
                samples.append(float(pred.item()))

        self.eval()
        mean_val = sum(samples) / len(samples)
        variance = sum((s - mean_val) ** 2 for s in samples) / len(samples)
        std_val = variance ** 0.5
        ci_low = max(0.0, round(mean_val - 1.96 * std_val, 3))
        ci_high = min(1.0, round(mean_val + 1.96 * std_val, 3))

        if std_val < 0.045:
            conf_label = "HIGH_CONFIDENCE"
        elif std_val < 0.095:
            conf_label = "MODERATE_CONFIDENCE"
        else:
            conf_label = "HIGH_UNCERTAINTY_STEP_UP"

        return {
            "mc_mean_risk": round(mean_val, 4),
            "epistemic_std": round(std_val, 4),
            "confidence_interval_95": [ci_low, ci_high],
            "confidence_label": conf_label,
            "stochastic_passes": len(samples),
        }
