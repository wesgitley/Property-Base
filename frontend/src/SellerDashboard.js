import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  DollarSign,
  Plus,
  Search,
  Eye,
  Check,
  X,
  MessageSquare,
  Menu,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  User,
  Bell,
  Settings,
  LogOut,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  ArrowRight,
  TrendingUp,
  Calendar,
  Save,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  UploadCloud,
  Camera,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Copy,
  Download,
  Edit3,
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

// Helper to generate 3 unique single-use backup codes specifically for editing/deleting a property listing
const generateListingBackupCodes = (count = 3) => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    let part1 = '';
    let part2 = '';
    for (let j = 0; j < 4; j += 1) {
      part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes.push(`${part1}-${part2}`);
  }
  return codes;
};

// ── SYNTHETIC BUYERS POOL (FOR REALISTIC OFFER GENERATION) ───────────────────
const SYNTHETIC_BUYER_POOL = [
  {
    name: 'Sarah Wanjiku Kamau',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
    email: 'sarah.kamau@ke-invest.com',
    phone: '+254 712 445 566',
    financing_type: 'Pre-Approved Conventional Mortgage (NCBA Bank Kenya)',
    contingencies: '14-day property inspection & clean title deed verification',
    discount: 0.96, // 96% of listing price
    message: (title, location) =>
      `Hello! I have been actively searching for a residence like "${title}" in ${location}. My mortgage pre-approval is certified up to asking price. Could we schedule an in-person viewing this Saturday?`,
  },
  {
    name: 'David Ochieng Otieno',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    email: 'david.otieno@safari-tech.co',
    phone: '+254 722 889 900',
    financing_type: 'Certified Cashier Funds / Unconditional Cash',
    contingencies: '7-day expedited title search; No financing contingency',
    discount: 0.94, // 94% cash offer
    message: (title, location) =>
      `Greetings. We are cash buyers representing a private family trust looking to acquire "${title}". We are ready to place a 15% escrow deposit immediately and close within 14 calendar days.`,
  },
  {
    name: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80',
    email: 'elena.rostova@globalcapital.ch',
    phone: '+41 79 123 4567',
    financing_type: 'Private Offshore Wealth Transfer (UBS Zurich)',
    contingencies: 'Standard diplomatic residency verification & building inspection',
    discount: 0.98, // 98% of listing price
    message: (title, location) =>
      `Dear Seller, I am relocating to Nairobi for a diplomatic assignment and your listing "${title}" in ${location} is ideal. I am submitting this offer with certified proof of liquid funds.`,
  },
  {
    name: 'Michael Mwangi Chege',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
    email: 'michael.mwangi@kenya-executives.org',
    phone: '+254 733 556 778',
    financing_type: 'Bank Guarantee & 25% Upfront Down Payment (Standard Chartered)',
    contingencies: 'Professional property appraisal & 21-day escrow period',
    discount: 0.95,
    message: (title, location) =>
      `Good day. I reviewed the listing specifications for "${title}". I would like to submit a formal purchase proposal with a 25% earnest deposit upon signing of the sale agreement.`,
  },
  {
    name: 'Amina Noor Hassan',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    email: 'amina.hassan@coastalliving.ke',
    phone: '+254 701 998 877',
    financing_type: 'Islamic Sharia-Compliant Home Financing (First Community / Gulf African Bank)',
    contingencies: 'Standard 10-day valuation & boundary survey clearance',
    discount: 0.97,
    message: (title, location) =>
      `Assalamu Alaikum. I am interested in purchasing "${title}". Our pre-approved Sharia-compliant facility is finalized and ready for release upon contract execution.`,
  },
];

// ── UTILITIES ────────────────────────────────────────────────────────────────
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

// ── MAIN SELLER DASHBOARD COMPONENT ──────────────────────────────────────────
export default function SellerDashboard({
  user,
  token,
  onUserUpdate,
  onShowBackupCodes,
  onLogout,
  onSwitchToAdmin,
}) {
  // Navigation & layout state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('listings');

  // Identify user storage key so each account has isolated listings, offers & listing MFA codes
  const userKey = user?.email || user?.username || 'new_seller';
  const storageKeyListings = `pb_listings_${userKey}`;
  const storageKeyOffers = `pb_offers_${userKey}`;
  const storageKeyListingMfa = `pb_listing_mfa_${userKey}`;

  // Listings state: New users start with an EMPTY portfolio ([]), or load previously posted listings
  const [listings, setListings] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeyListings);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load listings from storage', e);
    }
    return [];
  });

  // Listing MFA Backup Codes state (random backup codes used to edit/delete ANY property listing)
  const [listingMfa, setListingMfa] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeyListingMfa);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            initialized: Boolean(parsed.initialized),
            codes: Array.isArray(parsed.codes) ? parsed.codes : [],
            notificationVisible: Boolean(parsed.notificationVisible),
            notificationReason: parsed.notificationReason || 'FIRST_LISTING',
            lastSeenToken: parsed.lastSeenToken || '',
          };
        }
      }
    } catch (e) {
      console.error('Failed to load listing MFA state from storage', e);
    }
    return {
      initialized: false,
      codes: [],
      notificationVisible: false,
      notificationReason: 'FIRST_LISTING',
      lastSeenToken: '',
    };
  });
  const [bannerCopied, setBannerCopied] = useState(false);

  // Offers state: New users start with 0 offers ([]), or load previously received offers
  const [offers, setOffers] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeyOffers);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load offers from storage', e);
    }
    return [];
  });

  // Persist user-specific listings, offers & listing MFA state across sessions
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyListings, JSON.stringify(listings));
    } catch (e) {
      console.error(e);
    }
  }, [listings, storageKeyListings]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyOffers, JSON.stringify(offers));
    } catch (e) {
      console.error(e);
    }
  }, [offers, storageKeyOffers]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyListingMfa, JSON.stringify(listingMfa));
    } catch (e) {
      console.error(e);
    }
  }, [listingMfa, storageKeyListingMfa]);

  // ── PILLAR 4: REAL-TIME BROWSER BIOMETRIC SENSOR AGENT ──────────────────────
  const biometricSensorRef = useRef({
    loginTimestamp: Date.now(),
    lastKeyUpTime: 0,
    keyDownTimes: {},
    flightTimes: [],
    dwellTimes: [],
    lastMousePos: null,
    mouseVelocities: [],
    pasteDetected: false,
    navigationSequence: ['LOGIN', 'LISTINGS_VIEW'],
    tabSwitchCount: 0,
    actionCount: 0,
  });

  // Track navigation sequence across Seller Dashboard tabs
  useEffect(() => {
    const navMap = {
      listings: 'LISTINGS_VIEW',
      analytics: 'ANALYTICS_VIEW',
      messages: 'MESSAGES_VIEW',
      financials: 'FINANCIALS_VIEW',
      profile: 'PROFILE_VIEW',
    };
    const mapped = navMap[activeNav] || String(activeNav || 'LISTINGS_VIEW').toUpperCase();
    const sensor = biometricSensorRef.current;
    if (sensor.navigationSequence[sensor.navigationSequence.length - 1] !== mapped) {
      sensor.navigationSequence = [...sensor.navigationSequence.slice(-11), mapped];
      sensor.tabSwitchCount += 1;
      sensor.actionCount += 1;
    }
  }, [activeNav]);

  // Collect real keystroke flight/dwell, mouse velocity, and clipboard paste telemetry
  useEffect(() => {
    if (!token) return undefined;
    const sensor = biometricSensorRef.current;

    const onKeyDown = (e) => {
      const now = performance.now();
      if (sensor.lastKeyUpTime > 0) {
        const flight = now - sensor.lastKeyUpTime;
        if (flight > 5 && flight < 2000) {
          sensor.flightTimes = [...sensor.flightTimes.slice(-39), flight];
        }
      }
      sensor.keyDownTimes[e.code || e.key] = now;
      sensor.actionCount += 1;
    };

    const onKeyUp = (e) => {
      const now = performance.now();
      const start = sensor.keyDownTimes[e.code || e.key];
      if (start) {
        const dwell = now - start;
        if (dwell > 5 && dwell < 1000) {
          sensor.dwellTimes = [...sensor.dwellTimes.slice(-39), dwell];
        }
        delete sensor.keyDownTimes[e.code || e.key];
      }
      sensor.lastKeyUpTime = now;
    };

    const onMouseMove = (e) => {
      const now = performance.now();
      if (sensor.lastMousePos) {
        const dt = (now - sensor.lastMousePos.t) / 1000;
        if (dt > 0.015 && dt < 1.0) {
          const dx = e.clientX - sensor.lastMousePos.x;
          const dy = e.clientY - sensor.lastMousePos.y;
          const v = Math.hypot(dx, dy) / dt;
          if (v > 1 && v < 8000) {
            sensor.mouseVelocities = [...sensor.mouseVelocities.slice(-39), v];
          }
        }
      }
      sensor.lastMousePos = { x: e.clientX, y: e.clientY, t: now };
    };

    const onPaste = () => {
      sensor.pasteDetected = true;
      sensor.actionCount += 2;
    };

    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('keyup', onKeyUp, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('paste', onPaste, { passive: true });

    const interval = setInterval(() => {
      const avg = (arr, fallback) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;
      const secsSinceLogin = Math.max(5, (Date.now() - sensor.loginTimestamp) / 1000);
      const payload = {
        keystroke: {
          mean_flight_time: Number(avg(sensor.flightTimes, 120.0).toFixed(1)),
          mean_dwell_time: Number(avg(sensor.dwellTimes, 85.0).toFixed(1)),
          speed_wpm: 62.0,
        },
        mouse: {
          mean_velocity: Number(avg(sensor.mouseVelocities, 450.0).toFixed(1)),
          curvature: 1.35,
          jitter: 12.0,
        },
        navigation_sequence: sensor.navigationSequence,
        seconds_since_login: Number(secsSinceLogin.toFixed(1)),
        paste_detected: Boolean(sensor.pasteDetected),
        rapid_tab_switches: sensor.tabSwitchCount,
        action_velocity: Number(((sensor.actionCount / Math.max(secsSinceLogin, 15)) * 60).toFixed(2)),
        device_data: {
          device_hash: 'seller_dom_biometric_sensor',
          webdriver_detected: Boolean(navigator.webdriver),
          canvas_signature: true,
          webgl_signature: true,
          fonts_signature: true,
        },
      };
      sensor.pasteDetected = false;
      sensor.tabSwitchCount = 0;

      fetch(`${API_BASE}/users/me/telemetry-heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 25000);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('paste', onPaste);
      clearInterval(interval);
    };
  }, [token]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [offerFilter, setOfferFilter] = useState('ALL');

  // Detail / Edit Full-Page View state
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [editFormData, setEditFormData] = useState(null);

  // Add Property Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProperty, setNewProperty] = useState({
    title: '',
    location: '',
    price: '',
    property_type: 'Luxury Villa',
    bedrooms: 3,
    bathrooms: 3,
    square_feet: 2500,
    status: 'ACTIVE',
    images: [],
    description: '',
  });

  // Offer Modal states
  const [reviewingOffer, setReviewingOffer] = useState(null);
  const [messagingOffer, setMessagingOffer] = useState(null);
  const [messageText, setMessageText] = useState('');

  // Status feedback toast
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  // ── LISTING BACKUP CODES POPUP MODAL ──────────────────────────────────────
  const [listingBackupModal, setListingBackupModal] = useState({
    isOpen: false,
    propertyId: '',
    propertyTitle: '',
    codes: [],
    isRefill: false,
    copied: false,
  });

  // ── STEP-UP IDENTITY VERIFICATION & ANTI-ATO PROTECTION STATE ─────────────
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(8);
  const [stepUpModal, setStepUpModal] = useState({
    isOpen: false,
    actionType: '', // 'EDIT_LISTING' | 'DELETE_LISTING' | 'UPDATE_PROFILE'
    actionTitle: '',
    actionSubtitle: '',
    targetLabel: '',
    targetPropertyId: null, // Set when verifying for a property listing
    method: 'backup', // 'backup' | 'email_otp'
    codeInput: '',
    loading: false,
    sendingEmail: false,
    emailSentMessage: '',
    error: '',
    onVerified: null,
  });

  // ── MY PROFILE (SETTINGS) STATE ────────────────────────────────────────────
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);

  // ── MESSAGES PAGE ONE-TIME PASSCODE SECURITY CONTROL STATE ─────────────────
  const [isMessagesUnlocked, setIsMessagesUnlocked] = useState(false);
  const [messagesAuthStatus, setMessagesAuthStatus] = useState({
    has_passcode: false,
    hash_algorithm: 'bcrypt',
    hash_preview: null,
    total_hashed_passcodes_stored: 0,
  });
  const [newMessagesPasscode, setNewMessagesPasscode] = useState('');
  const [confirmMessagesPasscode, setConfirmMessagesPasscode] = useState('');
  const [verifyMessagesPasscode, setVerifyMessagesPasscode] = useState('');
  const [messagesAuthLoading, setMessagesAuthLoading] = useState(false);
  const [messagesAuthError, setMessagesAuthError] = useState('');
  const [messagesAuthSuccess, setMessagesAuthSuccess] = useState('');
  const [selectedClientThreadId, setSelectedClientThreadId] = useState(null);
  const [clientChatInput, setClientChatInput] = useState('');
  const [inboxFilter, setInboxFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'REPLIED'
  const [inboxSearchQuery, setInboxSearchQuery] = useState('');
  const [clientConversations, setClientConversations] = useState(() => {
    try {
      const saved = localStorage.getItem(`pb_seller_conversations_${userKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'inbox_thread_1',
        offer_id: 'inbox_1',
        client_name: 'Amara Okafor',
        client_email: 'amara.okafor@primecapital.ke',
        client_phone: '+254 722 841 902',
        client_badge: 'Pre-Approved Cash Buyer',
        subject: 'Private Viewing & Purchase Inquiry',
        property_title: 'Karen Ridge Luxury Villa (or Active Portfolio)',
        offer_amount: 1450000,
        unread: true,
        status: 'AWAITING_REPLY',
        last_activity: '10:24 AM',
        messages: [
          {
            id: 'msg_101',
            sender: 'buyer',
            text: 'Hello! I reviewed your portfolio on Property Base and I am very interested in scheduling a private viewing this Thursday afternoon. Our family is pre-approved for immediate settlement — please let me know if 2:00 PM works for you.',
            timestamp: 'Today, 10:24 AM',
          },
        ],
      },
      {
        id: 'inbox_thread_2',
        offer_id: 'inbox_2',
        client_name: 'David & Elena Vance',
        client_email: 'd.vance@vanceholdings.com',
        client_phone: '+254 733 519 440',
        client_badge: 'Verified Investor',
        subject: 'Title Deed & Closing Timeline Question',
        property_title: 'Westlands Executive Penthouse',
        offer_amount: 890000,
        unread: true,
        status: 'AWAITING_REPLY',
        last_activity: 'Yesterday',
        messages: [
          {
            id: 'msg_201',
            sender: 'buyer',
            text: 'Good afternoon, we are prepared to submit a formal purchase contract at asking price with a 20% earnest deposit in escrow. Could you confirm if a 30-day closing timeline works on your end?',
            timestamp: 'Yesterday, 4:15 PM',
          },
        ],
      },
      {
        id: 'inbox_thread_3',
        offer_id: 'inbox_3',
        client_name: 'Dr. Marcus Mutua',
        client_email: 'marcus.mutua@nairobimed.org',
        client_phone: '+254 711 309 778',
        client_badge: 'Verified Buyer',
        subject: 'Follow-up on Property Specifications & HOA',
        property_title: 'Muthaiga Ambassadorial Residence',
        offer_amount: 2150000,
        unread: false,
        status: 'AWAITING_REPLY',
        last_activity: '2 days ago',
        messages: [
          {
            id: 'msg_301',
            sender: 'buyer',
            text: 'Hi there, thank you for listing your property details. Does the residence include backup solar power and borehole water storage? Looking forward to your reply.',
            timestamp: '2 days ago, 11:05 AM',
          },
        ],
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        `pb_seller_conversations_${userKey}`,
        JSON.stringify(clientConversations)
      );
    } catch (e) {
      console.error(e);
    }
  }, [clientConversations, userKey]);
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    username: user?.username || '',
    mobile_number: user?.mobile_number || '',
    email: user?.email || '',
  });

  // ── MESSAGES BACKUP CODES STATE (USED FOR FINANCIALS EDIT VERIFICATION) ────
  const storageKeyMessagesBackupCodes = `pb_messages_backup_codes_${userKey}`;
  const [messagesBackupCodes, setMessagesBackupCodes] = useState(() => {
    try {
      const saved = localStorage.getItem(`pb_messages_backup_codes_${userKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [showMessagesBackupBanner, setShowMessagesBackupBanner] = useState(true);
  const [generatingMessagesCodes, setGeneratingMessagesCodes] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKeyMessagesBackupCodes,
        JSON.stringify(messagesBackupCodes)
      );
    } catch (e) {
      console.error(e);
    }
  }, [messagesBackupCodes, storageKeyMessagesBackupCodes]);

  // ── FINANCIALS (CREDIT CARD, BANK ACCOUNT & SOLD PROPERTY RECEIPTS) STATE ──
  const [isEditingFinancials, setIsEditingFinancials] = useState(false);
  const [financialsSaving, setFinancialsSaving] = useState(false);
  const [financialsMfaModal, setFinancialsMfaModal] = useState({
    isOpen: false,
    initiating: false,
    verifying: false,
    challengeId: '',
    expectedNumber: null,
    numberChoices: [],
    pushStatus: 'PENDING', // 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'
    email: user?.email || '',
    backupCodeInput: '',
    error: '',
    infoMessage: '',
  });
  const [financialsForm, setFinancialsForm] = useState(() => {
    const defaultHolder = user?.first_name
      ? `${user.first_name} ${user.last_name || ''}`.trim()
      : user?.username || 'Verified Property Seller';
    return {
      cardholder_name: defaultHolder,
      card_brand: 'Visa Infinite',
      card_number: '**** **** **** 8842',
      expiry_date: '08/28',
      cvv: '***',
      bank_name: 'KCB Private Wealth Bank',
      bank_account_number: '********7465',
      swift_routing_code: 'KCB******14',
      billing_phone: '+254 *** *** 902',
    };
  });

  // Poll mobile email number-matching push status while the Financials Step-Up Modal is open
  useEffect(() => {
    if (
      !financialsMfaModal.isOpen ||
      !financialsMfaModal.challengeId ||
      financialsMfaModal.pushStatus === 'APPROVED' ||
      financialsMfaModal.pushStatus === 'DENIED'
    ) {
      return undefined;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/mfa/push-status?challenge_id=${encodeURIComponent(
            financialsMfaModal.challengeId
          )}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'APPROVED') {
          setFinancialsMfaModal((prev) => ({
            ...prev,
            pushStatus: 'APPROVED',
            error: '',
            infoMessage: `Mobile email number match (${prev.expectedNumber}) confirmed! Now enter your unused Messages backup code below to unlock editing.`,
          }));
        } else if (data.status === 'DENIED' || data.status === 'EXPIRED') {
          setFinancialsMfaModal((prev) => ({
            ...prev,
            pushStatus: data.status,
            error:
              data.status === 'DENIED'
                ? 'Wrong digit tapped on mobile email! Click "Send New Number to Email" to try again.'
                : 'Number challenge expired. Click "Send New Number to Email" to request a fresh digit.',
          }));
        }
      } catch (err) {
        // Ignore transient polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [
    financialsMfaModal.isOpen,
    financialsMfaModal.challengeId,
    financialsMfaModal.pushStatus,
  ]);

  const handleGenerateMessagesBackupCodes = async () => {
    if (!token) return;
    setGeneratingMessagesCodes(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/messages-auth/generate-backup-codes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Could not generate Messages backup codes.');
      }
      if (Array.isArray(data.messages_backup_codes)) {
        setMessagesBackupCodes(data.messages_backup_codes);
        setShowMessagesBackupBanner(true);
      }
      if (typeof data.unused_count === 'number') {
        setBackupCodesRemaining(data.unused_count);
      }
      showToast(
        'success',
        'Generated 5 fresh single-use Messages backup codes (hashed in PostgreSQL)!'
      );
    } catch (err) {
      showToast('error', err.message || 'Failed to generate Messages backup codes.');
    } finally {
      setGeneratingMessagesCodes(false);
    }
  };

  const handleOpenFinancialsMfaModal = async () => {
    if (!token) return;
    setFinancialsMfaModal({
      isOpen: true,
      initiating: true,
      verifying: false,
      challengeId: '',
      expectedNumber: null,
      numberChoices: [],
      pushStatus: 'PENDING',
      email: user?.email || '',
      backupCodeInput: '',
      error: '',
      infoMessage: '',
    });

    try {
      // If user has no local Messages backup codes yet, also generate a set so they have unused Messages backup codes
      if (!messagesBackupCodes || messagesBackupCodes.length === 0) {
        const genRes = await fetch(
          `${API_BASE}/users/me/messages-auth/generate-backup-codes`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (genRes.ok) {
          const genData = await genRes.json().catch(() => ({}));
          if (Array.isArray(genData.messages_backup_codes)) {
            setMessagesBackupCodes(genData.messages_backup_codes);
          }
        }
      }

      const res = await fetch(`${API_BASE}/users/me/financials-mfa/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device_fp: 'FINANCIALS-EDIT-STEPUP',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.detail || 'Failed to initiate mobile email number-matching verification.'
        );
      }

      if (
        Array.isArray(data.newly_generated_messages_backup_codes) &&
        data.newly_generated_messages_backup_codes.length > 0
      ) {
        setMessagesBackupCodes(data.newly_generated_messages_backup_codes);
      }

      setFinancialsMfaModal((prev) => ({
        ...prev,
        initiating: false,
        challengeId: data.challenge_id,
        expectedNumber: data.expected_number,
        numberChoices: data.number_choices || [],
        pushStatus: 'PENDING',
        email: data.email || user?.email || '',
        infoMessage:
          data.message ||
          `Open the email sent to ${data.email || user?.email} on your mobile phone and tap the number ${data.expected_number}.`,
      }));
    } catch (err) {
      setFinancialsMfaModal((prev) => ({
        ...prev,
        initiating: false,
        error: err.message || 'Could not start verification challenge.',
      }));
    }
  };

  const handleCloseFinancialsMfaModal = () => {
    setFinancialsMfaModal((prev) => ({
      ...prev,
      isOpen: false,
      initiating: false,
      verifying: false,
      error: '',
    }));
  };

  const handleVerifyFinancialsMfa = async (e) => {
    e.preventDefault();
    if (!token) return;

    if (financialsMfaModal.pushStatus !== 'APPROVED') {
      setFinancialsMfaModal((prev) => ({
        ...prev,
        error: `Please press the number ${prev.expectedNumber} on the email sent to ${prev.email} on your mobile phone first.`,
      }));
      return;
    }

    const cleanBackup = (financialsMfaModal.backupCodeInput || '').trim().toUpperCase();
    if (!cleanBackup) {
      setFinancialsMfaModal((prev) => ({
        ...prev,
        error: 'Please enter one of your unused Messages backup codes.',
      }));
      return;
    }

    setFinancialsMfaModal((prev) => ({ ...prev, verifying: true, error: '' }));

    try {
      const res = await fetch(`${API_BASE}/users/me/financials-mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          challenge_id: financialsMfaModal.challengeId,
          backup_code: cleanBackup,
          active_messages_codes: messagesBackupCodes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 423) {
          showToast('error', data.detail || 'Account locked due to repeated failed attempts.');
          if (onLogout) setTimeout(() => onLogout(), 2200);
          return;
        }
        throw new Error(
          data.detail || 'Verification failed. Please check your unused Messages backup code.'
        );
      }

      // Consume the used backup code locally so it is no longer listed as unused
      setMessagesBackupCodes((prev) =>
        prev.filter((c) => String(c).trim().toUpperCase() !== cleanBackup)
      );
      if (typeof data.remaining_backup_codes === 'number') {
        setBackupCodesRemaining(data.remaining_backup_codes);
      }

      handleCloseFinancialsMfaModal();
      await executeSaveFinancials();
    } catch (err) {
      setFinancialsMfaModal((prev) => ({
        ...prev,
        verifying: false,
        error: err.message,
      }));
    }
  };

  // Load hashed/masked financial details from PostgreSQL database
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/users/me/financials`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setFinancialsForm((prev) => ({
            ...prev,
            cardholder_name: data.cardholder_name || prev.cardholder_name,
            bank_name: data.bank_name || prev.bank_name,
            card_number: data.card_number_masked || prev.card_number,
            bank_account_number: data.bank_account_masked || prev.bank_account_number,
            expiry_date: data.expiry_date || prev.expiry_date,
            cvv: data.cvv_masked || '***',
            billing_phone: data.billing_phone_masked || prev.billing_phone,
            swift_routing_code: data.swift_routing_masked || prev.swift_routing_code,
          }));
        }
      })
      .catch(() => {});
  }, [token]);

  // Star (*) Masking Helpers for Confidential Financial & Contact Information
  const maskCardNumber = (numStr) => {
    const str = String(numStr || '').trim();
    if (str.includes('*')) return str;
    const digits = str.replace(/\s+/g, '');
    if (!digits) return '**** **** **** ****';
    const last4 = digits.slice(-4);
    return `**** **** **** ${last4}`;
  };

  const maskBankAccount = (acctStr) => {
    const clean = String(acctStr || '').trim();
    if (clean.includes('*')) return clean;
    if (!clean) return '********0000';
    if (clean.length <= 4) return '****' + clean;
    const last4 = clean.slice(-4);
    const stars = '*'.repeat(Math.max(6, clean.length - 4));
    return `${stars}${last4}`;
  };

  const maskPhoneNumber = (phoneStr) => {
    const clean = String(phoneStr || '').trim();
    if (clean.includes('*')) return clean;
    if (!clean) return '+254 *** *** ***';
    if (clean.length <= 4) return '*'.repeat(clean.length);
    const prefix = clean.slice(0, 4);
    const suffix = clean.slice(-3);
    return `${prefix} *** *** ${suffix}`;
  };

  const maskCvv = () => '***';

  const maskSwiftOrRef = (codeStr) => {
    const clean = String(codeStr || '').trim();
    if (clean.includes('*')) return clean;
    if (!clean) return '********';
    if (clean.length <= 4) return '****';
    return `${clean.slice(0, 3)}${'*'.repeat(Math.max(4, clean.length - 5))}${clean.slice(-2)}`;
  };

  const executeSaveFinancials = async () => {
    if (!token) return;
    setFinancialsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/financials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(financialsForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save financial details.');
      }
      if (data.financials) {
        setFinancialsForm((prev) => ({
          ...prev,
          cardholder_name: data.financials.cardholder_name,
          bank_name: data.financials.bank_name,
          card_number: data.financials.card_number_masked,
          bank_account_number: data.financials.bank_account_masked,
          expiry_date: data.financials.expiry_date,
          cvv: data.financials.cvv_masked || '***',
          billing_phone: data.financials.billing_phone_masked,
          swift_routing_code: data.financials.swift_routing_masked,
        }));
      }
      setIsEditingFinancials(false);
      showToast(
        'success',
        'MFA verified! Your updated credit card and bank account details have been hashed and saved to the database.'
      );
    } catch (err) {
      showToast('error', err.message || 'Could not update financial details.');
    } finally {
      setFinancialsSaving(false);
    }
  };

  const handleSaveFinancials = async (e) => {
    e.preventDefault();
    if (!token) return;
    // Open the Dual Step-Up MFA modal (Mobile Email Number Match + Unused Messages Backup Code)
    // AFTER the user has edited their financial details and clicked Save!
    await handleOpenFinancialsMfaModal();
  };

  const handleDownloadReceipt = (receipt) => {
    const lines = [
      '============================================================',
      '        PROPERTY BASE - OFFICIAL PROPERTY SALE RECEIPT      ',
      '============================================================',
      `Receipt Number      : ${receipt.receipt_no}`,
      `Settlement Date     : ${receipt.date_settled}`,
      `Property Sold       : ${receipt.property_title}`,
      `Property Location   : ${receipt.property_location}`,
      `Gross Sale Amount   : ${formatCurrency(receipt.sale_amount)}`,
      `Platform Escrow Fee : ${formatCurrency(receipt.escrow_fee)}`,
      `Net Payout Disbursed: ${formatCurrency(receipt.net_payout)}`,
      '------------------------------------------------------------',
      'CONFIDENTIAL PAYOUT & BUYER DETAILS (MASKED FOR SECURITY)',
      `Seller Bank Name    : ${financialsForm.bank_name}`,
      `Seller Bank Account : ${maskBankAccount(financialsForm.bank_account_number)}`,
      `Linked Credit Card  : ${maskCardNumber(financialsForm.card_number)}`,
      `Seller Phone Number : ${maskPhoneNumber(financialsForm.billing_phone)}`,
      `Buyer Name          : ${receipt.buyer_name}`,
      `Buyer Phone Number  : ${maskPhoneNumber(receipt.buyer_phone)}`,
      `Buyer Bank Account  : ${maskBankAccount(receipt.buyer_account)}`,
      `Wire / Escrow Ref   : ${maskSwiftOrRef(receipt.wire_reference)}`,
      `Settlement Status   : ${receipt.status}`,
      '============================================================',
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PropertyBase-Receipt-${receipt.receipt_no}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setProfileForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      username: user?.username || '',
      mobile_number: user?.mobile_number || '',
      email: user?.email || '',
    });
  }, [user]);

  // Fetch remaining backup codes count from backend security overview
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/users/me/security`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.backup_codes_remaining === 'number') {
          setBackupCodesRemaining(data.backup_codes_remaining);
        }
      })
      .catch(() => {});
  }, [token, activeNav]);

  const showToast = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Automatically regenerate a new set of listing backup codes and display them on screen
  // once all backup codes have been used up and the user logs back in to the web application!
  useEffect(() => {
    if (!token) return;
    if (listingMfa.lastSeenToken !== token) {
      if (listingMfa.initialized && listingMfa.codes.length === 0) {
        const freshCodes = generateListingBackupCodes(3);
        setListingMfa({
          initialized: true,
          codes: freshCodes,
          notificationVisible: true,
          notificationReason: 'REGENERATED_ON_LOGIN',
          lastSeenToken: token,
        });
        setListingBackupModal({
          isOpen: true,
          propertyId: 'all',
          propertyTitle: 'All Property Listings',
          codes: freshCodes,
          isRefill: true,
          copied: false,
        });
        setFeedback({
          type: 'success',
          text: 'Welcome back! Since all your previous listing backup codes were used up, a new set of 3 backup codes has been generated for your listings.',
        });
      } else {
        setListingMfa((prev) => ({
          ...prev,
          lastSeenToken: token,
        }));
      }
    }
  }, [token, listingMfa.initialized, listingMfa.codes.length, listingMfa.lastSeenToken]);

  // ── LISTING BACKUP CODES POPUP & BANNER HELPERS ────────────────────────────
  const copyListingCodesToClipboard = (codesArray) => {
    const targetCodes = Array.isArray(codesArray) && codesArray.length ? codesArray : listingBackupModal.codes;
    if (!targetCodes.length) return;
    const text = targetCodes.join('\n');
    navigator.clipboard.writeText(text);
    setListingBackupModal((prev) => ({ ...prev, copied: true }));
    setBannerCopied(true);
    setTimeout(() => {
      setListingBackupModal((prev) => ({ ...prev, copied: false }));
      setBannerCopied(false);
    }, 3000);
  };

  const downloadListingCodesFile = (codesArray) => {
    const targetCodes = Array.isArray(codesArray) && codesArray.length ? codesArray : listingBackupModal.codes;
    if (!targetCodes.length) return;
    const textContent =
      `PROPERTY BASE - LISTING MFA BACKUP CODES (SINGLE-USE CODES)\n` +
      `Generated: ${new Date().toLocaleString()}\n` +
      `Seller Account: ${user?.email || ''}\n\n` +
      `IMPORTANT: Use these single-use backup codes to verify your identity whenever you want to View & Edit or Delete any property listing in your portfolio.\n` +
      `Once all backup codes have been used up, a new set of codes will automatically be generated and displayed on your screen the next time you log in.\n\n` +
      targetCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `propertybase-listing-backup-codes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── STEP-UP VERIFICATION MODAL HELPERS ─────────────────────────────────────
  const requestStepUpVerification = ({
    actionType,
    actionTitle,
    actionSubtitle,
    targetLabel,
    targetPropertyId = null,
    onVerified,
  }) => {
    setStepUpModal({
      isOpen: true,
      actionType,
      actionTitle,
      actionSubtitle,
      targetLabel: targetLabel || actionTitle,
      targetPropertyId,
      method: 'backup',
      codeInput: '',
      loading: false,
      sendingEmail: false,
      emailSentMessage: '',
      error: '',
      onVerified,
    });
  };

  const handleCloseStepUpModal = () => {
    setStepUpModal((prev) => ({
      ...prev,
      isOpen: false,
      codeInput: '',
      error: '',
      emailSentMessage: '',
      loading: false,
      sendingEmail: false,
    }));
  };

  // Automatically dispatches 6-digit code to the user's registered account email without asking them to type their email
  const handleSendStepUpEmailCode = async () => {
    if (!token) {
      setStepUpModal((prev) => ({
        ...prev,
        error: 'Authentication token missing. Please sign in again.',
      }));
      return;
    }

    setStepUpModal((prev) => ({
      ...prev,
      sendingEmail: true,
      error: '',
      emailSentMessage: '',
    }));

    try {
      const res = await fetch(`${API_BASE}/users/me/action-mfa/send-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action_type: stepUpModal.actionType,
          target_label: stepUpModal.targetLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to send verification code to registered email.');
      }

      setStepUpModal((prev) => ({
        ...prev,
        method: 'email_otp',
        codeInput: '',
        sendingEmail: false,
        emailSentMessage: data.dev_code
          ? `Verification code sent to ${user?.email} (Code: ${data.dev_code})`
          : data.message || `A 6-digit verification code has been sent to ${user?.email}.`,
      }));
    } catch (err) {
      setStepUpModal((prev) => ({
        ...prev,
        sendingEmail: false,
        error: err.message,
      }));
    }
  };

  const handleVerifyStepUpAction = async (e) => {
    e.preventDefault();
    const cleanInput = stepUpModal.codeInput.trim().toUpperCase();
    if (!cleanInput) {
      setStepUpModal((prev) => ({
        ...prev,
        error:
          prev.method === 'backup'
            ? 'Please enter one of your single-use backup codes.'
            : 'Please enter the 6-digit verification code sent to your email.',
      }));
      return;
    }

    setStepUpModal((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      // CASE A: Verifying a Property Listing (View & Edit or Delete) via the user's Listing Backup Codes
      if (stepUpModal.method === 'backup' && stepUpModal.targetPropertyId) {
        const availableCodes = (listingMfa.codes || []).map((c) =>
          String(c).trim().toUpperCase()
        );

        if (availableCodes.length === 0) {
          throw new Error(
            'All of your listing backup codes have been used up. Please log out and log back in to receive a newly generated set of backup codes on your screen, or verify via your registered email below.'
          );
        }

        if (availableCodes.includes(cleanInput)) {
          // Valid listing backup code! Consume this code
          const remainingCodes = availableCodes.filter((c) => c !== cleanInput);

          setListingMfa((prev) => ({
            ...prev,
            initialized: true,
            codes: remainingCodes,
            notificationVisible: remainingCodes.length > 0 ? prev.notificationVisible : false,
          }));

          const callback = stepUpModal.onVerified;
          handleCloseStepUpModal();

          if (callback) {
            callback(remainingCodes);
          }

          if (remainingCodes.length === 0) {
            showToast(
              'success',
              'Identity verified! You have now used all of your listing backup codes — a new set of backup codes will automatically be generated and displayed on your screen the next time you log in.'
            );
          } else {
            showToast(
              'success',
              `Identity verified! (${remainingCodes.length} listing backup code(s) remaining to edit or delete any property listing).`
            );
          }
          return;
        }

        // Code did not match the active listing backup codes -> Record ATO Risk Alert on backend!
        if (token) {
          const failRes = await fetch(`${API_BASE}/users/me/action-mfa/record-failure`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action_type: stepUpModal.actionType,
              method: 'listing_backup_code',
              target_label: stepUpModal.targetLabel,
            }),
          });
          const failData = await failRes.json();
          throw new Error(
            failData.detail ||
              `Invalid or already used listing backup code.`
          );
        } else {
          throw new Error(`Invalid or already used listing backup code.`);
        }
      }

      // CASE B: Email OTP verification (for Listings or Profile) OR Account Backup Code (for Profile Settings)
      const res = await fetch(`${API_BASE}/users/me/action-mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          method: stepUpModal.method,
          code: cleanInput,
          action_type: stepUpModal.actionType,
          target_label: stepUpModal.targetLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Identity verification failed.');
      }

      if (typeof data.backup_codes_remaining === 'number') {
        setBackupCodesRemaining(data.backup_codes_remaining);
      }

      if (data.new_backup_codes && data.new_backup_codes.length > 0 && onShowBackupCodes) {
        onShowBackupCodes(data.new_backup_codes);
      }

      const callback = stepUpModal.onVerified;
      handleCloseStepUpModal();

      showToast('success', data.message || 'Identity verified successfully!');
      if (callback) {
        callback();
      }
    } catch (err) {
      setStepUpModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  };

  const handleGenerateFreshBackupCodes = async () => {
    if (!token) return;
    setGeneratingCodes(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/generate-backup-codes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Could not generate backup codes.');
      }
      setBackupCodesRemaining(8);
      if (data.backup_codes && onShowBackupCodes) {
        onShowBackupCodes(data.backup_codes);
      }
      showToast('success', 'Generated 8 fresh single-use backup codes!');
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setGeneratingCodes(false);
    }
  };

  // ── PERMANENT ACCOUNT DELETION (WITH EMAIL OTP STEP-UP MFA) ───────────────
  const handleExecutePermanentAccountDeletion = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/users/me/account`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to permanently delete account.');
      }

      // Clear local storage records associated with this user
      try {
        localStorage.removeItem(storageKeyListings);
        localStorage.removeItem(storageKeyOffers);
        localStorage.removeItem(storageKeyListingMfa);
        localStorage.removeItem(`pb_seller_conversations_${userKey}`);
      } catch (e) {
        console.error(e);
      }

      showToast(
        'success',
        data.message || 'Your account has been permanently deleted from the database.'
      );
      if (onLogout) {
        setTimeout(() => {
          onLogout();
        }, 1200);
      }
    } catch (err) {
      showToast('error', err.message || 'Could not delete account.');
    }
  };

  const handleRequestDeleteAccount = async () => {
    setStepUpModal({
      isOpen: true,
      actionType: 'DELETE_ACCOUNT',
      actionTitle: 'Verify Identity to Delete Account',
      actionSubtitle:
        'To permanently delete your account, please enter the 6-digit verification code sent to your registered email address.',
      targetLabel: `Permanent Account Deletion (${user?.email || 'Account'})`,
      targetPropertyId: null,
      method: 'email_otp',
      codeInput: '',
      loading: false,
      sendingEmail: true,
      emailSentMessage: '',
      error: '',
      onVerified: handleExecutePermanentAccountDeletion,
    });

    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/users/me/action-mfa/send-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action_type: 'DELETE_ACCOUNT',
          target_label: `Permanent Account Deletion (${user?.email || 'Account'})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to send verification code to registered email.');
      }

      setStepUpModal((prev) => ({
        ...prev,
        method: 'email_otp',
        sendingEmail: false,
        emailSentMessage: data.dev_code
          ? `Verification code sent to ${user?.email} (Code: ${data.dev_code})`
          : data.message || `A 6-digit verification code has been sent to ${user?.email}.`,
      }));
    } catch (err) {
      setStepUpModal((prev) => ({
        ...prev,
        sendingEmail: false,
        error: err.message,
      }));
    }
  };

  // ── PHOTO UPLOAD HANDLERS (LOCAL IMAGE FILES) ──────────────────────────────
  const handlePhotoFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const fileReaders = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(fileReaders).then((newBase64Images) => {
      setNewProperty((prev) => ({
        ...prev,
        images: [...(prev.images || []), ...newBase64Images],
      }));
      showToast('success', `${files.length} property photo(s) uploaded successfully.`);
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (indexToRemove) => {
    setNewProperty((prev) => ({
      ...prev,
      images: (prev.images || []).filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const handleEditPhotoFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const fileReaders = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(fileReaders).then((newBase64Images) => {
      setEditFormData((prev) => {
        const currentList = prev.images || (prev.image_url ? [prev.image_url] : []);
        const updatedImages = [...currentList, ...newBase64Images];
        return {
          ...prev,
          images: updatedImages,
          image_url: updatedImages[0] || prev.image_url,
        };
      });
      showToast('success', `${files.length} new photo(s) added to property listing.`);
    });
    e.target.value = '';
  };

  const handleRemoveEditPhoto = (indexToRemove) => {
    setEditFormData((prev) => {
      const currentList = prev.images || (prev.image_url ? [prev.image_url] : []);
      const updatedImages = currentList.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        images: updatedImages,
        image_url: updatedImages[0] || '',
      };
    });
  };

  // ── SYNTHETIC OFFER GENERATOR ─────────────────────────────────────────────
  // Generates realistic verified prospective buyer offers tailored to a property
  const generateSyntheticOffers = (targetProperty, count = 1) => {
    if (!targetProperty) return;

    // Pick random synthetic buyers from the pool
    const shuffled = [...SYNTHETIC_BUYER_POOL].sort(() => 0.5 - Math.random());
    const selectedBuyers = shuffled.slice(0, count);

    const newOffers = selectedBuyers.map((buyer, idx) => {
      // Calculate realistic offer price rounded to nearest $5,000
      const calculatedAmt = Math.round((Number(targetProperty.price) * buyer.discount) / 5000) * 5000;
      const primaryPhoto =
        targetProperty.image_url ||
        (targetProperty.images && targetProperty.images[0]) ||
        '';

      return {
        id: `off-${Date.now().toString().slice(-5)}-${idx + 1}-${Math.floor(Math.random() * 900 + 100)}`,
        property_id: targetProperty.id,
        property_title: targetProperty.title,
        property_image: primaryPhoto,
        client_name: buyer.name,
        client_avatar: buyer.avatar,
        client_email: buyer.email,
        client_phone: buyer.phone,
        offer_amount: calculatedAmt,
        list_price: Number(targetProperty.price),
        date_received: 'Just now',
        message_preview: buyer.message(targetProperty.title, targetProperty.location),
        financing_type: buyer.financing_type,
        contingencies: buyer.contingencies,
        status: 'PENDING',
      };
    });

    // Prepend new offers
    setOffers((prev) => [...newOffers, ...prev]);

    // Update target property inquiry and view stats
    setListings((prev) =>
      prev.map((p) =>
        p.id === targetProperty.id
          ? {
              ...p,
              inquiries_count: (p.inquiries_count || 0) + newOffers.length,
              views_count: (p.views_count || 0) + Math.floor(Math.random() * 20) + 12,
            }
          : p
      )
    );

    const first = newOffers[0];
    showToast(
      'success',
      `New buyer offer of ${formatCurrency(first.offer_amount)} received from ${first.client_name} for "${targetProperty.title}"!`
    );
  };

  // ── HANDLERS: LISTINGS (PROTECTED BY LISTING MFA BACKUP CODES) ────────────
  const handleViewProperty = (property) => {
    requestStepUpVerification({
      actionType: 'EDIT_LISTING',
      actionTitle: 'Verify Identity to View & Edit Listing',
      actionSubtitle: `Enter one of your single-use listing backup codes (or verify via your registered email) to view and edit "${property.title}".`,
      targetLabel: property.title,
      targetPropertyId: property.id,
      onVerified: () => {
        setSelectedProperty(property);
        setEditFormData({
          ...property,
          images: property.images || (property.image_url ? [property.image_url] : []),
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };

  const handleSavePropertyChanges = (e) => {
    e.preventDefault();
    if (!editFormData) return;

    const primaryImg =
      (editFormData.images && editFormData.images[0]) || editFormData.image_url || '';

    setListings((prev) =>
      prev.map((item) =>
        item.id === editFormData.id
          ? {
              ...editFormData,
              price: Number(editFormData.price),
              bedrooms: Number(editFormData.bedrooms),
              bathrooms: Number(editFormData.bathrooms),
              square_feet: Number(editFormData.square_feet),
              image_url: primaryImg,
              images: editFormData.images && editFormData.images.length > 0 ? editFormData.images : [primaryImg],
            }
          : item
      )
    );

    setSelectedProperty(null);
    setEditFormData(null);
    showToast('success', `Listing "${editFormData.title}" updated successfully!`);
  };

  const handleDeleteProperty = (id) => {
    const targetListing = listings.find((p) => p.id === id);
    const titleLabel = targetListing ? targetListing.title : `Listing #${id}`;

    requestStepUpVerification({
      actionType: 'DELETE_LISTING',
      actionTitle: 'Verify Identity to Delete Property Listing',
      actionSubtitle: `Deleting "${titleLabel}" is a permanent action. Enter one of your single-use listing backup codes (or verify via your registered email).`,
      targetLabel: titleLabel,
      targetPropertyId: id,
      onVerified: () => {
        setListings((prev) => prev.filter((p) => p.id !== id));
        setOffers((prev) => prev.filter((o) => o.property_id !== id));
        setSelectedProperty(null);
        setEditFormData(null);
        showToast('success', `Property listing "${titleLabel}" and associated offers removed.`);
      },
    });
  };

  // ── HANDLER: MY PROFILE EDIT & SAVE (PROTECTED BY STEP-UP VERIFICATION) ────
  const handleUnlockProfileEditing = () => {
    requestStepUpVerification({
      actionType: 'UPDATE_PROFILE',
      actionTitle: 'Verify Identity to Edit Personal Profile',
      actionSubtitle:
        'To protect your account against unauthorized takeover, please verify your identity before modifying your personal profile details.',
      targetLabel: `Profile (${user?.email})`,
      targetPropertyId: null,
      onVerified: () => {
        setIsProfileUnlocked(true);
      },
    });
  };

  const handleSaveProfileChanges = async (e) => {
    e.preventDefault();
    if (!isProfileUnlocked) {
      handleUnlockProfileEditing();
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          first_name: profileForm.first_name.trim(),
          last_name: profileForm.last_name.trim(),
          username: profileForm.username.trim(),
          mobile_number: profileForm.mobile_number.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update profile details.');
      }

      if (data.user && onUserUpdate) {
        onUserUpdate({ ...user, ...data.user });
      }
      setIsProfileUnlocked(false);
      showToast('success', data.message || 'Personal profile details updated and re-locked!');
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCreateProperty = (e) => {
    e.preventDefault();
    if (!newProperty.title || !newProperty.price || !newProperty.location) {
      showToast('error', 'Please fill in all required property details.');
      return;
    }

    if (!newProperty.images || newProperty.images.length === 0) {
      showToast('error', 'Please upload at least one photo of your property.');
      return;
    }

    const primaryImage = newProperty.images[0];
    const isFirstListingSetup = !listingMfa.initialized || listings.length === 0;
    const activeCodes = isFirstListingSetup
      ? generateListingBackupCodes(3)
      : listingMfa.codes;

    const createdItem = {
      id: `prop-${Date.now().toString().slice(-4)}`,
      title: newProperty.title.trim(),
      location: newProperty.location.trim(),
      price: Number(newProperty.price),
      property_type: newProperty.property_type,
      bedrooms: Number(newProperty.bedrooms),
      bathrooms: Number(newProperty.bathrooms),
      square_feet: Number(newProperty.square_feet),
      image_url: primaryImage,
      images: newProperty.images,
      description: newProperty.description.trim(),
      status: 'ACTIVE',
      views_count: Math.floor(Math.random() * 25) + 14,
      inquiries_count: 0,
      created_at: 'Just now',
    };

    // 1. Add new listing to portfolio and return to the Listings page
    setListings((prev) => [createdItem, ...prev]);
    setIsAddModalOpen(false);
    setActiveNav('listings');
    setSelectedProperty(null);
    setEditFormData(null);
    setNewProperty({
      title: '',
      location: '',
      price: '',
      property_type: 'Luxury Villa',
      bedrooms: 3,
      bathrooms: 3,
      square_feet: 2500,
      status: 'ACTIVE',
      images: [],
      description: '',
    });

    // 2. When the user posts their first listing and saves, issue random backup codes
    // and display the notification on the Listings page so they can use them to edit/delete any property listing!
    if (isFirstListingSetup) {
      setListingMfa({
        initialized: true,
        codes: activeCodes,
        notificationVisible: true,
        notificationReason: 'FIRST_LISTING',
        lastSeenToken: token || 'active',
      });
      setListingBackupModal({
        isOpen: true,
        propertyId: createdItem.id,
        propertyTitle: createdItem.title,
        codes: activeCodes,
        isRefill: false,
        copied: false,
      });
      showToast(
        'success',
        `First listing "${createdItem.title}" saved! Your random backup codes for editing or deleting any property listing are now displayed on the Listings page.`
      );
    } else {
      showToast(
        'success',
        `Listing "${createdItem.title}" published successfully!`
      );
    }

    // 3. Automatically generate synthetic buyer offers for this newly created listing!
    setTimeout(() => {
      generateSyntheticOffers(createdItem, 1);
    }, 1500);
  };

  // ── HANDLERS: OFFERS ──────────────────────────────────────────────────────
  const handleUpdateOfferStatus = (offerId, newStatus) => {
    setOffers((prev) =>
      prev.map((off) => {
        if (off.id === offerId) {
          return { ...off, status: newStatus };
        }
        return off;
      })
    );

    // If accepted, also mark property pending
    if (newStatus === 'ACCEPTED') {
      const targetOffer = offers.find((o) => o.id === offerId);
      if (targetOffer) {
        setListings((prev) =>
          prev.map((p) =>
            p.id === targetOffer.property_id ? { ...p, status: 'PENDING' } : p
          )
        );
      }
      showToast('success', 'Offer accepted! Property listing updated to Pending Sale.');
    } else if (newStatus === 'DECLINED') {
      showToast('success', 'Offer declined.');
    }

    setReviewingOffer(null);
  };

  const handleSendMessageToClient = (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    const replyText = messageText.trim();
    if (messagingOffer) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setClientConversations((prev) => {
        const existing = prev.find((c) => c.offer_id === messagingOffer.id);
        if (existing) {
          return prev.map((c) =>
            c.offer_id === messagingOffer.id
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { id: Date.now(), sender: 'seller', text: replyText, timestamp: nowStr },
                  ],
                }
              : c
          );
        }
        return [
          {
            id: `conv_${messagingOffer.id}`,
            offer_id: messagingOffer.id,
            client_name: messagingOffer.client_name,
            client_email: messagingOffer.client_email,
            property_title: messagingOffer.property_title,
            offer_amount: messagingOffer.offer_amount,
            messages: [
              {
                id: Date.now() - 1000,
                sender: 'buyer',
                text: messagingOffer.message_preview,
                timestamp: messagingOffer.date_received || 'Earlier',
              },
              {
                id: Date.now(),
                sender: 'seller',
                text: replyText,
                timestamp: nowStr,
              },
            ],
          },
          ...prev,
        ];
      });
    }
    showToast('success', `Message sent to ${messagingOffer.client_name}!`);
    setMessagingOffer(null);
    setMessageText('');
  };

  // ── MESSAGES PASSCODE AUTHENTICATION HANDLERS ─────────────────────────────
  const fetchMessagesAuthStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/users/me/messages-auth/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessagesAuthStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages auth status', err);
    }
  };

  const handleNavigateToMessages = (pendingOfferToReply = null) => {
    setActiveNav('messages');
    setSelectedProperty(null);
    setMessagesAuthError('');
    setMessagesAuthSuccess('');
    setNewMessagesPasscode('');
    setConfirmMessagesPasscode('');
    setVerifyMessagesPasscode('');
    fetchMessagesAuthStatus();
    if (pendingOfferToReply) {
      setSelectedClientThreadId(pendingOfferToReply.id);
    }
  };

  const handleSetMessagesPasscode = async (e) => {
    e.preventDefault();
    setMessagesAuthError('');
    setMessagesAuthSuccess('');

    if (!newMessagesPasscode || newMessagesPasscode.trim().length < 4) {
      setMessagesAuthError('Your Messages passcode must be at least 4 characters long.');
      return;
    }
    if (newMessagesPasscode.trim() !== confirmMessagesPasscode.trim()) {
      setMessagesAuthError('Passcode and confirm passcode do not match.');
      return;
    }

    setMessagesAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/messages-auth/set-passcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          passcode: newMessagesPasscode.trim(),
          confirm_passcode: confirmMessagesPasscode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessagesAuthError(data.detail || 'Failed to create Messages passcode.');
        setMessagesAuthLoading(false);
        return;
      }

      setMessagesAuthStatus({
        has_passcode: true,
        hash_algorithm: data.hash_algorithm || 'bcrypt',
        hash_preview: data.hash_preview || null,
        total_hashed_passcodes_stored: data.total_hashed_passcodes_stored || 1,
      });
      if (Array.isArray(data.messages_backup_codes) && data.messages_backup_codes.length > 0) {
        setMessagesBackupCodes(data.messages_backup_codes);
        setShowMessagesBackupBanner(true);
      }
      setNewMessagesPasscode('');
      setConfirmMessagesPasscode('');
      setIsMessagesUnlocked(true);
      showToast('success', 'Passcode created and Messages workspace unlocked!');
    } catch (err) {
      setMessagesAuthError('Network error while saving Messages passcode.');
    } finally {
      setMessagesAuthLoading(false);
    }
  };

  const handleVerifyMessagesPasscode = async (e) => {
    e.preventDefault();
    setMessagesAuthError('');
    setMessagesAuthSuccess('');

    if (!verifyMessagesPasscode.trim()) {
      setMessagesAuthError('Please enter your Messages workspace passcode.');
      return;
    }

    setMessagesAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/me/messages-auth/verify-passcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          passcode: verifyMessagesPasscode.trim(),
          consume_one_time: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 423) {
          showToast('error', data.detail || 'Account locked due to potential ATO.');
          if (onLogout) setTimeout(() => onLogout(), 2200);
          return;
        }
        setMessagesAuthError(data.detail || 'Incorrect Messages passcode.');
        setMessagesAuthLoading(false);
        return;
      }

      if (!messagesBackupCodes || messagesBackupCodes.length === 0) {
        handleGenerateMessagesBackupCodes();
      }
      setVerifyMessagesPasscode('');
      setIsMessagesUnlocked(true);
      showToast('success', 'Messages workspace unlocked!');
    } catch (err) {
      setMessagesAuthError('Network error while verifying Messages passcode.');
    } finally {
      setMessagesAuthLoading(false);
    }
  };

  const handleSendDirectThreadMessage = (e, activeThread) => {
    e.preventDefault();
    if (!clientChatInput.trim() || !activeThread) return;
    const text = clientChatInput.trim();
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setClientConversations((prev) => {
      const existsInInbox = prev.some(
        (c) => c.id === activeThread.id || c.offer_id === activeThread.offer_id
      );
      if (existsInInbox) {
        return prev.map((c) =>
          c.id === activeThread.id || c.offer_id === activeThread.offer_id
            ? {
                ...c,
                unread: false,
                status: 'REPLIED',
                last_activity: `Today, ${nowStr}`,
                messages: [
                  ...c.messages,
                  { id: `msg_${Date.now()}`, sender: 'seller', text, timestamp: `Today, ${nowStr}` },
                ],
              }
            : c
        );
      }
      return [
        {
          id: activeThread.id || `conv_${activeThread.offer_id}`,
          offer_id: activeThread.offer_id || activeThread.id,
          client_name: activeThread.client_name,
          client_email: activeThread.client_email,
          client_phone: activeThread.client_phone || 'Verified Property Base Client',
          client_badge: activeThread.client_badge || 'Verified Buyer',
          subject: activeThread.subject || `Purchase Inquiry on ${activeThread.property_title}`,
          property_title: activeThread.property_title,
          offer_amount: activeThread.offer_amount,
          unread: false,
          status: 'REPLIED',
          last_activity: `Today, ${nowStr}`,
          messages: [
            ...(activeThread.messages || []),
            { id: `msg_${Date.now()}`, sender: 'seller', text, timestamp: `Today, ${nowStr}` },
          ],
        },
        ...prev,
      ];
    });
    setClientChatInput('');
    showToast('success', `Reply sent to ${activeThread.client_name}!`);
  };

  const handleSelectInboxThread = (thread) => {
    setSelectedClientThreadId(thread.id);
    if (thread.unread) {
      setClientConversations((prev) =>
        prev.map((c) => (c.id === thread.id ? { ...c, unread: false } : c))
      );
    }
  };

  const handleToggleThreadUnread = (threadId) => {
    setClientConversations((prev) =>
      prev.map((c) => (c.id === threadId ? { ...c, unread: !c.unread } : c))
    );
  };

  const handleDeleteInboxThread = (threadId) => {
    setClientConversations((prev) => {
      const updated = prev.filter((c) => c.id !== threadId);
      if (selectedClientThreadId === threadId) {
        setSelectedClientThreadId(updated[0]?.id || null);
      }
      return updated;
    });
    showToast('success', 'Conversation removed from inbox.');
  };

  // ── FILTERED DATA ─────────────────────────────────────────────────────────
  const filteredListings = listings.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.property_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredOffers = offers.filter((item) => {
    if (offerFilter === 'ALL') return true;
    return item.status === offerFilter;
  });

  const activeCount = listings.filter((l) => l.status === 'ACTIVE').length;
  const pendingOffersCount = offers.filter((o) => o.status === 'PENDING').length;
  const portfolioValue = listings
    .filter((l) => l.status !== 'SOLD')
    .reduce((acc, curr) => acc + curr.price, 0);

  return (
    <div style={styles.appWrapper}>
      {/* ──────────────── 1. COLLAPSIBLE SIDEBAR ──────────────── */}
      <aside
        style={{
          ...styles.sidebar,
          width: isSidebarOpen ? '260px' : '78px',
        }}
      >
        {/* Brand Header */}
        <div style={styles.sidebarHeader}>
          <div style={styles.brandGroup}>
            <div style={styles.logoPill}>
              <ShieldCheck size={24} color="#ffffff" />
            </div>
            {isSidebarOpen && (
              <div style={styles.brandTextGroup}>
                <span style={styles.brandTitle}>Property Base</span>
                <span style={styles.brandSubtitle}>Seller Portal</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={styles.toggleBtn}
            title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav style={styles.navLinks}>
          <button
            onClick={() => {
              setActiveNav('listings');
              setSelectedProperty(null);
              setIsMessagesUnlocked(false);
            }}
            style={activeNav === 'listings' ? styles.navItemActive : styles.navItem}
          >
            <Building2 size={20} />
            {isSidebarOpen && (
              <div style={styles.navLabelBadgeRow}>
                <span>My Listings</span>
                <span style={styles.countBadge}>{listings.length}</span>
              </div>
            )}
          </button>

          <button
            onClick={() => handleNavigateToMessages()}
            style={activeNav === 'messages' ? styles.navItemActive : styles.navItem}
          >
            <MessageSquare size={20} />
            {isSidebarOpen && (
              <div style={styles.navLabelBadgeRow}>
                <span>Messages</span>
                <Lock size={13} color={isMessagesUnlocked ? '#10B981' : '#F59E0B'} />
              </div>
            )}
          </button>

          <button
            onClick={() => {
              setActiveNav('settings');
              setIsMessagesUnlocked(false);
            }}
            style={activeNav === 'settings' ? styles.navItemActive : styles.navItem}
          >
            <Settings size={20} />
            {isSidebarOpen && <span>Settings</span>}
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div style={styles.sidebarFooter}>
          <div style={styles.userCard}>
            <div style={styles.avatar}>
              <User size={18} color="#4F46E5" />
            </div>
            {isSidebarOpen && (
              <div style={styles.userText}>
                <div style={styles.userName}>
                  {user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.email || 'Seller'}
                </div>
                <div style={styles.userRoleBadge}>{user?.role === 'ADMIN' ? 'Admin (Seller View)' : 'Verified Seller'}</div>
              </div>
            )}
          </div>

          {onSwitchToAdmin && isSidebarOpen && (
            <button
              onClick={onSwitchToAdmin}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#1E293B',
                color: '#38BDF8',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '8px',
                width: '100%',
                justifyContent: 'center',
              }}
              title="Return to SOC Control Room"
            >
              <ShieldCheck size={15} />
              <span>SOC Control Room</span>
            </button>
          )}

          <button
            onClick={onLogout}
            style={isSidebarOpen ? styles.logoutFullBtn : styles.logoutIconBtn}
            title="Sign Out"
          >
            <LogOut size={16} />
            {isSidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ──────────────── 2. MAIN CONTENT AREA ──────────────── */}
      <div style={styles.mainWrapper}>
        {/* Top Header Bar */}
        <header style={styles.topHeader}>
          <div style={styles.headerLeft}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={styles.mobileHamburger}
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 style={styles.pageTitle}>Seller Command Center</h2>
              <p style={styles.pageDate}>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div style={styles.headerRight}>
            <button
              onClick={() => setIsAddModalOpen(true)}
              style={styles.primaryAddBtn}
            >
              <Plus size={18} />
              <span>Add New Property</span>
            </button>

            <button style={styles.iconCircleBtn} title="Notifications">
              <Bell size={18} color="#475569" />
              {pendingOffersCount > 0 && <span style={styles.notifDot} />}
            </button>
          </div>
        </header>

        {/* Toast Banner Feedback */}
        {feedback && (
          <div
            style={
              feedback.type === 'error' ? styles.toastError : styles.toastSuccess
            }
          >
            {feedback.type === 'error' ? (
              <AlertCircle size={20} />
            ) : (
              <CheckCircle size={20} />
            )}
            <span>{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              style={styles.toastCloseBtn}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ──────────────── IF FULL PROPERTY DETAIL VIEW ACTIVE ──────────────── */}
        {selectedProperty && editFormData ? (
          <div style={styles.detailContainer}>
            <div style={styles.detailTopBar}>
              <button
                onClick={() => {
                  setSelectedProperty(null);
                  setEditFormData(null);
                }}
                style={styles.backBtn}
              >
                <ChevronLeft size={18} /> Back to My Listings
              </button>

              <div style={styles.detailActionRow}>
                <button
                  type="button"
                  onClick={() => handleDeleteProperty(selectedProperty.id)}
                  style={styles.deleteListingBtn}
                >
                  <Trash2 size={16} />
                  <span>Delete Listing</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSavePropertyChanges} style={styles.detailCard}>
              <div style={styles.detailHeader}>
                <div>
                  <span style={styles.categoryPill}>{editFormData.property_type}</span>
                  <h1 style={styles.detailTitle}>{editFormData.title}</h1>
                  <p style={styles.detailLoc}>
                    <MapPin size={16} color="#6366F1" /> {editFormData.location}
                  </p>
                </div>
                <div style={styles.detailPriceTag}>
                  {formatCurrency(editFormData.price)}
                </div>
              </div>

              {/* Photo Preview & Edit Image URL */}
              <div style={styles.photoContainer}>
                <img
                  src={(editFormData.images && editFormData.images[0]) || editFormData.image_url}
                  alt={editFormData.title}
                  style={styles.largeHeroImage}
                />
                <div style={styles.imageOverlayTag}>
                  Status: <strong>{editFormData.status}</strong>
                </div>
              </div>

              {/* Multi-Photo Strip in Edit View if > 1 photo */}
              {editFormData.images && editFormData.images.length > 1 && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '-12px', marginBottom: '22px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {editFormData.images.map((imgSrc, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        const updated = [imgSrc, ...editFormData.images.filter((_, i) => i !== idx)];
                        setEditFormData({ ...editFormData, images: updated, image_url: imgSrc });
                        showToast('success', `Cover photo switched to photo #${idx + 1}`);
                      }}
                      style={{
                        width: '84px',
                        height: '60px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: idx === 0 ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                        opacity: idx === 0 ? 1 : 0.75,
                        flexShrink: 0,
                        position: 'relative',
                      }}
                      title="Click to set as primary cover photo"
                    >
                      <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {idx === 0 && (
                        <span style={{ position: 'absolute', bottom: 2, left: 2, backgroundColor: '#4F46E5', color: '#fff', fontSize: '8px', padding: '1px 4px', borderRadius: '3px', fontWeight: '700' }}>
                          Cover
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Form Grid */}
              <div style={styles.formGrid}>
                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Property Title / Header</label>
                  <input
                    type="text"
                    required
                    value={editFormData.title}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, title: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Listing Price (USD $)</label>
                  <input
                    type="number"
                    required
                    value={editFormData.price}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, price: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Location / Neighborhood</label>
                  <input
                    type="text"
                    required
                    value={editFormData.location}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, location: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Listing Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, status: e.target.value })
                    }
                    style={styles.selectField}
                  >
                    <option value="ACTIVE">ACTIVE (On Market)</option>
                    <option value="PENDING">PENDING (Under Contract)</option>
                    <option value="SOLD">SOLD (Closed Deal)</option>
                  </select>
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Property Type</label>
                  <select
                    value={editFormData.property_type}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, property_type: e.target.value })
                    }
                    style={styles.selectField}
                  >
                    <option value="Luxury Villa">Luxury Villa</option>
                    <option value="Penthouse">Penthouse</option>
                    <option value="Family Home">Family Home</option>
                    <option value="Luxury Apartment">Luxury Apartment</option>
                    <option value="Golf Estate">Golf Estate</option>
                    <option value="Estate Manor">Estate Manor</option>
                  </select>
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Square Feet (sq ft)</label>
                  <input
                    type="number"
                    value={editFormData.square_feet}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, square_feet: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Bedrooms</label>
                  <input
                    type="number"
                    value={editFormData.bedrooms}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, bedrooms: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Bathrooms</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editFormData.bathrooms}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, bathrooms: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                  <label style={styles.fieldLabel}>
                    Property Photos ({editFormData.images ? editFormData.images.length : (editFormData.image_url ? 1 : 0)} uploaded)
                  </label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {((editFormData.images && editFormData.images.length > 0)
                      ? editFormData.images
                      : editFormData.image_url
                      ? [editFormData.image_url]
                      : []
                    ).map((imgSrc, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          width: '90px',
                          height: '65px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: idx === 0 ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                        }}
                      >
                        <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {idx === 0 && (
                          <span style={{ position: 'absolute', bottom: 2, left: 2, backgroundColor: '#4F46E5', color: '#fff', fontSize: '8px', padding: '1px 4px', borderRadius: '3px', fontWeight: '700' }}>
                            Cover
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditPhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            color: '#FFFFFF',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          title="Remove photo"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}

                    <label
                      htmlFor="edit-property-photo-upload"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px dashed #4F46E5',
                        backgroundColor: '#EEF2FF',
                        color: '#4F46E5',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      <UploadCloud size={16} />
                      <span>Upload More Photos</span>
                      <input
                        id="edit-property-photo-upload"
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleEditPhotoFilesSelected}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                  <label style={styles.fieldLabel}>Complete Property Description</label>
                  <textarea
                    rows={4}
                    value={editFormData.description}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, description: e.target.value })
                    }
                    style={styles.textareaField}
                  />
                </div>
              </div>

              {/* Save Actions Bar */}
              <div style={styles.saveActionBar}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProperty(null);
                    setEditFormData(null);
                  }}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.saveChangesBtn}>
                  <Save size={18} />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ──────────────── NORMAL DASHBOARD VIEW (FLOW) ──────────────── */
          <div style={styles.contentScroll}>
            {/* ── METRICS OVERVIEW ROW ── */}
            <div style={styles.statsRow}>
              <div style={styles.statBox}>
                <div style={styles.statIconBoxIndigo}>
                  <Building2 size={22} color="#4F46E5" />
                </div>
                <div>
                  <div style={styles.statNumber}>{activeCount}</div>
                  <div style={styles.statLabel}>Active Properties</div>
                </div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statIconBoxAmber}>
                  <DollarSign size={22} color="#D97706" />
                </div>
                <div>
                  <div style={styles.statNumber}>{pendingOffersCount}</div>
                  <div style={styles.statLabel}>Pending Offers in Review</div>
                </div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statIconBoxEmerald}>
                  <TrendingUp size={22} color="#059669" />
                </div>
                <div>
                  <div style={styles.statNumber}>{formatCurrency(portfolioValue)}</div>
                  <div style={styles.statLabel}>Active Portfolio Value</div>
                </div>
              </div>

              <div style={styles.statBox}>
                <div style={styles.statIconBoxBlue}>
                  <Eye size={22} color="#2563EB" />
                </div>
                <div>
                  <div style={styles.statNumber}>10.8k</div>
                  <div style={styles.statLabel}>Total Buyer Impressions</div>
                </div>
              </div>
            </div>

            {activeNav === 'listings' ? (
              <>
            {/* ── SECTION 1: "MY LISTINGS" ── */}
            <section style={styles.sectionBlock}>
              {/* ── LISTING MFA BACKUP CODES NOTIFICATION BANNER ── */}
              {listingMfa.initialized && listingMfa.notificationVisible && listingMfa.codes.length > 0 && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    border: '2px solid #6366F1',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    marginBottom: '24px',
                    boxShadow: '0 10px 25px rgba(79, 70, 229, 0.12)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '14px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          backgroundColor: '#4F46E5',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <KeyRound size={22} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#1E1B4B' }}>
                            {listingMfa.notificationReason === 'REGENERATED_ON_LOGIN'
                              ? 'New Listing MFA Backup Codes Generated on Sign-In'
                              : 'Listing MFA Backup Codes Issued'}
                          </h4>
                          <span
                            style={{
                              backgroundColor: '#4F46E5',
                              color: '#FFFFFF',
                              fontSize: '11px',
                              fontWeight: '700',
                              padding: '3px 9px',
                              borderRadius: '999px',
                            }}
                          >
                            {listingMfa.codes.length} Unused Code(s)
                          </span>
                        </div>
                        <p style={{ margin: '5px 0 0', fontSize: '13.5px', color: '#3730A3', lineHeight: 1.5 }}>
                          {listingMfa.notificationReason === 'REGENERATED_ON_LOGIN'
                            ? 'All of your previous listing backup codes were used up. Here is your new set of random single-use backup codes to edit or delete any property listing:'
                            : 'Save these random single-use backup codes now! You will use them to verify your identity whenever you click View & Edit or Delete on any property listing:'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => copyListingCodesToClipboard(listingMfa.codes)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 14px',
                          borderRadius: '8px',
                          border: '1px solid #6366F1',
                          backgroundColor: bannerCopied ? '#DCFCE7' : '#FFFFFF',
                          color: bannerCopied ? '#166534' : '#312E81',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        {bannerCopied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{bannerCopied ? 'Copied!' : 'Copy Codes'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadListingCodesFile(listingMfa.codes)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 14px',
                          borderRadius: '8px',
                          border: '1px solid #6366F1',
                          backgroundColor: '#FFFFFF',
                          color: '#312E81',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        <Download size={14} />
                        <span>Download .txt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setListingMfa((prev) => ({
                            ...prev,
                            notificationVisible: false,
                          }))
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#312E81',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        <CheckCircle size={14} />
                        <span>I've Saved These Codes</span>
                      </button>
                    </div>
                  </div>

                  {/* Random Backup Codes Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {listingMfa.codes.map((code, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #C7D2FE',
                          borderRadius: '10px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 2px 6px rgba(79, 70, 229, 0.06)',
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#6366F1' }}>
                          CODE #{idx + 1}
                        </span>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: '900',
                            color: '#1E1B4B',
                            letterSpacing: '1.5px',
                          }}
                        >
                          {code}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Depleted Backup Codes Notice Banner */}
              {listingMfa.initialized && listingMfa.codes.length === 0 && (
                <div
                  style={{
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #F59E0B',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#92400E', fontSize: '13px', fontWeight: '600' }}>
                    <AlertCircle size={18} color="#D97706" />
                    <span>
                      All of your listing backup codes have been used up! A new set of backup codes will automatically be generated and displayed on your screen once you log back in to the web application.
                    </span>
                  </div>
                </div>
              )}

              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.titleBadgeRow}>
                    <h3 style={styles.sectionTitle}>My Listings</h3>
                    <span style={styles.sectionCountPill}>{filteredListings.length}</span>
                    {listingMfa.initialized && listingMfa.codes.length > 0 && !listingMfa.notificationVisible && (
                      <button
                        type="button"
                        onClick={() =>
                          setListingMfa((prev) => ({
                            ...prev,
                            notificationVisible: true,
                          }))
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          marginLeft: '8px',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          border: '1px solid #C7D2FE',
                          backgroundColor: '#EEF2FF',
                          color: '#4F46E5',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        <KeyRound size={12} />
                        <span>View Listing Backup Codes ({listingMfa.codes.length} Left)</span>
                      </button>
                    )}
                  </div>
                  <p style={styles.sectionSub}>
                    Manage your portfolio, edit property details, and monitor engagement
                  </p>
                </div>

                {/* Filters & Add Property */}
                <div style={styles.filterControls}>
                  <div style={styles.searchBox}>
                    <Search size={16} color="#94A3B8" />
                    <input
                      type="text"
                      placeholder="Search title, city, type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={styles.searchInput}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={styles.clearSearch}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div style={styles.statusPillGroup}>
                    {['ALL', 'ACTIVE', 'PENDING', 'SOLD'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        style={
                          statusFilter === st
                            ? styles.statusPillActive
                            : styles.statusPillInactive
                        }
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Listings Grid */}
              {filteredListings.length === 0 ? (
                <div style={styles.emptyCard}>
                  <div style={styles.emptyIconCircle}>
                    <Building2 size={36} color="#4F46E5" />
                  </div>
                  <h4 style={styles.emptyTitle}>
                    {listings.length === 0
                      ? 'No Property Listings Yet'
                      : 'No Matching Listings Found'}
                  </h4>
                  <p style={styles.emptyDescription}>
                    {listings.length === 0
                      ? 'Your seller portfolio is currently empty. Post your first property listing to showcase your home to prospective buyers and start receiving verified purchase offers.'
                      : 'No listings match your current search or filter criteria. Try clearing your filters or search terms.'}
                  </p>
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      style={styles.primaryAddBtn}
                    >
                      <Plus size={16} /> Post Your First Listing
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.listingsGrid}>
                  {filteredListings.map((prop) => (
                    <div key={prop.id} style={styles.propertyCard}>
                      {/* Photo Thumbnail */}
                      <div style={styles.cardImageWrapper}>
                        <img
                          src={prop.image_url || (prop.images && prop.images[0])}
                          alt={prop.title}
                          style={styles.cardImage}
                        />
                        {prop.images && prop.images.length > 1 && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '10px',
                              right: '10px',
                              backgroundColor: 'rgba(15, 23, 42, 0.75)',
                              color: '#FFFFFF',
                              backdropFilter: 'blur(4px)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Camera size={12} />
                            <span>{prop.images.length} Photos</span>
                          </div>
                        )}
                        <div
                          style={{
                            ...styles.statusTag,
                            backgroundColor:
                              prop.status === 'ACTIVE'
                                ? '#10B981'
                                : prop.status === 'PENDING'
                                ? '#F59E0B'
                                : '#64748B',
                          }}
                        >
                          {prop.status}
                        </div>
                        <div style={styles.typeBadge}>{prop.property_type}</div>
                      </div>

                      {/* Card Content */}
                      <div style={styles.cardBody}>
                        <div style={styles.cardPriceRow}>
                          <span style={styles.cardPrice}>
                            {formatCurrency(prop.price)}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              backgroundColor: listingMfa.codes.length > 0 ? '#EEF2FF' : '#FEF3C7',
                              color: listingMfa.codes.length > 0 ? '#4F46E5' : '#B45309',
                              border: listingMfa.codes.length > 0 ? '1px solid #C7D2FE' : '1px solid #FDE68A',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                            }}
                            title="Single-use backup codes available for editing or deleting any property listing"
                          >
                            <KeyRound size={11} />
                            <span>
                              {listingMfa.codes.length}/3 Listing Codes
                            </span>
                          </span>
                        </div>

                        <h4 style={styles.cardTitle}>{prop.title}</h4>
                        <p style={styles.cardLocation}>
                          <MapPin size={14} color="#6366F1" /> {prop.location}
                        </p>

                        {/* Specs */}
                        <div style={styles.specsRow}>
                          <span style={styles.specItem}>
                            <Bed size={15} color="#64748B" /> {prop.bedrooms} Beds
                          </span>
                          <span style={styles.specItem}>
                            <Bath size={15} color="#64748B" /> {prop.bathrooms} Baths
                          </span>
                          <span style={styles.specItem}>
                            <Maximize2 size={14} color="#64748B" /> {prop.square_feet.toLocaleString()} sqft
                          </span>
                        </div>

                        {/* Action Bar */}
                        <div style={styles.cardFooter}>
                          <div style={styles.viewsCount}>
                            <Eye size={14} color="#94A3B8" />
                            <span>{prop.views_count.toLocaleString()} views</span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => handleViewProperty(prop)}
                              style={styles.viewBtn}
                            >
                              <span>View & Edit</span>
                              <ArrowRight size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProperty(prop.id);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '8px 10px',
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FECACA',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                              }}
                              title="Delete Listing"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── SECTION 2: "OFFERS & INQUIRIES" ── */}
            <section style={styles.sectionBlock}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.titleBadgeRow}>
                    <h3 style={styles.sectionTitle}>Offers & Inquiries</h3>
                    <span style={styles.sectionCountPill}>{filteredOffers.length}</span>
                  </div>
                  <p style={styles.sectionSub}>
                    Direct purchase proposals and verified inquiries from prospective clients
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Offer Status Filter Pills */}
                  <div style={styles.statusPillGroup}>
                    {['ALL', 'PENDING', 'ACCEPTED', 'DECLINED'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setOfferFilter(st)}
                        style={
                          offerFilter === st
                            ? styles.statusPillActive
                            : styles.statusPillInactive
                        }
                      >
                        {st === 'ALL' ? 'All Offers' : st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Offers List */}
              {filteredOffers.length === 0 ? (
                <div style={styles.emptyCard}>
                  <div style={{ ...styles.emptyIconCircle, backgroundColor: '#ECFDF5' }}>
                    <DollarSign size={36} color="#059669" />
                  </div>
                  <h4 style={styles.emptyTitle}>
                    {offers.length === 0
                      ? listings.length === 0
                        ? 'No Offers or Inquiries Yet'
                        : 'Awaiting Prospective Buyer Offers'
                      : 'No Offers Matching Filter'}
                  </h4>
                  <p style={styles.emptyDescription}>
                    {offers.length === 0
                      ? listings.length === 0
                        ? 'Once you publish a property listing, verified buyers on Property Base will submit formal purchase proposals and inquiries here for your review.'
                        : 'Your property listings are active! When prospective buyers submit purchase proposals, they will arrive here in real-time.'
                      : 'No purchase offers match your selected filter tab.'}
                  </p>
                </div>
              ) : (
                <div style={styles.offersGrid}>
                  {filteredOffers.map((offer) => {
                    const diff = offer.offer_amount - offer.list_price;
                    const diffPercent = Math.round((diff / offer.list_price) * 100);

                    return (
                      <div key={offer.id} style={styles.offerCard}>
                        {/* Top: Property Ref Row */}
                        <div style={styles.offerPropertyRow}>
                          <img
                            src={offer.property_image}
                            alt={offer.property_title}
                            style={styles.offerThumb}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={styles.offerPropRefLabel}>Inquiry on Property:</div>
                            <div style={styles.offerPropTitle}>
                              {offer.property_title}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div
                            style={{
                              ...styles.offerStatusBadge,
                              backgroundColor:
                                offer.status === 'ACCEPTED'
                                  ? '#ECFDF5'
                                  : offer.status === 'DECLINED'
                                  ? '#FEF2F2'
                                  : '#FFFBEB',
                              color:
                                offer.status === 'ACCEPTED'
                                  ? '#047857'
                                  : offer.status === 'DECLINED'
                                  ? '#B91C1C'
                                  : '#B45309',
                              borderColor:
                                offer.status === 'ACCEPTED'
                                  ? '#A7F3D0'
                                  : offer.status === 'DECLINED'
                                  ? '#FCA5A5'
                                  : '#FDE68A',
                            }}
                          >
                            {offer.status === 'PENDING' && (
                              <Clock size={12} style={{ marginRight: 4 }} />
                            )}
                            {offer.status === 'ACCEPTED' && (
                              <Check size={12} style={{ marginRight: 4 }} />
                            )}
                            {offer.status === 'DECLINED' && (
                              <X size={12} style={{ marginRight: 4 }} />
                            )}
                            {offer.status}
                          </div>
                        </div>

                        {/* Middle: Client Info & Offer Numbers */}
                        <div style={styles.offerDetailsBox}>
                          <div style={styles.clientInfoBlock}>
                            <div style={styles.clientAvatar}>
                              {offer.client_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={styles.clientName}>{offer.client_name}</div>
                              <div style={styles.clientContact}>
                                <Calendar size={13} /> {offer.date_received} • {offer.client_email}
                              </div>
                            </div>
                          </div>

                          <div style={styles.offerPriceBlock}>
                            <div style={styles.offerAmount}>
                              {formatCurrency(offer.offer_amount)}
                            </div>
                            <div style={styles.offerDiff}>
                              {diff === 0 ? (
                                <span style={{ color: '#059669', fontWeight: 600 }}>Full Asking Price</span>
                              ) : diff > 0 ? (
                                <span style={{ color: '#059669', fontWeight: 600 }}>+{formatCurrency(diff)} ({diffPercent}%)</span>
                              ) : (
                                <span style={{ color: '#D97706', fontWeight: 600 }}>{diffPercent}% below list ({formatCurrency(offer.list_price)})</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Message Preview */}
                        <div style={styles.messagePreviewBox}>
                          <span style={styles.quoteMark}>“</span>
                          <p style={styles.messageText}>{offer.message_preview}</p>
                        </div>

                        {/* Interactive Buttons */}
                        <div style={styles.offerActionsRow}>
                          <button
                            onClick={() => setReviewingOffer(offer)}
                            style={styles.reviewOfferBtn}
                          >
                            Review Details
                          </button>

                          <button
                            onClick={() => {
                              if (!isMessagesUnlocked) {
                                showToast(
                                  'error',
                                  'Client messaging is protected. Please authenticate with your one-time Messages passcode first.'
                                );
                                handleNavigateToMessages(offer);
                                return;
                              }
                              setMessagingOffer(offer);
                              setMessageText(`Hello ${offer.client_name.split(' ')[0]}, thank you for your offer on ${offer.property_title}. `);
                            }}
                            style={styles.messageClientBtn}
                          >
                            <MessageSquare size={15} />
                            <span>Reply</span>
                          </button>

                          {offer.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleUpdateOfferStatus(offer.id, 'ACCEPTED')}
                                style={styles.acceptBtn}
                                title="Accept this offer and move listing to Pending"
                              >
                                <Check size={16} />
                                <span>Accept</span>
                              </button>

                              <button
                                onClick={() => handleUpdateOfferStatus(offer.id, 'DECLINED')}
                                style={styles.declineBtn}
                                title="Decline this offer"
                              >
                                <X size={16} />
                                <span>Decline</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
              </>
            ) : null}

            {/* ── SECTION 2B: "MESSAGES" ── */}
            {activeNav === 'messages' && (
              <section style={styles.sectionBlock}>
                <div style={styles.sectionHeader}>
                  <div>
                    <div style={styles.titleBadgeRow}>
                      <h3 style={styles.sectionTitle}>Client Messages & Buyer Conversations</h3>
                      <span
                        style={{
                          ...styles.sectionCountPill,
                          backgroundColor: isMessagesUnlocked ? '#ECFDF5' : '#FEF2F2',
                          color: isMessagesUnlocked ? '#059669' : '#DC2626',
                        }}
                      >
                        {isMessagesUnlocked
                          ? 'Unlocked'
                          : !messagesAuthStatus.has_passcode
                          ? 'Passcode Setup Required'
                          : 'Locked — Passcode Required'}
                      </span>
                    </div>
                  </div>

                  {isMessagesUnlocked && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowMessagesBackupBanner((prev) => !prev)}
                        style={{
                          ...styles.cancelBtn,
                          borderColor: '#C7D2FE',
                          backgroundColor: '#EEF2FF',
                          color: '#4338CA',
                        }}
                      >
                        <KeyRound size={14} style={{ marginRight: 6 }} />
                        {showMessagesBackupBanner
                          ? 'Hide Messages Backup Codes'
                          : `Messages Backup Codes (${messagesBackupCodes.length} Unused)`}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMessagesUnlocked(false);
                          showToast('success', 'Client Messages workspace locked.');
                        }}
                        style={styles.cancelBtn}
                      >
                        <Lock size={14} style={{ marginRight: 6 }} />
                        Lock Messages
                      </button>
                    </div>
                  )}
                </div>

                {isMessagesUnlocked && showMessagesBackupBanner && (
                  <div
                    style={{
                      backgroundColor: '#EEF2FF',
                      border: '1px solid #C7D2FE',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      marginBottom: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#1E1B4B' }}>
                        Unused Messages Backup Codes ({messagesBackupCodes.length} Remaining)
                      </div>
                      <div style={{ fontSize: '12px', color: '#4338CA', marginTop: '2px' }}>
                        Save these single-use Messages backup codes. You will need one unused code (along with your mobile email number match) whenever you edit your Financial Details in Settings.
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginTop: '10px',
                        }}
                      >
                        {messagesBackupCodes.length > 0 ? (
                          messagesBackupCodes.map((code) => (
                            <span
                              key={code}
                              style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #A5B4FC',
                                color: '#1E1B4B',
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                fontWeight: '800',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                letterSpacing: '1px',
                              }}
                            >
                              {code}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: '700' }}>
                            No unused Messages backup codes remaining — click Generate Fresh Codes on the right.
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={generatingMessagesCodes}
                      onClick={handleGenerateMessagesBackupCodes}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        backgroundColor: '#4F46E5',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>
                        {generatingMessagesCodes ? 'Generating...' : 'Generate 5 Fresh Codes'}
                      </span>
                    </button>
                  </div>
                )}

                {!isMessagesUnlocked ? (
                  <div
                    style={{
                      ...styles.detailCard,
                      maxWidth: '520px',
                      margin: '20px auto',
                      border: '2px solid #4F46E5',
                      boxShadow: '0 16px 36px rgba(79, 70, 229, 0.12)',
                    }}
                  >
                    {/* Simple Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        paddingBottom: '16px',
                        marginBottom: '20px',
                        borderBottom: '1px solid #E2E8F0',
                      }}
                    >
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '12px',
                          backgroundColor: '#EEF2FF',
                          border: '1px solid #C7D2FE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {!messagesAuthStatus.has_passcode ? (
                          <KeyRound size={22} color="#4F46E5" />
                        ) : (
                          <Lock size={22} color="#4F46E5" />
                        )}
                      </div>
                      <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0F172A' }}>
                        {!messagesAuthStatus.has_passcode
                          ? 'Create Your Messages Workspace Passcode'
                          : 'Enter Your Messages Workspace Passcode'}
                      </h4>
                    </div>

                    {messagesAuthError && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FECACA',
                          color: '#DC2626',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          fontSize: '12.5px',
                          fontWeight: '600',
                          marginBottom: '16px',
                        }}
                      >
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{messagesAuthError}</span>
                      </div>
                    )}

                    {messagesAuthSuccess && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          backgroundColor: '#ECFDF5',
                          border: '1px solid #A7F3D0',
                          color: '#047857',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          fontSize: '12.5px',
                          fontWeight: '600',
                          marginBottom: '16px',
                        }}
                      >
                        <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{messagesAuthSuccess}</span>
                      </div>
                    )}

                    {!messagesAuthStatus.has_passcode ? (
                      <form onSubmit={handleSetMessagesPasscode}>
                        <div style={{ marginBottom: '14px' }}>
                          <label style={styles.fieldLabel}>
                            Create Passcode to Secure Your Messages Workspace
                          </label>
                          <input
                            type="password"
                            required
                            autoFocus
                            minLength={4}
                            placeholder="Create your Messages passcode (min. 4 characters)"
                            value={newMessagesPasscode}
                            onChange={(e) => setNewMessagesPasscode(e.target.value)}
                            style={{ ...styles.inputField, width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                          <label style={styles.fieldLabel}>Confirm Messages Passcode</label>
                          <input
                            type="password"
                            required
                            minLength={4}
                            placeholder="Re-enter your Messages passcode"
                            value={confirmMessagesPasscode}
                            onChange={(e) => setConfirmMessagesPasscode(e.target.value)}
                            style={{ ...styles.inputField, width: '100%', boxSizing: 'border-box' }}
                          />
                          <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#64748B' }}>
                            You will use this passcode whenever you open your Messages page to talk to potential clients.
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={messagesAuthLoading}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '12px 18px',
                            backgroundColor: '#4F46E5',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                          }}
                        >
                          <KeyRound size={16} />
                          <span>
                            {messagesAuthLoading ? 'Creating Passcode...' : 'Create Passcode'}
                          </span>
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyMessagesPasscode}>
                        <div style={{ marginBottom: '20px' }}>
                          <label style={styles.fieldLabel}>
                            Enter Your Messages Passcode to Unlock Client Conversations
                          </label>
                          <input
                            type="password"
                            required
                            autoFocus
                            placeholder="Enter your Messages workspace passcode"
                            value={verifyMessagesPasscode}
                            onChange={(e) => setVerifyMessagesPasscode(e.target.value)}
                            style={{ ...styles.inputField, width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={messagesAuthLoading}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '12px 18px',
                            backgroundColor: '#4F46E5',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                          }}
                        >
                          <ShieldCheck size={16} />
                          <span>
                            {messagesAuthLoading ? 'Unlocking...' : 'Unlock Messages'}
                          </span>
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  /* ── UNLOCKED CLIENT MESSAGES INBOX & CONVERSATIONS PAGE ── */
                  (() => {
                    // Merge any offer inquiries that aren't yet in clientConversations
                    const offerThreads = offers
                      .filter(
                        (o) =>
                          !clientConversations.some(
                            (c) => c.offer_id === o.id || c.id === o.id
                          )
                      )
                      .map((o) => ({
                        id: `conv_${o.id}`,
                        offer_id: o.id,
                        client_name: o.client_name,
                        client_email: o.client_email,
                        client_phone: 'Verified Property Base Buyer',
                        client_badge: 'Purchase Offer Submitted',
                        subject: `Offer Inquiry on ${o.property_title}`,
                        property_title: o.property_title,
                        offer_amount: o.offer_amount,
                        unread: o.status === 'PENDING',
                        status: 'AWAITING_REPLY',
                        last_activity: o.date_received || 'Recent',
                        messages: [
                          {
                            id: `init_${o.id}`,
                            sender: 'buyer',
                            text: o.message_preview,
                            timestamp: o.date_received || 'Earlier',
                          },
                        ],
                      }));

                    const allInboxThreads = [...offerThreads, ...clientConversations];
                    const unreadCount = allInboxThreads.filter((t) => t.unread).length;

                    const filteredInboxThreads = allInboxThreads.filter((thread) => {
                      if (inboxFilter === 'UNREAD' && !thread.unread) return false;
                      if (inboxFilter === 'REPLIED' && thread.status !== 'REPLIED') return false;
                      if (inboxSearchQuery.trim()) {
                        const q = inboxSearchQuery.toLowerCase();
                        const matchName = (thread.client_name || '').toLowerCase().includes(q);
                        const matchEmail = (thread.client_email || '').toLowerCase().includes(q);
                        const matchProp = (thread.property_title || '').toLowerCase().includes(q);
                        const matchSub = (thread.subject || '').toLowerCase().includes(q);
                        const matchMsg = (thread.messages || []).some((m) =>
                          (m.text || '').toLowerCase().includes(q)
                        );
                        return matchName || matchEmail || matchProp || matchSub || matchMsg;
                      }
                      return true;
                    });

                    const activeThread =
                      allInboxThreads.find(
                        (t) =>
                          t.id === selectedClientThreadId ||
                          t.offer_id === selectedClientThreadId
                      ) ||
                      filteredInboxThreads[0] ||
                      allInboxThreads[0] ||
                      null;

                    const quickReplyTemplates = [
                      'Hello! Yes, the property is available for a private viewing this week. What time works best for you?',
                      'Thank you for your message! I would be happy to discuss your offer and closing timeline.',
                      'All title documentation and property disclosures are ready for review. Let us schedule a quick call.',
                    ];

                    return (
                      <div
                        style={{
                          ...styles.detailCard,
                          padding: 0,
                          overflow: 'hidden',
                          border: '1px solid #CBD5E1',
                        }}
                      >
                        {/* Top Inbox Summary Bar */}
                        <div
                          style={{
                            padding: '16px 22px',
                            backgroundColor: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: '#EEF2FF',
                                color: '#4F46E5',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '12.5px',
                                fontWeight: '800',
                              }}
                            >
                              <Mail size={15} />
                              <span>Inbox ({allInboxThreads.length} Conversations)</span>
                            </div>

                            {unreadCount > 0 && (
                              <span
                                style={{
                                  backgroundColor: '#DBEAFE',
                                  color: '#1D4ED8',
                                  padding: '5px 10px',
                                  borderRadius: '999px',
                                  fontSize: '11.5px',
                                  fontWeight: '700',
                                }}
                              >
                                {unreadCount} Unread Message{unreadCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {/* Filter Tabs */}
                          <div style={styles.statusPillGroup}>
                            {[
                              { key: 'ALL', label: `All (${allInboxThreads.length})` },
                              { key: 'UNREAD', label: `Unread (${unreadCount})` },
                              {
                                key: 'REPLIED',
                                label: `Replied (${
                                  allInboxThreads.filter((t) => t.status === 'REPLIED').length
                                })`,
                              },
                            ].map((tab) => (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setInboxFilter(tab.key)}
                                style={
                                  inboxFilter === tab.key
                                    ? styles.statusPillActive
                                    : styles.statusPillInactive
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Main Split Inbox Layout */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(290px, 360px) 1fr',
                            minHeight: '540px',
                          }}
                        >
                          {/* ── LEFT COLUMN: INBOX MESSAGE LIST ── */}
                          <div
                            style={{
                              borderRight: '1px solid #E2E8F0',
                              backgroundColor: '#FFFFFF',
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            {/* Inbox Search Box */}
                            <div
                              style={{
                                padding: '14px 16px',
                                borderBottom: '1px solid #F1F5F9',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  backgroundColor: '#F8FAFC',
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '10px',
                                  padding: '8px 12px',
                                }}
                              >
                                <Search size={15} color="#64748B" />
                                <input
                                  type="text"
                                  placeholder="Search inbox by client, property, or message..."
                                  value={inboxSearchQuery}
                                  onChange={(e) => setInboxSearchQuery(e.target.value)}
                                  style={{
                                    border: 'none',
                                    outline: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '12.5px',
                                    color: '#0F172A',
                                    width: '100%',
                                  }}
                                />
                                {inboxSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setInboxSearchQuery('')}
                                    style={{
                                      border: 'none',
                                      background: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      color: '#94A3B8',
                                    }}
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Thread Cards List */}
                            <div
                              style={{
                                flex: 1,
                                overflowY: 'auto',
                                maxHeight: '480px',
                              }}
                            >
                              {filteredInboxThreads.length === 0 ? (
                                <div
                                  style={{
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    color: '#64748B',
                                    fontSize: '13px',
                                  }}
                                >
                                  No messages match your current filter.
                                </div>
                              ) : (
                                filteredInboxThreads.map((thread) => {
                                  const isSelected =
                                    activeThread && activeThread.id === thread.id;
                                  const lastMsg =
                                    thread.messages && thread.messages.length > 0
                                      ? thread.messages[thread.messages.length - 1]
                                      : null;

                                  return (
                                    <div
                                      key={thread.id}
                                      onClick={() => handleSelectInboxThread(thread)}
                                      style={{
                                        padding: '15px 18px',
                                        borderBottom: '1px solid #F1F5F9',
                                        cursor: 'pointer',
                                        backgroundColor: isSelected
                                          ? '#EEF2FF'
                                          : thread.unread
                                          ? '#F8FAFC'
                                          : '#FFFFFF',
                                        borderLeft: isSelected
                                          ? '4px solid #4F46E5'
                                          : thread.unread
                                          ? '4px solid #3B82F6'
                                          : '4px solid transparent',
                                        transition: 'background-color 0.15s ease',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          marginBottom: '5px',
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: '32px',
                                              height: '32px',
                                              borderRadius: '50%',
                                              backgroundColor: isSelected
                                                ? '#4F46E5'
                                                : '#E0E7FF',
                                              color: isSelected ? '#FFFFFF' : '#4338CA',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '11.5px',
                                              fontWeight: '800',
                                              flexShrink: 0,
                                            }}
                                          >
                                            {(thread.client_name || 'CL')
                                              .slice(0, 2)
                                              .toUpperCase()}
                                          </div>
                                          <div>
                                            <div
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                              }}
                                            >
                                              <span
                                                style={{
                                                  fontSize: '13.5px',
                                                  fontWeight: thread.unread ? '800' : '700',
                                                  color: '#0F172A',
                                                }}
                                              >
                                                {thread.client_name}
                                              </span>
                                              {thread.unread && (
                                                <span
                                                  style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    backgroundColor: '#2563EB',
                                                    display: 'inline-block',
                                                  }}
                                                  title="Unread message"
                                                />
                                              )}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: '11px',
                                                color: '#64748B',
                                              }}
                                            >
                                              {thread.client_email}
                                            </div>
                                          </div>
                                        </div>

                                        <span
                                          style={{
                                            fontSize: '11px',
                                            color: '#64748B',
                                            fontWeight: thread.unread ? '700' : '500',
                                          }}
                                        >
                                          {thread.last_activity}
                                        </span>
                                      </div>

                                      <div
                                        style={{
                                          fontSize: '12px',
                                          fontWeight: '700',
                                          color: '#4F46E5',
                                          marginBottom: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: '6px',
                                        }}
                                      >
                                        <span
                                          style={{
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                          }}
                                        >
                                          {thread.subject || thread.property_title}
                                        </span>
                                        {thread.status === 'REPLIED' && (
                                          <span
                                            style={{
                                              fontSize: '10px',
                                              backgroundColor: '#DCFCE7',
                                              color: '#15803D',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              fontWeight: '700',
                                              flexShrink: 0,
                                            }}
                                          >
                                            Replied
                                          </span>
                                        )}
                                      </div>

                                      <div
                                        style={{
                                          fontSize: '12px',
                                          color: thread.unread ? '#1E293B' : '#64748B',
                                          fontWeight: thread.unread ? '600' : '400',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}
                                      >
                                        {lastMsg
                                          ? `${
                                              lastMsg.sender === 'seller' ? 'You: ' : ''
                                            }${lastMsg.text}`
                                          : 'No messages yet'}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* ── RIGHT COLUMN: MESSAGE READER & REPLY WORKSPACE ── */}
                          {activeThread ? (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                backgroundColor: '#FFFFFF',
                              }}
                            >
                              {/* Conversation Header */}
                              <div
                                style={{
                                  padding: '18px 24px',
                                  borderBottom: '1px solid #E2E8F0',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  flexWrap: 'wrap',
                                  gap: '12px',
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <h4
                                      style={{
                                        margin: 0,
                                        fontSize: '17px',
                                        fontWeight: '800',
                                        color: '#0F172A',
                                      }}
                                    >
                                      {activeThread.client_name}
                                    </h4>
                                    {activeThread.client_badge && (
                                      <span
                                        style={{
                                          backgroundColor: '#EEF2FF',
                                          color: '#4F46E5',
                                          border: '1px solid #C7D2FE',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                        }}
                                      >
                                        {activeThread.client_badge}
                                      </span>
                                    )}
                                    <span
                                      style={{
                                        backgroundColor: '#ECFDF5',
                                        color: '#047857',
                                        border: '1px solid #A7F3D0',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                      }}
                                    >
                                      Passcode Protected Inbox
                                    </span>
                                  </div>

                                  <div
                                    style={{
                                      marginTop: '5px',
                                      fontSize: '12.5px',
                                      color: '#475569',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <span>
                                      <strong>Email:</strong> {activeThread.client_email}
                                    </span>
                                    {activeThread.client_phone && (
                                      <span>
                                        <strong>Phone:</strong> {activeThread.client_phone}
                                      </span>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      marginTop: '6px',
                                      fontSize: '12.5px',
                                      color: '#1E293B',
                                    }}
                                  >
                                    <strong>Property Inquiry:</strong>{' '}
                                    <span style={{ color: '#4F46E5', fontWeight: '700' }}>
                                      {activeThread.property_title}
                                    </span>
                                    {activeThread.offer_amount ? (
                                      <span style={{ marginLeft: '10px', color: '#059669', fontWeight: '700' }}>
                                        • Proposed Budget: {formatCurrency(activeThread.offer_amount)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleThreadUnread(activeThread.id)}
                                    style={{
                                      padding: '7px 12px',
                                      borderRadius: '8px',
                                      border: '1px solid #CBD5E1',
                                      backgroundColor: '#FFFFFF',
                                      color: '#334155',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {activeThread.unread ? 'Mark as Read' : 'Mark as Unread'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteInboxThread(activeThread.id)}
                                    style={{
                                      padding: '7px 10px',
                                      borderRadius: '8px',
                                      border: '1px solid #FECACA',
                                      backgroundColor: '#FEF2F2',
                                      color: '#DC2626',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    title="Delete conversation"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Messages Stream */}
                              <div
                                style={{
                                  flex: 1,
                                  padding: '20px 24px',
                                  backgroundColor: '#F8FAFC',
                                  overflowY: 'auto',
                                  maxHeight: '300px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '14px',
                                }}
                              >
                                {(activeThread.messages || []).map((msg) => {
                                  const isSeller = msg.sender === 'seller';
                                  return (
                                    <div
                                      key={msg.id}
                                      style={{
                                        alignSelf: isSeller ? 'flex-end' : 'flex-start',
                                        maxWidth: '78%',
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          color: '#64748B',
                                          marginBottom: '4px',
                                          textAlign: isSeller ? 'right' : 'left',
                                        }}
                                      >
                                        {isSeller
                                          ? 'You (Verified Seller)'
                                          : `${activeThread.client_name} (Client)`}{' '}
                                        • {msg.timestamp}
                                      </div>
                                      <div
                                        style={{
                                          backgroundColor: isSeller ? '#4F46E5' : '#FFFFFF',
                                          color: isSeller ? '#FFFFFF' : '#0F172A',
                                          border: isSeller ? 'none' : '1px solid #E2E8F0',
                                          padding: '12px 16px',
                                          borderRadius: isSeller
                                            ? '14px 14px 4px 14px'
                                            : '14px 14px 14px 4px',
                                          fontSize: '13.5px',
                                          lineHeight: 1.55,
                                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                                        }}
                                      >
                                        {msg.text}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Quick Reply Chips + Reply Composer Box */}
                              <div
                                style={{
                                  padding: '16px 24px',
                                  borderTop: '1px solid #E2E8F0',
                                  backgroundColor: '#FFFFFF',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: '6px',
                                    flexWrap: 'wrap',
                                    marginBottom: '10px',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      color: '#64748B',
                                      marginRight: '4px',
                                    }}
                                  >
                                    Quick Replies:
                                  </span>
                                  {quickReplyTemplates.map((tpl, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => setClientChatInput(tpl)}
                                      style={{
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid #C7D2FE',
                                        backgroundColor: '#EEF2FF',
                                        color: '#4338CA',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {tpl.slice(0, 42)}...
                                    </button>
                                  ))}
                                </div>

                                <form
                                  onSubmit={(e) => handleSendDirectThreadMessage(e, activeThread)}
                                  style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}
                                >
                                  <textarea
                                    rows={2}
                                    required
                                    placeholder={`Write a reply to ${activeThread.client_name}...`}
                                    value={clientChatInput}
                                    onChange={(e) => setClientChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendDirectThreadMessage(e, activeThread);
                                      }
                                    }}
                                    style={{
                                      ...styles.inputField,
                                      flex: 1,
                                      resize: 'none',
                                      fontFamily: 'inherit',
                                    }}
                                  />
                                  <button
                                    type="submit"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      backgroundColor: '#4F46E5',
                                      color: '#FFFFFF',
                                      border: 'none',
                                      borderRadius: '10px',
                                      fontSize: '13.5px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      padding: '12px 20px',
                                      height: '46px',
                                    }}
                                  >
                                    <MessageSquare size={16} />
                                    <span>Send Reply</span>
                                  </button>
                                </form>
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px',
                                color: '#64748B',
                              }}
                            >
                              Select a message from your inbox on the left to read and reply.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </section>
            )}

            {/* ── SECTION 3: "SETTINGS & MY PROFILE" (WITH STEP-UP VERIFICATION) ── */}
            {activeNav === 'settings' && (
              <section style={styles.sectionBlock}>
                <div style={styles.sectionHeader}>
                  <div>
                    <div style={styles.titleBadgeRow}>
                      <h3 style={styles.sectionTitle}>My Profile & Account Security Settings</h3>
                      <span
                        style={{
                          ...styles.sectionCountPill,
                          backgroundColor: isProfileUnlocked ? '#ECFDF5' : '#FEF2F2',
                          color: isProfileUnlocked ? '#059669' : '#DC2626',
                        }}
                      >
                        {isProfileUnlocked ? 'Identity Verified (Unlocked)' : 'Protected by Step-Up Verification'}
                      </span>
                    </div>
                    <p style={styles.sectionSub}>
                      Personal seller details and single-use backup codes are protected against unauthorized Account Takeover (ATO)
                    </p>
                  </div>

                  {!isProfileUnlocked ? (
                    <button
                      type="button"
                      onClick={handleUnlockProfileEditing}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 18px',
                        backgroundColor: '#4F46E5',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                      }}
                    >
                      <Lock size={16} />
                      <span>Edit Profile</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileUnlocked(false);
                        setProfileForm({
                          first_name: user?.first_name || '',
                          last_name: user?.last_name || '',
                          username: user?.username || '',
                          mobile_number: user?.mobile_number || '',
                          email: user?.email || '',
                        });
                      }}
                      style={styles.cancelBtn}
                    >
                      Lock Profile Editing
                    </button>
                  )}
                </div>

                {/* Personal Details Form Card */}
                <form
                  onSubmit={handleSaveProfileChanges}
                  style={{
                    ...styles.detailCard,
                    border: isProfileUnlocked ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: '18px',
                      marginBottom: '22px',
                      borderBottom: '1px solid #E2E8F0',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          backgroundColor: '#EEF2FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={24} color="#4F46E5" />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                          My Profile — Personal Details
                        </h4>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                          {isProfileUnlocked
                            ? 'Identity verified! You can now update your personal details below and click Save.'
                            : 'Fields are read-only until you verify your identity using a backup code or email OTP.'}
                        </p>
                      </div>
                    </div>

                    {!isProfileUnlocked && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          backgroundColor: '#FFFBEB',
                          color: '#B45309',
                          border: '1px solid #FDE68A',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        <ShieldCheck size={15} />
                        <span>Anti-ATO Step-Up Protection Active</span>
                      </div>
                    )}
                  </div>

                  <div style={styles.formGrid}>
                    <div style={styles.formCol}>
                      <label style={styles.fieldLabel}>First Name</label>
                      <input
                        type="text"
                        required
                        disabled={!isProfileUnlocked}
                        value={profileForm.first_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, first_name: e.target.value })
                        }
                        style={{
                          ...styles.inputField,
                          backgroundColor: isProfileUnlocked ? '#FFFFFF' : '#F1F5F9',
                          cursor: isProfileUnlocked ? 'text' : 'not-allowed',
                        }}
                      />
                    </div>

                    <div style={styles.formCol}>
                      <label style={styles.fieldLabel}>Last Name</label>
                      <input
                        type="text"
                        required
                        disabled={!isProfileUnlocked}
                        value={profileForm.last_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, last_name: e.target.value })
                        }
                        style={{
                          ...styles.inputField,
                          backgroundColor: isProfileUnlocked ? '#FFFFFF' : '#F1F5F9',
                          cursor: isProfileUnlocked ? 'text' : 'not-allowed',
                        }}
                      />
                    </div>

                    <div style={styles.formCol}>
                      <label style={styles.fieldLabel}>Username</label>
                      <input
                        type="text"
                        required
                        disabled={!isProfileUnlocked}
                        value={profileForm.username}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, username: e.target.value })
                        }
                        style={{
                          ...styles.inputField,
                          backgroundColor: isProfileUnlocked ? '#FFFFFF' : '#F1F5F9',
                          cursor: isProfileUnlocked ? 'text' : 'not-allowed',
                        }}
                      />
                    </div>

                    <div style={styles.formCol}>
                      <label style={styles.fieldLabel}>Mobile Phone Number</label>
                      <input
                        type="text"
                        required
                        disabled={!isProfileUnlocked}
                        value={
                          isProfileUnlocked
                            ? profileForm.mobile_number
                            : maskPhoneNumber(profileForm.mobile_number)
                        }
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, mobile_number: e.target.value })
                        }
                        style={{
                          ...styles.inputField,
                          backgroundColor: isProfileUnlocked ? '#FFFFFF' : '#F1F5F9',
                          cursor: isProfileUnlocked ? 'text' : 'not-allowed',
                        }}
                      />
                    </div>

                    <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                      <label style={styles.fieldLabel}>
                        Registered Account Email (Used for Security Verification)
                      </label>
                      <input
                        type="email"
                        disabled
                        value={profileForm.email}
                        style={{
                          ...styles.inputField,
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                          cursor: 'not-allowed',
                        }}
                      />
                    </div>
                  </div>

                  <div style={styles.saveActionBar}>
                    {!isProfileUnlocked ? (
                      <button
                        type="button"
                        onClick={handleUnlockProfileEditing}
                        style={styles.saveChangesBtn}
                      >
                        <KeyRound size={17} />
                        <span>Edit Details</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsProfileUnlocked(false)}
                          style={styles.cancelBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={profileSaving}
                          style={styles.saveChangesBtn}
                        >
                          <Save size={17} />
                          <span>{profileSaving ? 'Saving Profile...' : 'Save Personal Details'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </form>

                {/* Seller Backup Codes Management Card */}
                <div style={styles.detailCard}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          backgroundColor: '#ECFDF5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <KeyRound size={24} color="#059669" />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                          Seller Backup Verification Codes ({backupCodesRemaining} Unused Remaining)
                        </h4>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B', maxWidth: '640px' }}>
                          Your single-use backup codes are used to verify your identity when you click{' '}
                          <strong>View & Edit</strong> or <strong>Delete</strong> on any property listing, or when modifying your{' '}
                          <strong>My Profile</strong> details. Failed verification attempts automatically trigger Account Takeover (ATO) detection.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={generatingCodes}
                      onClick={() =>
                        requestStepUpVerification({
                          actionType: 'UPDATE_PROFILE',
                          actionTitle: 'Verify Identity to Generate New Backup Codes',
                          actionSubtitle:
                            'Verify your identity with an existing backup code or via your registered email to issue 8 fresh backup codes.',
                          targetLabel: 'Regenerate 8 Seller Backup Codes',
                          onVerified: handleGenerateFreshBackupCodes,
                        })
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={15} />
                      <span>{generatingCodes ? 'Generating...' : 'Generate 8 Fresh Backup Codes'}</span>
                    </button>
                  </div>
                </div>

                {/* ── FINANCIALS SECTION: CREDIT CARD / BANK ACCOUNT & SOLD PROPERTY RECEIPTS ── */}
                <div
                  style={{
                    ...styles.detailCard,
                    marginTop: '22px',
                    border: isEditingFinancials ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                  }}
                >
                  {/* Financials Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: '18px',
                      marginBottom: '22px',
                      borderBottom: '1px solid #E2E8F0',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          backgroundColor: '#EEF2FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <DollarSign size={24} color="#4F46E5" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                            Financials — Credit Card, Bank Account & Sold Property Receipts
                          </h4>
                          <span
                            style={{
                              backgroundColor: isEditingFinancials ? '#EEF2FF' : '#F1F5F9',
                              color: isEditingFinancials ? '#4F46E5' : '#475569',
                              border: '1px solid #CBD5E1',
                              fontSize: '11px',
                              fontWeight: '700',
                              padding: '2px 9px',
                              borderRadius: '999px',
                            }}
                          >
                            {isEditingFinancials ? 'Editing Mode Active' : 'Confidential Numbers Masked (*)'}
                          </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                          Manage the credit card and settlement bank account linked to your seller profile and review past payment receipts for properties sold.
                        </p>
                      </div>
                    </div>

                    {!isEditingFinancials ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingFinancials(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          backgroundColor: '#4F46E5',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={15} />
                        <span>Edit Card & Bank Details</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingFinancials(false)}
                        style={styles.cancelBtn}
                      >
                        Lock & Mask Details
                      </button>
                    )}
                  </div>

                  {/* Part 1: Credit Card & Bank Account Details Form */}
                  <form onSubmit={handleSaveFinancials}>
                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '18px 20px',
                        marginBottom: '26px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: '800',
                          color: '#1E293B',
                          marginBottom: '14px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Linked Credit Card & Bank Account Details
                      </div>

                      <div style={styles.formGrid}>
                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Cardholder / Account Holder Name</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            value={financialsForm.cardholder_name}
                            onChange={(e) =>
                              setFinancialsForm({ ...financialsForm, cardholder_name: e.target.value })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>
                            Settlement Bank / Payment Option
                          </label>
                          {(() => {
                            const commonBankingAndPaymentOptions = [
                              'KCB Private Wealth Bank',
                              'KCB Bank (Kenya Commercial Bank)',
                              'Equity Bank',
                              'Co-operative Bank of Kenya',
                              'NCBA Bank',
                              'Absa Bank',
                              'Standard Chartered Bank',
                              'Stanbic Bank',
                              'I&M Bank',
                              'Diamond Trust Bank (DTB)',
                              'Family Bank',
                              'M-Pesa (Safaricom Mobile Money)',
                              'JPMorgan Chase Bank',
                              'Bank of America',
                              'Citibank',
                              'HSBC',
                              'Barclays Bank',
                              'Wells Fargo',
                              'PayPal',
                              'Stripe Payouts',
                              'Wise (TransferWise)',
                              'Revolut',
                              'Payoneer',
                              'Apple Pay / Google Pay',
                            ];
                            const currentVal = financialsForm.bank_name || '';
                            const optionsList =
                              currentVal && !commonBankingAndPaymentOptions.includes(currentVal)
                                ? [currentVal, ...commonBankingAndPaymentOptions]
                                : commonBankingAndPaymentOptions;

                            return (
                              <select
                                required
                                disabled={!isEditingFinancials}
                                value={financialsForm.bank_name}
                                onChange={(e) =>
                                  setFinancialsForm({
                                    ...financialsForm,
                                    bank_name: e.target.value,
                                  })
                                }
                                style={{
                                  ...styles.selectField,
                                  backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                                  cursor: isEditingFinancials ? 'pointer' : 'not-allowed',
                                }}
                              >
                                {optionsList.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Credit / Debit Card Number</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            placeholder="Enter 16-digit card number"
                            value={
                              isEditingFinancials
                                ? financialsForm.card_number
                                : maskCardNumber(financialsForm.card_number)
                            }
                            onFocus={() => {
                              if (
                                isEditingFinancials &&
                                String(financialsForm.card_number || '').includes('*')
                              ) {
                                setFinancialsForm((prev) => ({ ...prev, card_number: '' }));
                              }
                            }}
                            onChange={(e) =>
                              setFinancialsForm({ ...financialsForm, card_number: e.target.value })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                              fontFamily: 'monospace',
                              letterSpacing: '0.8px',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Bank Account Number</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            placeholder="Enter bank account number"
                            value={
                              isEditingFinancials
                                ? financialsForm.bank_account_number
                                : maskBankAccount(financialsForm.bank_account_number)
                            }
                            onFocus={() => {
                              if (
                                isEditingFinancials &&
                                String(financialsForm.bank_account_number || '').includes('*')
                              ) {
                                setFinancialsForm((prev) => ({
                                  ...prev,
                                  bank_account_number: '',
                                }));
                              }
                            }}
                            onChange={(e) =>
                              setFinancialsForm({
                                ...financialsForm,
                                bank_account_number: e.target.value,
                              })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                              fontFamily: 'monospace',
                              letterSpacing: '0.8px',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Card Expiry Date (MM/YY)</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            placeholder="MM/YY"
                            value={financialsForm.expiry_date}
                            onChange={(e) =>
                              setFinancialsForm({ ...financialsForm, expiry_date: e.target.value })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Card Security Code (CVV)</label>
                          <input
                            type="text"
                            required
                            maxLength={4}
                            disabled={!isEditingFinancials}
                            placeholder="3 or 4-digit CVV"
                            value={isEditingFinancials ? financialsForm.cvv : maskCvv()}
                            onFocus={() => {
                              if (
                                isEditingFinancials &&
                                String(financialsForm.cvv || '').includes('*')
                              ) {
                                setFinancialsForm((prev) => ({ ...prev, cvv: '' }));
                              }
                            }}
                            onChange={(e) =>
                              setFinancialsForm({ ...financialsForm, cvv: e.target.value })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                              fontFamily: 'monospace',
                              letterSpacing: '2px',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Registered Banking Phone Number</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            placeholder="+254 7XX XXX XXX"
                            value={
                              isEditingFinancials
                                ? financialsForm.billing_phone
                                : maskPhoneNumber(financialsForm.billing_phone)
                            }
                            onFocus={() => {
                              if (
                                isEditingFinancials &&
                                String(financialsForm.billing_phone || '').includes('*')
                              ) {
                                setFinancialsForm((prev) => ({ ...prev, billing_phone: '' }));
                              }
                            }}
                            onChange={(e) =>
                              setFinancialsForm({ ...financialsForm, billing_phone: e.target.value })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                              fontFamily: 'monospace',
                            }}
                          />
                        </div>

                        <div style={styles.formCol}>
                          <label style={styles.fieldLabel}>Bank SWIFT / Routing Code</label>
                          <input
                            type="text"
                            required
                            disabled={!isEditingFinancials}
                            placeholder="Enter SWIFT / Routing code"
                            value={
                              isEditingFinancials
                                ? financialsForm.swift_routing_code
                                : maskSwiftOrRef(financialsForm.swift_routing_code)
                            }
                            onFocus={() => {
                              if (
                                isEditingFinancials &&
                                String(financialsForm.swift_routing_code || '').includes('*')
                              ) {
                                setFinancialsForm((prev) => ({
                                  ...prev,
                                  swift_routing_code: '',
                                }));
                              }
                            }}
                            onChange={(e) =>
                              setFinancialsForm({
                                ...financialsForm,
                                swift_routing_code: e.target.value,
                              })
                            }
                            style={{
                              ...styles.inputField,
                              backgroundColor: isEditingFinancials ? '#FFFFFF' : '#F1F5F9',
                              cursor: isEditingFinancials ? 'text' : 'not-allowed',
                              fontFamily: 'monospace',
                            }}
                          />
                        </div>
                      </div>

                      {isEditingFinancials && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            marginTop: '18px',
                            paddingTop: '14px',
                            borderTop: '1px solid #E2E8F0',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setIsEditingFinancials(false)}
                            style={styles.cancelBtn}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={financialsSaving}
                            style={styles.saveChangesBtn}
                          >
                            <Save size={16} />
                            <span>
                              {financialsSaving
                                ? 'Hashing & Saving...'
                                : 'Save Financial Details'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </form>

                  {/* Part 2: Past Payment Receipts for Sold Properties */}
                  {(() => {
                    // Combine any user listings marked SOLD with historical sold property receipts
                    const dynamicSoldReceipts = listings
                      .filter((l) => l.status === 'SOLD')
                      .map((l, idx) => {
                        const gross = Number(l.price) || 950000;
                        const fee = Math.round(gross * 0.015);
                        return {
                          id: `sold_listing_${l.id}`,
                          receipt_no: `RCP-2026-${8840 + idx}`,
                          date_settled: 'Oct 20, 2026',
                          property_title: l.title,
                          property_location: l.location,
                          sale_amount: gross,
                          escrow_fee: fee,
                          net_payout: gross - fee,
                          buyer_name: 'Verified Property Base Buyer',
                          buyer_phone: '+254 719 482 310',
                          buyer_account: '019283746519',
                          wire_reference: `ESCROW-${String(l.id).slice(-4).toUpperCase()}9821`,
                          status: 'SETTLED & DISBURSED',
                        };
                      });

                    const historicalSoldReceipts = [
                      {
                        id: 'hist_rcp_1',
                        receipt_no: 'RCP-2026-09481',
                        date_settled: 'Oct 14, 2026',
                        property_title: 'Lavington Contemporary 5-Bed Manor',
                        property_location: 'Lavington, Nairobi',
                        sale_amount: 1650000,
                        escrow_fee: 24750,
                        net_payout: 1625250,
                        buyer_name: 'Jonathan & Claire Sterling',
                        buyer_phone: '+254 722 910 418',
                        buyer_account: '014098231109',
                        wire_reference: 'WIRE-KCB99283104',
                        status: 'SETTLED & DISBURSED',
                      },
                      {
                        id: 'hist_rcp_2',
                        receipt_no: 'RCP-2026-08712',
                        date_settled: 'Sep 28, 2026',
                        property_title: 'Riverside Drive Sky Duplex Penthouse',
                        property_location: 'Riverside, Nairobi',
                        sale_amount: 920000,
                        escrow_fee: 13800,
                        net_payout: 906200,
                        buyer_name: 'Amina Hassan-Kenyatta',
                        buyer_phone: '+254 734 602 885',
                        buyer_account: '028374619203',
                        wire_reference: 'WIRE-EQB77412098',
                        status: 'SETTLED & DISBURSED',
                      },
                      {
                        id: 'hist_rcp_3',
                        receipt_no: 'RCP-2026-07305',
                        date_settled: 'Aug 19, 2026',
                        property_title: 'Runda Golf View Colonial Residence',
                        property_location: 'Runda, Nairobi',
                        sale_amount: 2100000,
                        escrow_fee: 31500,
                        net_payout: 2068500,
                        buyer_name: 'Sovereign Crest Estates Ltd',
                        buyer_phone: '+254 709 318 552',
                        buyer_account: '088392019482',
                        wire_reference: 'WIRE-SCB55190873',
                        status: 'SETTLED & DISBURSED',
                      },
                    ];

                    const allReceipts = [...dynamicSoldReceipts, ...historicalSoldReceipts];

                    return (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '14px',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div>
                            <h5
                              style={{
                                margin: 0,
                                fontSize: '15px',
                                fontWeight: '800',
                                color: '#0F172A',
                              }}
                            >
                              Past Payment Receipts for Properties Sold ({allReceipts.length})
                            </h5>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                              Confidential account numbers, card numbers, wire references, and phone numbers are masked with <strong>*</strong> for security.
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {allReceipts.map((rcp) => (
                            <div
                              key={rcp.id}
                              style={{
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                backgroundColor: '#FFFFFF',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                              }}
                            >
                              {/* Top Row: Property Title, Receipt Badge & Net Payout */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  flexWrap: 'wrap',
                                  gap: '12px',
                                  paddingBottom: '10px',
                                  borderBottom: '1px solid #F1F5F9',
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span
                                      style={{
                                        backgroundColor: '#EEF2FF',
                                        color: '#4F46E5',
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {rcp.receipt_no}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>
                                      Settled on {rcp.date_settled}
                                    </span>
                                    <span
                                      style={{
                                        backgroundColor: '#ECFDF5',
                                        color: '#047857',
                                        border: '1px solid #A7F3D0',
                                        fontSize: '10.5px',
                                        fontWeight: '800',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                      }}
                                    >
                                      {rcp.status}
                                    </span>
                                  </div>
                                  <h5
                                    style={{
                                      margin: '6px 0 2px',
                                      fontSize: '15.5px',
                                      fontWeight: '800',
                                      color: '#0F172A',
                                    }}
                                  >
                                    {rcp.property_title}
                                  </h5>
                                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                                    Location: {rcp.property_location}
                                  </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>
                                    Net Seller Payout
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '18px',
                                      fontWeight: '800',
                                      color: '#059669',
                                    }}
                                  >
                                    {formatCurrency(rcp.net_payout)}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                                    Gross Sale: {formatCurrency(rcp.sale_amount)} (Fee: {formatCurrency(rcp.escrow_fee)})
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Row: Masked Confidential Banking & Buyer Details */}
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                  gap: '10px',
                                  fontSize: '12px',
                                  color: '#334155',
                                  backgroundColor: '#F8FAFC',
                                  padding: '12px 14px',
                                  borderRadius: '8px',
                                }}
                              >
                                <div>
                                  <div style={{ color: '#64748B', fontSize: '11px' }}>Disbursed To Bank Account:</div>
                                  <strong style={{ fontFamily: 'monospace' }}>
                                    {financialsForm.bank_name} ({maskBankAccount(financialsForm.bank_account_number)})
                                  </strong>
                                </div>

                                <div>
                                  <div style={{ color: '#64748B', fontSize: '11px' }}>Linked Card & Seller Phone:</div>
                                  <strong style={{ fontFamily: 'monospace' }}>
                                    {maskCardNumber(financialsForm.card_number)} • {maskPhoneNumber(financialsForm.billing_phone)}
                                  </strong>
                                </div>

                                <div>
                                  <div style={{ color: '#64748B', fontSize: '11px' }}>Buyer & Masked Contact:</div>
                                  <strong>
                                    {rcp.buyer_name} ({maskPhoneNumber(rcp.buyer_phone)})
                                  </strong>
                                </div>

                                <div>
                                  <div style={{ color: '#64748B', fontSize: '11px' }}>Buyer Account & Wire Ref:</div>
                                  <strong style={{ fontFamily: 'monospace' }}>
                                    Acct {maskBankAccount(rcp.buyer_account)} • {maskSwiftOrRef(rcp.wire_reference)}
                                  </strong>
                                </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadReceipt(rcp)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 13px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#1E293B',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Download size={14} />
                                  <span>Download Receipt (.txt)</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Permanent Account Deletion Card */}
                <div
                  style={{
                    ...styles.detailCard,
                    marginTop: '22px',
                    border: '1.5px solid #FECACA',
                    backgroundColor: '#FFF5F5',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          backgroundColor: '#FEE2E2',
                          border: '1px solid #FCA5A5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={24} color="#DC2626" />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#991B1B' }}>
                          Delete Account
                        </h4>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#7F1D1D', maxWidth: '640px' }}>
                          Permanently delete your Property Base account, credentials, and property listings from the database.
                          Clicking <strong>Delete Account</strong> will send a 6-digit verification code to your email ({user?.email})
                          to verify your identity before deletion. Once deleted, you will no longer be able to log in with this account.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRequestDeleteAccount}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '11px 18px',
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Delete Account</span>
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* ──────────────── 3. ADD NEW PROPERTY MODAL ──────────────── */}
      {isAddModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={styles.modalIconBox}>
                  <Building2 size={22} color="#4F46E5" />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Add New Property Listing</h3>
                  <p style={styles.modalSub}>
                    Publish a verified listing to Property Base
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProperty} style={{ padding: '24px' }}>
              <div style={styles.formGrid}>
                <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                  <label style={styles.fieldLabel}>Property Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Modern Sunset Villa with Infinity Pool"
                    value={newProperty.title}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, title: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Price (USD $) *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 750000"
                    value={newProperty.price}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, price: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Location / City *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Karen, Nairobi"
                    value={newProperty.location}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, location: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Property Type</label>
                  <select
                    value={newProperty.property_type}
                    onChange={(e) =>
                      setNewProperty({
                        ...newProperty,
                        property_type: e.target.value,
                      })
                    }
                    style={styles.selectField}
                  >
                    <option value="Luxury Villa">Luxury Villa</option>
                    <option value="Penthouse">Penthouse</option>
                    <option value="Family Home">Family Home</option>
                    <option value="Luxury Apartment">Luxury Apartment</option>
                    <option value="Golf Estate">Golf Estate</option>
                  </select>
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Square Feet</label>
                  <input
                    type="number"
                    value={newProperty.square_feet}
                    onChange={(e) =>
                      setNewProperty({
                        ...newProperty,
                        square_feet: e.target.value,
                      })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Bedrooms</label>
                  <input
                    type="number"
                    value={newProperty.bedrooms}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, bedrooms: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.fieldLabel}>Bathrooms</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newProperty.bathrooms}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, bathrooms: e.target.value })
                    }
                    style={styles.inputField}
                  />
                </div>

                <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                  <label style={styles.fieldLabel}>
                    Property Photos * {newProperty.images && newProperty.images.length > 0 && `(${newProperty.images.length} uploaded)`}
                  </label>

                  {/* Drag-and-Drop / Click File Upload Dropzone */}
                  <label
                    htmlFor="property-photo-upload-input"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '24px 16px',
                      border: '2px dashed #CBD5E1',
                      borderRadius: '12px',
                      backgroundColor: '#F8FAFC',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: '#EEF2FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <UploadCloud size={24} color="#4F46E5" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
                        Click to browse or drag photos here
                      </span>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                        Select one or more images from your device (JPG, PNG, WebP)
                      </p>
                    </div>
                    <input
                      id="property-photo-upload-input"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoFilesSelected}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {/* Uploaded Photos Preview Thumbnails */}
                  {newProperty.images && newProperty.images.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                        Selected Photos ({newProperty.images.length}) — First image will be used as the primary cover:
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {newProperty.images.map((imgSrc, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: 'relative',
                              width: '92px',
                              height: '68px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: idx === 0 ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                            }}
                          >
                            <img
                              src={imgSrc}
                              alt={`Property upload ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {idx === 0 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: 2,
                                  left: 2,
                                  backgroundColor: '#4F46E5',
                                  color: '#FFFFFF',
                                  fontSize: '8px',
                                  fontWeight: '700',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                }}
                              >
                                Cover
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(idx)}
                              style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                                color: '#FFFFFF',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              title="Remove photo"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}

                        <label
                          htmlFor="property-photo-add-more"
                          style={{
                            width: '92px',
                            height: '68px',
                            borderRadius: '8px',
                            border: '1px dashed #94A3B8',
                            backgroundColor: '#F1F5F9',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#475569',
                          }}
                          title="Add more photos"
                        >
                          <Plus size={16} color="#4F46E5" />
                          <span>Add More</span>
                          <input
                            id="property-photo-add-more"
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handlePhotoFilesSelected}
                            style={{ display: 'none' }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ ...styles.formCol, gridColumn: 'span 2' }}>
                  <label style={styles.fieldLabel}>Property Description</label>
                  <textarea
                    rows={3}
                    placeholder="Highlight luxury features, architectural style, security, and amenities..."
                    value={newProperty.description}
                    onChange={(e) =>
                      setNewProperty({
                        ...newProperty,
                        description: e.target.value,
                      })
                    }
                    style={styles.textareaField}
                  />
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.primaryAddBtn}>
                  <Sparkles size={16} />
                  <span>Publish Property</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── 4. REVIEW OFFER MODAL ──────────────── */}
      {reviewingOffer && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={styles.modalIconBox}>
                  <DollarSign size={22} color="#10B981" />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Purchase Proposal Review</h3>
                  <p style={styles.modalSub}>
                    Formal offer details for {reviewingOffer.property_title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewingOffer(null)}
                style={styles.modalCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={styles.offerReviewHeader}>
                <div>
                  <div style={{ fontSize: 13, color: '#64748B' }}>Offered Price:</div>
                  <div style={styles.bigOfferNumber}>
                    {formatCurrency(reviewingOffer.offer_amount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                    List Price: {formatCurrency(reviewingOffer.list_price)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: '#64748B' }}>Offer Status:</div>
                  <span
                    style={{
                      ...styles.offerStatusBadge,
                      backgroundColor:
                        reviewingOffer.status === 'ACCEPTED'
                          ? '#ECFDF5'
                          : reviewingOffer.status === 'DECLINED'
                          ? '#FEF2F2'
                          : '#FFFBEB',
                      color:
                        reviewingOffer.status === 'ACCEPTED'
                          ? '#047857'
                          : reviewingOffer.status === 'DECLINED'
                          ? '#B91C1C'
                          : '#B45309',
                    }}
                  >
                    {reviewingOffer.status}
                  </span>
                </div>
              </div>

              <div style={styles.reviewSection}>
                <h5 style={styles.reviewSectionTitle}>Prospective Buyer Information</h5>
                <div style={styles.infoRow}>
                  <span>Buyer Full Name:</span>
                  <strong>{reviewingOffer.client_name}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Contact Email:</span>
                  <strong>{reviewingOffer.client_email}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Phone Number:</span>
                  <strong>{reviewingOffer.client_phone}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Financing Method:</span>
                  <strong>{reviewingOffer.financing_type}</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>Contingencies:</span>
                  <strong>{reviewingOffer.contingencies}</strong>
                </div>
              </div>

              <div style={styles.reviewSection}>
                <h5 style={styles.reviewSectionTitle}>Buyer Cover Message</h5>
                <p style={styles.reviewMessage}>{reviewingOffer.message_preview}</p>
              </div>

              <div style={styles.modalFooter}>
                <button
                  onClick={() => setReviewingOffer(null)}
                  style={styles.cancelBtn}
                >
                  Close
                </button>

                {reviewingOffer.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() =>
                        handleUpdateOfferStatus(reviewingOffer.id, 'DECLINED')
                      }
                      style={styles.declineBtn}
                    >
                      <X size={16} /> Decline Offer
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateOfferStatus(reviewingOffer.id, 'ACCEPTED')
                      }
                      style={styles.acceptBtn}
                    >
                      <Check size={16} /> Accept Offer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── 5. REPLY MESSAGE CLIENT MODAL ──────────────── */}
      {messagingOffer && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={styles.modalIconBox}>
                  <MessageSquare size={22} color="#4F46E5" />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Message Prospective Buyer</h3>
                  <p style={styles.modalSub}>
                    Direct message to {messagingOffer.client_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMessagingOffer(null)}
                style={styles.modalCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendMessageToClient} style={{ padding: '24px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={styles.fieldLabel}>Recipient</label>
                <input
                  type="text"
                  disabled
                  value={`${messagingOffer.client_name} (${messagingOffer.client_email})`}
                  style={{ ...styles.inputField, backgroundColor: '#F1F5F9' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={styles.fieldLabel}>Your Response / Counter-Offer</label>
                <textarea
                  rows={5}
                  required
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  style={styles.textareaField}
                />
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setMessagingOffer(null)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.primaryAddBtn}>
                  <ArrowRight size={16} />
                  <span>Send Reply</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── 6. STEP-UP IDENTITY VERIFICATION MODAL (ANTI-ATO) ──────────────── */}
      {stepUpModal.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, width: '500px' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    ...styles.modalIconBox,
                    backgroundColor:
                      stepUpModal.actionType === 'DELETE_LISTING' ||
                      stepUpModal.actionType === 'DELETE_ACCOUNT'
                        ? '#FEF2F2'
                        : '#EEF2FF',
                  }}
                >
                  <ShieldCheck
                    size={22}
                    color={
                      stepUpModal.actionType === 'DELETE_LISTING' ||
                      stepUpModal.actionType === 'DELETE_ACCOUNT'
                        ? '#DC2626'
                        : '#4F46E5'
                    }
                  />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>{stepUpModal.actionTitle}</h3>
                  <p style={styles.modalSub}>
                    Anti-Account Takeover (ATO) Step-Up Security Verification
                  </p>
                </div>
              </div>
              <button onClick={handleCloseStepUpModal} style={styles.modalCloseBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyStepUpAction} style={{ padding: '24px' }}>
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: 1.55,
                }}
              >
                {stepUpModal.actionSubtitle}
              </p>

              {/* Verification Method Toggle Tabs */}
              {stepUpModal.actionType !== 'DELETE_ACCOUNT' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    backgroundColor: '#F1F5F9',
                    padding: '4px',
                    borderRadius: '10px',
                    marginBottom: '18px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setStepUpModal((prev) => ({
                        ...prev,
                        method: 'backup',
                        codeInput: '',
                        error: '',
                      }))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      backgroundColor:
                        stepUpModal.method === 'backup' ? '#FFFFFF' : 'transparent',
                      color: stepUpModal.method === 'backup' ? '#4F46E5' : '#64748B',
                      boxShadow:
                        stepUpModal.method === 'backup'
                          ? '0 1px 3px rgba(0,0,0,0.08)'
                          : 'none',
                    }}
                  >
                    <KeyRound size={14} />
                    <span>
                      {stepUpModal.targetPropertyId
                        ? `Listing Backup Code (${listingMfa.codes.length}/3)`
                        : `Backup Code (${backupCodesRemaining})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={stepUpModal.sendingEmail}
                    onClick={() => {
                      if (stepUpModal.method !== 'email_otp' || !stepUpModal.emailSentMessage) {
                        handleSendStepUpEmailCode();
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      backgroundColor:
                        stepUpModal.method === 'email_otp' ? '#FFFFFF' : 'transparent',
                      color: stepUpModal.method === 'email_otp' ? '#4F46E5' : '#64748B',
                      boxShadow:
                        stepUpModal.method === 'email_otp'
                          ? '0 1px 3px rgba(0,0,0,0.08)'
                          : 'none',
                    }}
                  >
                    <Mail size={14} />
                    <span>
                      {stepUpModal.sendingEmail ? 'Sending Email...' : 'Verify via Email'}
                    </span>
                  </button>
                </div>
              )}

              {/* Error Alert */}
              {stepUpModal.error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '12px 14px',
                    backgroundColor: '#FEF2F2',
                    color: '#B91C1C',
                    border: '1px solid #FCA5A5',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    lineHeight: 1.45,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{stepUpModal.error}</span>
                </div>
              )}

              {/* Email Sent Banner */}
              {stepUpModal.method === 'email_otp' && stepUpModal.emailSentMessage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '12px 14px',
                    backgroundColor: '#ECFDF5',
                    color: '#047857',
                    border: '1px solid #A7F3D0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    lineHeight: 1.45,
                  }}
                >
                  <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{stepUpModal.emailSentMessage}</span>
                </div>
              )}

              {stepUpModal.method === 'backup' ? (
                <div style={{ marginBottom: '16px' }}>
                  <label style={styles.fieldLabel}>
                    {stepUpModal.targetPropertyId
                      ? `Enter Single-Use Listing Backup Code (${listingMfa.codes.length} remaining for editing/deleting any listing)`
                      : 'Enter Single-Use Seller Backup Code'}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. A8K2-9P1Z"
                    value={stepUpModal.codeInput}
                    onChange={(e) =>
                      setStepUpModal((prev) => ({
                        ...prev,
                        codeInput: e.target.value.toUpperCase(),
                      }))
                    }
                    style={{
                      ...styles.inputField,
                      width: '100%',
                      boxSizing: 'border-box',
                      marginTop: '6px',
                      fontSize: '15px',
                      fontWeight: '700',
                      letterSpacing: '1.5px',
                      textAlign: 'center',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#64748B',
                    }}
                  >
                    <span>Cannot verify with a backup code?</span>
                    <button
                      type="button"
                      disabled={stepUpModal.sendingEmail}
                      onClick={handleSendStepUpEmailCode}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4F46E5',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      {stepUpModal.sendingEmail
                        ? 'Sending code to your email...'
                        : `Send code to ${user?.email}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      fontSize: '12px',
                      color: '#334155',
                    }}
                  >
                    Code automatically dispatched to your registered email:{' '}
                    <strong>{user?.email}</strong>
                  </div>

                  <label style={styles.fieldLabel}>
                    Enter 6-Digit Email Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    placeholder="6-digit code"
                    value={stepUpModal.codeInput}
                    onChange={(e) =>
                      setStepUpModal((prev) => ({
                        ...prev,
                        codeInput: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    style={{
                      ...styles.inputField,
                      width: '100%',
                      boxSizing: 'border-box',
                      marginTop: '6px',
                      fontSize: '16px',
                      fontWeight: '800',
                      letterSpacing: '4px',
                      textAlign: 'center',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#64748B',
                    }}
                  >
                    {stepUpModal.actionType !== 'DELETE_ACCOUNT' ? (
                      <button
                        type="button"
                        onClick={() =>
                          setStepUpModal((prev) => ({
                            ...prev,
                            method: 'backup',
                            codeInput: '',
                            error: '',
                          }))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#475569',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Use Backup Code instead
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      disabled={stepUpModal.sendingEmail}
                      onClick={handleSendStepUpEmailCode}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4F46E5',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {stepUpModal.sendingEmail ? 'Resending...' : 'Resend Email Code'}
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={handleCloseStepUpModal}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stepUpModal.loading}
                  style={{
                    ...styles.primaryAddBtn,
                    backgroundColor:
                      stepUpModal.actionType === 'DELETE_LISTING' ||
                      stepUpModal.actionType === 'DELETE_ACCOUNT'
                        ? '#DC2626'
                        : '#4F46E5',
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>
                    {stepUpModal.loading
                      ? 'Verifying...'
                      : stepUpModal.actionType === 'DELETE_ACCOUNT'
                      ? 'Verify & Delete Account'
                      : 'Verify & Proceed'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── 6B. FINANCIALS DUAL STEP-UP VERIFICATION MODAL ──────────────── */}
      {financialsMfaModal.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, width: '540px', maxWidth: '95vw' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    ...styles.modalIconBox,
                    backgroundColor: '#EEF2FF',
                  }}
                >
                  <ShieldCheck size={22} color="#4F46E5" />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>
                    Verify Identity to Save Financial Details
                  </h3>
                  <p style={styles.modalSub}>
                    Dual Verification: Mobile Email Number Match + Unused Messages Backup Code
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseFinancialsMfaModal}
                style={styles.modalCloseBtn}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyFinancialsMfa} style={{ padding: '24px' }}>
              {financialsMfaModal.error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '12px 14px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    marginBottom: '16px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{financialsMfaModal.error}</span>
                </div>
              )}

              {/* STEP 1: MOBILE EMAIL NUMBER-MATCHING PUSH CHALLENGE */}
              <div
                style={{
                  backgroundColor:
                    financialsMfaModal.pushStatus === 'APPROVED' ? '#ECFDF5' : '#F8FAFC',
                  border:
                    financialsMfaModal.pushStatus === 'APPROVED'
                      ? '1.5px solid #10B981'
                      : '1px solid #CBD5E1',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  marginBottom: '18px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: '#0F172A',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Step 1 — Press Matching Digit on Mobile Email
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      backgroundColor:
                        financialsMfaModal.pushStatus === 'APPROVED'
                          ? '#D1FAE5'
                          : financialsMfaModal.pushStatus === 'DENIED'
                          ? '#FEE2E2'
                          : '#FEF3C7',
                      color:
                        financialsMfaModal.pushStatus === 'APPROVED'
                          ? '#047857'
                          : financialsMfaModal.pushStatus === 'DENIED'
                          ? '#B91C1C'
                          : '#B45309',
                    }}
                  >
                    {financialsMfaModal.initiating
                      ? 'SENDING EMAIL...'
                      : financialsMfaModal.pushStatus === 'APPROVED'
                      ? 'NUMBER MATCH CONFIRMED'
                      : financialsMfaModal.pushStatus === 'DENIED'
                      ? 'WRONG DIGIT PRESSED'
                      : 'WAITING FOR MOBILE TAP...'}
                  </span>
                </div>

                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: '12.5px',
                    color: '#334155',
                    lineHeight: 1.5,
                  }}
                >
                  We sent a security verification email to{' '}
                  <strong>{financialsMfaModal.email || user?.email}</strong>. Open the email on your{' '}
                  <strong>mobile phone</strong> and tap the matching 2-digit number shown below:
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 18px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700' }}>
                      NUMBER TO PRESS ON YOUR PHONE EMAIL
                    </div>
                    <div
                      style={{
                        fontSize: '30px',
                        fontWeight: '900',
                        color:
                          financialsMfaModal.pushStatus === 'APPROVED' ? '#059669' : '#4F46E5',
                        fontFamily: 'monospace',
                        letterSpacing: '3px',
                        marginTop: '2px',
                      }}
                    >
                      {financialsMfaModal.initiating
                        ? '..'
                        : financialsMfaModal.expectedNumber ?? '--'}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={financialsMfaModal.initiating}
                    onClick={handleOpenFinancialsMfaModal}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      backgroundColor: '#F1F5F9',
                      color: '#334155',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Send New Number to Email</span>
                  </button>
                </div>
              </div>

              {/* STEP 2: UNUSED MESSAGES BACKUP CODE */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: '#0F172A',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Step 2 — Enter Unused Messages Backup Code
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#4F46E5',
                      backgroundColor: '#EEF2FF',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    {messagesBackupCodes.length} Unused Messages Code(s) Available
                  </span>
                </div>

                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: '12.5px',
                    color: '#475569',
                    lineHeight: 1.45,
                  }}
                >
                  Enter one of your unused <strong>Messages backup codes</strong>. The system will verify against PostgreSQL that the code has not been used before and will consume it upon verification.
                </p>

                <input
                  type="text"
                  required
                  placeholder="e.g. A8K2-9P1Z"
                  value={financialsMfaModal.backupCodeInput}
                  onChange={(e) =>
                    setFinancialsMfaModal((prev) => ({
                      ...prev,
                      backupCodeInput: e.target.value.toUpperCase(),
                    }))
                  }
                  style={{
                    ...styles.inputField,
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '15px',
                    fontWeight: '800',
                    letterSpacing: '1.5px',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    backgroundColor: '#FFFFFF',
                  }}
                />

                {messagesBackupCodes.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>
                      Your unused Messages backup codes (click a code to fill):
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {messagesBackupCodes.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() =>
                            setFinancialsMfaModal((prev) => ({
                              ...prev,
                              backupCodeInput: code,
                            }))
                          }
                          style={{
                            backgroundColor: '#EEF2FF',
                            border: '1px solid #C7D2FE',
                            color: '#3730A3',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={handleCloseFinancialsMfaModal}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    financialsMfaModal.verifying ||
                    financialsMfaModal.initiating ||
                    financialsMfaModal.pushStatus !== 'APPROVED'
                  }
                  style={{
                    ...styles.primaryAddBtn,
                    backgroundColor:
                      financialsMfaModal.pushStatus === 'APPROVED' ? '#4F46E5' : '#94A3B8',
                    cursor:
                      financialsMfaModal.pushStatus === 'APPROVED' ? 'pointer' : 'not-allowed',
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>
                    {financialsMfaModal.verifying
                      ? 'Verifying & Saving...'
                      : financialsMfaModal.pushStatus !== 'APPROVED'
                      ? `Waiting for Digit ${financialsMfaModal.expectedNumber ?? ''} on Phone...`
                      : 'Verify Both & Save Financial Details'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── 7. LISTING BACKUP CODES POPUP MODAL ──────────────── */}
      {listingBackupModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '500px',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #E2E8F0',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#EEF2FF',
                color: '#4F46E5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <KeyRound size={28} />
            </div>

            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: '21px',
                fontWeight: '800',
                color: '#0F172A',
              }}
            >
              {listingBackupModal.isRefill
                ? 'New Listing Backup Codes Generated!'
                : 'Save Your Listing Backup Codes'}
            </h2>

            <p
              style={{
                margin: '0 0 18px 0',
                fontSize: '13.5px',
                color: '#475569',
                lineHeight: '1.55',
              }}
            >
              {listingBackupModal.isRefill ? (
                <>
                  Welcome back! Since all of your previous listing backup codes were used up, the
                  system has generated a <strong>new set of 3 random backup codes</strong>. Save
                  them now to verify your identity whenever you edit or delete any property listing.
                </>
              ) : (
                <>
                  Your first property listing{' '}
                  <strong style={{ color: '#0F172A' }}>
                    "{listingBackupModal.propertyTitle}"
                  </strong>{' '}
                  has been saved! Store these <strong>3 random single-use backup codes</strong> in a
                  safe place — you will use them whenever you click <strong>View & Edit</strong> or{' '}
                  <strong>Delete</strong> on any property listing.
                </>
              )}
            </p>

            {/* 3 Listing Backup Codes Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '10px',
                backgroundColor: '#F8FAFC',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                marginBottom: '20px',
              }}
            >
              {listingBackupModal.codes.map((code, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#FFFFFF',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontWeight: '800',
                    color: '#1E293B',
                    letterSpacing: '1.5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '700' }}>
                    CODE #{idx + 1}
                  </span>
                  <span>{code}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      backgroundColor: '#ECFDF5',
                      color: '#059669',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    SINGLE-USE
                  </span>
                </div>
              ))}
            </div>

            {/* Copy & Download Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={copyListingCodesToClipboard}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: listingBackupModal.copied ? '#ECFDF5' : '#FFFFFF',
                  color: listingBackupModal.copied ? '#059669' : '#334155',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Copy size={15} />
                <span>{listingBackupModal.copied ? 'Copied!' : 'Copy Codes'}</span>
              </button>

              <button
                type="button"
                onClick={downloadListingCodesFile}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Download size={15} />
                <span>Download .txt</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setListingBackupModal((prev) => ({
                  ...prev,
                  isOpen: false,
                }))
              }
              style={{
                width: '100%',
                padding: '13px 18px',
                backgroundColor: '#4F46E5',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              }}
            >
              I HAVE SAVED MY 3 LISTING BACKUP CODES
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── COMPREHENSIVE STYLES ─────────────────────────────────────────────────────
const styles = {
  appWrapper: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#F8FAFC',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#0F172A',
  },

  // ── Sidebar ──
  sidebar: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRight: '1px solid #1E293B',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'sticky',
    top: 0,
    height: '100vh',
    zIndex: 100,
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 16px',
    borderBottom: '1px solid #1E293B',
    minHeight: '44px',
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    overflow: 'hidden',
  },
  logoPill: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: '#4F46E5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
    flexShrink: 0,
  },
  brandTextGroup: {
    display: 'flex',
    flexDirection: 'column',
    whiteSpace: 'nowrap',
  },
  brandTitle: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  brandSubtitle: {
    fontSize: '11px',
    color: '#94A3B8',
    fontWeight: '500',
  },
  toggleBtn: {
    background: '#1E293B',
    border: '1px solid #334155',
    color: '#CBD5E1',
    borderRadius: '6px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s',
  },

  navLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 12px',
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 14px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94A3B8',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 14px',
    backgroundColor: '#4F46E5',
    border: 'none',
    color: '#FFFFFF',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
    whiteSpace: 'nowrap',
  },
  navLabelBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#1E293B',
    color: '#C7D2FE',
    padding: '2px 7px',
    borderRadius: '999px',
  },
  alertCountBadge: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    padding: '2px 7px',
    borderRadius: '999px',
  },

  sidebarFooter: {
    padding: '16px 12px',
    borderTop: '1px solid #1E293B',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    borderRadius: '8px',
    backgroundColor: '#1E293B',
    overflow: 'hidden',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userText: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  userName: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#F8FAFC',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  userRoleBadge: {
    fontSize: '10px',
    color: '#34D399',
    fontWeight: '600',
  },
  logoutFullBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '9px',
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    color: '#EF4444',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    width: '100%',
  },
  logoutIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '9px',
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    color: '#EF4444',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
  },

  // ── Main Wrapper ──
  mainWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  topHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E2E8F0',
    position: 'sticky',
    top: 0,
    zIndex: 90,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  mobileHamburger: {
    display: 'none',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#0F172A',
  },
  pageTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '800',
    color: '#0F172A',
  },
  pageDate: {
    margin: '2px 0 0',
    fontSize: '12px',
    color: '#64748B',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  primaryAddBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
    transition: 'all 0.15s',
  },
  iconCircleBtn: {
    position: 'relative',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#F1F5F9',
    border: '1px solid #E2E8F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  notifDot: {
    position: 'absolute',
    top: '7px',
    right: '8px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#EF4444',
  },

  // ── Toast Banner ──
  toastSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 32px 0',
    padding: '12px 18px',
    backgroundColor: '#ECFDF5',
    color: '#047857',
    borderRadius: '8px',
    border: '1px solid #A7F3D0',
    fontSize: '13px',
    fontWeight: '600',
  },
  toastError: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 32px 0',
    padding: '12px 18px',
    backgroundColor: '#FEF2F2',
    color: '#B91C1C',
    borderRadius: '8px',
    border: '1px solid #FCA5A5',
    fontSize: '13px',
    fontWeight: '600',
  },
  toastCloseBtn: {
    background: 'transparent',
    border: 'none',
    marginLeft: 'auto',
    cursor: 'pointer',
    color: 'inherit',
  },

  // ── Content Scroll Flow ──
  contentScroll: {
    padding: '24px 32px 60px',
    display: 'flex',
    flexDirection: 'column',
    gap: '36px',
  },

  // ── Stats Row ──
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  statBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #E2E8F0',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  },
  statIconBoxIndigo: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    backgroundColor: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBoxAmber: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    backgroundColor: '#FFFBEB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBoxEmerald: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    backgroundColor: '#ECFDF5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBoxBlue: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    backgroundColor: '#EFF6FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: '500',
  },

  // ── Section 1 & 2 Containers ──
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  titleBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: '-0.3px',
  },
  sectionCountPill: {
    fontSize: '12px',
    fontWeight: '700',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    padding: '2px 10px',
    borderRadius: '999px',
  },
  sectionSub: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: '#64748B',
  },
  filterControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    padding: '8px 12px',
    width: '260px',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    width: '100%',
    color: '#0F172A',
  },
  clearSearch: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#94A3B8',
    padding: 0,
  },
  statusPillGroup: {
    display: 'flex',
    gap: '6px',
    backgroundColor: '#F1F5F9',
    padding: '3px',
    borderRadius: '8px',
  },
  statusPillActive: {
    padding: '6px 12px',
    backgroundColor: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#4F46E5',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  statusPillInactive: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748B',
    cursor: 'pointer',
  },

  // ── Listings Grid & Card Components ──
  listingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
  },
  propertyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid #E2E8F0',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardImageWrapper: {
    position: 'relative',
    width: '100%',
    height: '210px',
    backgroundColor: '#0F172A',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  statusTag: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    color: '#FFFFFF',
    fontSize: '10px',
    fontWeight: '800',
    padding: '4px 10px',
    borderRadius: '6px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  typeBadge: {
    position: 'absolute',
    bottom: '12px',
    left: '12px',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(4px)',
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '6px',
  },

  cardBody: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  cardPriceRow: {
    marginBottom: '6px',
  },
  cardPrice: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#0F172A',
  },
  cardTitle: {
    margin: '0 0 6px',
    fontSize: '16px',
    fontWeight: '700',
    color: '#1E293B',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardLocation: {
    margin: '0 0 16px',
    fontSize: '13px',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  specsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0',
    borderTop: '1px solid #F1F5F9',
    borderBottom: '1px solid #F1F5F9',
    marginBottom: '16px',
  },
  specItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#475569',
    fontWeight: '600',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  viewsCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#94A3B8',
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  // ── Offers Grid & Card Components ──
  offersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
    gap: '20px',
  },
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid #E2E8F0',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  offerPropertyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingBottom: '14px',
    borderBottom: '1px solid #F1F5F9',
  },
  offerThumb: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    objectFit: 'cover',
  },
  offerPropRefLabel: {
    fontSize: '11px',
    color: '#94A3B8',
    fontWeight: '500',
  },
  offerPropTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0F172A',
  },
  offerStatusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: '800',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid',
    letterSpacing: '0.4px',
  },

  offerDetailsBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: '10px',
    padding: '14px 16px',
  },
  clientInfoBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  clientAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientName: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0F172A',
  },
  clientContact: {
    fontSize: '11px',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '2px',
  },

  offerPriceBlock: {
    textAlign: 'right',
  },
  offerAmount: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#0F172A',
  },
  offerDiff: {
    fontSize: '11px',
    marginTop: '2px',
  },

  messagePreviewBox: {
    position: 'relative',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '12px 14px',
    borderLeft: '3px solid #6366F1',
  },
  quoteMark: {
    fontSize: '16px',
    color: '#6366F1',
    fontWeight: '800',
    marginRight: '4px',
  },
  messageText: {
    margin: 0,
    fontSize: '12px',
    color: '#334155',
    lineHeight: '18px',
    fontStyle: 'italic',
  },

  offerActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: 'auto',
  },
  reviewOfferBtn: {
    padding: '7px 12px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#334155',
    cursor: 'pointer',
  },
  messageClientBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    backgroundColor: '#F1F5F9',
    border: '1px solid #E2E8F0',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155',
    cursor: 'pointer',
  },
  acceptBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '7px 14px',
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  declineBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '7px 14px',
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FCA5A5',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },

  // ── Full-Page Detail & Edit Container ──
  detailContainer: {
    padding: '24px 32px 60px',
    maxWidth: '1000px',
  },
  detailTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'transparent',
    border: 'none',
    color: '#4F46E5',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  detailActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  deleteListingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FCA5A5',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E2E8F0',
    padding: '32px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  categoryPill: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    padding: '3px 10px',
    borderRadius: '6px',
    textTransform: 'uppercase',
  },
  detailTitle: {
    margin: '8px 0 4px',
    fontSize: '26px',
    fontWeight: '800',
    color: '#0F172A',
  },
  detailLoc: {
    margin: 0,
    fontSize: '14px',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  detailPriceTag: {
    fontSize: '30px',
    fontWeight: '800',
    color: '#4F46E5',
  },

  photoContainer: {
    position: 'relative',
    width: '100%',
    height: '380px',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '28px',
  },
  largeHeroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imageOverlayTag: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: '#FFFFFF',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '12px',
  },

  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
  },
  formCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#334155',
  },
  inputField: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    color: '#0F172A',
    outline: 'none',
  },
  selectField: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    color: '#0F172A',
    outline: 'none',
    backgroundColor: '#FFFFFF',
  },
  textareaField: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13px',
    color: '#0F172A',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
  },

  saveActionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '28px',
    paddingTop: '20px',
    borderTop: '1px solid #E2E8F0',
  },
  saveChangesBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
  },
  cancelBtn: {
    padding: '12px 20px',
    backgroundColor: '#F1F5F9',
    color: '#475569',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // ── Modals ──
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
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    width: '640px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow:
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalIconBox: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    margin: '2px 0 0',
    fontSize: '12px',
    color: '#64748B',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#64748B',
  },
  modalFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid #E2E8F0',
  },

  // Review Offer Modal Internals
  offerReviewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: '16px 20px',
    borderRadius: '10px',
    border: '1px solid #E2E8F0',
    marginBottom: '20px',
  },
  bigOfferNumber: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#059669',
  },
  reviewSection: {
    marginBottom: '20px',
  },
  reviewSectionTitle: {
    margin: '0 0 10px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #F1F5F9',
    fontSize: '13px',
    color: '#475569',
  },
  reviewMessage: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '13px',
    color: '#334155',
    lineHeight: '20px',
    fontStyle: 'italic',
    borderLeft: '3px solid #10B981',
    margin: 0,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid #E2E8F0',
    padding: '48px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    color: '#64748B',
  },
  emptyIconCircle: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    backgroundColor: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '6px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0F172A',
    margin: 0,
  },
  emptyDescription: {
    fontSize: '14px',
    color: '#64748B',
    maxWidth: '520px',
    lineHeight: 1.6,
    margin: 0,
  },
  simOfferBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    border: '1px solid #C7D2FE',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
