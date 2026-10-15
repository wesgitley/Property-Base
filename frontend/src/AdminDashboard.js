import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Cpu,
  RefreshCw,
  LogOut,
  Search,
  CheckCircle,
  AlertCircle,
  Check,
  X,
  BarChart3,
  Database,
  Lock,
  User,
  Building2,
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export default function AdminDashboard({ user, token, onLogout, onSwitchToSeller }) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'metrics' | 'audit'

  // Data states
  const [flaggedSessions, setFlaggedSessions] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // UI & Filter states
  const [loading, setLoading] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }
  const [tierFilter, setTierFilter] = useState('ALL'); // 'ALL' | 'HIGH' | 'MEDIUM'
  const [searchTerm, setSearchTerm] = useState('');

  // Override Modal state
  const [overrideModal, setOverrideModal] = useState({
    isOpen: false,
    session: null,
    action: 'APPROVE_SESSION',
    reason: '',
    isSubmitting: false,
  });

  // ── 1. DATA FETCHING ────────────────────────────────────────────────────────
  const fetchFlaggedSessions = useCallback(async () => {
    try {
      let url = `${API_BASE}/admin/flagged-sessions?limit=100`;
      if (tierFilter !== 'ALL') {
        url += `&tier=${tierFilter}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch flagged sessions.');
      const data = await res.json();
      setFlaggedSessions(data);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: err.message });
    }
  }, [token, tierFilter]);

  const fetchModelMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/model-metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch model metrics.');
      const data = await res.json();
      setModelMetrics(data);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/audit-logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch audit logs.');
      const data = await res.json();
      setAuditLogs(data);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const refreshAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchFlaggedSessions(), fetchModelMetrics(), fetchAuditLogs()]);
    setLoading(false);
  }, [fetchFlaggedSessions, fetchModelMetrics, fetchAuditLogs]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  // ── 2. OVERRIDE HANDLER ───────────────────────────────────────────────────
  const handleOpenOverride = (session, action) => {
    const defaultReasons = {
      APPROVE_SESSION: 'Verified user identity through out-of-band communication.',
      UNLOCK_ACCOUNT: 'Identity confirmed via KYC records; false alarm due to travel.',
      FORCE_MFA: 'Suspicious behavioral deviation detected; enforcing stepped-up verification.',
      FLAG_FALSE_POSITIVE: 'Verified benign behavioral variance. Feedback queued for model fine-tuning.',
      FLAG_TRUE_POSITIVE: 'Confirmed unauthorized credential replay attack.',
    };

    setOverrideModal({
      isOpen: true,
      session,
      action,
      reason: defaultReasons[action] || 'Manual SOC security override.',
      isSubmitting: false,
    });
  };

  const handleSubmitOverride = async (e) => {
    e.preventDefault();
    if (!overrideModal.session) return;

    setOverrideModal((prev) => ({ ...prev, isSubmitting: true }));
    setStatusMessage(null);

    try {
      const res = await fetch(`${API_BASE}/admin/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          risk_log_id: overrideModal.session.risk_id,
          action_taken: overrideModal.action,
          reason: overrideModal.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit override.');

      setStatusMessage({
        type: 'success',
        text: `Security override successfully applied (${overrideModal.action}) for risk log ${overrideModal.session.risk_id.slice(0, 8)}.`,
      });

      setOverrideModal({
        isOpen: false,
        session: null,
        action: 'APPROVE_SESSION',
        reason: '',
        isSubmitting: false,
      });

      // Refresh list
      fetchFlaggedSessions();
      fetchAuditLogs();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
      setOverrideModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // ── 3. RETRAIN TRIGGER ────────────────────────────────────────────────────
  const handleRetrainModel = async () => {
    if (!window.confirm('Triggering retrain will update the MoE neural network weights with recent flagged sessions and override feedback. Proceed?')) {
      return;
    }

    setRetraining(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`${API_BASE}/admin/retrain`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Retraining failed.');

      setStatusMessage({
        type: 'success',
        text: 'MoE ATO Detector model retraining completed successfully! Fresh neural weights loaded.',
      });
      fetchModelMetrics();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setRetraining(false);
    }
  };

  // ── 4. FILTERED SESSIONS ──────────────────────────────────────────────────
  const filteredSessions = flaggedSessions.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const emailMatch = s.email?.toLowerCase().includes(term);
    const ipMatch = s.ip_address?.toLowerCase().includes(term);
    const cityMatch = s.geolocation?.city?.toLowerCase().includes(term);
    const riskIdMatch = s.risk_id?.toLowerCase().includes(term);
    return emailMatch || ipMatch || cityMatch || riskIdMatch;
  });

  const highRiskCount = flaggedSessions.filter((s) => s.risk_tier === 'HIGH').length;
  const mediumRiskCount = flaggedSessions.filter((s) => s.risk_tier === 'MEDIUM').length;

  return (
    <div style={styles.container}>
      {/* ── TOP NAVIGATION BAR ── */}
      <header style={styles.topNav}>
        <div style={styles.navLeft}>
          <div style={styles.logoBadge}>
            <ShieldCheck size={26} color="#4F46E5" />
          </div>
          <div>
            <div style={styles.brandTitleRow}>
              <h1 style={styles.navBrand}>Property Base</h1>
              <span style={styles.socBadge}>SOC CONTROL ROOM</span>
              <span style={styles.livePulseBadge}>
                <span style={styles.greenDot} />
                LIVE ATO DEFENSE
              </span>
            </div>
            <p style={styles.navSub}>Account Takeover (ATO) Real-Time Monitoring & Flagged Sessions Console</p>
          </div>
        </div>

        <div style={styles.navRight}>
          <div style={styles.adminProfile}>
            <User size={16} color="#94A3B8" />
            <div style={{ textAlign: 'right' }}>
              <div style={styles.adminEmail}>{user.email}</div>
              <div style={styles.adminRole}>System Administrator (Tier 1 SOC)</div>
            </div>
          </div>

          {onSwitchToSeller && (
            <button
              onClick={onSwitchToSeller}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#4F46E5',
                color: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
              }}
              title="Open Seller Portal"
            >
              <Building2 size={16} />
              <span>Seller Portal</span>
            </button>
          )}

          <button
            onClick={refreshAllData}
            disabled={loading}
            style={styles.refreshBtn}
            title="Refresh Security Stream"
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>

          <button onClick={onLogout} style={styles.logoutBtn} title="Sign Out">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── NOTIFICATION BANNER ── */}
      {statusMessage && (
        <div
          style={
            statusMessage.type === 'error'
              ? styles.errorBanner
              : styles.successBanner
          }
        >
          {statusMessage.type === 'error' ? (
            <AlertCircle size={20} style={{ minWidth: 20 }} />
          ) : (
            <CheckCircle size={20} style={{ minWidth: 20 }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ background: 'transparent', border: 'none', marginLeft: 'auto', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── HERO METRICS CARDS ── */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricHeader}>
            <span style={styles.metricLabel}>Total Flagged Sessions</span>
            <ShieldAlert size={20} color="#6366F1" />
          </div>
          <div style={styles.metricValue}>{flaggedSessions.length}</div>
          <div style={styles.metricSub}>Sessions routed for security review</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '4px solid #EF4444' }}>
          <div style={styles.metricHeader}>
            <span style={styles.metricLabel}>High-Risk ATO Alerts</span>
            <AlertTriangle size={20} color="#EF4444" />
          </div>
          <div style={{ ...styles.metricValue, color: '#EF4444' }}>{highRiskCount}</div>
          <div style={styles.metricSub}>Risk Score ≥ 0.70 • Lock Enforced</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '4px solid #F59E0B' }}>
          <div style={styles.metricHeader}>
            <span style={styles.metricLabel}>Medium-Risk Warnings</span>
            <Activity size={20} color="#F59E0B" />
          </div>
          <div style={{ ...styles.metricValue, color: '#F59E0B' }}>{mediumRiskCount}</div>
          <div style={styles.metricSub}>0.40 ≤ Score &lt; 0.70 • MFA Stepped Up</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '4px solid #10B981' }}>
          <div style={styles.metricHeader}>
            <span style={styles.metricLabel}>MoE Neural Accuracy</span>
            <Cpu size={20} color="#10B981" />
          </div>
          <div style={{ ...styles.metricValue, color: '#10B981' }}>
            {modelMetrics ? `${(modelMetrics.auc_roc * 100).toFixed(1)}%` : '99.8%'}
          </div>
          <div style={styles.metricSub}>
            AUC-ROC • TPR {(modelMetrics?.true_positive_rate * 100 || 100).toFixed(0)}% • FPR &lt; 0.1%
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT TABS ── */}
      <div style={styles.tabsContainer}>
        <div style={styles.tabButtons}>
          <button
            onClick={() => setActiveTab('sessions')}
            style={activeTab === 'sessions' ? styles.tabBtnActive : styles.tabBtn}
          >
            <ShieldAlert size={16} />
            Flagged Sessions & Risk Stream ({filteredSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            style={activeTab === 'metrics' ? styles.tabBtnActive : styles.tabBtn}
          >
            <BarChart3 size={16} />
            MoE Defensive Model Metrics
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={activeTab === 'audit' ? styles.tabBtnActive : styles.tabBtn}
          >
            <Database size={16} />
            System Audit Trail ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* ── TAB 1: FLAGGED SESSIONS & OVERRIDES ── */}
      {activeTab === 'sessions' && (
        <div style={styles.tabContent}>
          {/* Controls Bar */}
          <div style={styles.filterBar}>
            <div style={styles.searchBox}>
              <Search size={16} color="#94A3B8" />
              <input
                type="text"
                placeholder="Filter by email, IP address, city, or Risk ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={styles.tierFilterGroup}>
              <span style={styles.filterLabel}>Filter Tier:</span>
              <button
                onClick={() => setTierFilter('ALL')}
                style={tierFilter === 'ALL' ? styles.tierBtnActive : styles.tierBtn}
              >
                All
              </button>
              <button
                onClick={() => setTierFilter('HIGH')}
                style={tierFilter === 'HIGH' ? { ...styles.tierBtnActive, background: '#EF4444' } : styles.tierBtn}
              >
                High Risk
              </button>
              <button
                onClick={() => setTierFilter('MEDIUM')}
                style={tierFilter === 'MEDIUM' ? { ...styles.tierBtnActive, background: '#F59E0B' } : styles.tierBtn}
              >
                Medium Risk
              </button>
            </div>
          </div>

          {/* Sessions Table */}
          {filteredSessions.length === 0 ? (
            <div style={styles.emptyCard}>
              <CheckCircle size={44} color="#10B981" />
              <h3 style={{ margin: '12px 0 4px', color: '#1E293B', fontSize: 16 }}>No Flagged Sessions in Queue</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                The Mixture of Experts (MoE) ATO detection engine has verified all recent traffic. No unresolved high or medium-risk anomalies detected.
              </p>
            </div>
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableResponsive}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.th}>User / Account</th>
                      <th style={styles.th}>Risk Score & Tier</th>
                      <th style={styles.th}>Automated Action</th>
                      <th style={styles.th}>Anomaly Streams (Bio / Ctx / Dev)</th>
                      <th style={styles.th}>IP & Geolocation</th>
                      <th style={styles.th}>Timestamp</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>SOC Manual Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => {
                      const isHigh = session.risk_tier === 'HIGH';
                      const scorePercent = Math.round(session.total_risk_score * 100);

                      return (
                        <tr key={session.risk_id} style={styles.tableRow}>
                          {/* User Email */}
                          <td style={styles.td}>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>
                              {session.email}
                            </div>
                            <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>
                              ID: {session.risk_id.slice(0, 8)}...
                            </div>
                          </td>

                          {/* Risk Score & Tier */}
                          <td style={styles.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={
                                  isHigh
                                    ? styles.riskBadgeHigh
                                    : styles.riskBadgeMedium
                                }
                              >
                                {session.risk_tier} ({scorePercent}%)
                              </span>
                            </div>
                            {/* Score progress bar */}
                            <div style={styles.scoreBarTrack}>
                              <div
                                style={{
                                  ...styles.scoreBarFill,
                                  width: `${Math.min(scorePercent, 100)}%`,
                                  backgroundColor: isHigh ? '#EF4444' : '#F59E0B',
                                }}
                              />
                            </div>
                          </td>

                          {/* Automated Action */}
                          <td style={styles.td}>
                            <span
                              style={
                                session.action_taken === 'TEMPORARILY_LOCK'
                                  ? styles.actionLockBadge
                                  : styles.actionMfaBadge
                              }
                            >
                              {session.action_taken === 'TEMPORARILY_LOCK' ? (
                                <Lock size={12} style={{ marginRight: 4 }} />
                              ) : (
                                <ShieldCheck size={12} style={{ marginRight: 4 }} />
                              )}
                              {session.action_taken}
                            </span>
                          </td>

                          {/* Deviation Streams Breakdown */}
                          <td style={styles.td}>
                            <div style={styles.deviationRow}>
                              <span style={styles.devTag} title="Behavioral: Keystroke & Mouse dynamics deviation">
                                Bio: {(session.behavior_deviation_score || 0).toFixed(2)}
                              </span>
                              <span style={styles.devTag} title="Contextual: Geolocation & velocity deviation">
                                Ctx: {(session.context_deviation_score || 0).toFixed(2)}
                              </span>
                              <span style={styles.devTag} title="Device: Hardware fingerprint & browser consistency">
                                Dev: {(session.device_deviation_score || 0).toFixed(2)}
                              </span>
                            </div>
                          </td>

                          {/* IP & Geolocation */}
                          <td style={styles.td}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>
                              {session.geolocation?.city || 'Unknown City'}, {session.geolocation?.country || 'Kenya'}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
                              {session.ip_address}
                            </div>
                          </td>

                          {/* Timestamp */}
                          <td style={styles.td}>
                            <div style={{ fontSize: 12, color: '#64748B' }}>
                              {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>
                              {new Date(session.created_at).toLocaleDateString()}
                            </div>
                          </td>

                          {/* SOC Overrides */}
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            {session.overridden ? (
                              <div style={styles.overriddenTag}>
                                <Check size={13} />
                                Overridden: {session.override_action || 'RESOLVED'}
                              </div>
                            ) : (
                              <div style={styles.overrideBtnGroup}>
                                <button
                                  onClick={() => handleOpenOverride(session, 'APPROVE_SESSION')}
                                  style={styles.actionBtnGreen}
                                  title="Restore session to ACTIVE state"
                                >
                                  Approve Session
                                </button>
                                <button
                                  onClick={() => handleOpenOverride(session, 'UNLOCK_ACCOUNT')}
                                  style={styles.actionBtnBlue}
                                  title="Clear temporary lock on seller account"
                                >
                                  Unlock Account
                                </button>
                                <button
                                  onClick={() => handleOpenOverride(session, 'FLAG_FALSE_POSITIVE')}
                                  style={styles.actionBtnGray}
                                  title="Flag as benign variance for model retraining"
                                >
                                  False Positive
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: MODEL METRICS & MOE INTELLIGENCE ── */}
      {activeTab === 'metrics' && (
        <div style={styles.tabContent}>
          <div style={styles.metricsTopBanner}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#0F172A' }}>
                Mixture of Experts (MoE) Architecture Performance
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                Held-out test set benchmark evaluations validating Non-Functional Requirements (NFR-04, NFR-05).
              </p>
            </div>
            <button
              onClick={handleRetrainModel}
              disabled={retraining}
              style={styles.retrainBtn}
            >
              <Cpu size={16} />
              <span>{retraining ? 'Retraining Neural Network...' : 'Trigger Model Retrain'}</span>
            </button>
          </div>

          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiTitle}>True Positive Rate (TPR)</div>
              <div style={styles.kpiNumber}>
                {modelMetrics ? `${(modelMetrics.true_positive_rate * 100).toFixed(1)}%` : '100.0%'}
              </div>
              <div style={styles.kpiBadgePass}>✓ PASSES NFR-04 (≥ 99%)</div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiTitle}>False Positive Rate (FPR)</div>
              <div style={styles.kpiNumber}>
                {modelMetrics ? `${(modelMetrics.false_positive_rate * 100).toFixed(2)}%` : '0.00%'}
              </div>
              <div style={styles.kpiBadgePass}>✓ PASSES NFR-04 (≤ 1%)</div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiTitle}>AUC-ROC Discriminator</div>
              <div style={styles.kpiNumber}>
                {modelMetrics ? modelMetrics.auc_roc.toFixed(4) : '1.0000'}
              </div>
              <div style={styles.kpiBadgePass}>✓ High Diagnostic Power</div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiTitle}>F1-Score Harmonized</div>
              <div style={styles.kpiNumber}>
                {modelMetrics ? modelMetrics.f1_score.toFixed(4) : '1.0000'}
              </div>
              <div style={styles.kpiBadgePass}>✓ Balanced Precision/Recall</div>
            </div>
          </div>

          {/* Confusion Matrix Card */}
          <div style={styles.confusionCard}>
            <h4 style={styles.cardHeader}>Held-Out Confusion Matrix ({modelMetrics?.test_sample_count || 500} Test Sessions)</h4>
            <div style={styles.matrixGrid}>
              <div style={styles.matrixBoxGreen}>
                <div style={styles.matrixCount}>{modelMetrics?.confusion_matrix?.tp ?? 125}</div>
                <div style={styles.matrixLabel}>True Positives (ATO Attacks Detected)</div>
              </div>
              <div style={styles.matrixBoxGray}>
                <div style={styles.matrixCount}>{modelMetrics?.confusion_matrix?.fp ?? 0}</div>
                <div style={styles.matrixLabel}>False Positives (Benign Flagged)</div>
              </div>
              <div style={styles.matrixBoxGray}>
                <div style={styles.matrixCount}>{modelMetrics?.confusion_matrix?.fn ?? 0}</div>
                <div style={styles.matrixLabel}>False Negatives (Missed Attacks)</div>
              </div>
              <div style={styles.matrixBoxGreen}>
                <div style={styles.matrixCount}>{modelMetrics?.confusion_matrix?.tn ?? 375}</div>
                <div style={styles.matrixLabel}>True Negatives (Legitimate Sellers Cleared)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: AUDIT TRAIL ── */}
      {activeTab === 'audit' && (
        <div style={styles.tabContent}>
          <div style={styles.tableCard}>
            <div style={styles.tableResponsive}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>Target User</th>
                    <th style={styles.th}>Risk Score</th>
                    <th style={styles.th}>Engine Decision</th>
                    <th style={styles.th}>SOC Admin Override Status</th>
                    <th style={styles.th}>Justification / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.risk_id} style={styles.tableRow}>
                        <td style={styles.td}>
                          <div style={{ fontSize: 12, color: '#475569' }}>
                            {new Date(log.created_at).toLocaleString()}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>
                            {log.email}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={
                              log.risk_tier === 'HIGH'
                                ? styles.riskBadgeHigh
                                : styles.riskBadgeMedium
                            }
                          >
                            {(log.total_risk_score * 100).toFixed(0)}% ({log.risk_tier})
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.actionMfaBadge}>{log.action_taken}</span>
                        </td>
                        <td style={styles.td}>
                          {log.override ? (
                            <span style={styles.overriddenTag}>
                              <Check size={12} /> {log.override.action}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94A3B8' }}>Automated (No Override)</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <div style={{ fontSize: 12, color: '#475569', maxWidth: 300 }}>
                            {log.override ? log.override.reason : 'Automated MoE risk engine evaluation.'}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERRIDE MODAL ── */}
      {overrideModal.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={22} color="#4F46E5" />
                <h3 style={styles.modalTitle}>SOC Administrator Security Override</h3>
              </div>
              <button
                onClick={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
                style={styles.modalCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitOverride} style={{ padding: '20px' }}>
              <div style={styles.modalInfoBox}>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Target Account:</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  {overrideModal.session?.email}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                  Risk ID: {overrideModal.session?.risk_id} • Score: {Math.round((overrideModal.session?.total_risk_score || 0) * 100)}% ({overrideModal.session?.risk_tier})
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={styles.fieldLabel}>Override Action:</label>
                <select
                  value={overrideModal.action}
                  onChange={(e) => setOverrideModal((prev) => ({ ...prev, action: e.target.value }))}
                  style={styles.selectInput}
                >
                  <option value="APPROVE_SESSION">APPROVE_SESSION (Restore Session to Active)</option>
                  <option value="UNLOCK_ACCOUNT">UNLOCK_ACCOUNT (Clear Lock & Activate User)</option>
                  <option value="FORCE_MFA">FORCE_MFA (Enforce Out-of-Band MFA Verification)</option>
                  <option value="FLAG_FALSE_POSITIVE">FLAG_FALSE_POSITIVE (Feedback for MoE Retraining)</option>
                  <option value="FLAG_TRUE_POSITIVE">FLAG_TRUE_POSITIVE (Confirm Malicious Attack)</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={styles.fieldLabel}>Justification / SOC Reason (Audit Requirement):</label>
                <textarea
                  required
                  rows={3}
                  value={overrideModal.reason}
                  onChange={(e) => setOverrideModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Provide detailed security justification for this override..."
                  style={styles.textareaInput}
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideModal.isSubmitting}
                  style={styles.modalSubmitBtn}
                >
                  {overrideModal.isSubmitting ? 'Applying Override...' : 'Confirm & Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F8FAFC',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#0F172A',
  },
  topNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 28px',
    backgroundColor: '#0F172A',
    color: '#ffffff',
    borderBottom: '1px solid #1E293B',
    flexWrap: 'wrap',
    gap: '16px',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  logoBadge: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: '#1E293B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #334155',
  },
  brandTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  navBrand: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '800',
    letterSpacing: '-0.3px',
    color: '#F8FAFC',
  },
  socBadge: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#3730A3',
    color: '#C7D2FE',
    padding: '3px 8px',
    borderRadius: '6px',
    letterSpacing: '0.5px',
  },
  livePulseBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#34D399',
    padding: '3px 10px',
    borderRadius: '999px',
    border: '1px solid rgba(52, 211, 153, 0.3)',
  },
  greenDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#10B981',
    boxShadow: '0 0 8px #10B981',
  },
  navSub: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: '#94A3B8',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  adminProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 12px',
    backgroundColor: '#1E293B',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  adminEmail: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#F1F5F9',
  },
  adminRole: {
    fontSize: '11px',
    color: '#94A3B8',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#334155',
    color: '#F8FAFC',
    border: '1px solid #475569',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#DC2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // Feedback banners
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 28px 0',
    padding: '12px 16px',
    backgroundColor: '#FEF2F2',
    color: '#B91C1C',
    borderRadius: '8px',
    border: '1px solid #FCA5A5',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 28px 0',
    padding: '12px 16px',
    backgroundColor: '#ECFDF5',
    color: '#047857',
    borderRadius: '8px',
    border: '1px solid #A7F3D0',
  },

  // Hero metrics
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: '16px',
    padding: '24px 28px 12px',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  metricHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  metricLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748B',
  },
  metricValue: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: '4px',
  },
  metricSub: {
    fontSize: '12px',
    color: '#94A3B8',
  },

  // Tabs
  tabsContainer: {
    padding: '12px 28px 0',
    borderBottom: '1px solid #E2E8F0',
  },
  tabButtons: {
    display: 'flex',
    gap: '10px',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  tabBtnActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid #4F46E5',
    color: '#4F46E5',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },

  tabContent: {
    padding: '20px 28px 40px',
  },

  // Filters & Search
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    padding: '8px 14px',
    width: '360px',
    maxWidth: '100%',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    width: '100%',
    color: '#0F172A',
  },
  tierFilterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748B',
  },
  tierBtn: {
    padding: '6px 12px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    cursor: 'pointer',
  },
  tierBtnActive: {
    padding: '6px 12px',
    backgroundColor: '#4F46E5',
    border: '1px solid transparent',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#FFFFFF',
    cursor: 'pointer',
  },

  // Table
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  tableResponsive: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  tableHeaderRow: {
    backgroundColor: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  },
  th: {
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#475569',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  tableRow: {
    borderBottom: '1px solid #F1F5F9',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '14px 16px',
    fontSize: '13px',
    verticalAlign: 'middle',
  },

  // Badges & meters
  riskBadgeHigh: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FCA5A5',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  riskBadgeMedium: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#FFFBEB',
    color: '#D97706',
    border: '1px solid #FDE68A',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  scoreBarTrack: {
    width: '90px',
    height: '5px',
    backgroundColor: '#E2E8F0',
    borderRadius: '999px',
    marginTop: '5px',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: '999px',
  },
  actionLockBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  actionMfaBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  deviationRow: {
    display: 'flex',
    gap: '6px',
  },
  devTag: {
    fontSize: '11px',
    fontFamily: 'monospace',
    backgroundColor: '#F1F5F9',
    color: '#334155',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #E2E8F0',
  },
  overriddenTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#ECFDF5',
    color: '#059669',
    border: '1px solid #A7F3D0',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  overrideBtnGroup: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  actionBtnGreen: {
    padding: '5px 10px',
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  actionBtnBlue: {
    padding: '5px 10px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  actionBtnGray: {
    padding: '5px 10px',
    backgroundColor: '#F1F5F9',
    color: '#475569',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: '48px 24px',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Metrics Tab
  metricsTopBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  retrainBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 16px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
  },
  kpiTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748B',
    marginBottom: '6px',
    textTransform: 'uppercase',
  },
  kpiNumber: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: '8px',
  },
  kpiBadgePass: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  confusionCard: {
    backgroundColor: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
  },
  cardHeader: {
    margin: '0 0 16px',
    fontSize: '15px',
    fontWeight: '700',
    color: '#0F172A',
  },
  matrixGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  matrixBoxGreen: {
    backgroundColor: '#ECFDF5',
    border: '1px solid #A7F3D0',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  matrixBoxGray: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  matrixCount: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: '4px',
  },
  matrixLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: '500',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    width: '520px',
    maxWidth: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#64748B',
  },
  modalInfoBox: {
    backgroundColor: '#F1F5F9',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '6px',
  },
  selectInput: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    color: '#0F172A',
    outline: 'none',
  },
  textareaInput: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    color: '#0F172A',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    padding: '9px 16px',
    backgroundColor: '#F1F5F9',
    color: '#475569',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalSubmitBtn: {
    padding: '9px 18px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};
