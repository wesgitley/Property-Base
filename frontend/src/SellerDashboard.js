import React, { useState, useEffect } from 'react';
import {
  Home,
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
} from 'lucide-react';

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
export default function SellerDashboard({ user, onLogout, onSwitchToAdmin }) {
  // Navigation & layout state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('home');

  // Identify user storage key so each account has isolated listings & offers
  const userKey = user?.email || user?.username || 'new_seller';
  const storageKeyListings = `pb_listings_${userKey}`;
  const storageKeyOffers = `pb_offers_${userKey}`;

  // Listings state: New users start with an EMPTY portfolio ([]), or load previously posted listings
  const [listings, setListings] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeyListings);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load listings from storage', e);
    }
    // Brand new user starts with 0 listings!
    return [];
  });

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
    // Brand new user starts with 0 offers!
    return [];
  });

  // Persist user-specific listings & offers across sessions
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

  const showToast = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
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
      `✨ New buyer offer of ${formatCurrency(first.offer_amount)} received from ${first.client_name} for "${targetProperty.title}"!`
    );
  };

  // ── HANDLERS: LISTINGS ────────────────────────────────────────────────────
  const handleViewProperty = (property) => {
    setSelectedProperty(property);
    setEditFormData({
      ...property,
      images: property.images || (property.image_url ? [property.image_url] : []),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!window.confirm('Are you sure you want to remove this property listing?')) return;
    setListings((prev) => prev.filter((p) => p.id !== id));
    // Also remove associated offers
    setOffers((prev) => prev.filter((o) => o.property_id !== id));
    setSelectedProperty(null);
    setEditFormData(null);
    showToast('success', 'Property listing and associated offers removed.');
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

    // 1. Add new listing to portfolio
    setListings((prev) => [createdItem, ...prev]);
    setIsAddModalOpen(false);
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
    showToast('success', `Listing "${createdItem.title}" published with ${createdItem.images.length} photo(s)! Attracting buyer proposals...`);

    // 2. Automatically generate synthetic buyer offers for this newly created listing!
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
    showToast('success', `Message sent to ${messagingOffer.client_name}!`);
    setMessagingOffer(null);
    setMessageText('');
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
              setActiveNav('home');
              setSelectedProperty(null);
            }}
            style={activeNav === 'home' ? styles.navItemActive : styles.navItem}
          >
            <Home size={20} />
            {isSidebarOpen && <span>Dashboard Home</span>}
          </button>

          <button
            onClick={() => {
              setActiveNav('listings');
              setSelectedProperty(null);
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
            onClick={() => {
              setActiveNav('offers');
              setSelectedProperty(null);
            }}
            style={activeNav === 'offers' ? styles.navItemActive : styles.navItem}
          >
            <DollarSign size={20} />
            {isSidebarOpen && (
              <div style={styles.navLabelBadgeRow}>
                <span>Offers & Leads</span>
                {pendingOffersCount > 0 && (
                  <span style={styles.alertCountBadge}>{pendingOffersCount}</span>
                )}
              </div>
            )}
          </button>

          <button
            onClick={() => setActiveNav('messages')}
            style={activeNav === 'messages' ? styles.navItemActive : styles.navItem}
          >
            <MessageSquare size={20} />
            {isSidebarOpen && <span>Messages</span>}
          </button>

          <button
            onClick={() => setActiveNav('analytics')}
            style={activeNav === 'analytics' ? styles.navItemActive : styles.navItem}
          >
            <TrendingUp size={20} />
            {isSidebarOpen && <span>Market Analytics</span>}
          </button>

          <button
            onClick={() => setActiveNav('settings')}
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

            {/* ── SECTION 1: "MY LISTINGS" ── */}
            <section style={styles.sectionBlock}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.titleBadgeRow}>
                    <h3 style={styles.sectionTitle}>My Listings</h3>
                    <span style={styles.sectionCountPill}>{filteredListings.length}</span>
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
                  {listings.length > 0 && (
                    <button
                      onClick={() => {
                        const target = listings[Math.floor(Math.random() * listings.length)];
                        generateSyntheticOffers(target, 1);
                      }}
                      style={styles.simOfferBtn}
                      title="Simulate an incoming purchase offer for one of your listings"
                    >
                      <Sparkles size={14} />
                      <span>Simulate Offer</span>
                    </button>
                  )}

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
                        : 'Your property listings are active! When prospective buyers submit purchase proposals, they will arrive here in real-time. You can also generate a synthetic offer to preview the review workflow.'
                      : 'No purchase offers match your selected filter tab.'}
                  </p>
                  {listings.length > 0 && offers.length === 0 && (
                    <button
                      onClick={() => generateSyntheticOffers(listings[0], 1)}
                      style={{
                        ...styles.primaryAddBtn,
                        backgroundColor: '#059669',
                        marginTop: '12px',
                      }}
                    >
                      <Sparkles size={16} /> Simulate Buyer Offer for "{listings[0].title}"
                    </button>
                  )}
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
