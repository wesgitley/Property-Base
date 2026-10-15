import React, { useState } from 'react';
import AdminDashboard from './AdminDashboard';
import SellerDashboard from './SellerDashboard';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Phone,
  KeyRound,
  Copy,
  Download,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export default function App() {
  // Navigation tabs: 'login' | 'register' | 'mfa' | 'forgot'
  const [activeTab, setActiveTab] = useState('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Registration form state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // MFA & Pre-auth state
  const [preAuthToken, setPreAuthToken] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [mfaMethod, setMfaMethod] = useState('backup'); // 'backup' | 'email_otp'
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [backupCodesDepleted, setBackupCodesDepleted] = useState(false);

  // Backup Codes Modal (Registration or Auto-Refill on depletion)
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [modalMode, setModalMode] = useState('register'); // 'register' | 'refill'

  // Forgot password & reset state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [forgotMode, setForgotMode] = useState('request'); // 'request' | 'verify' | 'new_password'

  // Authenticated state
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [adminViewMode, setAdminViewMode] = useState('soc'); // 'soc' | 'seller'

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'error' | 'success', text: '' }

  const clearMessages = () => setStatusMessage(null);

  // Password complexity helper (uppercase, lowercase, number, special character, 8+ chars)
  const validatePasswordComplexity = (pwd) => {
    if (!pwd || pwd.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter (A-Z).';
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter (a-z).';
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number (0-9).';
    if (!/[^A-Za-z0-9]/.test(pwd)) return 'Password must contain at least one special character (e.g. !@#$%^&*).';
    return null;
  };

  // ── 1. REGISTRATION HANDLER ──────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();

    const pwdError = validatePasswordComplexity(regPassword);
    if (pwdError) {
      setStatusMessage({ type: 'error', text: pwdError });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: regFirstName,
          last_name: regLastName,
          mobile_number: regMobile,
          username: regUsername,
          email: regEmail,
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed. Check details.');
      }

      setGeneratedCodes(data.backup_codes || []);
      setShowBackupCodesModal(true);
      setMfaEmail(data.email);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── 2. LOGIN STEP 1 HANDLER ──────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          device_hash: `dev_${navigator.userAgent.slice(0, 30)}`,
          device_name: 'Property Base Secure Browser',
          remember_me: rememberMe,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed.');
      }

      // Step 1 Success: MFA Required
      setPreAuthToken(data.mfa_pre_auth_token);
      setMfaEmail(data.email);
      setBackupCodesDepleted(!!data.backup_codes_depleted);
      if (data.backup_codes_depleted) {
        setMfaMethod('email_otp');
        setStatusMessage({
          type: 'success',
          text: 'All backup codes were previously used. A one-time verification code has been dispatched to your email.',
        });
      } else {
        setMfaMethod('backup');
        setStatusMessage({
          type: 'success',
          text: 'Credentials verified! Please enter your single-use backup code to finish signing in.',
        });
      }
      setActiveTab('mfa');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── 3. MFA STEP 2A: VERIFY BACKUP CODE ───────────────────────────────────
  const handleVerifyBackupCode = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/mfa/verify-backup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_pre_auth_token: preAuthToken,
          backup_code: backupCodeInput.trim(),
          device_hash: `dev_${navigator.userAgent.slice(0, 30)}`,
          device_name: 'Property Base Secure Browser',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Backup code verification failed.');
      }

      // Success
      setAccessToken(data.access_token);
      setAuthenticatedUser(data.user);

      // AUTO-REFILL PROMPT: Check if the 8th code was just used and refilled!
      if (data.new_backup_codes && data.new_backup_codes.length > 0) {
        setGeneratedCodes(data.new_backup_codes);
        setModalMode('refill');
        setShowBackupCodesModal(true);
      } else {
        setStatusMessage({
          type: 'success',
          text: `Welcome back, ${data.user.first_name || data.user.email}! Account access granted.`,
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── 3B. MFA STEP 2B: VERIFY EMAIL ONE-TIME CODE (WHEN DEPLETED) ───────────
  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/mfa/verify-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_pre_auth_token: preAuthToken,
          otp_code: emailOtpInput.trim(),
          device_hash: `dev_${navigator.userAgent.slice(0, 30)}`,
          device_name: 'Property Base Secure Browser',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Email verification code invalid or expired.');
      }

      // Success
      setAccessToken(data.access_token);
      setAuthenticatedUser(data.user);

      // AUTO-REFILL PROMPT: Show modal with fresh 8 backup codes immediately on dashboard
      if (data.new_backup_codes && data.new_backup_codes.length > 0) {
        setGeneratedCodes(data.new_backup_codes);
        setModalMode('refill');
        setShowBackupCodesModal(true);
      } else {
        setStatusMessage({
          type: 'success',
          text: `Welcome back, ${data.user.first_name || data.user.email}! Account access granted.`,
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestEmailOtp = async () => {
    clearMessages();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/mfa/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_pre_auth_token: preAuthToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to dispatch email code.');
      setMfaMethod('email_otp');
      setStatusMessage({
        type: 'success',
        text: data.dev_code
          ? `One-time code: ${data.dev_code} (Enter this code to access your account)`
          : 'A one-time verification code has been dispatched to your email.',
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };


  // ── 4. FORGOT PASSWORD (STEP 1: REQUEST CODE) ────────────────────────────
  const handleRequestPasswordReset = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error requesting reset.');

      setForgotMode('verify');
      setStatusMessage({
        type: 'success',
        text: data.dev_code
          ? `Verification Code: ${data.dev_code} (Enter this code below to verify)`
          : 'A 6-digit verification code has been dispatched to your email. Enter it below to verify.',
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── 4B. FORGOT PASSWORD (STEP 2: CONFIRM VERIFICATION CODE) ──────────────
  const handleVerifyResetCode = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!resetCode.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter the 6-digit verification code.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          verification_code: resetCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Verification code does not match.');

      setResetToken(data.reset_token || null);
      setForgotMode('new_password');
      setStatusMessage({
        type: 'success',
        text: 'Code confirmed successfully! Please enter your new different password below.',
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── 5. RESET PASSWORD (STEP 3: SUBMIT NEW DIFFERENT PASSWORD) ─────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!newPassword) {
      setStatusMessage({ type: 'error', text: 'Please enter a new password.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'New passwords do not match. Please re-enter confirm password.' });
      return;
    }

    const pwdErr = validatePasswordComplexity(newPassword);
    if (pwdErr) {
      setStatusMessage({ type: 'error', text: pwdErr });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          verification_code: resetCode.trim(),
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update password.');

      // Return to login with notification
      setActiveTab('login');
      setLoginEmail(forgotEmail);
      setForgotMode('request');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken(null);
      setStatusMessage({
        type: 'success',
        text: 'Password updated successfully! Please sign in with your new password.',
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── BACKUP CODES UTILITIES ───────────────────────────────────────────────
  const copyCodesToClipboard = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 3000);
  };

  const downloadCodesFile = () => {
    const textContent = `PROPERTY BASE - ACCOUNT BACKUP CODES\nGenerated: ${new Date().toLocaleString()}\nAccount: ${regEmail}\n\nIMPORTANT: Each code can only be used once to pass MFA verification.\n\n` + generatedCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `property-base-backup-codes-${regUsername || 'user'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    setAuthenticatedUser(null);
    setAccessToken('');
    setPreAuthToken('');
    setLoginPassword('');
    setActiveTab('login');
    setStatusMessage({ type: 'success', text: 'You have signed out safely.' });
  };

  const renderBackupModal = () => {
    if (!showBackupCodesModal) return null;
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalBox}>
          <div style={styles.modalHeader}>
            <div style={styles.modalIconBox}>
              <ShieldCheck size={28} color="#4F46E5" />
            </div>
            <h3 style={styles.modalTitle}>
              {modalMode === 'refill'
                ? 'Backup Codes Auto-Refilled!'
                : 'Save Your Backup Recovery Codes'}
            </h3>
            <p style={styles.modalSubtitle}>
              {modalMode === 'refill'
                ? 'All previous codes were exhausted. A fresh set of 8 single-use backup recovery codes has been generated for your account. Please save them now!'
                : 'These 8 single-use codes allow you to sign in via two-factor authentication. Store them securely now—they will never be shown again!'}
            </p>
          </div>

          <div style={styles.codesGrid}>
            {generatedCodes.map((code, idx) => (
              <div key={idx} style={styles.codePill}>
                <span style={styles.codeIdx}>{idx + 1}.</span>
                <span style={styles.codeText}>{code}</span>
              </div>
            ))}
          </div>

          <div style={styles.modalActions}>
            <button
              type="button"
              onClick={copyCodesToClipboard}
              style={styles.modalSecondaryBtn}
            >
              <Copy size={16} />
              <span>{copiedCodes ? 'Copied to Clipboard!' : 'Copy Codes'}</span>
            </button>

            <button
              type="button"
              onClick={downloadCodesFile}
              style={styles.modalSecondaryBtn}
            >
              <Download size={16} />
              <span>Download .txt</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowBackupCodesModal(false);
              if (modalMode === 'register') {
                setActiveTab('login');
                setStatusMessage({
                  type: 'success',
                  text: 'Account created! Enter your credentials to sign in.',
                });
              } else {
                setStatusMessage({
                  type: 'success',
                  text: 'Your fresh backup codes have been activated and saved!',
                });
              }
            }}
            style={styles.modalPrimaryBtn}
          >
            I HAVE SAVED MY CODES <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ── 6. ADMIN VIEW BRANCHING (ATO FRAUD DETECTION & SOC CONTROL ROOM) ───────
  if (authenticatedUser && authenticatedUser.role === 'ADMIN') {
    if (adminViewMode === 'seller') {
      return (
        <>
          <SellerDashboard
            user={authenticatedUser}
            onLogout={handleLogout}
            onSwitchToAdmin={() => setAdminViewMode('soc')}
          />
          {renderBackupModal()}
        </>
      );
    }

    return (
      <>
        <AdminDashboard
          user={authenticatedUser}
          token={accessToken}
          onLogout={handleLogout}
          onSwitchToSeller={() => setAdminViewMode('seller')}
        />
        {renderBackupModal()}
      </>
    );
  }

  // ── 7. SELLER DASHBOARD VIEW (WHEN AUTHENTICATED OR PREVIEWING) ────────────
  if (authenticatedUser && authenticatedUser.role !== 'ADMIN') {
    return (
      <>
        <SellerDashboard
          user={authenticatedUser}
          onLogout={handleLogout}
        />
        {renderBackupModal()}
      </>
    );
  }

  return (
    <div style={styles.outerContainer}>
      <div style={styles.cardWrapper}>
        {/* Left Side: Brand Image / Hero Panel */}
        <div style={styles.heroSide}>
          <div style={styles.heroOverlay}>
            <div style={styles.heroBranding}>
              <div style={styles.logoPill}>
                <ShieldCheck size={28} color="#ffffff" />
                <span style={styles.logoText}>Property Base</span>
              </div>
              <h2 style={styles.heroTitle}>Protecting Property Sellers & Assets</h2>
              <p style={styles.heroSubtitle}>
                Your real estate, securely managed.
              </p>
            </div>
            <div style={styles.badgeRow}>
              <div style={styles.secureBadge}>Secure Property Selling & Listing Management</div>
              <div style={styles.secureBadge}>Multi-Stream Account Takeover (ATO) Fraud Defense</div>
              <div style={styles.secureBadge}>High-Performance Unified Architecture</div>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication Forms */}
        <div style={styles.formSide}>
          {/* Top Brand Header */}
          <div style={styles.headerBlock}>
            <div style={styles.hexLogoBox}>
              <div style={styles.hexInner}>
                <ShieldCheck size={36} color="#4F46E5" />
              </div>
            </div>
            <h1 style={styles.brandTitle}>Property Base</h1>
            <p style={styles.brandTagline}>High-Security Seller Platform</p>
          </div>

          {/* Tab Navigation: Only Sign In & Create Account */}
          {!authenticatedUser && activeTab !== 'mfa' && (
            <div style={styles.tabBar}>
              <button
                type="button"
                onClick={() => { setActiveTab('login'); clearMessages(); }}
                style={activeTab === 'login' ? styles.tabActive : styles.tabInactive}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('register'); clearMessages(); }}
                style={activeTab === 'register' ? styles.tabActive : styles.tabInactive}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Feedback Messages */}
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
              <span style={{ fontSize: 13, lineHeight: '18px' }}>{statusMessage.text}</span>
            </div>
          )}

          {/* ──────────────── AUTHENTICATED STATE ──────────────── */}
          {authenticatedUser ? (
            <div style={styles.userDashboard}>
              <div style={styles.userBadgeRow}>
                <CheckCircle size={48} color="#10B981" />
                <h3 style={{ margin: '12px 0 4px', fontSize: 20, color: '#1F2937' }}>
                  Authenticated Successfully
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
                  Connected as: <strong>{authenticatedUser.email}</strong>
                </p>
                <div style={styles.pillTag}>Role: {authenticatedUser.role}</div>
              </div>

              <div style={styles.infoBox}>
                <p style={{ margin: '4px 0', fontSize: 13, color: '#374151' }}>
                  <strong>Account Name:</strong> {authenticatedUser.first_name || 'Wesley'} {authenticatedUser.last_name || ''}
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: '#374151' }}>
                  <strong>Username:</strong> {authenticatedUser.username || 'seller_verified'}
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: '#374151' }}>
                  <strong>MFA Status:</strong> Active (Backup Codes Enforced)
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: '#374151' }}>
                  <strong>Active Session Token:</strong> {accessToken ? `${accessToken.slice(0, 24)}...` : 'Active'}
                </p>
              </div>

              <button type="button" onClick={handleLogout} style={styles.logoutButton}>
                Sign Out
              </button>
            </div>
          ) : (
            <>
              {/* ──────────────── TAB 1: SIGN IN ──────────────── */}
              {activeTab === 'login' && (
                <form onSubmit={handleLogin} style={styles.form}>
                  <div style={styles.headingGroup}>
                    <h2 style={styles.formHeading}>Sign in to your Account</h2>
                    <p style={styles.formSubheading}>Enter your email & password to continue</p>
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><Mail size={18} color="#6366F1" /></span>
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      style={styles.textInput}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><Lock size={18} color="#6366F1" /></span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      style={styles.textInput}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                    >
                      {showPassword ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
                    </button>
                  </div>

                  <div style={styles.checkboxRow}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        style={styles.checkbox}
                      />
                      <span>Remember me</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => { setActiveTab('forgot'); clearMessages(); }}
                      style={styles.forgotLink}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={loading ? styles.primaryBtnDisabled : styles.primaryBtn}
                  >
                    {loading ? 'Verifying Credentials...' : 'SIGN IN'}
                  </button>

                  <p style={styles.footerPrompt}>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setActiveTab('register'); clearMessages(); }}
                      style={styles.textLink}
                    >
                      Create Seller Account
                    </button>
                  </p>
                </form>
              )}

              {/* ──────────────── TAB 2: REGISTER ──────────────── */}
              {activeTab === 'register' && (
                <form onSubmit={handleRegister} style={styles.form}>
                  <div style={styles.headingGroup}>
                    <h2 style={styles.formHeading}>Create Property Base Account</h2>
                    <p style={styles.formSubheading}>Register as a verified property seller</p>
                  </div>

                  <div style={styles.nameRow}>
                    <div style={{ ...styles.inputGroup, flex: 1, marginBottom: 0 }}>
                      <span style={styles.inputIcon}><User size={18} color="#6366F1" /></span>
                      <input
                        type="text"
                        required
                        placeholder="First Name"
                        value={regFirstName}
                        onChange={(e) => setRegFirstName(e.target.value)}
                        style={styles.textInput}
                      />
                    </div>
                    <div style={{ ...styles.inputGroup, flex: 1, marginBottom: 0 }}>
                      <span style={styles.inputIcon}><User size={18} color="#6366F1" /></span>
                      <input
                        type="text"
                        required
                        placeholder="Last Name"
                        value={regLastName}
                        onChange={(e) => setRegLastName(e.target.value)}
                        style={styles.textInput}
                      />
                    </div>
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><User size={18} color="#6366F1" /></span>
                    <input
                      type="text"
                      required
                      placeholder="Username (unique identifier)"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      style={styles.textInput}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><Phone size={18} color="#6366F1" /></span>
                    <input
                      type="tel"
                      required
                      placeholder="Mobile Phone Number"
                      value={regMobile}
                      onChange={(e) => setRegMobile(e.target.value)}
                      style={styles.textInput}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><Mail size={18} color="#6366F1" /></span>
                    <input
                      type="email"
                      required
                      placeholder="Email Address"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      style={styles.textInput}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.inputIcon}><Lock size={18} color="#6366F1" /></span>
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      style={styles.textInput}
                    />
                  </div>

                  <p style={{ fontSize: '11px', color: '#64748B', marginTop: '-10px', marginBottom: '14px', lineHeight: '16px' }}>
                    * Password must be a combination of uppercase letters, lowercase letters, a number, and a special character (min. 8 characters).
                  </p>

                  <button
                    type="submit"
                    disabled={loading}
                    style={loading ? styles.primaryBtnDisabled : styles.primaryBtn}
                  >
                    {loading ? 'Registering...' : 'REGISTER'}
                  </button>

                  <p style={styles.footerPrompt}>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setActiveTab('login'); clearMessages(); }}
                      style={styles.textLink}
                    >
                      Sign In
                    </button>
                  </p>
                </form>
              )}

              {/* ──────────────── TAB 3: MFA VERIFICATION ──────────────── */}
              {activeTab === 'mfa' && (
                <div style={styles.form}>
                  <div style={styles.headingGroup}>
                    <div style={styles.iconCircle}>
                      <KeyRound size={28} color="#4F46E5" />
                    </div>
                    <h2 style={styles.formHeading}>Two-Factor Authentication</h2>
                    <p style={styles.formSubheading}>
                      {mfaMethod === 'email_otp'
                        ? 'Enter the 6-digit one-time code sent to your registered email'
                        : 'Enter one of your single-use backup recovery codes to access Property Base'}
                    </p>
                  </div>

                  {mfaEmail && (
                    <div style={styles.infoBanner}>
                      Signing in as: <strong>{mfaEmail}</strong>
                    </div>
                  )}

                  {backupCodesDepleted && (
                    <div style={{ ...styles.errorBanner, background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B' }}>
                      <AlertCircle size={20} style={{ minWidth: 20 }} />
                      <span style={{ fontSize: 13, lineHeight: '18px' }}>
                        All 8 initial backup codes have been used. A one-time verification code was sent to your email.
                        A fresh set of 8 backup codes will be generated upon login.
                      </span>
                    </div>
                  )}

                  {mfaMethod === 'backup' && !backupCodesDepleted ? (
                    <form onSubmit={handleVerifyBackupCode}>
                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><KeyRound size={18} color="#6366F1" /></span>
                        <input
                          type="text"
                          required
                          placeholder="Backup Code (e.g., A8K2-9P1Z)"
                          value={backupCodeInput}
                          onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                          style={{ ...styles.textInput, letterSpacing: '2px', fontWeight: 'bold' }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading || !backupCodeInput.trim()}
                        style={loading || !backupCodeInput.trim() ? styles.primaryBtnDisabled : styles.primaryBtn}
                      >
                        {loading ? 'Verifying Code...' : 'VERIFY & ACCESS ACCOUNT'}
                      </button>

                      <div style={{ marginTop: '16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={handleRequestEmailOtp}
                          style={styles.textLink}
                        >
                          Send One-Time Code to Email Instead
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyEmailOtp}>
                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><Mail size={18} color="#6366F1" /></span>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="6-Digit Email Code"
                          value={emailOtpInput}
                          onChange={(e) => setEmailOtpInput(e.target.value.trim())}
                          style={{ ...styles.textInput, letterSpacing: '4px', fontWeight: 'bold' }}
                        />
                      </div>

                      <p style={styles.helperText}>
                        * Check your email for the 6-digit code. Valid for 10 minutes.
                      </p>

                      <button
                        type="submit"
                        disabled={loading || !emailOtpInput.trim()}
                        style={loading || !emailOtpInput.trim() ? styles.primaryBtnDisabled : styles.primaryBtn}
                      >
                        {loading ? 'Verifying Email Code...' : 'VERIFY & RECEIVE REFILLED CODES'}
                      </button>

                      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          onClick={handleRequestEmailOtp}
                          style={styles.textLink}
                        >
                          Resend Code
                        </button>
                        {!backupCodesDepleted && (
                          <button
                            type="button"
                            onClick={() => setMfaMethod('backup')}
                            style={styles.textLink}
                          >
                            Use Backup Code
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <p style={styles.footerPrompt}>
                      Lost access to email?{' '}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('forgot'); clearMessages(); }}
                        style={styles.textLink}
                      >
                        Password Reset
                      </button>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPreAuthToken(null);
                        setMfaEmail('');
                        setBackupCodeInput('');
                        setEmailOtpInput('');
                        setActiveTab('login');
                        clearMessages();
                      }}
                      style={{ ...styles.textLink, fontSize: '13px', color: '#6B7280', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              )}

              {/* ──────────────── TAB 4: FORGOT / RESET PASSWORD ──────────────── */}
              {activeTab === 'forgot' && (
                <div style={styles.form}>
                  <div style={styles.headingGroup}>
                    <div style={styles.iconCircle}>
                      <RefreshCw size={28} color="#4F46E5" />
                    </div>
                    <h2 style={styles.formHeading}>
                      {forgotMode === 'request' && 'Reset Your Password'}
                      {forgotMode === 'verify' && 'Verify Verification Code'}
                      {forgotMode === 'new_password' && 'Update Your Password'}
                    </h2>
                    <p style={styles.formSubheading}>
                      {forgotMode === 'request' && 'Enter your registered email to receive a 6-digit verification code.'}
                      {forgotMode === 'verify' && `Enter the 6-digit code received in your email to verify your identity.`}
                      {forgotMode === 'new_password' && 'Enter a new different password meeting the security criteria below.'}
                    </p>
                  </div>

                  {/* STEP 1: REQUEST VERIFICATION CODE */}
                  {forgotMode === 'request' && (
                    <form onSubmit={handleRequestPasswordReset}>
                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><Mail size={18} color="#6366F1" /></span>
                        <input
                          type="email"
                          required
                          placeholder="Your Registered Email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          style={styles.textInput}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={loading ? styles.primaryBtnDisabled : styles.primaryBtn}
                      >
                        {loading ? 'Sending Code...' : 'SEND 6-DIGIT CODE'}
                      </button>
                    </form>
                  )}

                  {/* STEP 2: VERIFY CODE MATCHES */}
                  {forgotMode === 'verify' && (
                    <form onSubmit={handleVerifyResetCode}>
                      {forgotEmail && (
                        <div style={styles.infoBanner}>
                          Verification code sent to: <strong>{forgotEmail}</strong>
                        </div>
                      )}

                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><KeyRound size={18} color="#6366F1" /></span>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="6-Digit Verification Code"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.trim())}
                          style={{ ...styles.textInput, letterSpacing: '4px', fontWeight: 'bold' }}
                        />
                      </div>

                      <p style={styles.helperText}>
                        * Enter the 6-digit verification code received in your email and click Verify Code.
                      </p>

                      <button
                        type="submit"
                        disabled={loading || !resetCode.trim()}
                        style={loading || !resetCode.trim() ? styles.primaryBtnDisabled : styles.primaryBtn}
                      >
                        {loading ? 'Verifying Code...' : 'VERIFY CODE'}
                      </button>

                      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          onClick={handleRequestPasswordReset}
                          style={styles.textLink}
                        >
                          Resend Code
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForgotMode('request'); clearMessages(); }}
                          style={styles.textLink}
                        >
                          Change Email
                        </button>
                      </div>
                    </form>
                  )}

                  {/* STEP 3: UPDATE WITH NEW DIFFERENT PASSWORD */}
                  {forgotMode === 'new_password' && (
                    <form onSubmit={handleResetPassword}>
                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><Lock size={18} color="#6366F1" /></span>
                        <input
                          type="password"
                          required
                          placeholder="New Password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          style={styles.textInput}
                        />
                      </div>

                      <div style={styles.inputGroup}>
                        <span style={styles.inputIcon}><Lock size={18} color="#6366F1" /></span>
                        <input
                          type="password"
                          required
                          placeholder="Confirm New Password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          style={styles.textInput}
                        />
                      </div>

                      {/* Real-time Password Requirements Checklist */}
                      <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', fontSize: '11px', color: '#475569' }}>
                        <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1E293B' }}>Required Password Combination:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                          <span style={{ color: newPassword.length >= 8 ? '#16A34A' : '#64748B' }}>
                            {newPassword.length >= 8 ? '✓' : '•'} 8+ characters
                          </span>
                          <span style={{ color: /[A-Z]/.test(newPassword) ? '#16A34A' : '#64748B' }}>
                            {/[A-Z]/.test(newPassword) ? '✓' : '•'} Uppercase letter (A-Z)
                          </span>
                          <span style={{ color: /[a-z]/.test(newPassword) ? '#16A34A' : '#64748B' }}>
                            {/[a-z]/.test(newPassword) ? '✓' : '•'} Lowercase letter (a-z)
                          </span>
                          <span style={{ color: /[0-9]/.test(newPassword) ? '#16A34A' : '#64748B' }}>
                            {/[0-9]/.test(newPassword) ? '✓' : '•'} Number (0-9)
                          </span>
                          <span style={{ color: /[^A-Za-z0-9]/.test(newPassword) ? '#16A34A' : '#64748B', gridColumn: 'span 2' }}>
                            {/[^A-Za-z0-9]/.test(newPassword) ? '✓' : '•'} Special character (!@#$%^&*)
                          </span>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={loading ? styles.primaryBtnDisabled : styles.primaryBtn}
                      >
                        {loading ? 'Updating Password...' : 'RESET PASSWORD'}
                      </button>
                    </form>
                  )}

                  <p style={styles.footerPrompt}>
                    Remembered your password?{' '}
                    <button
                      type="button"
                      onClick={() => { setActiveTab('login'); clearMessages(); setForgotMode('request'); }}
                      style={styles.textLink}
                    >
                      Back to Sign In
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ──────────────── BACKUP CODES POPUP MODAL ──────────────── */}
      {renderBackupModal()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE INLINE STYLES (Matching Harrison Property Layout + Property Base Branding)
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  outerContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
    padding: '24px',
    boxSizing: 'border-box',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  cardWrapper: {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    maxWidth: '1040px',
    minHeight: '620px',
    background: '#ffffff',
    borderRadius: '24px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },
  heroSide: {
    flex: '1.1',
    background: 'url("/hero-building.jpg") center/cover no-repeat',
    position: 'relative',
    display: 'flex',
  },
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.55) 0%, rgba(15, 23, 42, 0.85) 100%)',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    color: '#ffffff',
  },
  heroBranding: {
    marginTop: '20px',
  },
  logoPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    padding: '8px 18px',
    borderRadius: '999px',
    marginBottom: '24px',
  },
  logoText: {
    fontWeight: 'bold',
    fontSize: '18px',
    letterSpacing: '0.5px',
  },
  heroTitle: {
    fontSize: '32px',
    lineHeight: '40px',
    fontWeight: '800',
    margin: '0 0 16px 0',
  },
  heroSubtitle: {
    fontSize: '15px',
    lineHeight: '24px',
    color: '#E2E8F0',
    margin: 0,
    maxWidth: '420px',
  },
  badgeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  secureBadge: {
    fontSize: '13px',
    color: '#A7F3D0',
    fontWeight: '600',
    background: 'rgba(16, 185, 129, 0.15)',
    padding: '6px 14px',
    borderRadius: '8px',
    display: 'inline-block',
    alignSelf: 'flex-start',
  },
  formSide: {
    flex: '1',
    padding: '48px 44px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  headerBlock: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  hexLogoBox: {
    width: '64px',
    height: '64px',
    margin: '0 auto 12px auto',
    borderRadius: '16px',
    background: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 4px 0',
    letterSpacing: '0.5px',
  },
  brandTagline: {
    fontSize: '13px',
    color: '#6B7280',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #E5E7EB',
    marginBottom: '24px',
  },
  tabActive: {
    flex: 1,
    padding: '10px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #4F46E5',
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
  },
  tabInactive: {
    flex: 1,
    padding: '10px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: '14px',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  headingGroup: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  formHeading: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 6px 0',
  },
  formSubheading: {
    fontSize: '13px',
    color: '#6B7280',
    margin: 0,
  },
  nameRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #E0E7FF',
    borderRadius: '10px',
    padding: '10px 14px',
    marginBottom: '16px',
    background: '#ffffff',
    transition: 'all 0.2s',
  },
  inputIcon: {
    display: 'flex',
    alignItems: 'center',
    marginRight: '10px',
  },
  textInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: '#1F2937',
    background: 'transparent',
  },
  eyeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#4B5563',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#4F46E5',
    cursor: 'pointer',
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: '#4F46E5',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
  },
  primaryBtn: {
    background: '#4F46E5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '13px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.2s',
    boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.39)',
  },
  primaryBtnDisabled: {
    background: '#A5B4FC',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '13px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrompt: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#6B7280',
    marginTop: '20px',
    marginBottom: 0,
  },
  textLink: {
    background: 'none',
    border: 'none',
    color: '#4F46E5',
    fontWeight: '700',
    cursor: 'pointer',
    padding: 0,
  },
  iconCircle: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#EEF2FF',
    margin: '0 auto 12px auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    background: '#F3F4F6',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#374151',
    marginBottom: '16px',
    textAlign: 'center',
  },
  helperText: {
    fontSize: '12px',
    color: '#6B7280',
    lineHeight: '18px',
    marginBottom: '18px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#FEE2E2',
    color: '#991B1B',
    padding: '10px 14px',
    borderRadius: '10px',
    marginBottom: '18px',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#D1FAE5',
    color: '#065F46',
    padding: '10px 14px',
    borderRadius: '10px',
    marginBottom: '18px',
  },
  userDashboard: {
    textAlign: 'center',
    padding: '10px 0',
  },
  userBadgeRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '20px',
  },
  pillTag: {
    display: 'inline-block',
    background: '#EEF2FF',
    color: '#4F46E5',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
    marginTop: '8px',
  },
  infoBox: {
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'left',
    marginBottom: '24px',
  },
  logoutButton: {
    background: '#EF4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 28px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 9999,
  },
  modalBox: {
    background: '#ffffff',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '520px',
    padding: '32px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  modalHeader: {
    marginBottom: '20px',
  },
  modalIconBox: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px auto',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 8px 0',
  },
  modalSubtitle: {
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: '20px',
    margin: 0,
  },
  codesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    margin: '20px 0',
  },
  codePill: {
    background: '#F3F4F6',
    border: '1px dashed #CBD5E1',
    borderRadius: '8px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  codeIdx: {
    fontSize: '12px',
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  codeText: {
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '1px',
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  modalSecondaryBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: '#F1F5F9',
    color: '#334155',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '11px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalPrimaryBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: '#4F46E5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '13px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};
