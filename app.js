const player = {
  name: 'Aurelia Voss',
  avatarText: 'AV',
  profession: 'Profile unavailable',
  className: 'Profile unavailable',
  education: 'Profile unavailable',
  party: 'United Front',
  balance: 'Loading...',
};

const installZoomLock = () => {
  if (window.__tyrannyZoomLockInstalled) {
    return;
  }

  window.__tyrannyZoomLockInstalled = true;

  const clampPageZoom = () => {
    const root = document.documentElement;
    const body = document.body;
    if (root) {
      root.style.zoom = '1';
    }
    if (body) {
      body.style.zoom = '1';
    }
  };

  clampPageZoom();
  window.addEventListener('resize', clampPageZoom, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', clampPageZoom, { passive: true });
  }

  const isTextEntryTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable]'));
  };

  document.addEventListener('keydown', (event) => {
    const isZoomCombo = (event.ctrlKey || event.metaKey) && (
      event.key === '+' ||
      event.key === '=' ||
      event.key === '-' ||
      event.key === '0' ||
      event.key === 'Dead' ||
      event.code === 'NumpadAdd' ||
      event.code === 'NumpadSubtract' ||
      event.code === 'Numpad0'
    );

    if (!isZoomCombo || isTextEntryTarget(event.target)) {
      return;
    }

    event.preventDefault();
  }, { passive: false });

  document.addEventListener('wheel', (event) => {
    if (!((event.ctrlKey || event.metaKey) && !isTextEntryTarget(event.target))) {
      return;
    }

    event.preventDefault();
  }, { passive: false });
};

installZoomLock();

function bindGlobalCitizenProfileActions() {
  const root = document.body;
  if (!root || root.dataset.globalProfileNavigationBound === 'true') {
    return;
  }

  root.dataset.globalProfileNavigationBound = 'true';
  root.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const profileOpenButton = target.closest('[data-social-action="open-citizen-profile"]');
    if (profileOpenButton) {
      event.preventDefault();
      event.stopPropagation();

      const targetCitizenId = String(profileOpenButton.dataset.citizenId || '').trim();
      if (!targetCitizenId) {
        return;
      }

      await loadSocialProfileView(targetCitizenId);
      return;
    }

    const closeProfileButton = target.closest('[data-social-action="close-profile-view"]');
    if (closeProfileButton) {
      closeSocialProfileView();
    }

    const messageProfileButton = target.closest('[data-social-action="message-profile"]');
    if (messageProfileButton) {
      event.preventDefault();
      const targetCitizenId = String(messageProfileButton.dataset.targetCitizenId || '').trim();
      if (!targetCitizenId || socialState.profileMessageBusyByCitizen[targetCitizenId]) {
        return;
      }

      const profileData = socialState.profileView?.data || null;
      const profileHandle = formatSocialHandle(profileData?.handle || '@citizen', '@citizen');
      const profileAvatarUrl = profileData?.avatar_url || './assets/avatars/aurelia-voss.svg';
      await startProfileMessageAction(targetCitizenId, profileHandle, profileAvatarUrl);
    }

    const associateToggle = target.closest('[data-associate-action="toggle-profile-association"]');
    if (associateToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleProfileAssociationPicker(associateToggle.dataset.targetCitizenId);
      return;
    }

    const associateChoice = target.closest('[data-associate-action="set-association"]');
    if (associateChoice) {
      event.preventDefault();
      event.stopPropagation();
      const targetCitizenId = String(associateChoice.dataset.targetCitizenId || '').trim();
      const relationshipType = String(associateChoice.dataset.relationshipType || '').trim();
      if (!targetCitizenId || !relationshipType) {
        return;
      }

      await setCitizenRelationship(targetCitizenId, relationshipType);
      return;
    }

    const removeAssociateButton = target.closest('[data-associate-action="remove-association"]');
    if (removeAssociateButton) {
      event.preventDefault();
      event.stopPropagation();
      const targetCitizenId = String(removeAssociateButton.dataset.targetCitizenId || '').trim();
      if (!targetCitizenId) {
        return;
      }

      await removeCitizenRelationship(targetCitizenId);
    }
  });
}

bindGlobalCitizenProfileActions();

const builtInAvatarAssets = [
  { url: './assets/avatars/aurelia-voss.svg', label: 'Aurelia Voss' },
  { url: './assets/avatars/jasper-reed.svg', label: 'Jasper Reed' },
  { url: './assets/avatars/mira-sloane.svg', label: 'Mira Sloane' },
  { url: './assets/avatars/dorian-kestrel.svg', label: 'Dorian Kestrel' },
  { url: './assets/avatars/leah-cortez.svg', label: 'Leah Cortez' },
  { url: './assets/avatars/omar-tate.svg', label: 'Omar Tate' },
];

const moneytreeContributorNameCache = new Map();

const profileState = {
  citizen: null,
  private: null,
  privateLoadError: null,
  isEditing: false,
  citizenLoadToken: 0,
};

const appCatalog = {
  social: {
    name: 'FakeBook',
    icon: './images/icons/socialmedia.PNG',
    color: '#8bc4ff',
    unread: 1,
  },
  associates: {
    name: 'Contacts',
    icon: '☎',
    color: '#7dc3ff',
    unread: 0,
  },
  messages: {
    name: 'Messages',
    icon: '✉',
    color: '#f0c36f',
    unread: 0,
  },
  moneytree: {
    name: 'MoneyTree',
    icon: './images/icons/moneytree.PNG',
    color: '#8ae5a5',
    unread: 2,
  },
  moderator: {
    name: 'Moderator',
    icon: '⚖',
    color: '#ffb86b',
    unread: 0,
  },
  mylife: {
    name: 'MyLife',
    icon: './images/icons/mylife.PNG',
    color: '#d6b765',
    unread: 0,
  },
  store: {
    name: 'Store',
    icon: './images/icons/store.PNG',
    color: '#ff9f7d',
    unread: 0,
  },
  lucky7: {
    name: 'LUCKY 7',
    icon: './assets/lucky 7/background/icon.jpg',
    color: '#ffdd57',
    unread: 0,
  },
  localnews: {
    name: 'Local News',
    icon: './images/icons/Localnews.PNG',
    color: '#c76dff',
    unread: 5,
  },
  voting: {
    name: 'Voting booth',
    icon: './images/icons/voting booth.PNG',
    color: '#7db4ff',
    unread: 0,
  },
  history: {
    name: 'History book',
    icon: './images/icons/historybook.PNG',
    color: '#a7a4c7',
    unread: 0,
  },
  darkweb: {
    name: 'Dark Web',
    icon: './images/icons/dark web.PNG',
    color: '#6bcab7',
    unread: 1,
    locked: true,
  },
};

const notifications = [
  {
    id: 1,
    title: 'Campaign Victory',
    detail: 'Your neighborhood charter expanded by 12%.',
    time: '2 min ago',
    unread: true,
  },
  {
    id: 2,
    title: 'Finance Alert',
    detail: 'Transfer from the treasury cleared successfully.',
    time: '19 min ago',
    unread: true,
  },
  {
    id: 3,
    title: 'City Watch',
    detail: 'Your influence map was updated overnight.',
    time: '1 hour ago',
    unread: false,
  },
  {
    id: 4,
    title: 'Access Notice',
    detail: 'Dark Web access key required before you can proceed.',
    time: '3 hours ago',
    unread: false,
  },
];

const socialState = {
  activeTab: 'associates',
  followSet: new Set(),
  posts: [],
  loading: false,
  error: null,
  feedRequestToken: 0,
  composerDraft: '',
  composerBusy: false,
  composerError: null,
  composerSuccess: null,
  pendingLikePostIds: new Set(),
  pendingFollowAuthorIds: new Set(),
  followErrorByAuthor: {},
  profileMessageBusyByCitizen: {},
  selectedCommentPostId: null,
  commentsPanelOpen: false,
  commentsPanelLoading: false,
  commentsPanelError: null,
  commentsLoadingMore: false,
  commentsPageByPost: {},
  commentsHasMoreByPost: {},
  commentsByPost: {},
  commentsRequestToken: 0,
  commentDraftByPost: {},
  commentComposerBusyByPost: {},
  commentComposerErrorByPost: {},
  commentComposerSuccessByPost: {},
  commentSubmitRequestToken: 0,
  commentEditOpenByComment: {},
  commentEditDraftByComment: {},
  commentEditBusyByComment: {},
  commentEditErrorByComment: {},
  commentEditRequestTokenByComment: {},
  commentDeleteBusyByComment: {},
  commentDeleteRequestTokenByComment: {},
  commentDeleteErrorByComment: {},
  postEditOpenByPost: {},
  postEditDraftByPost: {},
  postEditBusyByPost: {},
  postEditErrorByPost: {},
  postEditRequestTokenByPost: {},
  postDeleteBusyByPost: {},
  postDeleteErrorByPost: {},
  postDeleteRequestTokenByPost: {},
  openPostMenuId: null,
  deleteConfirmationPostId: null,
  profileView: {
    active: false,
    targetCitizenId: null,
    data: null,
    loading: false,
    error: null,
    requestToken: 0,
  },
  relationshipNotice: null,
  currentCitizenHandle: null,
  handleOnboarding: {
    open: false,
    checking: false,
    draft: '',
    busy: false,
    error: null,
    success: null,
  },
  chat: {
    open: false,
    loading: false,
    hasLoaded: false,
    messages: [],
    onlineCount: 0,
    error: null,
    composerDraft: '',
    sending: false,
    channel: null,
    reconnecting: false,
  },
};

const associatesState = {
  loading: false,
  requestToken: 0,
  error: null,
  friends: [],
  enemies: [],
  filter: 'all',
  currentPickerTargetId: null,
  currentPickerOpen: false,
  pendingTargetId: null,
};

function resetProfileRelationshipPickerState() {
  associatesState.currentPickerTargetId = null;
  associatesState.currentPickerOpen = false;
  if (socialState.profileView) {
    socialState.profileView.relationshipPickerTargetId = null;
    socialState.profileView.relationshipPickerOpen = false;
  }
}

const messagesState = {
  items: [],
  loading: false,
  error: null,
  requestToken: 0,
  activeThreadId: null,
  activePartnerCitizenId: null,
  activePartnerName: 'Citizen',
  activePartnerAvatar: './assets/avatars/aurelia-voss.svg',
  history: [],
  historyLoading: false,
  historyError: null,
  historyRequestToken: 0,
  composerDraft: '',
  sending: false,
  sendError: null,
  sendRequestToken: 0,
  readMarkRequestToken: 0,
  readMarkInFlight: false,
  readMarkThreadId: null,
  readMarkError: null,
};

function getUnifiedAssociates(filter = associatesState.filter) {
  const normalizedFilter = filter === 'friend' || filter === 'enemy' ? filter : 'all';
  return [...associatesState.friends, ...associatesState.enemies]
    .filter((associate) => normalizedFilter === 'all' || associate.relationshipType === normalizedFilter)
    .sort((left, right) => String(left.publicName).localeCompare(String(right.publicName)));
}

const appState = {};
const storeState = {
  categories: [],
  catalog: [],
  selectedCategory: 'all',
  searchTerm: '',
  loading: false,
  error: null,
  hasLoaded: false,
  selectedProductId: null,
  confirmationProductId: null,
  activeCheckoutProductId: null,
  isCheckoutBusy: false,
  checkoutError: null,
  lastReceipt: null,
  purchaseHistory: [],
  purchaseHistoryLoading: false,
  purchaseHistoryError: null,
  taxConfig: null,
  quote: null,
  purchaseRequestProductId: null,
  purchaseRequestKey: null,
};
const lucky7State = {
  selectedGame: 'slots',
  wager: 5,
  baccaratSelection: 'player',
  rouletteSelectedChip: 5,
  rouletteSelections: {
    color: null,
    parity: null,
    range: null,
  },
  previousRouletteSelections: {
    color: null,
    parity: null,
    range: null,
  },
  isBusy: false,
  slotsAnimating: false,
  slotsCelebrating: false,
  error: null,
  lastResult: null,
  history: [],
  stats: {
    total_bet: 0,
    total_win: 0,
    net_profit: 0,
  },
  historyLoading: false,
  historyError: null,
};

const votingState = {
  ownerAccess: false,
  ownerLoading: false,
  ownerError: null,
  ownerMessage: null,
  loading: false,
  error: null,
  polls: [],
  citizenPolls: [],
  closedPolls: [],
};
const localNewsState = {
  loading: false,
  error: null,
  articles: [],
  activeArticleId: null,
  detailOpen: false,
  activeCategory: 'Latest',
};
const newsroomState = {
  loading: false,
  error: null,
  message: null,
  articles: [],
  editingId: null,
  draft: {
    headline: '',
    excerpt: '',
    featuredImageUrl: '',
    contentHtml: '',
    status: 'draft',
  },
  history: [],
  historyIndex: -1,
  uploadingImage: false,
};
const lucky7BetDenominations = [1, 2, 3, 4, 5, 10, 15, 20, 50];
let activeAppId = null;
let lockVisible = true;

const moderatorAppState = {
  visible: false,
  queue: [],
  loading: false,
  error: null,
  message: null,
  processingIds: [],
  requestToken: 0,
  ownerAccess: false,
  ownerLoading: false,
  ownerMessage: null,
  ownerError: null,
  ownerTargetCitizenId: '',
  ownerAmount: '',
  ownerReason: '',
  ownerSubmitting: false,
  ownerHistory: [],
  currentSubpage: 'queue',
};

const moderatorPollState = {
  loading: false,
  error: null,
  message: null,
  polls: [],
  editingPollId: null,
  draftEdits: {},
};

const appLayer = document.getElementById('app-layer');
const homeScreen = document.getElementById('home-screen');
const lockScreen = document.getElementById('lock-screen');
const authScreen = document.getElementById('auth-screen');
const appGrid = document.getElementById('appGrid');
const notificationCenter = document.getElementById('notificationCenter');
const notificationList = document.getElementById('notificationList');
const notificationBubble = document.getElementById('notificationBubble');
const floatingHome = document.getElementById('floatingHome');
const settingsMenu = document.getElementById('settingsMenu');
const authMessage = document.getElementById('authMessage');
const verifyScreen = document.getElementById('verify-screen');
const verifyEmailText = document.getElementById('verifyEmailText');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const recoverForm = document.getElementById('recoverForm');
const newPasswordForm = document.getElementById('newPasswordForm');
const citizenSetupScreen = document.getElementById('citizenSetupScreen');
const citizenSetupForm = document.getElementById('citizenSetupForm');
const citizenSetupMessage = document.getElementById('citizenSetupMessage');

const authViews = {
  login: loginForm,
  register: registerForm,
  recover: recoverForm,
  newPassword: newPasswordForm,
  verify: verifyScreen,
};

const authState = {
  currentView: 'login',
  pendingEmail: '',
  hasCitizen: false,
  initializing: true,
  ready: false,
};

function getSafeAuthDiagnostics() {
  const diagnostics = window.TYRANNY_AUTH_DIAGNOSTICS || {};
  return {
    projectUrl: diagnostics.projectUrl ?? window.TYRANNY_SUPABASE_CONFIG?.url ?? null,
    sessionExists: Boolean(diagnostics.sessionExists),
    userId: diagnostics.userId ?? null,
    persistedSessionKeys: Number(diagnostics.persistedSessionKeys ?? 0),
    initializedAt: diagnostics.initializedAt ?? null,
    lastUpdatedAt: diagnostics.lastUpdatedAt ?? null,
  };
}

const citizenNameSeeds = {
  first: ['Aurelia', 'Jasper', 'Mira', 'Dorian', 'Leah', 'Omar', 'Cassian', 'Iris', 'Rowan', 'Selene'],
  last: ['Voss', 'Reed', 'Sloane', 'Kestrel', 'Cortez', 'Tate', 'Morrow', 'Vale', 'Fen', 'Ash'],
};

function isRecoveryUrl() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const type = params.get('type') || hash.get('type');
  const code = params.get('code') || hash.get('code');
  return type === 'recovery' || Boolean(code);
}

function deriveAvatarText(name) {
  const parts = String(name || 'Aurelia Voss').trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  return initials || 'AV';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function sanitizeRichTextHtml(rawHtml) {
  const content = String(rawHtml ?? '');
  if (!content.trim()) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const body = doc.body;
  const allowedTags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'span']);
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const tagName = String(node.tagName || '').toLowerCase();

    if (!allowedTags.has(tagName)) {
      const wrapper = doc.createElement('span');
      while (node.firstChild) {
        wrapper.appendChild(node.firstChild);
      }

      if (node.parentNode) {
        node.parentNode.replaceChild(wrapper, node);
      }
      continue;
    }

    if (tagName === 'a') {
      const href = (node.getAttribute('href') || '').trim();
      const safeHref = /^https?:\/\//i.test(href)
        || /^mailto:/i.test(href)
        || /^tel:/i.test(href)
        || /^\//.test(href)
        || /^#/.test(href)
        || /^[A-Za-z0-9._%+\-/=]+$/.test(href);
      if (!safeHref) {
        node.replaceWith(...Array.from(node.childNodes));
        continue;
      }
      node.removeAttribute('style');
      node.removeAttribute('target');
      node.removeAttribute('rel');
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }

    if (tagName === 'img') {
      const src = (node.getAttribute('src') || '').trim();
      const safeSrc = /^https?:\/\//i.test(src)
        || /^\//.test(src)
        || /^data:image\//i.test(src)
        || /^[A-Za-z0-9._%+\-/=]+$/.test(src);
      if (!safeSrc) {
        node.remove();
        continue;
      }
      node.removeAttribute('style');
      node.removeAttribute('onerror');
      node.removeAttribute('onclick');
      node.removeAttribute('onload');
    }

    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attribute.name);
      }
    });
  }

  body.querySelectorAll('script, style, iframe, object, embed, svg, math, link').forEach((node) => node.remove());
  return body.innerHTML.trim();
}

function isStorageObjectReference(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return false;
  }

  return /^[A-Za-z0-9._%+\-/=]+$/.test(trimmed) && !trimmed.includes('javascript:');
}

function normalizeSignedStorageUrlResult(result) {
  if (!result) {
    return '';
  }

  if (typeof result === 'string') {
    return result.trim();
  }

  if (typeof result === 'object') {
    const nested = result.data && typeof result.data === 'object' ? result.data : result;
    const candidate = nested.signedUrl || nested.signed_url || nested.url || nested.signedURL || nested.publicUrl || nested.href || nested.value || nested.path || '';
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }

    if (Array.isArray(result)) {
      const firstUrl = result.find((entry) => typeof entry === 'string' && entry.trim());
      if (firstUrl) {
        return firstUrl.trim();
      }
    }
  }

  return '';
}

function hasRenderableImageUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return /^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed) || trimmed.startsWith('/');
}

async function resolveSignedStorageUrl(rawValue, supabase = getAuthClient()) {
  if (!rawValue) {
    return '';
  }

  const value = String(rawValue).trim();
  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith('/')) {
    return value;
  }

  if (!supabase || !isStorageObjectReference(value)) {
    return value;
  }

  try {
    const session = (await supabase.auth.getSession())?.data?.session;
    if (!session?.user) {
      return value;
    }

    const { data, error } = await supabase.rpc('get_signed_news_article_image_url', {
      p_image_path: value,
    });
    const signedUrl = normalizeSignedStorageUrlResult(data);
    if (error || !signedUrl) {
      return value;
    }

    return signedUrl;
  } catch (error) {
    console.warn('Signed Local News image resolution failed:', error);
    return value;
  }
}

function transformHtmlImageUrls(contentHtml, signedUrlsByPath) {
  if (!contentHtml || !signedUrlsByPath || typeof signedUrlsByPath !== 'object') {
    return contentHtml || '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentHtml, 'text/html');
  doc.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src');
    if (src && signedUrlsByPath[src]) {
      image.setAttribute('src', signedUrlsByPath[src]);
    }
  });

  return doc.body.innerHTML;
}

async function resolveLocalNewsContentForDisplay(contentHtml, supabase = getAuthClient()) {
  if (!contentHtml) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentHtml, 'text/html');
  const sources = Array.from(doc.querySelectorAll('img')).map((image) => image.getAttribute('src')).filter(Boolean);
  const uniquePaths = [...new Set(sources.filter((value) => isStorageObjectReference(value)))];

  if (!uniquePaths.length) {
    return sanitizeRichTextHtml(contentHtml);
  }

  const signedUrlsByPath = {};
  for (const path of uniquePaths) {
    signedUrlsByPath[path] = await resolveSignedStorageUrl(path, supabase);
  }

  const transformed = transformHtmlImageUrls(contentHtml, signedUrlsByPath);
  return sanitizeRichTextHtml(transformed);
}

async function resolveLocalNewsArticleForDisplay(article, supabase = getAuthClient()) {
  if (!article || typeof article !== 'object') {
    return article;
  }

  const nextArticle = { ...article };
  nextArticle.featured_image_url = await resolveSignedStorageUrl(article.featured_image_url, supabase);
  nextArticle.content_html = await resolveLocalNewsContentForDisplay(article.content_html, supabase);
  return nextArticle;
}

function formatNewsDate(value) {
  if (!value) {
    return 'Recently';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Recently';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDisplayProfession(value, fallback = 'Profile unavailable') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return fallback;
  }

  if (text.toLowerCase() === 'civilian') {
    return 'Unemployed';
  }

  return text;
}

function getCitizenAvatarUrl(citizen) {
  if (citizen?.avatar_url && builtInAvatarAssets.some((option) => option.url === citizen.avatar_url)) {
    return citizen.avatar_url;
  }

  return './assets/avatars/aurelia-voss.svg';
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 'Unavailable';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(number);
}

function getAvatarForCitizenName(name) {
  const match = builtInAvatarAssets.find((option) => option.label.toLowerCase() === String(name || '').trim().toLowerCase());
  if (match) {
    return match.url;
  }

  return './assets/avatars/aurelia-voss.svg';
}

function formatSocialTimestamp(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.round(hours / 24);
  return `${days}d`;
}

function normalizeHandleValue(value) {
  const rawHandle = String(value ?? '').trim();
  if (!rawHandle) {
    return null;
  }

  const withoutAt = rawHandle.replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(withoutAt)) {
    return null;
  }

  return `@${withoutAt.toLowerCase()}`;
}

function formatSocialHandle(value, fallback = '@citizen') {
  return normalizeHandleValue(value) || fallback;
}

function normalizeSocialPostRecord(record) {
  const author = record?.author || {};
  const authorId = author?.id ?? record?.author_citizen_id ?? record?.authorCitizenId ?? null;
  const authorName = author?.public_name ?? record?.author_name ?? record?.author ?? 'Citizen';
  const authorHandleValue = record?.author_handle ?? record?.handle ?? author?.handle ?? null;
  const authorAvatar = author?.avatar_url ?? record?.avatar_url ?? './assets/avatars/aurelia-voss.svg';
  const resolvedAvatar = builtInAvatarAssets.some((option) => option.url === authorAvatar)
    ? authorAvatar
    : './assets/avatars/aurelia-voss.svg';

  return {
    id: String(record?.id ?? `social-${Date.now()}`),
    authorCitizenId: authorId,
    author: String(authorName || 'Citizen'),
    handle: formatSocialHandle(authorHandleValue, '@citizen'),
    avatar: resolvedAvatar,
    content: String(record?.content ?? ''),
    createdAt: record?.created_at || new Date().toISOString(),
    likes: Number(record?.like_count ?? 0),
    comments: Number(record?.comment_count ?? 0),
    reposts: Number(record?.repost_count ?? 0),
    liked: Boolean(record?.liked_by_current_user),
    reposted: Boolean(record?.reposted_by_current_user),
    isCurrentUser: Boolean(record?.is_own_post),
    currentUserFollowingAuthor: Boolean(record?.current_user_following_author),
  };
}

function normalizeInboxConversation(record) {
  const partnerName = String(record?.other_public_name || 'Citizen').trim() || 'Citizen';
  const preview = String(record?.latest_message_preview || '').trim() || 'No messages yet.';
  const unreadCount = Number(record?.unread_count ?? 0);
  const partnerAvatar = typeof record?.other_avatar_url === 'string' && record.other_avatar_url.trim()
    ? record.other_avatar_url.trim()
    : './assets/avatars/aurelia-voss.svg';
  const resolvedAvatar = builtInAvatarAssets.some((option) => option.url === partnerAvatar)
    ? partnerAvatar
    : './assets/avatars/aurelia-voss.svg';

  return {
    threadId: record?.thread_id ?? null,
    partnerCitizenId: record?.other_citizen_id ?? null,
    partnerName,
    avatar: resolvedAvatar,
    preview,
    time: record?.latest_message_time ? new Date(record.latest_message_time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) : 'No recent messages',
    unreadCount: Number.isFinite(unreadCount) ? Math.max(0, unreadCount) : 0,
  };
}

function openMessageThread(conversation) {
  if (!conversation?.threadId) {
    return;
  }

  messagesState.readMarkRequestToken += 1;
  messagesState.readMarkInFlight = false;
  messagesState.readMarkThreadId = null;
  messagesState.readMarkError = null;

  messagesState.activeThreadId = conversation.threadId;
  messagesState.activePartnerCitizenId = conversation.partnerCitizenId ?? null;
  messagesState.activePartnerName = conversation.partnerName || 'Citizen';
  messagesState.activePartnerAvatar = conversation.avatar || './assets/avatars/aurelia-voss.svg';
  messagesState.history = [];
  messagesState.historyError = null;
  messagesState.historyLoading = true;
  renderMessagesApp();
  loadMessageHistory(conversation.threadId);
}

async function markIncomingMessagesRead(threadId, partnerCitizenId) {
  if (!threadId || !partnerCitizenId) {
    return;
  }

  const currentCitizenId = String(profileState?.citizen?.id ?? '');
  if (!currentCitizenId) {
    return;
  }

  const unreadIncoming = (messagesState.history || []).filter((message) => {
    const senderCitizenId = String(message.senderCitizenId ?? '');
    const isIncomingFromPartner = senderCitizenId === String(partnerCitizenId);
    const isCurrentCitizenMessage = senderCitizenId === currentCitizenId;
    return isIncomingFromPartner && !isCurrentCitizenMessage && message.readAt == null;
  });

  if (!unreadIncoming.length) {
    return;
  }

  if (messagesState.readMarkInFlight && messagesState.readMarkThreadId === threadId) {
    return;
  }

  const requestToken = ++messagesState.readMarkRequestToken;
  messagesState.readMarkInFlight = true;
  messagesState.readMarkThreadId = threadId;
  messagesState.readMarkError = null;

  const supabase = getAuthClient();
  if (!supabase) {
    if (requestToken === messagesState.readMarkRequestToken) {
      messagesState.readMarkInFlight = false;
      messagesState.readMarkThreadId = null;
    }
    return;
  }

  try {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('sender_citizen_id', partnerCitizenId)
      .is('read_at', null);

    if (requestToken !== messagesState.readMarkRequestToken) {
      return;
    }

    if (error) {
      throw error;
    }

    await Promise.all([
      loadMessageHistory(threadId),
      loadMessagesInbox(),
    ]);
  } catch (error) {
    console.error('message read receipt update failed', error);
    if (requestToken !== messagesState.readMarkRequestToken) {
      return;
    }

    messagesState.readMarkError = error?.message || 'Unable to mark incoming messages as read.';
    renderMessagesApp();
  } finally {
    if (requestToken === messagesState.readMarkRequestToken) {
      messagesState.readMarkInFlight = false;
      messagesState.readMarkThreadId = null;
    }
  }
}

async function loadMessageHistory(threadId) {
  const requestToken = ++messagesState.historyRequestToken;
  const supabase = getAuthClient();

  if (!threadId) {
    messagesState.history = [];
    messagesState.historyError = 'Conversation is unavailable.';
    messagesState.historyLoading = false;
    renderMessagesApp();
    return [];
  }

  if (!supabase) {
    if (requestToken !== messagesState.historyRequestToken) {
      return [];
    }

    messagesState.history = [];
    messagesState.historyError = 'Sign in to view your messages.';
    messagesState.historyLoading = false;
    renderMessagesApp();
    return [];
  }

  let sessionData;
  let sessionError;
  try {
    const sessionResult = await supabase.auth.getSession();
    sessionData = sessionResult?.data;
    sessionError = sessionResult?.error;
  } catch (error) {
    if (requestToken !== messagesState.historyRequestToken) {
      return [];
    }

    messagesState.history = [];
    messagesState.historyError = error?.message || 'Unable to load your conversation right now.';
    messagesState.historyLoading = false;
    renderMessagesApp();
    return [];
  }

  if (requestToken !== messagesState.historyRequestToken) {
    return [];
  }

  if (sessionError || !sessionData?.session?.user) {
    messagesState.history = [];
    messagesState.historyError = 'Sign in to view your messages.';
    messagesState.historyLoading = false;
    renderMessagesApp();
    return [];
  }

  messagesState.historyLoading = true;
  messagesState.historyError = null;
  renderMessagesApp();

  try {
    const { data, error } = await supabase.rpc('get_message_history', {
      p_thread_id: threadId,
      p_limit: 50,
      p_offset: 0,
    });

    if (requestToken !== messagesState.historyRequestToken) {
      return [];
    }

    if (error) {
      throw error;
    }

    const normalizedHistory = Array.isArray(data)
      ? data.map((message) => ({
          id: message?.id ?? null,
          senderCitizenId: message?.sender_citizen_id ?? null,
          content: String(message?.content ?? '').trim(),
          createdAt: message?.created_at ?? null,
          readAt: message?.read_at ?? null,
        }))
      : [];

    messagesState.history = normalizedHistory;
    messagesState.historyError = null;
    messagesState.historyLoading = false;

    if (messagesState.activeThreadId === threadId && messagesState.activePartnerCitizenId) {
      markIncomingMessagesRead(threadId, messagesState.activePartnerCitizenId);
    }

    renderMessagesApp();
    return normalizedHistory;
  } catch (error) {
    console.error('message history load failed', error);
    if (requestToken !== messagesState.historyRequestToken) {
      return [];
    }

    messagesState.history = [];
    messagesState.historyError = error?.message || 'Unable to load that conversation right now.';
    messagesState.historyLoading = false;
    renderMessagesApp();
    return [];
  }
}

async function loadMessagesInbox() {
  const requestToken = ++messagesState.requestToken;

  const supabase = getAuthClient();
  if (!supabase) {
    if (requestToken !== messagesState.requestToken) {
      return [];
    }

    messagesState.error = 'Sign in to view your messages.';
    messagesState.loading = false;
    messagesState.items = [];
    renderMessagesApp();
    return [];
  }

  let sessionData;
  let sessionError;
  try {
    const sessionResult = await supabase.auth.getSession();
    sessionData = sessionResult?.data;
    sessionError = sessionResult?.error;
  } catch (error) {
    if (requestToken !== messagesState.requestToken) {
      return [];
    }

    messagesState.error = error?.message || 'Unable to load your inbox right now.';
    messagesState.loading = false;
    messagesState.items = [];
    renderMessagesApp();
    return [];
  }

  if (requestToken !== messagesState.requestToken) {
    return [];
  }

  if (sessionError || !sessionData?.session?.user) {
    messagesState.error = 'Sign in to view your messages.';
    messagesState.loading = false;
    messagesState.items = [];
    renderMessagesApp();
    return [];
  }

  messagesState.loading = true;
  messagesState.error = null;
  renderMessagesApp();

  try {
    const { data, error } = await supabase.rpc('get_message_inbox', {
      p_limit: 50,
      p_offset: 0,
    });

    if (requestToken !== messagesState.requestToken) {
      return [];
    }

    if (error) {
      throw error;
    }

    messagesState.items = Array.isArray(data) ? data.map((record) => normalizeInboxConversation(record)) : [];
    messagesState.error = null;
    messagesState.loading = false;
    renderMessagesApp();
    return messagesState.items;
  } catch (error) {
    console.error('message inbox load failed', error);
    if (requestToken !== messagesState.requestToken) {
      return [];
    }

    messagesState.items = [];
    messagesState.error = error?.message || 'Unable to load your inbox right now.';
    messagesState.loading = false;
    renderMessagesApp();
    return [];
  }
}

async function sendMessageInThread() {
  const requestToken = ++messagesState.sendRequestToken;
  const supabase = getAuthClient();

  if (!messagesState.activeThreadId) {
    messagesState.sendError = 'No conversation is selected.';
    renderMessagesApp();
    return;
  }

  if (!profileState?.citizen?.id) {
    messagesState.sendError = 'Your citizen record is unavailable.';
    renderMessagesApp();
    return;
  }

  if (messagesState.sending) {
    return;
  }

  const trimmedDraft = messagesState.composerDraft.replace(/\r\n/g, '\n').trim();
  if (!trimmedDraft) {
    messagesState.sendError = 'Message cannot be empty.';
    renderMessagesApp();
    return;
  }

  if (Array.from(messagesState.composerDraft).length > 2000) {
    messagesState.sendError = 'Message cannot exceed 2,000 characters.';
    renderMessagesApp();
    return;
  }

  if (!supabase) {
    messagesState.sendError = 'Supabase is unavailable.';
    renderMessagesApp();
    return;
  }

  let sessionData;
  let sessionError;
  try {
    const sessionResult = await supabase.auth.getSession();
    sessionData = sessionResult?.data;
    sessionError = sessionResult?.error;
  } catch (error) {
    messagesState.sendError = error?.message || 'Unable to verify your session.';
    renderMessagesApp();
    return;
  }

  if (sessionError || !sessionData?.session?.user) {
    messagesState.sendError = 'Please sign in again to continue.';
    renderMessagesApp();
    return;
  }

  const currentCitizenId = String(profileState.citizen.id);
  const senderCitizenId = String(profileState.citizen.id);
  if (!senderCitizenId || senderCitizenId !== currentCitizenId) {
    messagesState.sendError = 'Your citizen account is unavailable for sending.';
    renderMessagesApp();
    return;
  }

  messagesState.sending = true;
  messagesState.sendError = null;
  renderMessagesApp();

  try {
    const { error } = await supabase
      .from('messages')
      .insert({
        thread_id: messagesState.activeThreadId,
        sender_citizen_id: senderCitizenId,
        content: trimmedDraft,
      });

    if (requestToken !== messagesState.sendRequestToken) {
      return;
    }

    if (error) {
      throw error;
    }

    messagesState.composerDraft = '';
    messagesState.sendError = null;
    messagesState.sending = false;

    await loadMessageHistory(messagesState.activeThreadId);
    await loadMessagesInbox();
    renderMessagesApp();
    return;
  } catch (error) {
    console.error('message send failed', error);
    if (requestToken !== messagesState.sendRequestToken) {
      return;
    }

    messagesState.sendError = error?.message || 'Unable to send your message right now.';
    messagesState.sending = false;
    renderMessagesApp();
    return;
  }
}

function renderAssociatesApp() {
  const body = document.querySelector('#app-associates .app-body');
  if (!body) {
    return;
  }

  const friends = Array.isArray(associatesState.friends) ? associatesState.friends : [];
  const enemies = Array.isArray(associatesState.enemies) ? associatesState.enemies : [];

  const visibleAssociates = getUnifiedAssociates();
  const filterLabel = associatesState.filter === 'friend' ? 'friends' : associatesState.filter === 'enemy' ? 'enemies' : 'associates';
  const associateMarkup = visibleAssociates.length
      ? visibleAssociates.map((associate) => `
          <button type="button" class="associate-item" data-social-action="open-citizen-profile" data-citizen-id="${escapeHtml(String(associate.citizenId || ''))}">
            <div class="associate-avatar" style="background-image: url('${escapeHtml(associate.avatarUrl || './assets/avatars/aurelia-voss.svg')}')"></div>
            <div class="associate-copy">
              <strong>${escapeHtml(associate.publicName || 'Citizen')}</strong>
              <span>${escapeHtml(associate.handle || '@citizen')}</span>
              <small>${escapeHtml(associate.profession || 'Civilian')}</small>
            </div>
            <span class="associate-pill ${associate.relationshipType === 'enemy' ? 'enemy' : 'friend'}">${associate.relationshipType === 'enemy' ? 'Enemy' : 'Friend'}</span>
            <span class="associate-chevron" aria-hidden="true">›</span>
          </button>
        `).join('')
      : associatesState.loading
        ? '<div class="messages-empty-state"><strong>Loading contacts…</strong></div>'
        : `<div class="messages-empty-state"><strong>No ${escapeHtml(filterLabel)} yet.</strong><p>Mark citizens as friends or enemies from their profile.</p></div>`;

  body.innerHTML = `
    <div class="associates-shell">
      <header class="associates-header">
        <div class="associates-heading">
          <h3>Contacts</h3>
          <button type="button" class="associates-refresh" data-action="refresh-associates" aria-label="Refresh contacts" title="Refresh contacts">↻</button>
        </div>
        <p>Your associates</p>
      </header>
      ${associatesState.error ? `<div class="mylife-alert"><span>Contacts unavailable</span><p>${escapeHtml(associatesState.error)}</p></div>` : ''}
      <div class="associate-filter" role="group" aria-label="Filter associates">
        <button type="button" class="associate-filter-button ${associatesState.filter === 'all' ? 'active' : ''}" data-associate-filter="all" aria-pressed="${associatesState.filter === 'all'}">All <span>${String(friends.length + enemies.length)}</span></button>
        <button type="button" class="associate-filter-button ${associatesState.filter === 'friend' ? 'active' : ''}" data-associate-filter="friend" aria-pressed="${associatesState.filter === 'friend'}">Friends <span>${String(friends.length)}</span></button>
        <button type="button" class="associate-filter-button ${associatesState.filter === 'enemy' ? 'active' : ''}" data-associate-filter="enemy" aria-pressed="${associatesState.filter === 'enemy'}">Enemies <span>${String(enemies.length)}</span></button>
      </div>
      <div class="associates-list" aria-live="polite">${associateMarkup}</div>
    </div>
  `;

  const refreshButton = body.querySelector('[data-action="refresh-associates"]');
  refreshButton?.addEventListener('click', async () => {
    await loadAssociatesApp();
  });

  body.querySelectorAll('[data-associate-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextFilter = button.dataset.associateFilter;
      associatesState.filter = nextFilter === 'friend' || nextFilter === 'enemy' ? nextFilter : 'all';
      renderAssociatesApp();
    });
  });

  body.querySelectorAll('[data-social-action="open-citizen-profile"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetCitizenId = String(button.dataset.citizenId || '').trim();
      if (!targetCitizenId) {
        return;
      }

      openApp('social', 'normal');
      await loadSocialProfileView(targetCitizenId);
    });
  });
}

function renderMessagesApp() {
  const body = document.querySelector('#app-messages .app-body');
  if (!body) {
    return;
  }

  const currentCitizenId = profileState?.citizen?.id ?? null;

  if (messagesState.activeThreadId) {
    const partnerAvatar = builtInAvatarAssets.some((option) => option.url === messagesState.activePartnerAvatar)
      ? messagesState.activePartnerAvatar
      : './assets/avatars/aurelia-voss.svg';

    const historyMarkup = messagesState.historyLoading
      ? '<div class="mylife-alert"><span>Loading</span><p>Loading conversation…</p></div>'
      : messagesState.historyError
        ? `<div class="mylife-alert"><span>Conversation unavailable</span><p>${escapeHtml(messagesState.historyError)}</p></div>`
        : messagesState.history.length > 0
          ? messagesState.history.map((message) => {
              const isOutgoing = String(message.senderCitizenId ?? '') === String(currentCitizenId ?? '');
              const timestamp = message.createdAt ? new Date(message.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }) : 'Just now';
              return `
                <div class="message-row ${isOutgoing ? 'self' : 'other'}">
                  <div class="message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}">
                    <div class="message-text">${escapeHtml(message.content || '')}</div>
                    <div class="message-timestamp">${escapeHtml(timestamp)}</div>
                  </div>
                </div>
              `;
            }).join('')
          : '<div class="messages-empty-state"><strong>No messages yet.</strong><p>This thread is empty.</p></div>';

    const composerMarkup = `
      <div class="messages-composer">
        ${messagesState.sendError ? `<div class="mylife-alert"><span>Message failed</span><p>${escapeHtml(messagesState.sendError)}</p></div>` : ''}
        ${messagesState.readMarkError ? `<div class="mylife-alert"><span>Read status update failed</span><p>${escapeHtml(messagesState.readMarkError)}</p></div>` : ''}
        <textarea
          class="message-composer-input"
          rows="1"
          maxlength="2000"
          placeholder="Write a message…"
          data-message-composer
          aria-label="Write a message"
        >${escapeHtml(messagesState.composerDraft)}</textarea>
        <div class="messages-composer-row">
          <span class="message-composer-count" aria-label="Message character count">${Array.from(messagesState.composerDraft).length}/2000</span>
          <button type="button" class="primary-button message-send-button" data-action="send-message" aria-label="Send message" ${messagesState.sending ? 'disabled' : ''}>
            ${messagesState.sending ? '…' : '↑'}
          </button>
        </div>
      </div>
    `;

    const conversationMarkup = `
      <div class="messages-card">
        <div class="messages-header-row">
          <button type="button" class="secondary-button message-back-button" data-action="back-to-inbox">‹ <span>Messages</span></button>
          <div class="messages-conversation-header">
            <div class="message-thread-avatar" style="background-image: url('${escapeHtml(partnerAvatar)}')"></div>
            <div>
              <h3>${escapeHtml(messagesState.activePartnerName)}</h3>
            </div>
          </div>
          <button type="button" class="secondary-button message-profile-button" data-action="open-partner-profile" data-partner-citizen-id="${escapeHtml(String(messagesState.activePartnerCitizenId ?? ''))}">Info</button>
        </div>
        <div class="messages-thread-list">
          ${historyMarkup}
        </div>
        ${composerMarkup}
      </div>
    `;

    body.innerHTML = conversationMarkup;

    const backButton = body.querySelector('[data-action="back-to-inbox"]');
    backButton?.addEventListener('click', () => {
      messagesState.readMarkRequestToken += 1;
      messagesState.readMarkInFlight = false;
      messagesState.readMarkThreadId = null;
      messagesState.readMarkError = null;

      messagesState.activeThreadId = null;
      messagesState.activePartnerCitizenId = null;
      messagesState.activePartnerName = 'Citizen';
      messagesState.activePartnerAvatar = './assets/avatars/aurelia-voss.svg';
      messagesState.history = [];
      messagesState.historyError = null;
      messagesState.historyLoading = false;
      messagesState.composerDraft = '';
      messagesState.sendError = null;
      messagesState.sending = false;
      renderMessagesApp();
      loadMessagesInbox();
    });

    const composer = body.querySelector('[data-message-composer]');
    composer?.addEventListener('input', (event) => {
      const nextValue = String(event.target.value || '');
      messagesState.composerDraft = nextValue;
      messagesState.sendError = null;

      const composerContainer = event.target.closest('.messages-composer');
      const counter = composerContainer?.querySelector('.message-composer-count');
      if (counter) {
        counter.textContent = `${Array.from(nextValue).length}/2000`;
      }
    });

    const profileButton = body.querySelector('[data-action="open-partner-profile"]');
    profileButton?.addEventListener('click', async () => {
      const targetCitizenId = String(profileButton.dataset.partnerCitizenId || '').trim();
      if (!targetCitizenId) {
        return;
      }

      openApp('social');
      await loadSocialProfileView(targetCitizenId);
    });

    const sendButton = body.querySelector('[data-action="send-message"]');
    sendButton?.addEventListener('click', () => {
      sendMessageInThread();
    });
    return;
  }

  const inboxMarkup = `
    <div class="messages-card">
      <div class="messages-header-row">
        <h3>Messages</h3>
        <button type="button" class="secondary-button message-refresh-button" data-action="refresh-messages">↻ <span>Refresh</span></button>
      </div>
      <div class="messages-list-caption">Private conversations with your associates</div>
      ${messagesState.loading ? '<div class="mylife-alert"><span>Loading</span><p>Checking your inbox…</p></div>' : ''}
      ${messagesState.error ? `<div class="mylife-alert"><span>Messages unavailable</span><p>${escapeHtml(messagesState.error)}</p></div>` : ''}
      <div class="messages-list">
        ${messagesState.items.length > 0 ? messagesState.items.map((conversation) => `
          <button type="button" class="message-thread-item message-thread-button" data-action="open-message-thread" data-thread-id="${escapeHtml(String(conversation.threadId ?? ''))}">
            <div class="message-thread-avatar" style="background-image: url('${escapeHtml(conversation.avatar)}')"></div>
            <div class="message-thread-copy">
              <div class="message-thread-meta">
                <strong>${escapeHtml(conversation.partnerName)}</strong>
                <span>${escapeHtml(conversation.time)}</span>
              </div>
              <div class="message-thread-preview-row">
                <p>${escapeHtml(conversation.preview.length > 96 ? `${conversation.preview.slice(0, 93)}…` : conversation.preview)}</p>
                ${conversation.unreadCount > 0 ? `<span class="message-unread-badge">${escapeHtml(String(conversation.unreadCount))}</span>` : ''}
              </div>
            </div>
          </button>
        `).join('') : ''}
      </div>
      ${!messagesState.loading && messagesState.items.length === 0 && !messagesState.error ? `
        <div class="messages-empty-state">
          <strong>Your inbox is empty.</strong>
          <p>No private conversations are active right now.</p>
        </div>
      ` : ''}
    </div>
  `;

  body.innerHTML = inboxMarkup;

  const refreshButton = body.querySelector('[data-action="refresh-messages"]');
  refreshButton?.addEventListener('click', () => {
    loadMessagesInbox();
  });

  const threadButtons = body.querySelectorAll('[data-action="open-message-thread"]');
  threadButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const threadId = button.getAttribute('data-thread-id');
      const conversation = messagesState.items.find((entry) => String(entry.threadId) === String(threadId));
      if (conversation) {
        openMessageThread(conversation);
      }
    });
  });
}

function syncFollowSetFromPosts() {
  socialState.followSet = new Set(
    socialState.posts
      .filter((post) => post.authorCitizenId && (post.currentUserFollowingAuthor || post.isCurrentUser))
      .map((post) => post.authorCitizenId)
  );
}

function setFollowStateForAuthor(authorCitizenId, isFollowing) {
  const normalizedAuthorId = String(authorCitizenId ?? '').trim();
  if (!normalizedAuthorId) {
    return;
  }

  if (isFollowing) {
    socialState.followSet.add(normalizedAuthorId);
  } else {
    socialState.followSet.delete(normalizedAuthorId);
  }

  socialState.posts.forEach((post) => {
    if (String(post.authorCitizenId || '') !== normalizedAuthorId) {
      return;
    }

    post.currentUserFollowingAuthor = Boolean(isFollowing);
  });
}

async function toggleFollowForAuthor(authorCitizenId) {
  const normalizedAuthorId = String(authorCitizenId ?? '').trim();
  if (!normalizedAuthorId || socialState.pendingFollowAuthorIds.has(normalizedAuthorId)) {
    return;
  }

  const supabase = getAuthClient();
  if (!supabase) {
    throw new Error('Social media is unavailable because Supabase is not available.');
  }

  const previousFollowState = socialState.followSet.has(normalizedAuthorId);
  const requestKey = normalizedAuthorId;
  socialState.pendingFollowAuthorIds.add(requestKey);
  delete socialState.followErrorByAuthor[requestKey];
  renderSocialApp();

  try {
    const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;

    if (!currentCitizenId) {
      throw new Error('Your citizen profile is not available yet.');
    }

    if (normalizedAuthorId === currentCitizenId) {
      throw new Error('You cannot follow your own citizen profile.');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session?.user) {
      throw new Error('You must be signed in to follow someone.');
    }

    const shouldFollow = !previousFollowState;

    if (shouldFollow) {
      const { error } = await supabase
        .from('social_follows')
        .insert([{ following_citizen_id: normalizedAuthorId }]);

      if (error) {
        if (error.code === '23505' || /duplicate|already following/i.test(error.message || '')) {
          setFollowStateForAuthor(normalizedAuthorId, true);
          if (socialState.profileView?.active && socialState.profileView.targetCitizenId === normalizedAuthorId && socialState.profileView.data) {
            socialState.profileView.data.current_user_following = true;
          }
          return;
        }

        throw error;
      }

      setFollowStateForAuthor(normalizedAuthorId, true);
      if (socialState.profileView?.active && socialState.profileView.targetCitizenId === normalizedAuthorId && socialState.profileView.data) {
        socialState.profileView.data.current_user_following = true;
        socialState.profileView.data.follower_count = Math.max(0, Number(socialState.profileView.data.follower_count ?? 0) + 1);
      }
    } else {
      const { error } = await supabase
        .from('social_follows')
        .delete()
        .eq('following_citizen_id', normalizedAuthorId);

      if (error) {
        throw error;
      }

      setFollowStateForAuthor(normalizedAuthorId, false);
      if (socialState.profileView?.active && socialState.profileView.targetCitizenId === normalizedAuthorId && socialState.profileView.data) {
        socialState.profileView.data.current_user_following = false;
        socialState.profileView.data.follower_count = Math.max(0, Number(socialState.profileView.data.follower_count ?? 0) - 1);
      }
    }
  } catch (error) {
    setFollowStateForAuthor(normalizedAuthorId, previousFollowState);
    const readableError = error?.message || 'Unable to update this follow right now.';
    socialState.followErrorByAuthor[requestKey] = readableError;
    console.error('follow toggle failed', error);
    renderSocialApp();
    return;
  } finally {
    socialState.pendingFollowAuthorIds.delete(requestKey);
    renderSocialApp();
  }
}

function updateSocialPostLikeState(postId, liked, likes) {
  const normalizedPostId = String(postId);
  const targetPost = findActiveSocialPostById(normalizedPostId);
  if (!targetPost) {
    return;
  }

  targetPost.liked = Boolean(liked);
  targetPost.likes = Math.max(0, Number(likes) || 0);

  document.querySelectorAll('.social-post').forEach((article) => {
    if (String(article.dataset.postId) !== normalizedPostId) {
      return;
    }

    const likeButton = article.querySelector('[data-social-action="like"]');
    const likeMetric = article.querySelector('.social-post-metrics span');
    if (likeButton) {
      const isPending = socialState.pendingLikePostIds.has(normalizedPostId);
      likeButton.classList.toggle('active', targetPost.liked);
      likeButton.disabled = isPending;
      likeButton.setAttribute('aria-disabled', String(isPending));
      likeButton.setAttribute('aria-pressed', String(targetPost.liked));
      likeButton.title = isPending ? 'Updating like...' : (targetPost.liked ? 'Unlike this post' : 'Like this post');
      likeButton.textContent = `${targetPost.liked ? 'Liked' : 'Like'} · ${targetPost.likes}`;
    }

    if (likeMetric) {
      likeMetric.textContent = `${targetPost.likes} likes`;
    }
  });
}

function getVisibleSocialPosts() {
  return Array.isArray(socialState.posts) ? socialState.posts.slice() : [];
}

function getActiveSocialPosts() {
  if (socialState.profileView?.active && Array.isArray(socialState.profileView?.data?.posts)) {
    return socialState.profileView.data.posts;
  }

  return Array.isArray(socialState.posts) ? socialState.posts : [];
}

function findActiveSocialPostById(postId) {
  const normalizedPostId = String(postId ?? '').trim();
  if (!normalizedPostId) {
    return null;
  }

  return getActiveSocialPosts().find((post) => String(post.id) === normalizedPostId) || null;
}

function openSocialProfileView(targetCitizenId) {
  const normalizedCitizenId = String(targetCitizenId ?? '').trim();
  if (!normalizedCitizenId) {
    return;
  }

  resetProfileRelationshipPickerState();

  const nextRequestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: true,
    targetCitizenId: normalizedCitizenId,
    data: null,
    loading: true,
    error: null,
    requestToken: nextRequestToken,
    relationshipPickerTargetId: null,
    relationshipPickerOpen: false,
  };

  renderSocialApp();
}

function closeSocialProfileView() {
  resetProfileRelationshipPickerState();

  const nextRequestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: false,
    targetCitizenId: null,
    data: null,
    loading: false,
    error: null,
    requestToken: nextRequestToken,
    relationshipPickerTargetId: null,
    relationshipPickerOpen: false,
  };

  renderSocialApp();
}

async function loadSocialProfileView(targetCitizenId) {
  if (authState.initializing || !authState.ready) {
    return;
  }

  const normalizedCitizenId = String(targetCitizenId ?? '').trim();
  if (!normalizedCitizenId) {
    return;
  }

  socialState.relationshipNotice = null;

  resetProfileRelationshipPickerState();

  const requestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: true,
    targetCitizenId: normalizedCitizenId,
    data: null,
    loading: true,
    error: null,
    requestToken,
    relationshipPickerTargetId: null,
    relationshipPickerOpen: false,
  };

  renderSocialApp();

  const supabase = getAuthClient();
  if (!supabase) {
    if (requestToken !== Number(socialState.profileView?.requestToken || 0)) {
      return;
    }

    socialState.profileView = {
      ...socialState.profileView,
      loading: false,
      error: 'Social media is unavailable because Supabase is not available.',
    };
    renderSocialApp();
    return;
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session?.user) {
      throw new Error('You must be signed in to view this citizen profile.');
    }

    const { data, error } = await supabase.rpc('get_citizen_social_profile', {
      p_citizen_id: normalizedCitizenId,
    });

    if (requestToken !== Number(socialState.profileView?.requestToken || 0)) {
      return;
    }

    if (error) {
      throw error;
    }

    const profileRow = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    if (!profileRow) {
      socialState.profileView = {
        ...socialState.profileView,
        loading: false,
        error: 'This citizen profile could not be found.',
        data: null,
      };
      renderSocialApp();
      return;
    }

    const normalizedProfilePosts = Array.isArray(profileRow.posts)
      ? profileRow.posts.map((post) => normalizeSocialPostRecord(post))
      : [];

    const relationshipStatus = await loadProfileRelationshipStatus(normalizedCitizenId);

    socialState.profileView = {
      ...socialState.profileView,
      loading: false,
      error: null,
      data: {
        ...profileRow,
        relationship_type: relationshipStatus,
        posts: normalizedProfilePosts,
      },
    };
    renderSocialApp();
  } catch (error) {
    if (requestToken !== Number(socialState.profileView?.requestToken || 0)) {
      return;
    }

    console.error('load social profile failed', error);
    socialState.profileView = {
      ...socialState.profileView,
      loading: false,
      error: error?.message || 'Unable to load this citizen profile right now.',
      data: null,
    };
    renderSocialApp();
  }
}

function getSafeAvatarUrl(url, fallback = './assets/avatars/aurelia-voss.svg') {
  const candidate = String(url || '').trim();
  if (!candidate) {
    return fallback;
  }

  if (builtInAvatarAssets.some((option) => option.url === candidate)) {
    return candidate;
  }

  return fallback;
}

function normalizeAssociateListRecord(record) {
  const citizenId = String(record?.citizen_id ?? record?.id ?? '').trim();
  if (!citizenId) {
    return null;
  }

  return {
    citizenId,
    publicName: String(record?.public_name || 'Citizen').trim() || 'Citizen',
    handle: formatSocialHandle(record?.handle || record?.author_handle || '@citizen', '@citizen'),
    avatarUrl: getSafeAvatarUrl(record?.avatar_url || './assets/avatars/aurelia-voss.svg'),
    profession: String(record?.profession || 'Civilian').trim() || 'Civilian',
    socialClass: String(record?.social_class || 'Unknown').trim() || 'Unknown',
    relationshipType: String(record?.relationship_type || 'friend').trim().toLowerCase(),
  };
}

async function loadAssociatesApp() {
  const requestToken = ++associatesState.requestToken;
  const supabase = getAuthClient();
  if (!supabase) {
    associatesState.loading = false;
    associatesState.error = 'Associates is unavailable because Supabase is not available.';
    associatesState.friends = [];
    associatesState.enemies = [];
    renderAssociatesApp();
    return;
  }

  associatesState.loading = true;
  associatesState.error = null;

  try {
    const [friendsResult, enemiesResult] = await Promise.all([
      supabase.rpc('get_current_citizen_association_list', { p_relationship_type: 'friend' }),
      supabase.rpc('get_current_citizen_association_list', { p_relationship_type: 'enemy' }),
    ]);

    if (requestToken !== associatesState.requestToken) {
      return;
    }

    if (friendsResult.error) {
      throw friendsResult.error;
    }

    if (enemiesResult.error) {
      throw enemiesResult.error;
    }

    associatesState.friends = Array.isArray(friendsResult.data)
      ? friendsResult.data.map((row) => normalizeAssociateListRecord(row)).filter(Boolean)
      : [];

    associatesState.enemies = Array.isArray(enemiesResult.data)
      ? enemiesResult.data.map((row) => normalizeAssociateListRecord(row)).filter(Boolean)
      : [];
  } catch (error) {
    if (requestToken !== associatesState.requestToken) {
      return;
    }
    console.error('associates load failed', error);
    associatesState.error = error?.message || 'Unable to load associates right now.';
  } finally {
    if (requestToken === associatesState.requestToken) {
      associatesState.loading = false;
      renderAssociatesApp();
    }
  }
}

async function loadProfileRelationshipStatus(targetCitizenId) {
  const supabase = getAuthClient();
  const normalizedTarget = String(targetCitizenId || '').trim();
  if (!supabase || !normalizedTarget) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc('get_citizen_relationship_status', {
      p_target_citizen_id: normalizedTarget,
    });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const nextValue = String(row?.relationship_type || '').trim().toLowerCase();
    return nextValue === 'friend' || nextValue === 'enemy' ? nextValue : null;
  } catch (error) {
    console.warn('relationship status lookup failed', error);
    return null;
  }
}

async function setCitizenRelationship(targetCitizenId, relationshipType) {
  if (authState.initializing || !authState.ready) {
    setRelationshipNotice(authState.initializing
      ? 'Your signed-in session is still being prepared. Please try Associate again in a moment.'
      : 'Please sign in before changing an association.', 'error');
    return false;
  }

  const supabase = getAuthClient();
  const normalizedTarget = String(targetCitizenId || '').trim();
  const normalizedType = String(relationshipType || '').trim().toLowerCase();

  if (!supabase || !normalizedTarget || (normalizedType !== 'friend' && normalizedType !== 'enemy')) {
    setRelationshipNotice('That association request is not valid. Please reopen the citizen profile and try again.', 'error');
    return false;
  }

  if (profileState.citizen?.id && normalizedTarget === String(profileState.citizen.id)) {
    setRelationshipNotice('You cannot change your association with yourself.', 'error');
    return false;
  }

  try {
    const { error } = await supabase.rpc('set_citizen_relationship', {
      p_target_citizen_id: normalizedTarget,
      p_relationship_type: normalizedType,
    });

    if (error) {
      throw error;
    }

    if (socialState.profileView?.active && String(socialState.profileView.targetCitizenId || '') === normalizedTarget) {
      socialState.profileView.data = {
        ...(socialState.profileView.data || {}),
        relationship_type: normalizedType,
      };
      socialState.profileView.relationshipPickerTargetId = null;
      socialState.profileView.relationshipPickerOpen = false;
    }

    associatesState.currentPickerTargetId = null;
    associatesState.currentPickerOpen = false;
    setRelationshipNotice(`Association updated: ${normalizedType === 'friend' ? 'Friend' : 'Enemy'}.`, 'success');

    if (socialState.profileView?.active && String(socialState.profileView.targetCitizenId || '') === normalizedTarget) {
      renderSocialApp();
    }

    await loadAssociatesApp();
    renderAssociatesApp();

    return true;
  } catch (error) {
    console.error('set citizen relationship failed', error);
    setRelationshipNotice(`Could not update this association. ${error?.message || 'Please try again.'}`, 'error');
    return false;
  }
}

async function removeCitizenRelationship(targetCitizenId) {
  if (authState.initializing || !authState.ready) {
    setRelationshipNotice(authState.initializing
      ? 'Your signed-in session is still being prepared. Please try again in a moment.'
      : 'Please sign in before changing an association.', 'error');
    return false;
  }

  const supabase = getAuthClient();
  const normalizedTarget = String(targetCitizenId || '').trim();
  if (!supabase || !normalizedTarget) {
    setRelationshipNotice('That association request is not valid. Please reopen the citizen profile and try again.', 'error');
    return false;
  }

  try {
    const { error } = await supabase.rpc('remove_citizen_relationship', {
      p_target_citizen_id: normalizedTarget,
    });

    if (error) {
      throw error;
    }

    if (socialState.profileView?.active && String(socialState.profileView.targetCitizenId || '') === normalizedTarget) {
      socialState.profileView.data = {
        ...(socialState.profileView.data || {}),
        relationship_type: null,
      };
      socialState.profileView.relationshipPickerTargetId = null;
      socialState.profileView.relationshipPickerOpen = false;
    }

    associatesState.currentPickerTargetId = null;
    associatesState.currentPickerOpen = false;
    setRelationshipNotice('Association removed.', 'success');

    if (socialState.profileView?.active && String(socialState.profileView.targetCitizenId || '') === normalizedTarget) {
      renderSocialApp();
    }

    await loadAssociatesApp();
    renderAssociatesApp();

    return true;
  } catch (error) {
    console.error('remove citizen relationship failed', error);
    setRelationshipNotice(`Could not remove this association. ${error?.message || 'Please try again.'}`, 'error');
    return false;
  }
}

function setRelationshipNotice(message, type = 'error') {
  socialState.relationshipNotice = { message: String(message || ''), type };
  if (socialState.profileView?.active) {
    renderSocialApp();
  }
}

function toggleProfileAssociationPicker(targetCitizenId) {
  const normalizedTarget = String(targetCitizenId || '').trim();
  if (!normalizedTarget) {
    setRelationshipNotice('This citizen profile is missing the information needed to update an association.', 'error');
    return false;
  }

  const shouldOpen = !(associatesState.currentPickerTargetId === normalizedTarget && associatesState.currentPickerOpen);
  const targetIdForPicker = shouldOpen ? normalizedTarget : null;

  associatesState.currentPickerTargetId = targetIdForPicker;
  associatesState.currentPickerOpen = shouldOpen;

  if (socialState.profileView && String(socialState.profileView.targetCitizenId || '') === normalizedTarget) {
    socialState.profileView.relationshipPickerTargetId = targetIdForPicker;
    socialState.profileView.relationshipPickerOpen = shouldOpen;
  }

  renderSocialApp();
  return shouldOpen;
}

async function loadCommentsForPost(postId, appendOnly = false) {
  const supabase = getAuthClient();
  const normalizedPostId = String(postId || '').trim();

  if (!supabase || !normalizedPostId) {
    socialState.commentsPanelError = 'Comments are unavailable because Supabase is not available.';
    socialState.commentsPanelLoading = false;
    socialState.commentsLoadingMore = false;
    renderSocialApp();
    return;
  }

  if (appendOnly) {
    if (socialState.commentsLoadingMore || !socialState.commentsHasMoreByPost[normalizedPostId]) {
      return;
    }
    socialState.commentsLoadingMore = true;
    socialState.commentsPanelError = null;
  } else {
    socialState.commentsPanelLoading = true;
    socialState.commentsLoadingMore = false;
    socialState.commentsPanelError = null;
    socialState.commentsHasMoreByPost[normalizedPostId] = false;
  }

  const requestId = ++socialState.commentsRequestToken;
  const offset = appendOnly
    ? Number(socialState.commentsPageByPost[normalizedPostId] || 0)
    : 0;

  renderSocialApp();

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session?.user) {
      throw new Error('User is not authenticated.');
    }

    const { data, error } = await supabase.rpc('get_post_comments', {
      p_post_id: normalizedPostId,
      p_limit: 25,
      p_offset: offset,
    });

    if (requestId !== socialState.commentsRequestToken) {
      return;
    }

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const seenIds = new Set((socialState.commentsByPost[normalizedPostId] || []).map((comment) => String(comment.id)));

    const mergedRows = appendOnly
      ? rows.filter((comment) => !seenIds.has(String(comment.id)))
      : rows;

    const nextList = appendOnly
      ? [...(socialState.commentsByPost[normalizedPostId] || []), ...mergedRows]
      : mergedRows;

    socialState.commentsByPost[normalizedPostId] = nextList;
    socialState.commentsPageByPost[normalizedPostId] = offset + rows.length;
    socialState.commentsHasMoreByPost[normalizedPostId] = rows.length === 25;
    socialState.commentsPanelError = null;
  } catch (error) {
    if (requestId !== socialState.commentsRequestToken) {
      return;
    }

    console.error('comment load failed', error);
    socialState.commentsPanelError = error?.message || 'Unable to load comments right now.';
    if (!appendOnly) {
      socialState.commentsByPost[normalizedPostId] = [];
    }
  } finally {
    if (requestId !== socialState.commentsRequestToken) {
      return;
    }

    socialState.commentsPanelLoading = false;
    socialState.commentsLoadingMore = false;
    renderSocialApp();
  }
}

async function loadSocialFeed(tabName = socialState.activeTab) {
  const supabase = getAuthClient();
  const rpcMap = {
    latest: 'get_latest_feed',
    associates: 'get_latest_feed',
    following: 'get_latest_feed',
    trending: 'get_trending_feed',
  };

  if (tabName === 'associates') {
    await loadAssociatesApp();
  }

  const requestId = ++socialState.feedRequestToken;
  const rpcName = rpcMap[tabName] || rpcMap.associates;

  if (!supabase) {
    socialState.loading = false;
    socialState.error = 'Social feed is unavailable because Supabase is not available.';
    socialState.posts = [];
    renderSocialApp();
    return;
  }

  socialState.loading = true;
  socialState.error = null;
  renderSocialApp();

  try {
    const { data, error } = await supabase.rpc(rpcName, { p_limit: 50, p_offset: 0 });
    if (requestId !== socialState.feedRequestToken) {
      return;
    }

    if (error) {
      throw error;
    }

    const feedRows = Array.isArray(data) ? data : [];
    if (tabName === 'associates') {
      const associateSet = new Set([
        ...associatesState.friends.map((person) => String(person.citizenId || '').trim()),
        ...associatesState.enemies.map((person) => String(person.citizenId || '').trim()),
      ].filter(Boolean));
      socialState.posts = feedRows
        .map((record) => normalizeSocialPostRecord(record))
        .filter((post) => {
          const authorId = String(post.authorCitizenId || '').trim();
          return !authorId || associateSet.has(authorId);
        });
    } else {
      socialState.posts = feedRows.map((record) => normalizeSocialPostRecord(record));
    }
    syncFollowSetFromPosts();
    socialState.error = null;
  } catch (error) {
    if (requestId !== socialState.feedRequestToken) {
      return;
    }

    console.error('social feed load failed', error);
    socialState.posts = [];
    socialState.error = 'Unable to load the social feed right now.';
  } finally {
    if (requestId === socialState.feedRequestToken) {
      socialState.loading = false;
      renderSocialApp();
    }
  }
}

async function ensureCurrentCitizenHandleStatus() {
  const supabase = getAuthClient();
  if (!supabase) {
    return null;
  }

  socialState.handleOnboarding.checking = true;
  renderSocialApp();

  try {
    const { data, error } = await supabase.rpc('get_current_citizen_social_handle');
    if (error) {
      throw error;
    }

    const nextValue = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    const nextHandle = normalizeHandleValue(nextValue);
    socialState.currentCitizenHandle = nextHandle;
    socialState.handleOnboarding.open = !nextHandle;
    if (!nextHandle) {
      socialState.handleOnboarding.draft = '';
      socialState.handleOnboarding.error = null;
      socialState.handleOnboarding.success = null;
    }
    return nextHandle;
  } catch (error) {
    console.error('social handle status check failed', error);
    socialState.currentCitizenHandle = null;
    socialState.handleOnboarding.open = true;
    socialState.handleOnboarding.error = error?.message || 'Unable to confirm your handle right now.';
    return null;
  } finally {
    socialState.handleOnboarding.checking = false;
    renderSocialApp();
  }
}

async function registerCitizenHandleFromOnboarding() {
  const supabase = getAuthClient();
  const draftedHandle = String(socialState.handleOnboarding.draft || '').trim();
  const normalizedDraft = normalizeHandleValue(draftedHandle) || draftedHandle.replace(/^@+/, '').trim();

  if (!supabase) {
    socialState.handleOnboarding.error = 'Social media is unavailable because Supabase is not available.';
    renderSocialApp();
    return;
  }

  socialState.handleOnboarding.busy = true;
  socialState.handleOnboarding.error = null;
  socialState.handleOnboarding.success = null;
  renderSocialApp();

  try {
    const { data: availabilityData, error: availabilityError } = await supabase.rpc('check_citizen_social_handle', {
      p_handle: normalizedDraft,
    });

    if (availabilityError) {
      throw availabilityError;
    }

    const availability = Array.isArray(availabilityData) ? (availabilityData[0] ?? null) : (availabilityData ?? null);
    if (!availability?.is_available) {
      socialState.handleOnboarding.error = availability?.message || 'That handle is not available.';
      return;
    }

    const { data: registerData, error: registerError } = await supabase.rpc('register_citizen_social_handle', {
      p_handle: availability.normalized_handle || normalizedDraft,
    });

    if (registerError) {
      throw registerError;
    }

    const registration = Array.isArray(registerData) ? (registerData[0] ?? null) : (registerData ?? null);
    if (!registration?.success) {
      socialState.handleOnboarding.error = registration?.message || 'Unable to register your handle right now.';
      return;
    }

    socialState.currentCitizenHandle = normalizeHandleValue(registration.handle) || `@${String(registration.handle || normalizedDraft).replace(/^@+/, '').trim().toLowerCase()}`;
    socialState.handleOnboarding.open = false;
    socialState.handleOnboarding.success = 'Your handle is live.';
    socialState.handleOnboarding.draft = '';
    await loadSocialFeed(socialState.activeTab);
  } catch (error) {
    console.error('social handle registration failed', error);
    socialState.handleOnboarding.error = error?.message || 'Unable to register your handle right now.';
  } finally {
    socialState.handleOnboarding.busy = false;
    renderSocialApp();
  }
}

function invalidateCommentEditRequests() {
  Object.keys(socialState.commentEditRequestTokenByComment).forEach((commentId) => {
    socialState.commentEditRequestTokenByComment[commentId] = Number(socialState.commentEditRequestTokenByComment[commentId] || 0) + 1;
  });
  socialState.commentEditBusyByComment = {};
  socialState.commentEditOpenByComment = {};
  socialState.commentEditDraftByComment = {};
  socialState.commentEditErrorByComment = {};
}

function invalidatePostEditRequest(postId) {
  if (!postId) {
    return;
  }

  const currentToken = Number(socialState.postEditRequestTokenByPost[postId] || 0);
  socialState.postEditRequestTokenByPost[postId] = currentToken + 1;
  socialState.postEditOpenByPost[postId] = false;
  delete socialState.postEditDraftByPost[postId];
  delete socialState.postEditErrorByPost[postId];
  if (socialState.postEditBusyByPost[postId]) {
    socialState.postEditBusyByPost[postId] = false;
  }
}

function closePostActionMenu() {
  socialState.openPostMenuId = null;
}

function closeDeleteConfirmation() {
  socialState.deleteConfirmationPostId = null;
}

async function runDeletePostRequest(postId) {
  if (!postId || socialState.postDeleteBusyByPost[postId]) {
    return;
  }

  const post = findActiveSocialPostById(postId);
  if (!post) {
    return;
  }

  const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
  const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
  if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
    return;
  }

  const supabase = getAuthClient();
  if (!supabase) {
    socialState.postDeleteErrorByPost[postId] = 'Social media is unavailable because Supabase is not available.';
    renderSocialApp();
    return;
  }

  const requestId = Number(socialState.postDeleteRequestTokenByPost[postId] || 0) + 1;
  socialState.postDeleteRequestTokenByPost[postId] = requestId;
  socialState.postDeleteBusyByPost[postId] = true;
  delete socialState.postDeleteErrorByPost[postId];
  renderSocialApp();

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session?.user) {
      throw new Error('User is not authenticated.');
    }

    if (requestId !== Number(socialState.postDeleteRequestTokenByPost[postId] || 0)) {
      return;
    }

    const activePost = findActiveSocialPostById(postId);
    const currentCitizenStillMatches = activePost && profileState.citizen?.id ? String(profileState.citizen.id) === String(activePost.authorCitizenId || '') : false;
    if (!activePost || !currentCitizenStillMatches) {
      invalidatePostEditRequest(postId);
      return;
    }

    const { error } = await supabase.rpc('delete_social_post', {
      p_post_id: postId,
    });

    if (error) {
      throw error;
    }

    if (requestId !== Number(socialState.postDeleteRequestTokenByPost[postId] || 0)) {
      return;
    }

    invalidatePostEditRequest(postId);

    const activeCollection = getActiveSocialPosts();
    const activeIndex = activeCollection.findIndex((entry) => String(entry.id) === postId);
    if (activeIndex >= 0 && socialState.profileView?.active) {
      activeCollection.splice(activeIndex, 1);
    } else if (activeIndex >= 0) {
      activeCollection.splice(activeIndex, 1);
    }

    if (!socialState.profileView?.active) {
      await loadSocialFeed(socialState.activeTab);
    }
  } catch (error) {
    if (requestId !== Number(socialState.postDeleteRequestTokenByPost[postId] || 0)) {
      return;
    }

    console.error('delete social post failed', error);
    socialState.postDeleteErrorByPost[postId] = error?.message || 'Unable to delete the post right now.';
    renderSocialApp();
  } finally {
    if (requestId === Number(socialState.postDeleteRequestTokenByPost[postId] || 0)) {
      socialState.postDeleteBusyByPost[postId] = false;
      renderSocialApp();
    }
  }
}

function invalidateCommentDeleteRequests() {
  Object.keys(socialState.commentDeleteRequestTokenByComment).forEach((commentId) => {
    socialState.commentDeleteRequestTokenByComment[commentId] = Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0) + 1;
  });
  socialState.commentDeleteBusyByComment = {};
  socialState.commentDeleteErrorByComment = {};
}

function bindSocialFollowButtons(body) {
  if (!body) {
    return;
  }

  body.querySelectorAll('[data-follow-author-id]').forEach((button) => {
    if (button.dataset.followBindingAttached === 'true') {
      return;
    }

    button.dataset.followBindingAttached = 'true';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      const authorCitizenId = String(button.dataset.followAuthorId || '').trim();
      if (!authorCitizenId || button.disabled) {
        return;
      }

      try {
        await toggleFollowForAuthor(authorCitizenId);
      } catch (error) {
        console.error('follow toggle failed', error);
      }
    });
  });
}

async function startProfileMessageAction(targetCitizenId, profileName, profileAvatarUrl) {
  const normalizedTargetCitizenId = String(targetCitizenId ?? '').trim();
  if (!normalizedTargetCitizenId) {
    return;
  }

  const currentCitizenId = profileState?.citizen?.id ? String(profileState.citizen.id) : null;
  if (!currentCitizenId || normalizedTargetCitizenId === currentCitizenId) {
    return;
  }

  if (socialState.profileMessageBusyByCitizen[normalizedTargetCitizenId]) {
    return;
  }

  socialState.profileMessageBusyByCitizen[normalizedTargetCitizenId] = true;
  renderSocialApp();

  const supabase = getAuthClient();
  if (!supabase) {
    delete socialState.profileMessageBusyByCitizen[normalizedTargetCitizenId];
    renderSocialApp();
    return;
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session?.user) {
      throw new Error('You must be signed in to message this citizen.');
    }

    const activeCitizenId = profileState?.citizen?.id ? String(profileState.citizen.id) : null;
    if (!activeCitizenId || activeCitizenId !== currentCitizenId) {
      throw new Error('Your citizen profile is not available.');
    }

    const { data: threadMatches, error: threadLookupError } = await supabase
      .from('message_threads')
      .select('id, participant_a_citizen_id, participant_b_citizen_id')
      .or(`participant_a_citizen_id.eq.${activeCitizenId},participant_b_citizen_id.eq.${activeCitizenId}`);

    if (threadLookupError) {
      throw threadLookupError;
    }

    const existingThread = Array.isArray(threadMatches)
      ? threadMatches.find((thread) => {
          const participantA = String(thread?.participant_a_citizen_id ?? '');
          const participantB = String(thread?.participant_b_citizen_id ?? '');
          return (participantA === activeCitizenId && participantB === normalizedTargetCitizenId)
            || (participantA === normalizedTargetCitizenId && participantB === activeCitizenId);
        })
      : null;

    let threadId = existingThread?.id ?? null;
    if (!threadId) {
      const { data: createdThread, error: insertError } = await supabase
        .from('message_threads')
        .insert({
          participant_a_citizen_id: activeCitizenId,
          participant_b_citizen_id: normalizedTargetCitizenId,
        })
        .select('id')
        .single();

      if (insertError) {
        const messageText = String(insertError?.message || '');
        const isUniqueConflict = /duplicate|unique|23505|already exists/i.test(messageText);
        if (!isUniqueConflict) {
          throw insertError;
        }

        const { data: retryMatches, error: retryError } = await supabase
          .from('message_threads')
          .select('id, participant_a_citizen_id, participant_b_citizen_id')
          .or(`participant_a_citizen_id.eq.${activeCitizenId},participant_b_citizen_id.eq.${activeCitizenId}`);

        if (retryError) {
          throw retryError;
        }

        const retryThread = Array.isArray(retryMatches)
          ? retryMatches.find((thread) => {
              const participantA = String(thread?.participant_a_citizen_id ?? '');
              const participantB = String(thread?.participant_b_citizen_id ?? '');
              return (participantA === activeCitizenId && participantB === normalizedTargetCitizenId)
                || (participantA === normalizedTargetCitizenId && participantB === activeCitizenId);
            })
          : null;

        if (!retryThread) {
          throw new Error('Conversation could not be created.');
        }

        threadId = retryThread.id;
      } else {
        threadId = createdThread?.id ?? null;
      }
    }

    if (!threadId) {
      throw new Error('Conversation is unavailable.');
    }

    openApp('messages');
    openMessageThread({
      threadId,
      partnerCitizenId: normalizedTargetCitizenId,
      partnerName: String(profileName || '@citizen').trim() || '@citizen',
      avatar: getSafeAvatarUrl(profileAvatarUrl || './assets/avatars/aurelia-voss.svg'),
    });
  } catch (error) {
    console.error('profile message action failed', error);
  } finally {
    delete socialState.profileMessageBusyByCitizen[normalizedTargetCitizenId];
    renderSocialApp();
  }
}

function normalizeSocialChatMessage(record) {
  const id = String(record?.id ?? '');
  const citizenId = record?.citizen_id ? String(record.citizen_id) : '';
  const messageText = String(record?.message ?? '').trim();
  if (!id || !citizenId || !messageText) {
    return null;
  }

  const handleValue = record?.author_handle ?? record?.handle ?? null;
  const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
  const currentCitizenHandle = currentCitizenId && citizenId === currentCitizenId ? socialState.currentCitizenHandle : null;

  return {
    id,
    citizenId,
    handle: formatSocialHandle(handleValue || currentCitizenHandle || '@citizen', '@citizen'),
    body: messageText,
    createdAt: record?.created_at || new Date().toISOString(),
  };
}

async function loadSocialChatMessages() {
  const supabase = getAuthClient();
  if (!supabase) {
    socialState.chat.loading = false;
    socialState.chat.error = 'Supabase is unavailable.';
    socialState.chat.hasLoaded = true;
    renderSocialApp();
    return;
  }

  socialState.chat.loading = true;
  socialState.chat.error = null;
  renderSocialApp();

  try {
    const { data, error } = await supabase.rpc('get_recent_social_chat_messages', { p_limit: 100 });
    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const parsedMessages = rows
      .map((row) => normalizeSocialChatMessage(row))
      .filter(Boolean);

    socialState.chat.messages = parsedMessages.slice(-100);
    socialState.chat.hasLoaded = true;
    socialState.chat.error = null;
  } catch (error) {
    console.error('social chat load failed', error);
    socialState.chat.error = error?.message || 'Unable to load the Social Chat room right now.';
    socialState.chat.messages = [];
  } finally {
    socialState.chat.loading = false;
    renderSocialApp();
  }
}

function cleanupSocialChatRealtime() {
  const supabase = getAuthClient();
  if (!supabase || !socialState.chat.channel) {
    return;
  }

  try {
    supabase.removeChannel(socialState.chat.channel);
  } catch (error) {
    console.warn('Social chat realtime cleanup failed:', error);
  }

  socialState.chat.channel = null;
}

function ensureSocialChatRealtime() {
  const supabase = getAuthClient();
  if (!supabase || socialState.chat.channel) {
    return;
  }

  const roomName = 'social_chat_public_room';
  const channel = supabase.channel(roomName, {
    config: {
      presence: { key: roomName },
    },
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState() || {};
    socialState.chat.onlineCount = Object.keys(state).length;
    renderSocialApp();
  });

  channel.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'social_chat_messages',
  }, (payload) => {
    const row = payload?.new || null;
    if (!row || row.deleted_at) {
      return;
    }

    const incomingMessage = normalizeSocialChatMessage(row);
    if (!incomingMessage) {
      return;
    }

    const nextMessages = socialState.chat.messages.filter((message) => message.id !== incomingMessage.id);
    nextMessages.push(incomingMessage);
    socialState.chat.messages = nextMessages.slice(-100);
    renderSocialApp();
  });

  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'social_chat_messages',
  }, (payload) => {
    const row = payload?.new || null;
    if (!row) {
      return;
    }

    if (row.deleted_at) {
      socialState.chat.messages = socialState.chat.messages.filter((message) => message.id !== String(row.id));
      renderSocialApp();
      return;
    }

    const updatedMessage = normalizeSocialChatMessage(row);
    if (!updatedMessage) {
      return;
    }

    const nextMessages = socialState.chat.messages.filter((message) => message.id !== updatedMessage.id);
    nextMessages.push(updatedMessage);
    socialState.chat.messages = nextMessages.slice(-100);
    renderSocialApp();
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      socialState.chat.reconnecting = false;
      socialState.chat.error = null;
      channel.track({ citizen_id: profileState.citizen?.id ?? null });
      renderSocialApp();
      return;
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      socialState.chat.reconnecting = true;
      socialState.chat.error = 'Realtime connection lost. Reconnecting…';
      renderSocialApp();
    }
  });

  socialState.chat.channel = channel;
}

async function submitSocialChatMessage() {
  const supabase = getAuthClient();
  if (!supabase) {
    socialState.chat.error = 'Supabase is unavailable.';
    renderSocialApp();
    return;
  }

  const trimmedMessage = String(socialState.chat.composerDraft || '').trim();
  if (!trimmedMessage) {
    socialState.chat.error = 'Write a message before sending.';
    renderSocialApp();
    return;
  }

  if (Array.from(trimmedMessage).length > 500) {
    socialState.chat.error = 'Chat messages must be 500 characters or fewer.';
    renderSocialApp();
    return;
  }

  socialState.chat.sending = true;
  socialState.chat.error = null;
  renderSocialApp();

  try {
    const { data, error } = await supabase.rpc('send_social_chat_message', {
      p_message: trimmedMessage,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const nextMessage = normalizeSocialChatMessage({
      id: result?.message_id || result?.id || null,
      citizen_id: result?.citizen_id || profileState.citizen?.id || null,
      author_handle: result?.author_handle || result?.handle || socialState.currentCitizenHandle || null,
      message: result?.message || trimmedMessage,
      created_at: result?.created_at || new Date().toISOString(),
    });

    if (nextMessage) {
      const dedupedMessages = socialState.chat.messages.filter((message) => message.id !== nextMessage.id);
      dedupedMessages.push(nextMessage);
      socialState.chat.messages = dedupedMessages.slice(-100);
    }

    socialState.chat.composerDraft = '';
    socialState.chat.error = null;
  } catch (error) {
    console.error('social chat send failed', error);
    socialState.chat.error = error?.message || 'Unable to send the message right now.';
  } finally {
    socialState.chat.sending = false;
    renderSocialApp();
  }
}

async function removeSocialChatMessage(messageId) {
  const supabase = getAuthClient();
  if (!supabase || !messageId) {
    return;
  }

  try {
    const { error } = await supabase.rpc('remove_social_chat_message', {
      p_message_id: messageId,
      p_reason: null,
    });

    if (error) {
      throw error;
    }

    socialState.chat.messages = socialState.chat.messages.filter((message) => message.id !== String(messageId));
  } catch (error) {
    console.error('social chat remove failed', error);
    socialState.chat.error = error?.message || 'Unable to remove this message right now.';
  } finally {
    renderSocialApp();
  }
}

function renderSocialApp() {
  const appWindow = ensureAppWindow('social');
  const body = appWindow.querySelector('.app-body');
  if (socialState.chat.open) {
    ensureSocialChatRealtime();
    if (!socialState.chat.hasLoaded && !socialState.chat.loading) {
      loadSocialChatMessages();
    }
  } else {
    cleanupSocialChatRealtime();
  }
  const profileView = socialState.profileView || {
    active: false,
    targetCitizenId: null,
    data: null,
    loading: false,
    error: null,
    requestToken: 0,
  };

  if (profileView.active) {
    const profileDisplayName = profileView.loading
      ? 'Loading citizen profile…'
      : profileView.error
        ? 'Citizen profile unavailable'
        : (profileView.data?.public_name || 'Citizen');
    const profileDisplayHandle = profileView.loading || profileView.error
      ? '@citizen'
      : formatSocialHandle(profileView.data?.handle || '@citizen', '@citizen');
    const profileAvatarUrl = getSafeAvatarUrl(profileView.data?.avatar_url || './assets/avatars/aurelia-voss.svg');
    const profilePosts = Array.isArray(profileView.data?.posts) ? profileView.data.posts : [];
    const registrationDate = profileView.data?.registration_date
      ? new Date(profileView.data.registration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recent';
    const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
    const profileTargetCitizenId = profileView.targetCitizenId ? String(profileView.targetCitizenId) : null;
    const isOwnProfile = Boolean(profileTargetCitizenId && currentCitizenId && profileTargetCitizenId === currentCitizenId);
    const profileMessageBusy = Boolean(profileTargetCitizenId && socialState.profileMessageBusyByCitizen[profileTargetCitizenId]);
    const profileRelationship = String(profileView.data?.relationship_type || '').trim().toLowerCase();
    const profileRelationshipLabel = profileRelationship === 'friend' ? 'Friend' : profileRelationship === 'enemy' ? 'Enemy' : 'Associate';
    const pickerTargetId = String(socialState.profileView?.relationshipPickerTargetId || associatesState.currentPickerTargetId || '').trim();
    const associateMenuOpen = Boolean(
      profileTargetCitizenId &&
      pickerTargetId === profileTargetCitizenId &&
      (Boolean(socialState.profileView?.relationshipPickerOpen) || associatesState.currentPickerOpen)
    );
    const relationshipNotice = socialState.relationshipNotice;
    const profileHeaderActions = !isOwnProfile && profileTargetCitizenId && !profileView.loading && !profileView.error ? `
      <div class="social-associate-wrap">
        <button
          type="button"
          class="secondary-button social-associate-toggle"
          data-associate-action="toggle-profile-association"
          data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}"
          aria-expanded="${associateMenuOpen ? 'true' : 'false'}"
        >${profileRelationshipLabel}</button>
        ${associateMenuOpen ? `
          <div class="social-associate-menu">
            <button type="button" class="social-associate-choice" data-associate-action="set-association" data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}" data-relationship-type="friend">Make Friend</button>
            <button type="button" class="social-associate-choice" data-associate-action="set-association" data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}" data-relationship-type="enemy">Make Enemy</button>
            ${profileRelationship ? `<button type="button" class="social-associate-choice danger" data-associate-action="remove-association" data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}">Remove relationship</button>` : ''}
          </div>
        ` : ''}
      </div>
      <button
        type="button"
        class="secondary-button"
        data-social-action="message-profile"
        data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}"
        title="Send a message to this citizen"
        ${profileMessageBusy ? 'disabled aria-disabled="true"' : ''}
      >${profileMessageBusy ? 'Opening…' : 'Message'}</button>
    ` : '';

    const profileStatusText = profileView.data?.current_user_following ? 'Following' : 'Citizen';
    const profileFriendBadge = '';
    const profileEmploymentStatus = String(
      profileView.data?.profession || profileState.private?.profession || profileView.data?.employment_status || 'Unavailable'
    ).trim() || 'Unavailable';
    const profileSocialClass = String(
      profileView.data?.social_class || profileState.private?.social_class || 'Unavailable'
    ).trim() || 'Unavailable';
    const profileEducation = String(
      profileView.data?.education || profileState.private?.education || 'Unavailable'
    ).trim() || 'Unavailable';
    const profileDetailRows = [
      { key: 'employment_status', label: 'Employment status', value: getDisplayProfession(profileEmploymentStatus, 'Unavailable'), icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5V6.7A2.7 2.7 0 0 1 9.7 4h4.6A2.7 2.7 0 0 1 17 6.7v1.8M4.5 18.5h15a1 1 0 0 0 1-1V9.8a1 1 0 0 0-1-1h-15a1 1 0 0 0-1 1v7.7a1 1 0 0 0 1 1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
      { key: 'social_class', label: 'Social class', value: profileSocialClass, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V8.8m7 9.7V5.5m7 13V11.2M3.5 18.5h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
      { key: 'education', label: 'Education', value: profileEducation, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2 12 5l8 4.2-8 4.2-8-4.2Zm-1 2.8 9 4.5 9-4.5M7 12v4.8c.9 1.7 3 2.9 5 2.9s4.1-1.2 5-2.9V12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    ];

    const profileBody = profileView.loading
      ? `
        <div class="mylife-alert">
          <span>Loading profile</span>
          <p>Retrieving the citizen profile…</p>
        </div>
      `
      : profileView.error
        ? `
          <div class="mylife-alert">
            <span>Profile unavailable</span>
            <p>${escapeHtml(profileView.error)}</p>
          </div>
        `
        : `
          <section class="profile-section">
            <div class="profile-section-header">
              <h3>Personal details</h3>
            </div>
            <div class="profile-detail-list">
              ${profileDetailRows.map((detail) => `
                <div class="profile-detail-item">
                  <span class="profile-detail-icon">${detail.icon}</span>
                  <strong>${escapeHtml(detail.label)}: ${escapeHtml(detail.value)}</strong>
                </div>
              `).join('')}
            </div>
          </section>

          ${profilePosts.length ? `
            <section class="profile-section">
              <div class="profile-section-header">
                <h3>Recent posts</h3>
              </div>
              <div class="social-feed profile-feed">
                ${profilePosts.map((post) => {
                  const author = post?.author || {};
                  const authorHandle = formatSocialHandle(post?.author_handle || author.handle || '@citizen', '@citizen');
                  const authorCitizenId = String(post?.author_citizen_id ?? author?.citizen_id ?? author?.id ?? '');
                  const authorAvatar = getSafeAvatarUrl(author.avatar_url || './assets/avatars/aurelia-voss.svg');
                  const postId = String(post?.id ?? '');
                  const content = String(post?.content ?? '');
                  const createdAt = post?.created_at ? formatSocialTimestamp(post.created_at) : 'Recent';
                  const likeCount = Number(post?.like_count ?? 0) || 0;
                  const commentCount = Number(post?.comment_count ?? 0) || 0;

                  return `
                    <article class="social-post profile-post" data-post-id="${escapeHtml(postId)}">
                      <div class="social-post-header">
                        <button
                          type="button"
                          class="social-post-author social-author-button"
                          data-social-action="open-citizen-profile"
                          data-citizen-id="${escapeHtml(authorCitizenId)}"
                          aria-label="Open ${escapeHtml(authorHandle)}'s profile"
                          style="background: none; border: none; color: inherit; text-align: left; padding: 0; cursor: pointer;"
                        >
                          <div class="social-post-avatar" style="background-image: url('${escapeHtml(authorAvatar)}')"></div>
                          <div>
                            <strong>${escapeHtml(authorHandle)}</strong>
                            <span>${escapeHtml(createdAt)}</span>
                          </div>
                        </button>
                      </div>
                      <p class="social-post-copy">${escapeHtml(content)}</p>
                      <div class="social-post-metrics">
                        <span>${likeCount} likes</span>
                        <span>${commentCount} comments</span>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            </section>
          ` : `
            <section class="profile-section">
              <div class="profile-section-header">
                <h3>Recent posts</h3>
              </div>
              <div class="mylife-alert">
                <span>No posts yet</span>
                <p>This citizen has not posted anything recent.</p>
              </div>
            </section>
          `}
        `;

    body.innerHTML = `
      <div class="shared-profile-shell">
        <div class="profile-hero-panel">
          <div class="profile-cover profile-cover-public">
            <div class="profile-cover-actions">
              <button type="button" class="profile-mini-button" aria-label="More citizen actions">⋯</button>
            </div>
          </div>

          <div class="profile-avatar-wrap">
            <div class="profile-avatar-ring">
              <div class="profile-avatar-photo" style="background-image: url('${escapeHtml(profileAvatarUrl)}')"></div>
            </div>
          </div>

          <div class="profile-main-header">
            <div class="profile-header-row">
              <div class="profile-identity">
                <div class="profile-name-row">
                  <h2>${escapeHtml(profileDisplayName)}</h2>
                  <span class="profile-verified-badge" title="${escapeHtml(profileStatusText)}">${profileView.data?.current_user_following ? '✓' : '◉'}</span>
                </div>
                <div class="profile-role">${escapeHtml(getDisplayProfession(profileView.data?.profession, 'Citizen'))}</div>
              </div>
              <button type="button" class="profile-close-button" data-social-action="close-profile-view">Back</button>
            </div>

            ${profileFriendBadge}
          </div>

          <div class="profile-action-row">
            ${profileHeaderActions}
          </div>

          ${relationshipNotice?.message ? `
            <div class="mylife-alert ${relationshipNotice.type === 'success' ? 'success' : ''}" role="status">
              <p>${escapeHtml(relationshipNotice.message)}</p>
            </div>
          ` : ''}

        </div>

        ${profileBody}
      </div>
    `;
    bindSocialFollowButtons(body);
    return;
  }

  const currentUserHandle = socialState.currentCitizenHandle || formatSocialHandle(profileState.citizen?.handle || '@citizen', '@citizen');
  const rawCurrentUserAvatar = getCitizenAvatarUrl(profileState.citizen || null);
  const currentUserAvatar = rawCurrentUserAvatar && builtInAvatarAssets.some((option) => option.url === rawCurrentUserAvatar)
    ? rawCurrentUserAvatar
    : './assets/avatars/aurelia-voss.svg';
  const visiblePosts = getVisibleSocialPosts();
  const commentsPanelOpen = Boolean(socialState.commentsPanelOpen && socialState.selectedCommentPostId);
  const selectedCommentPost = commentsPanelOpen
    ? visiblePosts.find((post) => String(post.id) === String(socialState.selectedCommentPostId)) || null
    : null;
  const selectedCommentId = commentsPanelOpen && socialState.selectedCommentPostId
    ? String(socialState.selectedCommentPostId)
    : null;
  const selectedCommentList = selectedCommentId
    ? socialState.commentsByPost[selectedCommentId] || []
    : [];
  const selectedCommentDraft = selectedCommentId ? (socialState.commentDraftByPost[selectedCommentId] ?? '') : '';
  const selectedCommentComposerBusy = selectedCommentId ? Boolean(socialState.commentComposerBusyByPost[selectedCommentId]) : false;
  const selectedCommentComposerError = selectedCommentId ? socialState.commentComposerErrorByPost[selectedCommentId] || null : null;
  const selectedCommentComposerSuccess = selectedCommentId ? socialState.commentComposerSuccessByPost[selectedCommentId] || null : null;
  const selectedCommentDraftLength = Array.from(String(selectedCommentDraft || '')).length;
  const selectedCommentTrimmedLength = Array.from(String(selectedCommentDraft || '').replace(/^\s+|\s+$/g, '')).length;

  const handleOnboardingMarkup = socialState.handleOnboarding.open || !socialState.currentCitizenHandle ? `
    <div class="mylife-alert">
      <span>Choose your handle</span>
      <p>Set a permanent @handle before you can post in FakeBook.</p>
      <div class="social-handle-onboarding">
        <input
          type="text"
          value="${escapeHtml(socialState.handleOnboarding.draft || '')}"
          placeholder="@yourhandle"
          maxlength="20"
          data-social-handle-input
          ${socialState.handleOnboarding.busy ? 'disabled aria-disabled="true"' : ''}
        />
        <button
          type="button"
          class="secondary-button"
          data-social-action="register-handle"
          ${socialState.handleOnboarding.busy ? 'disabled aria-disabled="true"' : ''}
        >${socialState.handleOnboarding.busy ? 'Saving…' : 'Set handle'}</button>
      </div>
      ${socialState.handleOnboarding.error ? `<p class="social-composer-message social-composer-error">${escapeHtml(socialState.handleOnboarding.error)}</p>` : ''}
      ${socialState.handleOnboarding.success ? `<p class="social-composer-message social-composer-success">${escapeHtml(socialState.handleOnboarding.success)}</p>` : ''}
    </div>
  ` : '';

  let feedMarkup = '';

  if (socialState.loading) {
    feedMarkup = `
      <div class="mylife-alert">
        <span>Loading feed</span>
        <p>Retrieving ${escapeHtml(socialState.activeTab)} posts…</p>
      </div>
    `;
  } else if (socialState.error) {
    feedMarkup = `
      <div class="mylife-alert">
        <span>Feed unavailable</span>
        <p>${escapeHtml(socialState.error)}</p>
      </div>
    `;
  } else if (!visiblePosts.length) {
    feedMarkup = `
      <div class="mylife-alert">
        <span>No updates</span>
        <p>There are no posts in this feed right now.</p>
      </div>
    `;
  } else {
    feedMarkup = visiblePosts
      .map((post) => {
        const authorCitizenId = String(post.authorCitizenId || '');
        const likeLabel = post.liked ? 'Liked' : 'Like';
        const postId = escapeHtml(String(post.id));
        const normalizedPostId = String(post.id ?? '');
        const postHandle = escapeHtml(post.handle || '@citizen');
        const postContent = escapeHtml(post.content);
        const postAvatar = escapeHtml(post.avatar);
        const escapedAuthorCitizenId = escapeHtml(authorCitizenId);
        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        const isOwnPost = Boolean(currentCitizenId && postOwnerCitizenId && postOwnerCitizenId === currentCitizenId);
        const isEditing = Boolean(socialState.postEditOpenByPost[normalizedPostId]);
        const editDraft = socialState.postEditDraftByPost[normalizedPostId] ?? post.content;
        const editDraftLength = Array.from(String(editDraft || '')).length;
        const editTrimmedLength = Array.from(String(editDraft ?? '').replace(/^\s+|\s+$/g, '')).length;
        const editError = socialState.postEditErrorByPost[normalizedPostId] || null;
        const isBusy = Boolean(socialState.postEditBusyByPost[normalizedPostId]);
        const likePending = socialState.pendingLikePostIds.has(String(post.id));
        const isDeleteBusy = Boolean(socialState.postDeleteBusyByPost[normalizedPostId]);
        const deleteError = socialState.postDeleteErrorByPost[normalizedPostId] || null;
        const isPostMenuOpen = socialState.openPostMenuId === normalizedPostId;

        return `
          <article class="social-post" data-post-id="${postId}">
            <div class="social-post-header">
              <button
                type="button"
                class="social-post-author social-author-button"
                data-social-action="open-citizen-profile"
                data-citizen-id="${escapedAuthorCitizenId}"
                aria-label="Open ${postHandle}'s profile"
                style="background: none; border: none; color: inherit; text-align: left; padding: 0; cursor: pointer;"
              >
                <div class="social-post-avatar" style="background-image: url('${postAvatar}')"></div>
                <div>
                  <strong>${postHandle}</strong>
                  <span>${escapeHtml(formatSocialTimestamp(post.createdAt))}</span>
                </div>
              </button>
              <div class="social-post-header-actions">
                ${isOwnPost ? `
                  <div class="social-post-menu-wrap">
                    <button
                      type="button"
                      class="social-post-menu-button"
                      data-social-action="toggle-post-menu"
                      data-post-id="${postId}"
                      aria-label="${isPostMenuOpen ? 'Close post actions menu' : 'Open post actions menu'}"
                      aria-expanded="${String(Boolean(isPostMenuOpen))}"
                      aria-haspopup="menu"
                    >
                      <span aria-hidden="true">⋮</span>
                    </button>
                    ${isPostMenuOpen ? `
                      <div class="social-post-menu" role="menu" aria-label="Post actions menu">
                        <button
                          type="button"
                          class="social-post-menu-item"
                          data-social-action="edit-post"
                          data-post-id="${postId}"
                          role="menuitem"
                        >Edit post</button>
                        <button
                          type="button"
                          class="social-post-menu-item danger"
                          data-social-action="request-delete-post"
                          data-post-id="${postId}"
                          role="menuitem"
                        >Delete post</button>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            </div>

            ${isOwnPost && isEditing ? `
              <div class="social-post-editor">
                <textarea
                  data-post-edit-input="${postId}"
                  rows="4"
                  aria-label="Edit post"
                  ${isBusy ? 'disabled aria-disabled="true"' : ''}
                >${escapeHtml(editDraft)}</textarea>
                <div class="social-post-editor-actions">
                  <span data-post-edit-counter="${postId}">${editDraftLength} / 280</span>
                  <div class="social-post-editor-buttons">
                    <button
                      type="button"
                      class="social-action"
                      data-social-action="cancel-edit-post"
                      data-post-id="${postId}"
                      data-social-prototype="true"
                      ${isBusy ? 'disabled aria-disabled="true"' : ''}
                    >Cancel</button>
                    <button
                      type="button"
                      class="social-action"
                      data-social-action="save-edit-post"
                      data-post-id="${postId}"
                      data-social-prototype="true"
                      ${isBusy || editTrimmedLength === 0 || editDraftLength > 280 ? 'disabled aria-disabled="true"' : ''}
                    >${isBusy ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
                ${editError ? `<div class="social-post-editor-error">${escapeHtml(editError)}</div>` : ''}
              </div>
            ` : `<p class="social-post-copy">${postContent}</p>`}

            <div class="social-post-metrics">
              <span>${post.likes} likes</span>
              <span>${post.comments} comments</span>
            </div>

            <div class="social-post-actions">
              <button
                type="button"
                class="social-action ${post.liked ? 'active' : ''}"
                data-social-action="like"
                data-post-id="${postId}"
                data-social-prototype="true"
                title="${likePending ? 'Updating like...' : (post.liked ? 'Unlike this post' : 'Like this post')}"
                ${likePending ? 'disabled aria-disabled="true"' : ''}
                aria-pressed="${String(Boolean(post.liked))}"
              >${likeLabel} · ${post.likes}</button>
              <button
                type="button"
                class="social-action"
                data-social-action="comment"
                data-post-id="${postId}"
                data-social-prototype="true"
                title="Open comments for this post"
              >Comment · ${post.comments}</button>
              ${deleteError ? `<div class="social-post-editor-error">${escapeHtml(deleteError)}</div>` : ''}
            </div>
          </article>
        `;
      })
      .join('');
  }

  const composerDraftValue = escapeHtml(socialState.composerDraft ?? '');
  const composerLength = Array.from(socialState.composerDraft ?? '').length;
  const composerDisabled = socialState.composerBusy;
  const deleteConfirmationPostId = socialState.deleteConfirmationPostId ? String(socialState.deleteConfirmationPostId) : null;
  const deleteConfirmationPost = deleteConfirmationPostId
    ? visiblePosts.find((post) => String(post.id) === deleteConfirmationPostId) || null
    : null;
  const deleteConfirmationMarkup = deleteConfirmationPost ? `
    <div class="social-post-confirm-overlay" aria-hidden="false">
      <div class="social-post-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="social-delete-confirm-title">
        <div class="social-post-confirm-header">
          <span class="section-kicker">Confirm action</span>
          <h3 id="social-delete-confirm-title">Delete post</h3>
        </div>
        <p>Deleting this post removes it from the social feed for everyone.</p>
        <div class="social-post-confirm-actions">
          <button
            type="button"
            class="social-post-confirm-button secondary"
            data-social-action="cancel-delete-post"
            data-post-id="${escapeHtml(deleteConfirmationPostId)}"
          >Cancel</button>
          <button
            type="button"
            class="social-post-confirm-button danger"
            data-social-action="delete-post"
            data-post-id="${escapeHtml(deleteConfirmationPostId)}"
            data-confirm-delete="true"
            ${socialState.postDeleteBusyByPost[deleteConfirmationPostId] ? 'disabled aria-disabled="true"' : ''}
          >${socialState.postDeleteBusyByPost[deleteConfirmationPostId] ? 'Deleting...' : 'Delete'}</button>
        </div>
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    <div class="social-shell">
      <header class="social-header social-brand-header">
        <div class="social-brand-lockup">
          <img class="social-brand-mark" src="./images/icons/socialmedia.PNG" alt="FakeBook logo" />
          <h3>FakeBook</h3>
        </div>
      </header>

      <div class="social-profile-card">
        <div class="social-avatar" style="background-image: url('${escapeHtml(currentUserAvatar)}')"></div>
        <div class="social-profile-copy">
          <strong>${escapeHtml(currentUserHandle)}</strong>
          <span>Public profile</span>
        </div>
      </div>

      ${handleOnboardingMarkup}

      <div class="social-search-box">
        <span>⌕</span>
        <input type="text" aria-label="Search citizens or discussions" value="Search citizens or discussions" readonly />
      </div>

      <div class="social-tabs" aria-label="Social media feed tabs">
        <button type="button" class="social-tab ${socialState.activeTab === 'associates' ? 'active' : ''}" data-social-tab="associates">Associates</button>
        <button type="button" class="social-tab ${socialState.activeTab === 'trending' ? 'active' : ''}" data-social-tab="trending">Trending</button>
        <button type="button" class="social-tab ${socialState.activeTab === 'latest' ? 'active' : ''}" data-social-tab="latest">Latest</button>
      </div>

      <div class="social-chat-entry">
        <button
          type="button"
          class="social-chat-toggle ${socialState.chat.open ? 'active' : ''}"
          data-social-action="toggle-social-chat"
          aria-expanded="${String(Boolean(socialState.chat.open))}"
        >
          <span class="social-chat-toggle-icon">◉</span>
          <span>Social Chat</span>
          <span class="social-chat-toggle-meta">${socialState.chat.onlineCount || 0} online</span>
        </button>
      </div>

      ${socialState.chat.open ? `
        <div class="social-chat-panel">
          <div class="social-chat-header">
            <div class="social-chat-status">
              <span class="social-chat-live-dot"></span>
              <span>Live room</span>
            </div>
            <strong>${socialState.chat.onlineCount || 0} online</strong>
          </div>

          <div class="social-chat-messages" aria-live="polite">
            ${socialState.chat.loading
              ? '<div class="social-chat-empty">Loading chat…</div>'
              : socialState.chat.error
                ? `<div class="social-chat-empty error">${escapeHtml(socialState.chat.error)}</div>`
                : socialState.chat.messages.length
                  ? socialState.chat.messages.map((message) => `
                      <article class="social-chat-message" data-chat-message-id="${escapeHtml(message.id)}">
                        <div class="social-chat-message-meta">
                          <button
                            type="button"
                            class="social-author-button"
                            data-social-action="open-citizen-profile"
                            data-citizen-id="${escapeHtml(message.citizenId)}"
                            aria-label="Open ${escapeHtml(message.handle)}'s profile"
                          >${escapeHtml(message.handle)}</button>
                          <span>${escapeHtml(formatSocialTimestamp(message.createdAt))}</span>
                          ${message.citizenId && profileState.citizen?.id && String(message.citizenId) === String(profileState.citizen.id) ? `
                            <button
                              type="button"
                              class="social-chat-remove"
                              data-social-chat-remove="${escapeHtml(message.id)}"
                              aria-label="Remove your chat message"
                            >Remove</button>
                          ` : ''}
                        </div>
                        <div class="social-chat-message-body">${escapeHtml(message.body)}</div>
                      </article>
                    `).join('')
                  : '<div class="social-chat-empty">Nobody has started a message yet. Be the first to speak.</div>'}
          </div>

          <div class="social-chat-composer">
            <textarea
              rows="2"
              aria-label="Write a message in Social Chat"
              data-social-chat-input="true"
              placeholder="Share an update with the city…"
              ${socialState.chat.sending ? 'disabled aria-disabled="true"' : ''}
            >${escapeHtml(socialState.chat.composerDraft)}</textarea>
            <button
              type="button"
              class="social-action"
              data-social-chat-send="true"
              ${socialState.chat.sending || !String(socialState.chat.composerDraft || '').trim() ? 'disabled aria-disabled="true"' : ''}
            >${socialState.chat.sending ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      ` : ''}

      <form id="socialComposerForm" class="social-composer">
        <textarea
          rows="3"
          placeholder="What's on your mind?"
          ${composerDisabled ? 'disabled aria-disabled="true"' : ''}
          aria-label="Write a public post"
        >${composerDraftValue}</textarea>
        <div class="social-composer-actions">
          <span data-composer-counter>${composerLength} / 280</span>
          <button type="submit" ${composerDisabled ? 'disabled aria-disabled="true"' : ''}>${composerDisabled ? 'Publishing...' : 'Publish'}</button>
        </div>
        ${socialState.composerError ? `<div class="social-composer-message social-composer-error">${escapeHtml(socialState.composerError)}</div>` : ''}
        ${socialState.composerSuccess ? `<div class="social-composer-message social-composer-success">${escapeHtml(socialState.composerSuccess)}</div>` : ''}
      </form>

      <div class="social-feed">
        ${feedMarkup}
      </div>

      ${commentsPanelOpen ? `
        <aside class="social-comments-panel open" aria-live="polite">
          <div class="social-comments-header">
            <div class="social-comments-title-wrap">
              <h4>Comments</h4>
            </div>
            <button
              type="button"
              class="social-comments-close"
              data-comments-close="true"
              aria-label="Close comments panel"
              title="Close comments panel"
            >×</button>
          </div>

          <div class="social-comments-body">
            ${socialState.commentsPanelLoading
              ? `<div class="mylife-alert"><span>Loading</span><p>Loading the selected post comments…</p></div>`
              : socialState.commentsPanelError
                ? `<div class="mylife-alert"><span>Comments unavailable</span><p>${escapeHtml(socialState.commentsPanelError)}</p><button type="button" class="social-action" data-comments-retry="true">Retry</button></div>`
                : selectedCommentList.length === 0
                  ? `<div class="social-comments-empty"><p>No comments yet for this post.</p></div>`
                  : `
                    <div class="social-comments-list">
                      ${selectedCommentList
                        .map((comment) => {
                          const commentId = String(comment.id ?? '');
                          const commentIdEscaped = escapeHtml(commentId);
                          const commentHandle = formatSocialHandle(comment.author_handle || comment.handle || '@citizen', '@citizen');
                          const commentAuthorCitizenId = comment.author_citizen_id ? String(comment.author_citizen_id) : '';
                          const commentContent = String(comment.content || '');
                          const commentAvatarUrl = getSafeAvatarUrl(comment.author_avatar_url || comment.avatar_url);
                          const createdAt = comment.created_at ? formatSocialTimestamp(comment.created_at) : 'now';
                          const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
                          const commentOwnerCitizenId = comment.author_citizen_id ? String(comment.author_citizen_id) : null;
                          const isOwnComment = Boolean(currentCitizenId && commentOwnerCitizenId && commentOwnerCitizenId === currentCitizenId);
                          const isEditing = Boolean(socialState.commentEditOpenByComment[commentId]);
                          const isBusy = Boolean(socialState.commentEditBusyByComment[commentId]);
                          const editDraft = socialState.commentEditDraftByComment[commentId] ?? commentContent;
                          const editDraftLength = Array.from(String(editDraft || '')).length;
                          const editTrimmedLength = Array.from(String((editDraft || '').replace(/^\s+|\s+$/g, ''))).length;
                          const editError = socialState.commentEditErrorByComment[commentId] || null;

                          if (isEditing) {
                            return `
                              <article class="social-comment-item" data-comment-id="${commentIdEscaped}">
                                <div class="social-comment-header">
                                  <button
                                    type="button"
                                    class="social-comment-author social-author-button"
                                    data-social-action="open-citizen-profile"
                                    data-citizen-id="${escapeHtml(commentAuthorCitizenId)}"
                                    aria-label="Open ${escapeHtml(commentHandle)}'s profile"
                                    style="background: none; border: none; color: inherit; text-align: left; padding: 0; cursor: pointer;"
                                  >
                                    <div class="social-comment-avatar" style="background-image: url('${escapeHtml(commentAvatarUrl)}')"></div>
                                    <div>
                                      <strong>${escapeHtml(commentHandle)}</strong>
                                      <span>${escapeHtml(createdAt)}</span>
                                    </div>
                                  </button>
                                </div>
                                <div class="social-comment-editor">
                                  <textarea
                                    data-comment-edit-input="${commentIdEscaped}"
                                    rows="3"
                                    aria-label="Edit comment"
                                    ${isBusy ? 'disabled aria-disabled="true"' : ''}
                                  >${escapeHtml(editDraft)}</textarea>
                                  <div class="social-comment-editor-actions">
                                    <span data-comment-edit-counter="${commentIdEscaped}">${editDraftLength} / 500</span>
                                    <div class="social-comment-editor-buttons">
                                      <button
                                        type="button"
                                        class="social-action"
                                        data-comment-action="cancel-edit"
                                        data-comment-id="${commentIdEscaped}"
                                        ${isBusy ? 'disabled aria-disabled="true"' : ''}
                                      >Cancel</button>
                                      <button
                                        type="button"
                                        class="social-action"
                                        data-comment-action="save-edit"
                                        data-comment-id="${commentIdEscaped}"
                                        ${isBusy || editTrimmedLength === 0 || editDraftLength > 500 ? 'disabled aria-disabled="true"' : ''}
                                      >${isBusy ? 'Saving...' : 'Save'}</button>
                                    </div>
                                  </div>
                                  ${editError ? `<div class="social-comment-editor-error">${escapeHtml(editError)}</div>` : ''}
                                </div>
                              </article>
                            `;
                          }

                          const deleteError = socialState.commentDeleteErrorByComment[commentId] || null;
                          return `
                            <article class="social-comment-item" data-comment-id="${commentIdEscaped}">
                              <div class="social-comment-header">
                                <button
                                  type="button"
                                  class="social-comment-author social-author-button"
                                  data-social-action="open-citizen-profile"
                                  data-citizen-id="${escapeHtml(commentAuthorCitizenId)}"
                                  aria-label="Open ${escapeHtml(commentHandle)}'s profile"
                                  style="background: none; border: none; color: inherit; text-align: left; padding: 0; cursor: pointer;"
                                >
                                  <div class="social-comment-avatar" style="background-image: url('${escapeHtml(commentAvatarUrl)}')"></div>
                                  <div>
                                    <strong>${escapeHtml(commentHandle)}</strong>
                                    <span>${escapeHtml(createdAt)}</span>
                                  </div>
                                </button>
                                ${isOwnComment ? `
                                  <div class="social-comment-actions">
                                    <button
                                      type="button"
                                      class="social-action"
                                      data-comment-action="edit"
                                      data-comment-id="${commentIdEscaped}"
                                      ${isBusy ? 'disabled aria-disabled="true"' : ''}
                                    >Edit</button>
                                    <button
                                      type="button"
                                      class="social-action"
                                      data-comment-action="delete"
                                      data-comment-id="${commentIdEscaped}"
                                      ${Boolean(socialState.commentDeleteBusyByComment[commentId]) ? 'disabled aria-disabled="true"' : ''}
                                    >${Boolean(socialState.commentDeleteBusyByComment[commentId]) ? 'Deleting...' : 'Delete'}</button>
                                  </div>
                                ` : ''}
                              </div>
                              <p class="social-comment-copy">${escapeHtml(commentContent)}</p>
                              ${deleteError ? `<div class="social-comment-editor-error">${escapeHtml(deleteError)}</div>` : ''}
                            </article>
                          `;
                        })
                        .join('')}
                    </div>
                    ${socialState.commentsHasMoreByPost[String(socialState.selectedCommentPostId)]
                      ? `<div class="social-comments-actions"><button type="button" class="social-action" data-comments-load-more="true" ${socialState.commentsLoadingMore ? 'disabled aria-disabled="true"' : ''}>${socialState.commentsLoadingMore ? 'Loading...' : 'Load More Comments'}</button></div>`
                      : ''}
                  `}

            <form id="socialCommentComposerForm" class="social-comment-composer-form">
              <textarea
                rows="3"
                placeholder="Write a comment..."
                aria-label="Write a comment"
                ${selectedCommentComposerBusy ? 'disabled aria-disabled="true"' : ''}
              >${escapeHtml(selectedCommentDraft)}</textarea>
              <div class="social-comment-composer-actions">
                <span data-comment-counter>${selectedCommentDraftLength} / 500</span>
                <button
                  type="submit"
                  class="social-action"
                  ${selectedCommentComposerBusy || selectedCommentTrimmedLength === 0 || selectedCommentDraftLength > 500 ? 'disabled aria-disabled="true"' : ''}
                >${selectedCommentComposerBusy ? 'Posting...' : 'Post Comment'}</button>
              </div>
              ${selectedCommentComposerError ? `<div class="social-composer-message social-composer-error">${escapeHtml(selectedCommentComposerError)}</div>` : ''}
              ${selectedCommentComposerSuccess ? `<div class="social-composer-message social-composer-success">${escapeHtml(selectedCommentComposerSuccess)}</div>` : ''}
            </form>
          </div>
        </aside>
      ` : ''}
    </div>
    ${deleteConfirmationMarkup}
  `;

  body.querySelectorAll('[data-social-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextTab = button.dataset.socialTab;
      if (!nextTab || nextTab === socialState.activeTab) {
        return;
      }

      Object.keys(socialState.postEditOpenByPost).forEach((postId) => {
        invalidatePostEditRequest(postId);
      });
      closePostActionMenu();
      closeDeleteConfirmation();
      socialState.activeTab = nextTab;
      await loadSocialFeed(nextTab);
    });
  });

  const toggleChatButton = body.querySelector('[data-social-action="toggle-social-chat"]');
  if (toggleChatButton) {
    toggleChatButton.addEventListener('click', async () => {
      socialState.chat.open = !socialState.chat.open;
      if (socialState.chat.open && !socialState.chat.hasLoaded) {
        await loadSocialChatMessages();
      }
      if (!socialState.chat.open) {
        cleanupSocialChatRealtime();
      }
      renderSocialApp();
    });
  }

  const chatInput = body.querySelector('[data-social-chat-input]');
  if (chatInput) {
    chatInput.value = socialState.chat.composerDraft;
    chatInput.addEventListener('input', (event) => {
      socialState.chat.composerDraft = String(event.target.value || '');
      const sendButton = body.querySelector('[data-social-chat-send]');
      if (sendButton) {
        const isDisabled = socialState.chat.sending || !String(socialState.chat.composerDraft || '').trim();
        sendButton.disabled = isDisabled;
        sendButton.setAttribute('aria-disabled', String(isDisabled));
      }
    });
    chatInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        await submitSocialChatMessage();
      }
    });
  }

  const chatSendButton = body.querySelector('[data-social-chat-send]');
  if (chatSendButton) {
    chatSendButton.addEventListener('click', async () => {
      await submitSocialChatMessage();
    });
  }

  const chatMessages = body.querySelector('.social-chat-messages');
  if (chatMessages) {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  const removeChatButtons = body.querySelectorAll('[data-social-chat-remove]');
  if (removeChatButtons.length) {
    removeChatButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const messageId = String(button.dataset.socialChatRemove || '').trim();
        if (!messageId) {
          return;
        }

        await removeSocialChatMessage(messageId);
      });
    });
  }

  const handleInput = body.querySelector('[data-social-handle-input]');
  const handleRegisterButton = body.querySelector('[data-social-action="register-handle"]');

  if (handleInput) {
    handleInput.addEventListener('input', (event) => {
      socialState.handleOnboarding.draft = event.target.value;
      if (socialState.handleOnboarding.error) {
        socialState.handleOnboarding.error = null;
      }
      if (socialState.handleOnboarding.success) {
        socialState.handleOnboarding.success = null;
      }
    });
  }

  if (handleRegisterButton) {
    handleRegisterButton.addEventListener('click', () => {
      registerCitizenHandleFromOnboarding();
    });
  }

  const confirmDeleteButtons = body.querySelectorAll('[data-social-action="delete-post"][data-confirm-delete="true"], [data-social-action="cancel-delete-post"]');
  if (confirmDeleteButtons.length) {
    confirmDeleteButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
        const action = event.currentTarget.dataset.socialAction;
        const postId = String(event.currentTarget.dataset.postId || '').trim();
        if (!postId) {
          return;
        }

        if (action === 'cancel-delete-post') {
          closeDeleteConfirmation();
          renderSocialApp();
          return;
        }

        await runDeletePostRequest(postId);
      });
    });
  }

  const composerForm = body.querySelector('#socialComposerForm');
  const composerTextarea = composerForm ? composerForm.querySelector('textarea') : null;
  const composerCounter = composerForm ? composerForm.querySelector('[data-composer-counter]') : null;

  if (composerTextarea) {
    composerTextarea.value = socialState.composerDraft ?? '';
    composerTextarea.addEventListener('input', (event) => {
      socialState.composerDraft = event.target.value;
      if (socialState.composerError) {
        socialState.composerError = null;
      }
      if (socialState.composerSuccess) {
        socialState.composerSuccess = null;
      }

      const errorBanner = composerForm?.querySelector('.social-composer-error');
      if (errorBanner) {
        errorBanner.remove();
      }
      const successBanner = composerForm?.querySelector('.social-composer-success');
      if (successBanner) {
        successBanner.remove();
      }

      if (composerCounter) {
        composerCounter.textContent = `${Array.from(socialState.composerDraft).length} / 280`;
      }
    });
  }

  if (composerForm) {
    composerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const supabase = getAuthClient();
      if (!supabase) {
        socialState.composerError = 'Supabase is unavailable.';
        renderSocialApp();
        return;
      }

      if (socialState.composerBusy) {
        return;
      }

      const rawContent = socialState.composerDraft ?? '';
      const content = rawContent.replace(/^\s+|\s+$/g, '');
      const trimmedLength = Array.from(content).length;

      if (!content) {
        socialState.composerError = 'Post content is required.';
        renderSocialApp();
        return;
      }

      if (trimmedLength < 1 || trimmedLength > 280) {
        socialState.composerError = 'Posts must be 1–280 characters.';
        renderSocialApp();
        return;
      }

      socialState.composerBusy = true;
      socialState.composerError = null;
      socialState.composerSuccess = null;
      renderSocialApp();

      try {
        const { error } = await supabase.rpc('create_social_post', { p_content: content });

        if (error) {
          throw error;
        }

        socialState.composerDraft = '';
        socialState.composerSuccess = 'Post published.';
        await loadSocialFeed(socialState.activeTab);

        socialState.composerBusy = false;
        renderSocialApp();
      } catch (error) {
        console.error('create social post failed', error);
        socialState.composerError = error?.message || 'Unable to publish the post right now.';
        socialState.composerBusy = false;
        renderSocialApp();
      }
    });
  }

  bindGlobalCitizenProfileActions();

  const socialFeed = body.querySelector('.social-feed');

  if (socialFeed && !socialFeed.dataset.postEditDelegationBound) {
    socialFeed.dataset.postEditDelegationBound = 'true';
    socialFeed.addEventListener('click', async (event) => {
      const menuToggle = event.target.closest('[data-social-action="toggle-post-menu"]');
      if (menuToggle) {
        const postId = String(menuToggle.dataset.postId || '').trim();
        if (!postId) {
          return;
        }

        const post = findActiveSocialPostById(postId);
        if (!post) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
          return;
        }

        socialState.openPostMenuId = socialState.openPostMenuId === postId ? null : postId;
        if (socialState.openPostMenuId) {
          socialState.deleteConfirmationPostId = null;
        }
        renderSocialApp();
        return;
      }

      const menuRequestDelete = event.target.closest('[data-social-action="request-delete-post"]');
      if (menuRequestDelete) {
        const postId = String(menuRequestDelete.dataset.postId || '').trim();
        if (!postId || socialState.postDeleteBusyByPost[postId]) {
          return;
        }

        socialState.openPostMenuId = null;
        socialState.deleteConfirmationPostId = postId;
        renderSocialApp();
        return;
      }

      const cancelDeleteButton = event.target.closest('[data-social-action="cancel-delete-post"]');
      if (cancelDeleteButton) {
        closeDeleteConfirmation();
        renderSocialApp();
        return;
      }

      const editButton = event.target.closest('[data-social-action="edit-post"]');
      if (editButton) {
        const postId = String(editButton.dataset.postId || '').trim();
        if (!postId) {
          return;
        }

        const post = findActiveSocialPostById(postId);
        if (!post) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
          return;
        }

        closePostActionMenu();
        socialState.postEditOpenByPost[postId] = true;
        socialState.postEditDraftByPost[postId] = String(post.content ?? '');
        socialState.postEditErrorByPost[postId] = null;
        renderSocialApp();
        return;
      }

      const cancelButton = event.target.closest('[data-social-action="cancel-edit-post"]');
      if (cancelButton) {
        const postId = String(cancelButton.dataset.postId || '').trim();
        if (!postId) {
          return;
        }

        const post = findActiveSocialPostById(postId);
        if (!post) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
          return;
        }

        invalidatePostEditRequest(postId);
        renderSocialApp();
        return;
      }

      const deleteButton = event.target.closest('[data-social-action="delete-post"]');
      if (deleteButton) {
        const postId = String(deleteButton.dataset.postId || '').trim();
        if (!postId || socialState.postDeleteBusyByPost[postId]) {
          return;
        }

        const post = findActiveSocialPostById(postId);
        if (!post) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
          return;
        }

        const isConfirmationTrigger = deleteButton.dataset.confirmDelete === 'true' || socialState.deleteConfirmationPostId === postId;
        if (!isConfirmationTrigger) {
          socialState.openPostMenuId = null;
          socialState.deleteConfirmationPostId = postId;
          renderSocialApp();
          return;
        }

        closeDeleteConfirmation();
        await runDeletePostRequest(postId);
        return;
      }

      const saveButton = event.target.closest('[data-social-action="save-edit-post"]');
      if (saveButton) {
        const postId = String(saveButton.dataset.postId || '').trim();
        if (!postId || socialState.postEditBusyByPost[postId]) {
          return;
        }

        const post = findActiveSocialPostById(postId);
        if (!post) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId || !socialState.postEditOpenByPost[postId]) {
          invalidatePostEditRequest(postId);
          renderSocialApp();
          return;
        }

        const draft = String(socialState.postEditDraftByPost[postId] ?? '');
        const trimmedDraft = draft.replace(/^\s+|\s+$/g, '');
        const draftLength = Array.from(draft).length;
        if (!trimmedDraft || draftLength > 280) {
          socialState.postEditErrorByPost[postId] = trimmedDraft ? 'Post exceeds 280 characters.' : 'Post content is required.';
          renderSocialApp();
          return;
        }

        const supabase = getAuthClient();
        if (!supabase) {
          socialState.postEditErrorByPost[postId] = 'Social media is unavailable because Supabase is not available.';
          renderSocialApp();
          return;
        }

        const requestId = Number(socialState.postEditRequestTokenByPost[postId] || 0) + 1;
        socialState.postEditRequestTokenByPost[postId] = requestId;
        socialState.postEditBusyByPost[postId] = true;
        socialState.postEditErrorByPost[postId] = null;
        renderSocialApp();

        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }

          if (!sessionData?.session?.user) {
            throw new Error('User is not authenticated.');
          }

          if (requestId !== Number(socialState.postEditRequestTokenByPost[postId] || 0)) {
            return;
          }

          const { error } = await supabase.rpc('update_social_post', {
            p_post_id: postId,
            p_content: trimmedDraft,
          });

          if (error) {
            throw error;
          }

          if (requestId !== Number(socialState.postEditRequestTokenByPost[postId] || 0)) {
            return;
          }

          socialState.postEditOpenByPost[postId] = false;
          delete socialState.postEditDraftByPost[postId];
          delete socialState.postEditErrorByPost[postId];
          await loadSocialFeed(socialState.activeTab);
        } catch (error) {
          if (requestId !== Number(socialState.postEditRequestTokenByPost[postId] || 0)) {
            return;
          }

          console.error('update social post failed', error);
          socialState.postEditErrorByPost[postId] = error?.message || 'Unable to save the post right now.';
          renderSocialApp();
        } finally {
          if (requestId === Number(socialState.postEditRequestTokenByPost[postId] || 0)) {
            socialState.postEditBusyByPost[postId] = false;
            renderSocialApp();
          }
        }
      }
    });

    socialFeed.addEventListener('input', (event) => {
      const textarea = event.target.closest('[data-post-edit-input]');
      if (!textarea) {
        return;
      }

      const postId = String(textarea.dataset.postEditInput || '').trim();
      if (!postId) {
        return;
      }

      const post = findActiveSocialPostById(postId);
      if (!post) {
        return;
      }

      const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
      const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
      if (!currentCitizenId || !postOwnerCitizenId || postOwnerCitizenId !== currentCitizenId) {
        invalidatePostEditRequest(postId);
        renderSocialApp();
        return;
      }

      const nextValue = String(event.target.value || '');
      const limitedValue = Array.from(nextValue).slice(0, 280).join('');
      socialState.postEditDraftByPost[postId] = limitedValue;
      delete socialState.postEditErrorByPost[postId];

      const editorContainer = textarea.closest('.social-post-editor');
      if (editorContainer) {
        const counter = editorContainer.querySelector('[data-post-edit-counter]');
        if (counter) {
          counter.textContent = `${Array.from(limitedValue).length} / 280`;
        }

        const saveButton = editorContainer.querySelector('[data-social-action="save-edit-post"]');
        if (saveButton) {
          const trimmedValue = limitedValue.replace(/^\s+|\s+$/g, '');
          const isDisabled = Boolean(socialState.postEditBusyByPost[postId]) || trimmedValue.length === 0 || Array.from(limitedValue).length > 280;
          saveButton.disabled = isDisabled;
          saveButton.setAttribute('aria-disabled', String(isDisabled));
        }
      }

      event.target.value = limitedValue;
    });
  }

  if (!document.body.dataset.socialPostOutsideDismissBound) {
    document.body.dataset.socialPostOutsideDismissBound = 'true';
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('.social-post-menu') || target.closest('[data-social-action="toggle-post-menu"]') || target.closest('[data-social-action="request-delete-post"]') || target.closest('[data-social-action="edit-post"]') || target.closest('[data-social-action="cancel-delete-post"]') || target.closest('[data-social-action="delete-post"]') || target.closest('.social-post-confirm-dialog')) {
        return;
      }

      if (target.closest('.social-post-confirm-overlay')) {
        closeDeleteConfirmation();
        renderSocialApp();
        return;
      }

      if (socialState.openPostMenuId || socialState.deleteConfirmationPostId) {
        closePostActionMenu();
        closeDeleteConfirmation();
        renderSocialApp();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (socialState.deleteConfirmationPostId) {
        closeDeleteConfirmation();
        renderSocialApp();
        return;
      }

      if (socialState.openPostMenuId) {
        closePostActionMenu();
        renderSocialApp();
      }
    });
  }

  if (socialFeed && !socialFeed.dataset.commentDelegationBound) {
    socialFeed.dataset.commentDelegationBound = 'true';
    socialFeed.addEventListener('click', (event) => {
      const commentButton = event.target.closest('[data-social-action="comment"]');
      if (!commentButton || commentButton.disabled) {
        return;
      }

      const postId = String(commentButton.dataset.postId || '').trim();
      if (!postId) {
        return;
      }

      const alreadyOpen = socialState.commentsPanelOpen && String(socialState.selectedCommentPostId || '').trim() === postId;
      if (alreadyOpen) {
        socialState.commentsPanelOpen = false;
        socialState.selectedCommentPostId = null;
        socialState.commentsPanelLoading = false;
        socialState.commentsPanelError = null;
        socialState.commentsLoadingMore = false;
        socialState.commentsRequestToken += 1;
        socialState.commentSubmitRequestToken += 1;
        invalidateCommentEditRequests();
        invalidateCommentDeleteRequests();
        renderSocialApp();
        return;
      }

      socialState.selectedCommentPostId = postId;
      socialState.commentsPanelOpen = true;
      socialState.commentsPanelLoading = false;
      socialState.commentsPanelError = null;
      socialState.commentsPageByPost[postId] = 0;
      socialState.commentsHasMoreByPost[postId] = false;
      socialState.commentsRequestToken += 1;
      socialState.commentSubmitRequestToken += 1;
      invalidateCommentEditRequests();
      invalidateCommentDeleteRequests();
      socialState.commentComposerBusyByPost[postId] = false;
      socialState.commentComposerErrorByPost[postId] = null;
      socialState.commentComposerSuccessByPost[postId] = null;
      renderSocialApp();
      loadCommentsForPost(postId, false);
    });
  }

  if (socialFeed && !socialFeed.dataset.likeDelegationBound) {
    socialFeed.dataset.likeDelegationBound = 'true';
    socialFeed.addEventListener('click', async (event) => {
      const likeButton = event.target.closest('[data-social-action="like"]');
      if (!likeButton || likeButton.disabled) {
        return;
      }

      const postId = String(likeButton.dataset.postId || '').trim();
      if (!postId) {
        return;
      }

      if (socialState.pendingLikePostIds.has(postId)) {
        return;
      }

      const post = findActiveSocialPostById(postId);
      if (!post) {
        return;
      }

      const supabase = getAuthClient();
      if (!supabase) {
        socialState.error = 'Social feed is unavailable because Supabase is not available.';
        renderSocialApp();
        return;
      }

      const originalLiked = Boolean(post.liked);
      const originalLikeCount = Math.max(0, Number(post.likes) || 0);
      const nextLikedState = !originalLiked;
      const nextLikeCount = Math.max(0, originalLikeCount + (nextLikedState ? 1 : -1));

      socialState.pendingLikePostIds.add(postId);
      post.liked = nextLikedState;
      post.likes = nextLikeCount;
      updateSocialPostLikeState(postId, nextLikedState, nextLikeCount);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData?.session?.user) {
          throw new Error('User is not authenticated.');
        }

        const { error } = await supabase.rpc('set_post_like', {
          p_post_id: postId,
          p_liked: nextLikedState,
        });

        if (error) {
          throw error;
        }

        socialState.error = null;
      } catch (error) {
        console.error('social like action failed', error);
        post.liked = originalLiked;
        post.likes = originalLikeCount;
        updateSocialPostLikeState(postId, originalLiked, originalLikeCount);
        socialState.error = 'Unable to update like right now.';
        renderSocialApp();
      } finally {
        socialState.pendingLikePostIds.delete(postId);
        updateSocialPostLikeState(postId, post.liked, post.likes);
      }
    });
  }

  const commentsCloseButton = body.querySelector('[data-comments-close]');
  if (commentsCloseButton) {
    commentsCloseButton.addEventListener('click', () => {
      socialState.commentsPanelOpen = false;
      socialState.selectedCommentPostId = null;
      socialState.commentsPanelLoading = false;
      socialState.commentsPanelError = null;
      socialState.commentsLoadingMore = false;
      socialState.commentsRequestToken += 1;
      socialState.commentSubmitRequestToken += 1;
      invalidateCommentEditRequests();
      invalidateCommentDeleteRequests();
      renderSocialApp();
    });
  }

  const commentComposerForm = body.querySelector('#socialCommentComposerForm');
  const commentComposerTextarea = commentComposerForm ? commentComposerForm.querySelector('textarea') : null;
  const commentComposerCounter = commentComposerForm ? commentComposerForm.querySelector('[data-comment-counter]') : null;

  if (commentComposerTextarea) {
    const selectedPostId = String(socialState.selectedCommentPostId || '').trim();
    commentComposerTextarea.value = selectedPostId ? (socialState.commentDraftByPost[selectedPostId] ?? '') : '';
    commentComposerTextarea.addEventListener('input', (event) => {
      const currentPostId = String(socialState.selectedCommentPostId || '').trim();
      if (!currentPostId) {
        return;
      }

      const nextValue = String(event.target.value || '');
      const limitedValue = Array.from(nextValue).slice(0, 500).join('');
      const trimmedValue = limitedValue.replace(/^\s+|\s+$/g, '');
      const displayLength = Array.from(limitedValue).length;
      const trimmedLength = Array.from(trimmedValue).length;
      const isBusy = Boolean(socialState.commentComposerBusyByPost[currentPostId]);
      const isDisabled = isBusy || trimmedLength === 0 || displayLength > 500;

      socialState.commentDraftByPost[currentPostId] = limitedValue;
      socialState.commentComposerErrorByPost[currentPostId] = null;
      socialState.commentComposerSuccessByPost[currentPostId] = null;

      if (commentComposerCounter) {
        commentComposerCounter.textContent = `${displayLength} / 500`;
      }

      const submitButton = commentComposerForm?.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = isDisabled;
        submitButton.setAttribute('aria-disabled', String(isDisabled));
      }

      if (event.target) {
        event.target.value = limitedValue;
      }
    });
  }

  if (commentComposerForm) {
    commentComposerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const selectedPostId = String(socialState.selectedCommentPostId || '').trim();
      if (!selectedPostId || !socialState.commentsPanelOpen) {
        return;
      }

      const draftValue = socialState.commentDraftByPost[selectedPostId] ?? '';
      const trimmedDraft = draftValue.replace(/^\s+|\s+$/g, '');
      const trimmedLength = Array.from(trimmedDraft).length;
      const displayLength = Array.from(String(draftValue || '')).length;
      const supabase = getAuthClient();

      if (socialState.commentComposerBusyByPost[selectedPostId]) {
        return;
      }

      if (!supabase) {
        socialState.commentComposerErrorByPost[selectedPostId] = 'Supabase is unavailable.';
        renderSocialApp();
        return;
      }

      if (!trimmedDraft || trimmedLength > 500 || displayLength > 500) {
        socialState.commentComposerErrorByPost[selectedPostId] = trimmedDraft ? 'Comment exceeds 500 characters.' : 'Comment content is required.';
        renderSocialApp();
        return;
      }

      const requestId = ++socialState.commentSubmitRequestToken;
      socialState.commentComposerBusyByPost[selectedPostId] = true;
      socialState.commentComposerErrorByPost[selectedPostId] = null;
      socialState.commentComposerSuccessByPost[selectedPostId] = null;
      renderSocialApp();

      let successHandled = false;

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData?.session?.user) {
          throw new Error('User is not authenticated.');
        }

        if (requestId !== socialState.commentSubmitRequestToken || !socialState.commentsPanelOpen || String(socialState.selectedCommentPostId || '').trim() !== selectedPostId) {
          return;
        }

        const { error } = await supabase.rpc('create_social_comment', {
          p_post_id: selectedPostId,
          p_content: trimmedDraft,
        });

        if (error) {
          throw error;
        }

        if (!successHandled) {
          const targetPost = findActiveSocialPostById(selectedPostId);
          if (targetPost) {
            targetPost.comments = Math.max(0, Number(targetPost.comments || 0) + 1);
          }
          successHandled = true;
        }

        if (requestId !== socialState.commentSubmitRequestToken) {
          return;
        }

        const panelIsStillCurrent = socialState.commentsPanelOpen
          && String(socialState.selectedCommentPostId || '').trim() === selectedPostId;

        if (panelIsStillCurrent) {
          socialState.commentDraftByPost[selectedPostId] = '';
          socialState.commentComposerSuccessByPost[selectedPostId] = 'Comment posted.';
        }

        if (requestId !== socialState.commentSubmitRequestToken || !panelIsStillCurrent) {
          return;
        }

        await loadCommentsForPost(selectedPostId, false);

        if (requestId !== socialState.commentSubmitRequestToken) {
          return;
        }
      } catch (error) {
        if (requestId !== socialState.commentSubmitRequestToken) {
          return;
        }

        console.error('create social comment failed', error);
        socialState.commentComposerErrorByPost[selectedPostId] = error?.message || 'Unable to post the comment right now.';
      } finally {
        socialState.commentComposerBusyByPost[selectedPostId] = false;

        if (requestId === socialState.commentSubmitRequestToken
          && socialState.commentsPanelOpen
          && String(socialState.selectedCommentPostId || '').trim() === selectedPostId) {
          renderSocialApp();
        }
      }
    });
  }

  const commentsBody = body.querySelector('.social-comments-body');
  if (commentsBody && !commentsBody.dataset.commentEditBound) {
    commentsBody.dataset.commentEditBound = 'true';

    commentsBody.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-comment-action="edit"]');
      if (editButton) {
        const commentId = String(editButton.dataset.commentId || '').trim();
        if (!commentId) {
          return;
        }

        const commentRecord = (socialState.commentsByPost[String(socialState.selectedCommentPostId || '')] || []).find((entry) => String(entry.id) === commentId);
        if (!commentRecord) {
          return;
        }

        socialState.commentEditOpenByComment[commentId] = true;
        socialState.commentEditDraftByComment[commentId] = String(commentRecord.content || '');
        socialState.commentEditErrorByComment[commentId] = null;
        renderSocialApp();
        return;
      }

      const cancelButton = event.target.closest('[data-comment-action="cancel-edit"]');
      if (cancelButton) {
        const commentId = String(cancelButton.dataset.commentId || '').trim();
        if (!commentId) {
          return;
        }

        socialState.commentEditOpenByComment[commentId] = false;
        socialState.commentEditErrorByComment[commentId] = null;
        delete socialState.commentEditDraftByComment[commentId];
        renderSocialApp();
        return;
      }

      const deleteButton = event.target.closest('[data-comment-action="delete"]');
      if (deleteButton) {
        const commentId = String(deleteButton.dataset.commentId || '').trim();
        if (!commentId || socialState.commentDeleteBusyByComment[commentId] || socialState.commentEditBusyByComment[commentId] || socialState.commentEditOpenByComment[commentId]) {
          return;
        }

        const selectedPostId = String(socialState.selectedCommentPostId || '').trim();
        if (!selectedPostId || !socialState.commentsPanelOpen) {
          return;
        }

        const commentRecord = (socialState.commentsByPost[selectedPostId] || []).find((entry) => String(entry.id) === commentId);
        if (!commentRecord) {
          return;
        }

        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const commentOwnerCitizenId = commentRecord.author_citizen_id ? String(commentRecord.author_citizen_id) : null;
        if (!currentCitizenId || !commentOwnerCitizenId || commentOwnerCitizenId !== currentCitizenId) {
          return;
        }

        const supabase = getAuthClient();
        if (!supabase) {
          socialState.commentDeleteErrorByComment[commentId] = 'Comments are unavailable because Supabase is not available.';
          renderSocialApp();
          return;
        }

        const requestId = Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0) + 1;
        socialState.commentDeleteRequestTokenByComment[commentId] = requestId;
        socialState.commentDeleteBusyByComment[commentId] = true;
        socialState.commentDeleteErrorByComment[commentId] = null;
        renderSocialApp();

        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }

          if (!sessionData?.session?.user) {
            throw new Error('User is not authenticated.');
          }

          if (requestId !== Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0)) {
            return;
          }

          const { error } = await supabase.rpc('delete_social_comment', {
            p_comment_id: commentId,
          });

          if (error) {
            throw error;
          }

          if (requestId !== Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0)) {
            return;
          }

          const activeSelectedPostId = String(socialState.selectedCommentPostId || '').trim();
          if (!socialState.commentsPanelOpen || !activeSelectedPostId || activeSelectedPostId !== selectedPostId) {
            return;
          }

          socialState.commentsByPost[selectedPostId] = (socialState.commentsByPost[selectedPostId] || []).filter((entry) => String(entry.id) !== commentId);
          const targetPost = findActiveSocialPostById(selectedPostId);
          if (targetPost) {
            targetPost.comments = Math.max(0, Number(targetPost.comments || 0) - 1);
          }
          socialState.commentEditRequestTokenByComment[commentId] = Number(socialState.commentEditRequestTokenByComment[commentId] || 0) + 1;
          delete socialState.commentDeleteErrorByComment[commentId];
          delete socialState.commentEditBusyByComment[commentId];
          delete socialState.commentEditOpenByComment[commentId];
          delete socialState.commentEditDraftByComment[commentId];
          delete socialState.commentEditErrorByComment[commentId];
          renderSocialApp();
        } catch (error) {
          if (requestId !== Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0)) {
            return;
          }

          console.error('delete social comment failed', error);
          socialState.commentDeleteErrorByComment[commentId] = error?.message || 'Unable to delete the comment right now.';
          renderSocialApp();
        } finally {
          if (requestId === Number(socialState.commentDeleteRequestTokenByComment[commentId] || 0)) {
            socialState.commentDeleteBusyByComment[commentId] = false;
            renderSocialApp();
          }
        }
        return;
      }

      const saveButton = event.target.closest('[data-comment-action="save-edit"]');
      if (!saveButton) {
        return;
      }

      const commentId = String(saveButton.dataset.commentId || '').trim();
      if (!commentId || socialState.commentEditBusyByComment[commentId] || socialState.commentDeleteBusyByComment[commentId]) {
        return;
      }

      const originalPanelPostId = String(socialState.selectedCommentPostId || '').trim();
      const draft = String(socialState.commentEditDraftByComment[commentId] ?? '');
      const trimmedContent = draft.replace(/^\s+|\s+$/g, '');
      const draftLength = Array.from(draft).length;
      const supabase = getAuthClient();

      if (!supabase) {
        socialState.commentEditErrorByComment[commentId] = 'Comments are unavailable because Supabase is not available.';
        renderSocialApp();
        return;
      }

      if (!trimmedContent || draftLength > 500) {
        socialState.commentEditErrorByComment[commentId] = trimmedContent ? 'Comment exceeds 500 characters.' : 'Comment content is required.';
        renderSocialApp();
        return;
      }

      const requestId = Number(socialState.commentEditRequestTokenByComment[commentId] || 0) + 1;
      socialState.commentEditRequestTokenByComment[commentId] = requestId;
      socialState.commentEditBusyByComment[commentId] = true;
      socialState.commentEditErrorByComment[commentId] = null;
      renderSocialApp();

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData?.session?.user) {
          throw new Error('User is not authenticated.');
        }

        if (requestId !== Number(socialState.commentEditRequestTokenByComment[commentId] || 0)) {
          return;
        }

        const { error } = await supabase.rpc('update_social_comment', {
          p_comment_id: commentId,
          p_content: trimmedContent,
        });

        if (error) {
          throw error;
        }

        if (requestId !== Number(socialState.commentEditRequestTokenByComment[commentId] || 0)) {
          return;
        }

        const selectedPostId = String(socialState.selectedCommentPostId || '').trim();
        if (!socialState.commentsPanelOpen || !selectedPostId || selectedPostId !== originalPanelPostId) {
          return;
        }

        socialState.commentEditOpenByComment[commentId] = false;
        delete socialState.commentEditDraftByComment[commentId];
        delete socialState.commentEditErrorByComment[commentId];
        await loadCommentsForPost(selectedPostId, false);
      } catch (error) {
        if (requestId !== Number(socialState.commentEditRequestTokenByComment[commentId] || 0)) {
          return;
        }

        console.error('update social comment failed', error);
        socialState.commentEditErrorByComment[commentId] = error?.message || 'Unable to save the comment right now.';
        renderSocialApp();
      } finally {
        if (requestId === Number(socialState.commentEditRequestTokenByComment[commentId] || 0)) {
          socialState.commentEditBusyByComment[commentId] = false;
          renderSocialApp();
        }
      }
    });

    commentsBody.addEventListener('input', (event) => {
      const textarea = event.target.closest('[data-comment-edit-input]');
      if (!textarea) {
        return;
      }

      const commentId = String(textarea.dataset.commentEditInput || '').trim();
      if (!commentId) {
        return;
      }

      const nextValue = String(event.target.value || '');
      const limitedValue = Array.from(nextValue).slice(0, 500).join('');
      socialState.commentEditDraftByComment[commentId] = limitedValue;
      socialState.commentEditErrorByComment[commentId] = null;

      const editorContainer = textarea.closest('.social-comment-editor');
      if (editorContainer) {
        const counter = editorContainer.querySelector('[data-comment-edit-counter]');
        if (counter) {
          counter.textContent = `${Array.from(limitedValue).length} / 500`;
        }

        const saveButton = editorContainer.querySelector('[data-comment-action="save-edit"]');
        if (saveButton) {
          const trimmedValue = limitedValue.replace(/^\s+|\s+$/g, '');
          const isDisabled = socialState.commentEditBusyByComment[commentId] || trimmedValue.length === 0 || Array.from(limitedValue).length > 500;
          saveButton.disabled = isDisabled;
          saveButton.setAttribute('aria-disabled', String(isDisabled));
        }
      }

      event.target.value = limitedValue;
    });
  }

  const retryButton = body.querySelector('[data-comments-retry="true"]');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      const postId = String(socialState.selectedCommentPostId || '').trim();
      if (!postId) {
        return;
      }

      socialState.commentsPanelError = null;
      socialState.commentsPanelLoading = true;
      socialState.commentsLoadingMore = false;
      renderSocialApp();
      loadCommentsForPost(postId, false);
    });
  }

  const loadMoreButton = body.querySelector('[data-comments-load-more="true"]');
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      const postId = String(socialState.selectedCommentPostId || '').trim();
      if (!postId || socialState.commentsLoadingMore) {
        return;
      }

      loadCommentsForPost(postId, true);
    });
  }

  bindSocialFollowButtons(body);

}

function applyCitizenProfile(citizen) {
  if (!citizen) {
    player.balance = 'Unavailable';
    return;
  }

  if (citizen.public_name) {
    player.name = citizen.public_name;
  }

  if (citizen.political_party) {
    player.party = citizen.political_party;
  }

  if (profileState.private && profileState.private.balance !== undefined && profileState.private.balance !== null) {
    player.balance = formatCurrency(profileState.private.balance);
  } else if (profileState.private === null) {
    player.balance = 'Unavailable';
  } else {
    player.balance = 'Loading...';
  }

  player.avatarText = deriveAvatarText(player.name);
  renderPlayerDetails();
}

function renderPlayerDetails() {
  const activeAvatarUrl = getCitizenAvatarUrl(profileState.citizen || null);
  const lockName = document.getElementById('lockName');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');

  if (lockName) {
    lockName.textContent = player.name;
  }

  if (profileName) {
    profileName.textContent = player.name;
  }

  if (profileRole) {
    const profession = getDisplayProfession(profileState.private?.profession, 'Profile unavailable');
    profileRole.textContent = profession;
  }

  document.querySelectorAll('.avatar').forEach((avatar) => {
    if (activeAvatarUrl) {
      avatar.style.backgroundImage = `linear-gradient(135deg, rgba(18, 24, 28, 0.15), rgba(18, 24, 28, 0.05)), url("${activeAvatarUrl}")`;
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = player.avatarText;
    }
  });

  const walletBalance = document.getElementById('walletBalance');
  if (walletBalance) {
    walletBalance.textContent = player.balance;
  }

  const homeBalance = document.querySelector('.balance-value');
  if (homeBalance) {
    homeBalance.textContent = player.balance;
  }

  const lucky7Body = document.querySelector('#app-lucky7 .app-body');
  if (lucky7Body && typeof renderLucky7App === 'function') {
    renderLucky7App();
  }
}

async function refreshCitizenBalanceFromSupabase(citizenId) {
  const supabase = getAuthClient();
  if (!supabase || !citizenId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('citizen_private')
      .select('citizen_id, balance')
      .eq('citizen_id', citizenId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    const nextBalance = Number(data.balance);
    const isCurrentCitizen = Boolean(profileState.citizen?.id && profileState.citizen.id === citizenId);

    if (isCurrentCitizen) {
      profileState.private = {
        ...(profileState.private || {}),
        balance: nextBalance,
      };
      applyCitizenProfile(profileState.citizen);
      renderPlayerDetails();
    }

    return nextBalance;
  } catch (error) {
    console.warn('Citizen balance refresh failed:', error);
    return null;
  }
}

function renderAppGrid() {
  const keys = Object.keys(appCatalog)
    .filter((appId) => appId !== 'messages')
    .filter((appId) => appId !== 'associates')
    .filter((appId) => appId !== 'moderator' || moderatorAppState.visible);
  appGrid.innerHTML = keys
    .map((appId) => {
      const app = appCatalog[appId];
      const badge = app.unread > 0 ? `<span class="badge">${app.unread}</span>` : '';
      const lockedClass = app.locked ? 'locked' : '';
      const iconMarkup = app.icon.startsWith('.')
        ? `<span class="icon-graphic app-icon-image" style="background-image: url('${app.icon}'); background-size: cover; background-position: center; background-repeat: no-repeat; border-color: rgba(255,255,255,0.08);"></span>`
        : `<span class="icon-graphic" style="background: linear-gradient(135deg, rgba(255,255,255,0.18), ${app.color}55); color: ${app.color};">${app.icon}</span>`;

      return `
        <button
          type="button"
          class="app-icon ${lockedClass}"
          data-app-id="${appId}"
          aria-label="${app.name}"
        >
          ${iconMarkup}
          <span class="app-name">${app.name}</span>
          ${badge}
          ${app.locked ? '<span class="locked-state">Locked</span>' : ''}
        </button>
      `;
    })
    .join('');

  appGrid.querySelectorAll('.app-icon').forEach((button) => {
    button.addEventListener('click', () => {
      const appId = button.dataset.appId;
      if (appCatalog[appId].locked) {
        openApp(appId, 'locked');
        return;
      }
      openApp(appId, 'normal');
    });
  });
}

async function refreshModeratorAppVisibility() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  if (!supabase || !session?.user) {
    moderatorAppState.visible = false;
    renderAppGrid();
    return false;
  }

  try {
    const { data, error } = await supabase.functions.invoke('get-moneytree-moderation-queue', {
      method: 'GET',
    });

    const canAccessQueue = !error && Boolean(data || (Array.isArray(data) && data.length >= 0));
    moderatorAppState.visible = canAccessQueue;
    renderAppGrid();
    return canAccessQueue;
  } catch (error) {
    console.warn('Moderator app visibility check failed:', error);
    moderatorAppState.visible = false;
    renderAppGrid();
    return false;
  }
}

function renderNotificationCenter() {
  const unreadCount = notifications.filter((item) => item.unread).length;
  notificationBubble.textContent = String(unreadCount);

  notificationList.innerHTML = notifications
    .map(
      (item) => `
        <article class="notification-item ${item.unread ? 'unread' : ''}">
          <strong>${item.title}</strong>
          <span>${item.detail}</span>
          <small>${item.time}</small>
        </article>
      `,
    )
    .join('');
}

function setClock() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const lockTime = document.getElementById('lockTime');
  const lockDate = document.getElementById('lockDate');

  document.getElementById('clockLabel').textContent = formatter.format(now);

  if (lockTime) {
    lockTime.textContent = formatter.format(now);
  }

  if (lockDate) {
    lockDate.textContent = dateFormatter.format(now);
  }
}

function ensureAppWindow(appId) {
  if (!appState[appId]) {
    appState[appId] = {
      open: false,
      scrollTop: 0,
    };
  }

  let appWindow = document.getElementById(`app-${appId}`);
  if (!appWindow) {
    appWindow = document.createElement('section');
    appWindow.id = `app-${appId}`;
    appWindow.className = 'app-window';
    appWindow.setAttribute('aria-label', `${appCatalog[appId].name} app`);

    appWindow.innerHTML = `
      <div class="app-body"></div>
    `;
    appLayer.appendChild(appWindow);
  }

  return appWindow;
}

async function loadCitizenProfile() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  player.balance = 'Loading...';
  renderPlayerDetails();

  if (!supabase || !session?.user) {
    player.balance = 'Unavailable';
    renderPlayerDetails();
    return null;
  }

  const loadToken = ++profileState.citizenLoadToken;

  const { data: citizen, error: citizenError } = await supabase
    .from('citizens')
    .select('id, citizen_id, auth_user_id, public_name, avatar_type, avatar_url, political_party, registration_date, created_at')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (citizenError && citizenError.code !== 'PGRST116') {
    console.error('citizen profile load failed', citizenError);
    profileState.privateLoadError = 'Unable to load your citizen record.';
    return null;
  }

  if (!citizen) {
    profileState.citizen = null;
    profileState.private = null;
    player.balance = 'Unavailable';
    profileState.privateLoadError = 'No citizen record is linked to this account.';
    renderPlayerDetails();
    return null;
  }

  let privateRecord = null;
  profileState.privateLoadError = null;

  try {
    const { data, error } = await supabase.functions.invoke('get-citizen-profile');
    if (error) {
      throw error;
    }
    privateRecord = data || null;
  } catch (privateError) {
    console.error('citizen private profile load failed', privateError);
    profileState.privateLoadError = 'Unable to load private profile details. Please retry.';
    privateRecord = null;
  }

  if (loadToken !== profileState.citizenLoadToken) {
    return citizen;
  }

  profileState.citizen = citizen;
  profileState.private = privateRecord || null;
  void ensureCurrentCitizenHandleStatus();

  if (!privateRecord) {
    player.balance = 'Unavailable';
    renderPlayerDetails();
  } else {
    applyCitizenProfile(citizen);
    renderPlayerDetails();
  }

  return citizen;
}

async function handleProfileEditSubmit(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  if (!supabase || !session?.user || !profileState.citizen) {
    setAuthMessage('You must be signed in to edit your profile.', 'error');
    return;
  }

  const form = event.currentTarget;
  const politicalParty = form.political_party.value;
  const avatarUrl = form.avatar_url.value || getCitizenAvatarUrl(profileState.citizen);

  if (!builtInAvatarAssets.some((asset) => asset.url === avatarUrl)) {
    setAuthMessage('Please select a valid built-in avatar.', 'error');
    return;
  }

  const { error } = await supabase
    .from('citizens')
    .update({
      avatar_url: avatarUrl,
      political_party: politicalParty,
    })
    .eq('id', profileState.citizen.id);

  if (error) {
    console.error('profile update failed', error);
    setAuthMessage('Profile update failed. Please try again.', 'error');
    return;
  }

  profileState.isEditing = false;
  setAuthMessage('Profile updated successfully.', 'success');
  await loadCitizenProfile();
  renderAppContent('mylife');
}

function getStoreProductStatus(product) {
  if (!product || !product.is_visible) {
    return { label: 'Unavailable', tone: 'locked' };
  }

  if (product.is_locked) {
    return { label: 'Coming Soon', tone: 'locked' };
  }

  if (product.is_purchasable) {
    return { label: 'Available', tone: 'available' };
  }

  if (product.price === null || product.price === undefined) {
    return { label: 'Coming Soon', tone: 'locked' };
  }

  return { label: 'Unavailable', tone: 'locked' };
}

function getStoreRequirementLabel(product) {
  const requirements = product && typeof product.requirements === 'object' ? product.requirements : null;
  if (!requirements) {
    return '';
  }

  const approvedContributionCount = Number(requirements.moneytree_approved_contributions ?? 0);
  if (Number.isFinite(approvedContributionCount) && approvedContributionCount > 0) {
    return `${approvedContributionCount} approved contributions`;
  }

  return '';
}

function getStoreEligibilityStatus(product, quote = null) {
  const eligibility = quote && typeof quote === 'object' && quote.eligibility && typeof quote.eligibility === 'object'
    ? quote.eligibility
    : null;

  if (!product || product.product_key !== 'high_school_diploma') {
    return {
      is_eligible: true,
      approved_contributions: 0,
      required_approved_contributions: 0,
      remaining_required: 0,
      message: 'No purchase eligibility requirement.',
    };
  }

  const required = Number(eligibility?.required_approved_contributions ?? 200);
  const approved = Number(eligibility?.approved_contributions ?? 0);
  const isEligible = Boolean(eligibility?.is_eligible ?? approved >= required);
  const remainingRequired = Math.max(0, required - approved);

  return {
    is_eligible: isEligible,
    approved_contributions: approved,
    required_approved_contributions: required,
    remaining_required: remainingRequired,
    message: isEligible
      ? 'Eligible — meets the diploma requirement.'
      : `${approved}/${required} approved contributions. ${remainingRequired} more approved MoneyTree contribution${remainingRequired === 1 ? '' : 's'} required.`,
  };
}

function getStoreCheckoutDisabledReason(product, quote = null) {
  if (!product || !product.is_visible || product.is_locked || !product.is_purchasable) {
    return 'This item is unavailable for purchase.';
  }

  if (product.price === null || product.price === undefined) {
    return 'This item does not have a valid price.';
  }

  if (!storeState.taxConfig) {
    return 'Store checkout is temporarily unavailable because national sales tax has not been configured.';
  }

  const eligibility = getStoreEligibilityStatus(product, quote);
  if (!eligibility.is_eligible) {
    return eligibility.message;
  }

  return null;
}

function getStoreReceiptRows(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return [];
  }

  return [
    { label: 'Item', value: receipt.item_name || receipt.item || 'Unknown item' },
    { label: 'Quantity', value: Number(receipt.quantity ?? 1) },
    { label: 'Original price', value: receipt.original_item_price != null ? formatCurrency(Number(receipt.original_item_price)) : '—' },
    { label: 'Tax rate', value: receipt.sales_tax_rate != null ? `${Number(receipt.sales_tax_rate * 100).toFixed(2)}%` : '—' },
    { label: 'Tax amount', value: receipt.tax_amount != null ? formatCurrency(Number(receipt.tax_amount)) : '—' },
    { label: 'Final amount', value: receipt.final_amount != null ? formatCurrency(Number(receipt.final_amount)) : '—' },
    { label: 'Purchased', value: receipt.purchased_at ? new Date(receipt.purchased_at).toLocaleString() : '—' },
    { label: 'Balance after purchase', value: receipt.balance_after_purchase != null ? formatCurrency(Number(receipt.balance_after_purchase)) : '—' },
  ];
}

function createStoreIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `store-purchase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStoreIdempotencyKeyForProduct(productId) {
  if (storeState.purchaseRequestProductId === productId && storeState.purchaseRequestKey) {
    return storeState.purchaseRequestKey;
  }

  const nextKey = createStoreIdempotencyKey();
  storeState.purchaseRequestProductId = productId;
  storeState.purchaseRequestKey = nextKey;
  return nextKey;
}

function clearStorePurchaseAttempt(productId) {
  if (productId == null || storeState.purchaseRequestProductId === productId) {
    storeState.purchaseRequestProductId = null;
    storeState.purchaseRequestKey = null;
  }
}

function renderStorePurchaseHistory() {
  if (!storeState.purchaseHistory.length) {
    return `
      <div class="store-history-panel">
        <h4>Purchase history</h4>
        <p>No purchases yet.</p>
      </div>
    `;
  }

  const rows = storeState.purchaseHistory.map((purchase) => {
    const status = purchase.status === 'reversed' ? 'Reversed' : 'Completed';
    const total = purchase.final_amount != null ? formatCurrency(Number(purchase.final_amount)) : '—';
    return `
      <div class="store-history-item">
        <div>
          <strong>${escapeHtml(purchase.item_name || 'Item')}</strong>
          <small>${escapeHtml(status)} • ${escapeHtml(purchase.quantity ?? 1)} item${Number(purchase.quantity ?? 1) === 1 ? '' : 's'}</small>
        </div>
        <div class="store-history-total">${escapeHtml(total)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="store-history-panel">
      <h4>Purchase history</h4>
      <div class="store-history-list">${rows}</div>
    </div>
  `;
}

function renderStoreReceiptPanel() {
  if (!storeState.lastReceipt || typeof storeState.lastReceipt !== 'object') {
    return '';
  }

  const receiptRows = getStoreReceiptRows(storeState.lastReceipt).map((row) => `
    <div class="store-receipt-row">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(String(row.value))}</strong>
    </div>
  `).join('');

  return `
    <div class="store-receipt-panel">
      <h4>Purchase receipt</h4>
      <div class="store-receipt-list">${receiptRows}</div>
    </div>
  `;
}

function renderStoreDetailModal(product) {
  if (!product) {
    return '';
  }

  const category = storeState.categories.find((entry) => entry.id === product.category_id) || null;
  const categoryName = category?.display_name || 'Store';
  const productStatus = getStoreProductStatus(product);
  const requirementText = getStoreRequirementLabel(product);
  const quote = storeState.quote && storeState.quote.product_id === product.id ? storeState.quote : null;
  const eligibility = getStoreEligibilityStatus(product, quote);
  const checkoutDisabledReason = getStoreCheckoutDisabledReason(product, quote);
  const isConfirmationReady = storeState.confirmationProductId === product.id && !storeState.isCheckoutBusy;
  const quotePriceText = quote && quote.item_price != null ? formatCurrency(Number(quote.item_price)) : product.price !== null && product.price !== undefined ? formatCurrency(Number(product.price)) : 'Price not set';
  const quoteTaxRateText = quote && quote.tax_rate != null ? `${Number(quote.tax_rate * 100).toFixed(2)}%` : '—';
  const quoteTaxAmountText = quote && quote.tax_amount != null ? formatCurrency(Number(quote.tax_amount)) : '—';
  const quoteFinalTotalText = quote && quote.final_total != null ? formatCurrency(Number(quote.final_total)) : '—';
  const isBuyNowAvailable = Boolean(
    product &&
    product.is_visible &&
    !product.is_locked &&
    product.is_purchasable &&
    product.price !== null &&
    product.price !== undefined &&
    !storeState.isCheckoutBusy &&
    !checkoutDisabledReason &&
    storeState.confirmationProductId !== product.id
  );

  return `
    <div class="store-modal-backdrop" data-store-modal-backdrop="true">
      <div class="store-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(product.product_name)} details">
        <button type="button" class="store-modal-close" data-store-modal-close aria-label="Close product details">×</button>
        <div class="store-modal-art" aria-hidden="true">${escapeHtml((product.product_name || 'ST').slice(0, 2).toUpperCase())}</div>
        <div class="store-modal-header">
          <span class="store-product-pill ${productStatus.tone}">${escapeHtml(productStatus.label)}</span>
          <h4>${escapeHtml(product.product_name)}</h4>
        </div>
        <p class="store-modal-copy">${escapeHtml(product.description || 'No description available.')}</p>
        <div class="store-detail-list">
          <div><span>Category</span><strong>${escapeHtml(categoryName)}</strong></div>
          <div><span>Item price</span><strong>${escapeHtml(quotePriceText)}</strong></div>
          ${quote ? `<div><span>National sales tax</span><strong>${escapeHtml(quoteTaxRateText)}</strong></div>` : ''}
          ${quote ? `<div><span>Tax amount</span><strong>${escapeHtml(quoteTaxAmountText)}</strong></div>` : ''}
          ${quote ? `<div><span>Final total</span><strong>${escapeHtml(quoteFinalTotalText)}</strong></div>` : ''}
          ${requirementText ? `<div><span>Requirement</span><strong>${escapeHtml(requirementText)}</strong></div>` : ''}
          ${product.product_key === 'high_school_diploma' ? `<div><span>Eligibility</span><strong>${escapeHtml(eligibility.is_eligible ? `Eligible (${eligibility.approved_contributions}/${eligibility.required_approved_contributions})` : `Ineligible (${eligibility.approved_contributions}/${eligibility.required_approved_contributions})`)}</strong></div>` : ''}
          <div><span>Availability</span><strong>${escapeHtml(productStatus.label)}</strong></div>
          ${product.one_time_purchase ? '<div><span>Purchase type</span><strong>One-time purchase</strong></div>' : ''}
        </div>
        ${product.product_key === 'high_school_diploma' ? `<p class="store-error-state" style="margin: 0.75rem 0 0;">${escapeHtml(eligibility.message)}</p>` : ''}
        ${checkoutDisabledReason ? `<p class="store-error-state" style="margin: 0.75rem 0 0;">${escapeHtml(checkoutDisabledReason)}</p>` : ''}
        <div class="store-modal-actions">
          <button type="button" class="secondary-button" data-store-modal-close>Close</button>
          ${isBuyNowAvailable ? `<button type="button" class="primary-button" data-store-buy-now="${escapeHtml(product.id)}">Buy Now</button>` : ''}
          ${isConfirmationReady ? `<button type="button" class="primary-button" data-store-confirm-purchase="${escapeHtml(product.id)}">Confirm Purchase</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

const STORE_PRIORITY_PRODUCT_KEYS = new Map([
  ['high_school_diploma', 0],
  ['laptop', 1],
]);

function renderStoreApp() {
  const categoryMap = new Map(storeState.categories.map((category) => [category.id, category]));
  const searchQuery = String(storeState.searchTerm || '').trim().toLowerCase();
  const filteredCatalog = storeState.catalog
    .filter((product) => categoryMap.has(product.category_id))
    .filter((product) => storeState.selectedCategory === 'all' || categoryMap.get(product.category_id)?.category_key === storeState.selectedCategory)
    .filter((product) => {
      if (!searchQuery) {
        return true;
      }
      return `${product.product_name || ''} ${product.description || ''}`.toLowerCase().includes(searchQuery);
    })
    .sort((first, second) => {
      const firstRank = STORE_PRIORITY_PRODUCT_KEYS.has(first.product_key)
        ? STORE_PRIORITY_PRODUCT_KEYS.get(first.product_key)
        : Number.MAX_SAFE_INTEGER;
      const secondRank = STORE_PRIORITY_PRODUCT_KEYS.has(second.product_key)
        ? STORE_PRIORITY_PRODUCT_KEYS.get(second.product_key)
        : Number.MAX_SAFE_INTEGER;

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return (first.product_name || '').localeCompare(second.product_name || '', undefined, { sensitivity: 'base' });
    });

  const categoryButtons = storeState.categories
    .filter((category) => category.is_visible)
    .map((category) => {
      const isSelected = storeState.selectedCategory === category.category_key;
      const disabled = Boolean(category.is_locked);
      return `
        <button
          type="button"
          class="store-category ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
          data-store-category-key="${escapeHtml(category.category_key)}"
          ${disabled ? 'disabled' : ''}
          aria-label="${escapeHtml(category.display_name)}"
        >
          <span>${escapeHtml(category.display_name)}</span>
          ${disabled ? '<small>Locked</small>' : ''}
        </button>
      `;
    })
    .join('');

  const productCards = filteredCatalog
    .map((product) => {
      const category = categoryMap.get(product.category_id);
      const status = getStoreProductStatus(product);
      const requirementText = getStoreRequirementLabel(product);
      const priceText = product.price !== null && product.price !== undefined ? formatCurrency(Number(product.price)) : 'Price not set';
      const artLabel = (product.product_name || 'ST').split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'ST';

      return `
        <article class="store-product" data-store-product-id="${escapeHtml(product.id)}">
          <div class="store-product-art" aria-hidden="true">${escapeHtml(artLabel)}</div>
          <div class="store-product-body">
            <div class="store-product-meta">
              <span class="store-product-category">${escapeHtml(category?.display_name || 'Store')}</span>
              <span class="store-product-pill ${status.tone}">${escapeHtml(status.label)}</span>
            </div>
            <h4>${escapeHtml(product.product_name)}</h4>
            <div class="store-product-rating" aria-label="5 out of 5 fictional game rating">
              <span>5.0</span><b aria-hidden="true">★★★★★</b><small>Game rating</small>
            </div>
            <p>${escapeHtml(product.description || 'No description available.')}</p>
            <div class="store-product-row">
              <strong>${escapeHtml(priceText)}</strong>
              ${requirementText ? `<small>${escapeHtml(requirementText)}</small>` : ''}
            </div>
            <span class="store-product-action">View details</span>
          </div>
        </article>
      `;
    })
    .join('');

  const storeModalMarkup = storeState.selectedProductId
    ? renderStoreDetailModal(storeState.catalog.find((entry) => entry.id === storeState.selectedProductId) || null)
    : '';

  const appBody = document.querySelector('#app-store .app-body');
  if (!appBody) {
    return;
  }

  appBody.innerHTML = `
    <div class="store-shell">
      <div class="store-header">
        <button type="button" class="store-back-affordance" aria-label="Back to home" data-store-home>‹</button>
        <label class="store-search" for="storeSearchInput">
          <span class="store-search-icon" aria-hidden="true">⌕</span>
          <input id="storeSearchInput" type="search" value="${escapeHtml(storeState.searchTerm)}" placeholder="Search Tyranny Store" />
        </label>
        <button type="button" class="store-refresh-button" data-store-refresh aria-label="Refresh catalog">↻</button>
      </div>

      <div class="store-category-strip">
        <span class="store-filter-icon" aria-hidden="true">☷</span>
        <button
          type="button"
          class="store-category ${storeState.selectedCategory === 'all' ? 'selected' : ''}"
          data-store-category-key="all"
          aria-label="Browse all products"
        >
          <span>All</span>
        </button>
        ${categoryButtons}
      </div>

      ${storeState.checkoutError ? `
        <div class="store-error-state">
          <strong>Checkout issue</strong>
          <p>${escapeHtml(storeState.checkoutError)}</p>
        </div>
      ` : ''}

      ${storeState.taxConfig ? '' : `
        <div class="store-error-state">
          <strong>Store checkout unavailable</strong>
          <p>Store checkout is temporarily unavailable because national sales tax has not been configured.</p>
        </div>
      `}

      ${storeState.loading ? `
        <div class="store-loading-state">
          <strong>Loading Store catalog…</strong>
          <p>Retrieving categories and available products.</p>
        </div>
      ` : ''}

      ${storeState.error ? `
        <div class="store-error-state">
          <strong>Store unavailable</strong>
          <p>${escapeHtml(storeState.error)}</p>
          <button type="button" class="secondary-button" data-store-retry>Retry</button>
        </div>
      ` : ''}

      ${!storeState.loading && !storeState.error && filteredCatalog.length === 0 ? `
        <div class="store-empty-state">
          <strong>No products match this filter.</strong>
          <p>Try another search term or switch categories.</p>
        </div>
      ` : ''}

      ${!storeState.loading && !storeState.error && filteredCatalog.length > 0 ? `
        <div class="store-product-grid">
          ${productCards}
        </div>
      ` : ''}

      ${renderStoreReceiptPanel()}
      ${renderStorePurchaseHistory()}
    </div>
    ${storeModalMarkup}
  `;

  const searchInput = appBody.querySelector('#storeSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      storeState.searchTerm = event.target.value || '';
      renderStoreApp();
    });
  }

  appBody.querySelectorAll('[data-store-category-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.storeCategoryKey;
      if (!selected) {
        return;
      }

      storeState.selectedCategory = selected;
      renderStoreApp();
    });
  });

  appBody.querySelectorAll('[data-store-product-id]').forEach((card) => {
    card.addEventListener('click', async () => {
      const productId = card.dataset.storeProductId;
      if (!productId) {
        return;
      }

      storeState.selectedProductId = productId;
      storeState.quote = null;
      renderStoreApp();

      const product = storeState.catalog.find((entry) => entry.id === productId);
      if (product && product.is_visible && !product.is_locked && product.is_purchasable) {
        await loadStoreQuote(productId, 1);
        renderStoreApp();
      }
    });
  });

  appBody.querySelectorAll('[data-store-buy-now]').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.storeBuyNow;
      if (!productId) {
        return;
      }

      const product = storeState.catalog.find((entry) => entry.id === productId);
      if (!product) {
        return;
      }

      const checkoutReason = getStoreCheckoutDisabledReason(product);
      if (checkoutReason) {
        storeState.checkoutError = checkoutReason;
        renderStoreApp();
        return;
      }

      const quote = await loadStoreQuote(productId, 1);
      if (!quote) {
        storeState.checkoutError = 'Unable to load the purchase quote for this item.';
        renderStoreApp();
        return;
      }

      const eligibility = getStoreEligibilityStatus(product, quote);
      if (!eligibility.is_eligible) {
        storeState.checkoutError = eligibility.message;
        renderStoreApp();
        return;
      }

      storeState.checkoutError = null;
      storeState.confirmationProductId = productId;
      storeState.activeCheckoutProductId = null;
      storeState.isCheckoutBusy = false;
      renderStoreApp();
    });
  });

  appBody.querySelectorAll('[data-store-confirm-purchase]').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.storeConfirmPurchase;
      if (!productId || storeState.isCheckoutBusy) {
        return;
      }

      await handleStorePurchase(productId);
    });
  });

  const refreshButton = appBody.querySelector('[data-store-refresh]');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      storeState.hasLoaded = false;
      storeState.selectedProductId = null;
      loadStoreCatalog();
    });
  }

  const homeButton = appBody.querySelector('[data-store-home]');
  homeButton?.addEventListener('click', () => {
    returnHome();
  });

  const retryButton = appBody.querySelector('[data-store-retry]');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      storeState.error = null;
      storeState.hasLoaded = false;
      loadStoreCatalog();
    });
  }

  const modalBackdrop = appBody.querySelector('[data-store-modal-backdrop]');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) {
        storeState.selectedProductId = null;
        storeState.confirmationProductId = null;
        storeState.quote = null;
        renderStoreApp();
      }
    });
  }

  appBody.querySelectorAll('[data-store-modal-close]').forEach((button) => {
    button.addEventListener('click', () => {
      storeState.selectedProductId = null;
      storeState.confirmationProductId = null;
      storeState.quote = null;
      renderStoreApp();
    });
  });
}

async function loadStoreTaxConfig() {
  const supabase = getAuthClient();
  if (!supabase) {
    storeState.taxConfig = null;
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke('store-checkout-status');
    const checkoutAvailable = Boolean(data && data.checkout_available === true && !error);

    if (error || !data) {
      storeState.taxConfig = null;
      return;
    }

    storeState.taxConfig = checkoutAvailable ? { active: true } : null;
  } catch (error) {
    console.error('Store checkout status load failed:', error);
    storeState.taxConfig = null;
  }
}

async function loadStoreQuote(productId, quantity = 1) {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  if (!supabase || !session?.user) {
    return null;
  }

  try {
    const { data, error } = await supabase.functions.invoke('store-checkout-quote', {
      body: {
        product_id: productId,
        quantity,
      },
    });

    if (error || !data) {
      console.error('Store checkout quote load failed:', error || 'No quote data returned.');
      return null;
    }

    storeState.quote = data;
    return data;
  } catch (error) {
    console.error('Store checkout quote request failed:', error);
    return null;
  }
}

async function loadStorePurchaseHistory() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  if (!supabase || !session?.user) {
    storeState.purchaseHistory = [];
    storeState.purchaseHistoryError = null;
    return;
  }

  storeState.purchaseHistoryLoading = true;
  renderStoreApp();

  try {
    const { data: citizen, error: citizenError } = await supabase
      .from('citizens')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (citizenError) {
      throw citizenError;
    }

    if (!citizen) {
      storeState.purchaseHistory = [];
      storeState.purchaseHistoryError = null;
      return;
    }

    const { data, error } = await supabase
      .from('store_purchases')
      .select('*')
      .eq('citizen_id', citizen.id)
      .order('purchased_at', { ascending: false });

    if (error) {
      throw error;
    }

    storeState.purchaseHistory = data || [];
    storeState.purchaseHistoryError = null;
  } catch (error) {
    console.error('Store purchase history load failed:', error);
    storeState.purchaseHistory = [];
    storeState.purchaseHistoryError = error?.message || 'Unable to load purchase history.';
  } finally {
    storeState.purchaseHistoryLoading = false;
    renderStoreApp();
  }
}

async function handleStorePurchase(productId) {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;
  const product = storeState.catalog.find((entry) => entry.id === productId);

  if (!supabase || !session?.user) {
    storeState.checkoutError = 'Please sign in to purchase items.';
    renderStoreApp();
    return;
  }

  if (!product) {
    storeState.checkoutError = 'This item is no longer available.';
    renderStoreApp();
    return;
  }

  const checkoutReason = getStoreCheckoutDisabledReason(product);
  if (checkoutReason) {
    storeState.checkoutError = checkoutReason;
    renderStoreApp();
    return;
  }

  if (storeState.isCheckoutBusy) {
    return;
  }

  const idempotencyKey = getStoreIdempotencyKeyForProduct(productId);

  storeState.isCheckoutBusy = true;
  storeState.activeCheckoutProductId = productId;
  storeState.confirmationProductId = productId;
  storeState.checkoutError = null;
  renderStoreApp();

  try {
    const { data, error } = await supabase.rpc('purchase_store_item', {
      p_product_id: productId,
      p_quantity: 1,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const message = error.message || 'Purchase failed.';
      const normalized = message.toLowerCase();

      if (normalized.includes('no active economic settings row exists') || normalized.includes('sales tax')) {
        storeState.checkoutError = 'Store checkout is temporarily unavailable because national sales tax has not been configured.';
      } else if (normalized.includes('insufficient balance')) {
        storeState.checkoutError = 'Your balance is too low to complete this purchase.';
      } else if (normalized.includes('already been consumed') || normalized.includes('one-time purchase')) {
        storeState.checkoutError = 'This one-time item has already been purchased.';
      } else if (normalized.includes('not purchasable') || normalized.includes('not visible') || normalized.includes('locked')) {
        storeState.checkoutError = 'This item is unavailable for purchase.';
      } else if (normalized.includes('requires 200 approved')) {
        storeState.checkoutError = 'You do not meet the required approval threshold for this item.';
      } else if (normalized.includes('duplicate') || normalized.includes('idempotency')) {
        storeState.checkoutError = 'This purchase request is already in progress.';
      } else {
        storeState.checkoutError = 'The Store could not complete this purchase right now.';
      }

      storeState.isCheckoutBusy = false;
      storeState.activeCheckoutProductId = null;
      storeState.confirmationProductId = productId;
      renderStoreApp();
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const receipt = result && typeof result.receipt === 'object' ? result.receipt : result;

    storeState.lastReceipt = receipt || null;
    storeState.checkoutError = null;
    storeState.activeCheckoutProductId = null;
    storeState.confirmationProductId = null;
    storeState.selectedProductId = null;
    clearStorePurchaseAttempt(productId);
    await loadCitizenProfile();
    await loadStorePurchaseHistory();
    await loadStoreCatalog();
  } catch (error) {
    console.error('Store purchase failed:', error);
    storeState.checkoutError = 'Purchase failed. Please try again.';
    storeState.isCheckoutBusy = false;
    storeState.activeCheckoutProductId = null;
    storeState.confirmationProductId = productId;
  } finally {
    if (!storeState.checkoutError) {
      storeState.isCheckoutBusy = false;
    }
    renderStoreApp();
  }
}

async function loadStoreCatalog() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  storeState.loading = true;
  storeState.error = null;
  renderStoreApp();

  if (!supabase || !session?.user) {
    storeState.loading = false;
    storeState.hasLoaded = true;
    storeState.taxConfig = null;
    storeState.error = 'Please sign in to browse the Store.';
    renderStoreApp();
    return;
  }

  try {
    const [{ data: categories, error: categoryError }, { data: catalog, error: catalogError }] = await Promise.all([
      supabase
        .from('store_categories')
        .select('id, category_key, display_name, display_order, is_visible, is_locked')
        .eq('is_visible', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('store_catalog')
        .select('id, category_id, product_key, product_name, description, price, currency, is_visible, is_purchasable, is_locked, one_time_purchase, requirements')
        .eq('is_visible', true)
        .order('product_name', { ascending: true }),
    ]);

    if (categoryError) {
      throw categoryError;
    }

    if (catalogError) {
      throw catalogError;
    }

    const categoryMap = new Map((categories || []).map((category) => [category.id, category]));
    const visibleCatalog = (catalog || [])
      .filter((product) => categoryMap.has(product.category_id))
      .sort((first, second) => {
        const firstRank = STORE_PRIORITY_PRODUCT_KEYS.has(first.product_key)
          ? STORE_PRIORITY_PRODUCT_KEYS.get(first.product_key)
          : Number.MAX_SAFE_INTEGER;
        const secondRank = STORE_PRIORITY_PRODUCT_KEYS.has(second.product_key)
          ? STORE_PRIORITY_PRODUCT_KEYS.get(second.product_key)
          : Number.MAX_SAFE_INTEGER;

        if (firstRank !== secondRank) {
          return firstRank - secondRank;
        }

        return (first.product_name || '').localeCompare(second.product_name || '', undefined, { sensitivity: 'base' });
      });

    storeState.categories = categories || [];
    storeState.catalog = visibleCatalog;
    storeState.hasLoaded = true;
    storeState.error = null;

    if (storeState.selectedCategory !== 'all' && !storeState.categories.some((category) => category.category_key === storeState.selectedCategory)) {
      storeState.selectedCategory = 'all';
    }

    await loadStoreTaxConfig();
    await loadStorePurchaseHistory();
    renderStoreApp();
  } catch (error) {
    console.error('Store catalog load failed:', error);
    storeState.hasLoaded = true;
    storeState.error = error?.message || 'Unable to load the Store right now. Please try again.';
    renderStoreApp();
  } finally {
    storeState.loading = false;
    renderStoreApp();
  }
}

function formatLucky7Currency(value) {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') {
      return '$0';
    }
    value = Number(cleaned);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '$0';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numeric);
}

function getRouletteCategoryConfig() {
  return {
    color: {
      label: 'Color',
      options: ['red', 'black'],
    },
    parity: {
      label: 'Number type',
      options: ['odd', 'even'],
    },
    range: {
      label: 'Number range',
      options: ['low', 'high'],
    },
  };
}

function normalizeRouletteBetType(type) {
  return String(type || '').trim().toLowerCase();
}

function getRouletteSelectionLabel(type) {
  const normalized = normalizeRouletteBetType(type);
  if (normalized === 'low') {
    return 'LOW (1–18)';
  }
  if (normalized === 'high') {
    return 'HIGH (19–36)';
  }
  if (normalized === 'odd') {
    return 'ODD';
  }
  if (normalized === 'even') {
    return 'EVEN';
  }
  return normalized ? normalized.toUpperCase() : 'BET';
}

function cloneRouletteSelections(selections) {
  const next = {};
  Object.keys(getRouletteCategoryConfig()).forEach((category) => {
    const current = selections && selections[category];
    if (current && current.type && Number(current.wager || 0) > 0) {
      next[category] = {
        type: normalizeRouletteBetType(current.type),
        wager: Number(current.wager || 0),
      };
    } else {
      next[category] = null;
    }
  });
  return next;
}

function getRouletteSelectedBets(selections = lucky7State.rouletteSelections) {
  return Object.entries(getRouletteCategoryConfig())
    .map(([category, config]) => {
      const selection = selections && selections[category];
      const type = selection && selection.type ? normalizeRouletteBetType(selection.type) : '';
      const wager = Number(selection?.wager ?? 0);
      if (!type || !Number.isFinite(wager) || wager <= 0) {
        return null;
      }
      return {
        category,
        label: config.label,
        type,
        wager,
      };
    })
    .filter(Boolean);
}

function getRouletteSelectedTotal(selections = lucky7State.rouletteSelections) {
  return getRouletteSelectedBets(selections).reduce((total, bet) => total + Number(bet.wager || 0), 0);
}

async function loadLucky7History() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  lucky7State.historyLoading = true;
  lucky7State.historyError = null;

  if (!supabase || !session?.user) {
    lucky7State.history = [];
    lucky7State.historyLoading = false;
    lucky7State.historyError = 'Your session has expired. Please sign in again.';
    return [];
  }

  try {
    const { data, error } = await supabase.functions.invoke('lucky7-history', {
      method: 'GET',
    });

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.transactions)
        ? data.transactions
        : [];

    const rawStats = data && typeof data === 'object' && 'stats' in data ? data.stats : {};
    const totalBet = Number(rawStats?.total_bet ?? rawStats?.totalBet ?? 0);
    const totalWin = Number(rawStats?.total_win ?? rawStats?.totalWin ?? 0);
    const netProfit = Number(rawStats?.net_profit ?? rawStats?.netProfit ?? (Number.isFinite(totalWin) && Number.isFinite(totalBet) ? totalWin - totalBet : 0));

    lucky7State.history = rows.map((entry) => ({
      id: entry?.id ?? null,
      game_type: entry?.game_type ?? 'slots',
      wager: Number(entry?.wager ?? 0),
      payout: Number(entry?.payout ?? 0),
      net_change: Number(entry?.net_change ?? 0),
      status: entry?.status ?? 'posted',
      created_at: entry?.created_at ?? null,
      result: entry?.result ?? {},
    }));
    lucky7State.stats = {
      total_bet: Number.isFinite(totalBet) ? totalBet : 0,
      total_win: Number.isFinite(totalWin) ? totalWin : 0,
      net_profit: Number.isFinite(netProfit) ? netProfit : 0,
    };
    lucky7State.historyError = null;
    return lucky7State.history;
  } catch (error) {
    console.error('LUCKY 7 history load failed:', error);
    lucky7State.history = [];
    lucky7State.historyError = error?.message || 'Unable to load LUCKY 7 history right now.';
    return [];
  } finally {
    lucky7State.historyLoading = false;
  }
}

async function playLucky7Round() {
  if (lucky7State.isBusy) {
    return;
  }

  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession())?.data?.session;

  if (!supabase || !session?.user) {
    lucky7State.error = 'Your session has expired. Please sign in again.';
    renderLucky7App();
    return;
  }

  const isRoulette = lucky7State.selectedGame === 'roulette';
  const isBaccarat = lucky7State.selectedGame === 'baccarat';
  const roundWager = isRoulette ? getRouletteSelectedTotal() : Number(lucky7State.wager);

  if (!Number.isFinite(roundWager) || roundWager <= 0) {
    lucky7State.error = isRoulette
      ? 'Add at least one roulette bet before spinning.'
      : 'Select a valid wager before playing.';
    renderLucky7App();
    return;
  }

  if (roundWager < 1 || roundWager > 500) {
    lucky7State.error = 'Wagers must be between $1 and $500.';
    renderLucky7App();
    return;
  }

  if (isRoulette && getRouletteSelectedBets().length === 0) {
    lucky7State.error = 'Add one or more roulette bets to the slip.';
    renderLucky7App();
    return;
  }

  if (isBaccarat && !['player', 'banker', 'tie'].includes(lucky7State.baccaratSelection)) {
    lucky7State.error = 'Choose Player, Banker, or Tie before dealing.';
    renderLucky7App();
    return;
  }

  lucky7State.isBusy = true;
  lucky7State.lastResult = null;
  lucky7State.slotsAnimating = lucky7State.selectedGame === 'slots';
  lucky7State.slotsCelebrating = false;
  lucky7State.error = null;
  renderLucky7App();

  try {
    const previousRouletteSnapshot = isRoulette ? cloneRouletteSelections(lucky7State.rouletteSelections) : null;
    const payload = {
      game_type: lucky7State.selectedGame,
      wager: roundWager,
      payload: isRoulette
        ? {
            bets: getRouletteSelectedBets().map((bet) => ({
              type: normalizeRouletteBetType(bet.type),
              wager: Number(bet.wager || 0),
            })),
          }
        : isBaccarat
          ? {
              bet: lucky7State.baccaratSelection,
            }
          : {},
    };

    const { data, error } = await supabase.functions.invoke('lucky7-play', {
      body: payload,
    });

    if (error) {
      throw error;
    }

    const normalizeLucky7Response = (response) => {
      if (Array.isArray(response)) {
        return response[0] || null;
      }

      if (response && typeof response === 'object' && 'transaction' in response) {
        return response.transaction || null;
      }

      return response || null;
    };

    const result = normalizeLucky7Response(data);
    const slotReelValues = lucky7State.selectedGame === 'slots'
      ? (() => {
          const reels = Array.isArray(result?.result?.reels) ? result.result.reels.slice(0, 3) : [];
          const parsed = reels.map((value) => Number(value));
          const isValid = parsed.length === 3 && parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 9);
          return isValid ? parsed : null;
        })()
      : null;

    if (lucky7State.selectedGame === 'slots' && !slotReelValues) {
      lucky7State.lastResult = null;
      lucky7State.error = 'The casino returned an invalid slot result. Please try again.';
      lucky7State.slotsAnimating = false;
      lucky7State.slotsCelebrating = false;
      renderLucky7App();
      return;
    }

    lucky7State.lastResult = result || null;
    lucky7State.error = null;
    lucky7State.slotsAnimating = false;
    lucky7State.slotsCelebrating = Boolean(
      lucky7State.selectedGame === 'slots'
      && result?.result
      && typeof result.result === 'object'
      && result.result.summary
      && result.result.summary !== 'No match'
      && result.result.summary !== 'Missed bet'
    );
    if (isRoulette) {
      lucky7State.previousRouletteSelections = previousRouletteSnapshot || cloneRouletteSelections(lucky7State.rouletteSelections);
      lucky7State.rouletteSelections = {
        color: null,
        parity: null,
        range: null,
      };
    }
    await loadCitizenProfile();
    await loadLucky7History();
    renderLucky7App();

    if (lucky7State.slotsCelebrating) {
      window.setTimeout(() => {
        lucky7State.slotsCelebrating = false;
        renderLucky7App();
      }, 1100);
    }
  } catch (error) {
    const responseContext = error?.context;
    if (responseContext instanceof Response) {
      const responseBody = await responseContext.clone().text();
      console.error('LUCKY 7 play failed: HTTP error', {
        status: responseContext.status,
        statusText: responseContext.statusText,
        body: responseBody,
        error,
      });
    } else {
      console.error('LUCKY 7 play failed:', error);
    }
    lucky7State.slotsAnimating = false;
    lucky7State.slotsCelebrating = false;
    lucky7State.error = error?.message || 'The casino could not process your turn.';
    renderLucky7App();
  } finally {
    lucky7State.isBusy = false;
    lucky7State.slotsAnimating = false;
    renderLucky7App();
  }
}

function renderLucky7App() {
  const body = document.querySelector('#app-lucky7 .app-body');
  if (!body) {
    return;
  }

  const gameConfig = {
    slots: {
      name: 'Slots',
      description: 'Three reels. Match the machine to trigger the big payout.',
      accent: '#ffdd57',
      accentDark: '#d4a500',
    },
    roulette: {
      name: 'Roulette',
      description: 'Text roulette for the beta: combine red, black, odd, even, low, and high bets in one spin.',
      accent: '#ff7a66',
      accentDark: '#d95b3d',
    },
    baccarat: {
      name: 'Baccarat',
      description: 'Bet on Player, Banker, or Tie in a standard Punto Banco round.',
      accent: '#7ee7c8',
      accentDark: '#2fb58d',
    },
  };

  const selectedGame = gameConfig[lucky7State.selectedGame] || gameConfig.slots;
  const lastResult = lucky7State.lastResult;
  const historyRows = lucky7State.history.length
    ? lucky7State.history.slice(0, 6).map((entry) => {
        const label = `${entry.game_type.toUpperCase()} • ${formatLucky7Currency(entry.wager)}`;
        const delta = entry.net_change >= 0 ? `+${formatLucky7Currency(entry.net_change)}` : formatLucky7Currency(entry.net_change);
        const meta = entry.result && typeof entry.result === 'object' && entry.result?.summary ? entry.result.summary : 'Round complete';
        return `
          <div class="lucky7-history-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(meta)}</small>
            </div>
            <span class="${entry.net_change >= 0 ? 'positive' : 'negative'}">${escapeHtml(delta)}</span>
          </div>
        `;
      }).join('')
    : '<div class="lucky7-empty-state"><strong>No rounds yet.</strong><p>Win a few spins to fill the ledger.</p></div>';

  const lucky7SlotAssetMap = {
    0: 'assets/lucky7/slots/new%20sprites/cherry.png',
    1: 'assets/lucky7/slots/new%20sprites/lemon.png',
    2: 'assets/lucky7/slots/new%20sprites/orange.png',
    3: 'assets/lucky7/slots/new%20sprites/bell.png',
    4: 'assets/lucky7/slots/new%20sprites/grapes.png',
    5: 'assets/lucky7/slots/new%20sprites/watermelon.png',
    6: 'assets/lucky7/slots/new%20sprites/bar.png',
    7: 'assets/lucky7/slots/new%20sprites/lucky7.png',
    8: 'assets/lucky7/slots/new%20sprites/bar2.png',
    9: 'assets/lucky7/slots/new%20sprites/bar3.png',
  };

  const getLucky7SlotAsset = (value) => {
    const numericValue = Number(value);
    return lucky7SlotAssetMap[Number.isFinite(numericValue) ? numericValue : 0] || lucky7SlotAssetMap[0];
  };

  const slotSymbolCycle = [7, 9, 3, 8, 6, 1, 4, 2, 5, 0, 7, 9, 3, 8, 6, 1, 4, 2, 5, 0];
  const slotFinalReels = Array.isArray(lastResult?.result?.reels)
    ? lastResult.result.reels.slice(0, 3).map((item) => Number(item))
    : null;
  const hasValidSlotReels = Array.isArray(slotFinalReels)
    && slotFinalReels.length === 3
    && slotFinalReels.every((value) => Number.isInteger(value) && value >= 0 && value <= 9);

  const slotReelsMarkup = [0, 1, 2].map((index) => {
    if (!hasValidSlotReels) {
      return `
        <div class="lucky7-slot-reel">
          <div class="lucky7-slot-window">
            <div class="lucky7-slot-track is-stopped">
              <div class="lucky7-slot-symbol is-final"><img src="${lucky7SlotAssetMap[0]}" alt="Slot result unavailable" /></div>
            </div>
          </div>
        </div>
      `;
    }

    const finalValue = slotFinalReels[index];
    const finalAsset = getLucky7SlotAsset(finalValue);
    const reelTrack = lucky7State.slotsAnimating
      ? [...slotSymbolCycle, ...slotSymbolCycle].map((symbolValue) => {
          const assetPath = getLucky7SlotAsset(symbolValue);
          return `<div class="lucky7-slot-symbol"><img src="${assetPath}" alt="Lucky 7 slot symbol" /></div>`;
        }).join('')
      : `<div class="lucky7-slot-symbol is-final"><img src="${finalAsset}" alt="Lucky 7 final symbol" /></div>`;

    return `
      <div class="lucky7-slot-reel">
        <div class="lucky7-slot-window">
          <div class="lucky7-slot-track ${lucky7State.slotsAnimating ? 'is-spinning' : 'is-stopped'}" style="--reel-duration:${(2.1 + index * 0.5).toFixed(2)}s; --reel-delay:${(0.2 + index * 0.18).toFixed(2)}s;">
            ${reelTrack}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const rouletteCategoryConfig = getRouletteCategoryConfig();
  const rouletteChipOptions = lucky7BetDenominations;
  const rouletteSelectionRows = Object.entries(rouletteCategoryConfig).map(([category, config]) => {
    const currentSelection = lucky7State.rouletteSelections[category];
    const rowButtons = config.options.map((option) => {
      const isSelected = currentSelection && currentSelection.type === option;
      const displayLabel = getRouletteSelectionLabel(option);
      return `
        <button
          type="button"
          class="lucky7-roulette-option ${isSelected ? 'selected' : ''}"
          data-lucky7-roulette-category="${category}"
          data-lucky7-roulette-option="${option}"
        >
          <span>${escapeHtml(displayLabel)}</span>
          <small>${isSelected ? formatLucky7Currency(Number(currentSelection.wager || 0)) : 'Select'}</small>
        </button>
      `;
    }).join('');

    return `
      <div class="lucky7-roulette-row">
        <div class="lucky7-roulette-label">${escapeHtml(config.label)}</div>
        <div class="lucky7-roulette-option-row">
          ${rowButtons}
        </div>
      </div>
    `;
  }).join('');

  const rouletteSelectedBets = getRouletteSelectedBets();
  const rouletteTotalWager = getRouletteSelectedTotal();
  const rouletteSlipRows = rouletteSelectedBets.length
    ? rouletteSelectedBets.map((bet) => `
      <div class="lucky7-slip-row">
        <div>
          <strong>${escapeHtml(getRouletteSelectionLabel(bet.type))}</strong>
          <span>${formatLucky7Currency(Number(bet.wager || 0))}</span>
        </div>
        <div class="lucky7-slip-bet-controls">
          <button type="button" class="lucky7-slip-bet-button" data-lucky7-adjust-bet="decrease" data-lucky7-adjust-category="${bet.category}">−</button>
          <button type="button" class="lucky7-slip-bet-button" data-lucky7-adjust-bet="increase" data-lucky7-adjust-category="${bet.category}">+</button>
        </div>
      </div>
    `).join('')
    : '<div class="lucky7-empty-state"><strong>No bets yet.</strong><p>Select one option from any row to build a round.</p></div>';

  const rouletteMarkup = lucky7State.selectedGame === 'roulette'
    ? `
      <div class="lucky7-roulette-editor">
        <div class="lucky7-chip-row">
          ${rouletteChipOptions.map((chip) => `
            <button type="button" class="lucky7-chip ${Number(lucky7State.rouletteSelectedChip) === Number(chip) ? 'selected' : ''}" data-lucky7-chip="${chip}">${formatLucky7Currency(chip)}</button>
          `).join('')}
        </div>

        <div class="lucky7-roulette-grid">
          ${rouletteSelectionRows}
        </div>

        <div class="lucky7-slip-actions">
          <button type="button" class="lucky7-secondary-button" data-lucky7-clear-bets>Clear bets</button>
        </div>

        <div class="lucky7-roulette-slip">
          <div class="lucky7-slip-header">
            <span>Betting slip</span>
            <strong>${formatLucky7Currency(rouletteTotalWager)}</strong>
          </div>
          <div class="lucky7-slip-list">
            ${rouletteSlipRows}
          </div>
          <div class="lucky7-slip-footer">
            <span>Total wager</span>
            <strong>${formatLucky7Currency(rouletteTotalWager)}</strong>
          </div>
          <div class="lucky7-slip-actions">
            <button type="button" class="lucky7-secondary-button" data-lucky7-repeat-bets>Repeat previous</button>
            <button type="button" class="lucky7-secondary-button" data-lucky7-double-bets>Double previous</button>
          </div>
        </div>
      </div>
    `
    : '';

  const slotsDisplayMarkup = lucky7State.selectedGame === 'slots'
    ? `
      <div class="lucky7-slot-machine ${lucky7State.slotsCelebrating ? 'celebrating' : ''}">
        <div class="lucky7-slot-header">
          <span>Spin</span>
          <strong>${lucky7State.slotsAnimating ? 'Rolling…' : (lastResult?.result?.summary || 'Ready')}</strong>
        </div>
        <div class="lucky7-slot-reel-bank">
          ${slotReelsMarkup}
        </div>
        <div class="lucky7-slot-summary">
          <div>
            <span>Wager</span>
            <strong>${formatLucky7Currency(Number(lucky7State.wager) || 0)}</strong>
          </div>
          <div>
            <span>Payout</span>
            <strong>${formatLucky7Currency(Number(lastResult?.payout) || 0)}</strong>
          </div>
        </div>
      </div>
    `
    : '';

  const baccaratCardAssetBase = 'assets/lucky%207/baccarat/PNG/Cards%20(large)';
  const baccaratBackAsset = `${baccaratCardAssetBase}/card_back.png`;
  const getBaccaratCardAsset = (card) => {
    if (!card || typeof card !== 'object') {
      return baccaratBackAsset;
    }
    const suit = typeof card.suit === 'string' ? card.suit.trim().toLowerCase() : 'hearts';
    const rank = typeof card.rank === 'string' ? card.rank.trim() : String(card.rank ?? 'A');
    const normalizedSuit = suit === 'diamonds' || suit === 'hearts' || suit === 'clubs' || suit === 'spades' ? suit : 'hearts';
    const normalizedRank = rank === '1' ? 'A' : rank === '11' ? 'J' : rank === '12' ? 'Q' : rank === '13' ? 'K' : rank === '10' ? '10' : rank.length === 1 && Number.isFinite(Number(rank)) ? String(rank).padStart(2, '0') : rank.toUpperCase();
    return `${baccaratCardAssetBase}/card_${normalizedSuit}_${normalizedRank}.png`;
  };

  const baccaratBetKeys = ['player', 'banker', 'tie'];
  const baccaratCardMarkup = (hand, reveal = true) => {
    const cards = Array.isArray(hand) ? hand.filter((card) => card !== null && card !== undefined) : [];
    if (!cards.length && reveal) {
      return '<div class="lucky7-baccarat-empty">No cards dealt.</div>';
    }
    const visibleCards = cards.length ? cards : [null, null];
    return visibleCards.map((card, index) => {
      const safeCard = reveal && card ? card : { suit: 'back', rank: 'back' };
      const imageSrc = reveal && card ? getBaccaratCardAsset(card) : baccaratBackAsset;
      const alt = reveal && card ? `${card.rank || ''} of ${card.suit || ''}` : 'Hidden baccarat card';
      return `<img class="lucky7-baccarat-card ${reveal && card ? 'revealed' : 'hidden'}" src="${imageSrc}" alt="${escapeHtml(alt)}" style="animation-delay:${index * 90}ms;" />`;
    }).join('');
  };

  const baccaratRoundResult = lastResult && lucky7State.selectedGame === 'baccarat' ? lastResult.result || {} : null;
  const baccaratPlayerHand = Array.isArray(baccaratRoundResult?.player_cards) ? baccaratRoundResult.player_cards : [];
  const baccaratBankerHand = Array.isArray(baccaratRoundResult?.banker_cards) ? baccaratRoundResult.banker_cards : [];
  const baccaratMarkup = lucky7State.selectedGame === 'baccarat' ? `
    <div class="lucky7-baccarat-bet-row">
      ${baccaratBetKeys.map((bet) => `
        <button type="button" class="lucky7-baccarat-bet ${lucky7State.baccaratSelection === bet ? 'selected' : ''}" data-lucky7-baccarat-bet="${bet}">${bet === 'player' ? 'Player' : bet === 'banker' ? 'Banker' : 'Tie'}</button>
      `).join('')}
    </div>
    <div class="lucky7-baccarat-table">
      <div class="lucky7-baccarat-hand">
        <div class="lucky7-baccarat-label">Player</div>
        <div class="lucky7-baccarat-cards">
          ${baccaratCardMarkup(baccaratPlayerHand.length ? baccaratPlayerHand : [null, null], Boolean(baccaratPlayerHand.length))}
        </div>
        <div class="lucky7-baccarat-total">Total: <strong>${Number(baccaratRoundResult?.player_total ?? 0)}</strong></div>
      </div>
      <div class="lucky7-baccarat-hand">
        <div class="lucky7-baccarat-label">Banker</div>
        <div class="lucky7-baccarat-cards">
          ${baccaratCardMarkup(baccaratBankerHand.length ? baccaratBankerHand : [null, null], Boolean(baccaratBankerHand.length))}
        </div>
        <div class="lucky7-baccarat-total">Total: <strong>${Number(baccaratRoundResult?.banker_total ?? 0)}</strong></div>
      </div>
    </div>
  ` : '';

  const gameContentMarkup = [
    lucky7State.selectedGame !== 'roulette' ? `
      <div class="lucky7-wager-row">
        ${lucky7BetDenominations.map((amount) => `
          <button type="button" class="lucky7-wager ${Number(lucky7State.wager) === Number(amount) ? 'selected' : ''}" data-lucky7-wager="${amount}">${formatLucky7Currency(amount)}</button>
        `).join('')}
      </div>
    ` : '',
    slotsDisplayMarkup,
    rouletteMarkup,
    baccaratMarkup,
  ].filter(Boolean).join('');

  const rouletteResultBetMarkup = lucky7State.selectedGame === 'roulette' && Array.isArray(lastResult?.result?.bets)
    ? lastResult.result.bets.map((bet) => `
        <div class="lucky7-bet-result-row ${bet.won ? 'win' : 'loss'}">
          <div>
            <strong>${escapeHtml(getRouletteSelectionLabel(bet.type || bet.label || 'Bet'))}</strong>
            <span>${escapeHtml(bet.won ? 'Win' : 'Loss')}</span>
          </div>
          <div class="lucky7-bet-result-amount">
            <span>${formatLucky7Currency(Number(bet.wager || 0))}</span>
            <strong>${formatLucky7Currency(Number(bet.payout || 0))}</strong>
          </div>
        </div>
      `).join('')
    : '';

  const resultBoxMarkup = lucky7State.selectedGame !== 'slots'
    ? (lastResult
      ? (lucky7State.selectedGame === 'roulette'
        ? `
          <div class="lucky7-result-panel">
            <div class="lucky7-result-header">
              <span>Roulette</span>
              <strong>${escapeHtml(lastResult.result?.summary || 'Round complete')}</strong>
            </div>
            <div class="lucky7-roulette-result-card">
              <div class="lucky7-roulette-number">${Number(lastResult.result?.spin ?? 0)}</div>
              <div class="lucky7-roulette-meta">
                <div><span>Color</span><strong>${escapeHtml(lastResult.result?.color || 'GREEN')}</strong></div>
                <div><span>Parity</span><strong>${escapeHtml(lastResult.result?.is_even ? 'EVEN' : lastResult.result?.is_odd ? 'ODD' : 'GREEN')}</strong></div>
                <div><span>Range</span><strong>${escapeHtml(lastResult.result?.is_low ? 'LOW (1–18)' : lastResult.result?.is_high ? 'HIGH (19–36)' : 'GREEN')}</strong></div>
              </div>
            </div>
            <div class="lucky7-result-grid">
              <div><span>Wager</span><strong>${formatLucky7Currency(Number(lastResult.wager || lucky7State.wager))}</strong></div>
              <div><span>Payout</span><strong>${formatLucky7Currency(Number(lastResult.payout || lastResult.result?.total_payout || 0))}</strong></div>
              <div><span>Net</span><strong>${formatLucky7Currency(Number(lastResult.net_change || 0))}</strong></div>
              <div><span>Balance</span><strong>${formatLucky7Currency(Number(lastResult.balance_after || player.balance))}</strong></div>
            </div>
            <div class="lucky7-slot-summary">
              <div>
                <span>Each bet</span>
                <strong>${Array.isArray(lastResult.result?.bets) ? lastResult.result.bets.length : 0}</strong>
              </div>
              <div>
                <span>Total payout</span>
                <strong>${formatLucky7Currency(Number(lastResult.result?.total_payout || 0))}</strong>
              </div>
            </div>
            <div class="lucky7-bet-result-list">
              ${rouletteResultBetMarkup || '<div class="lucky7-empty-state"><strong>No bet outcomes.</strong><p>The round result is displayed above.</p></div>'}
            </div>
          </div>
        `
        : lucky7State.selectedGame === 'baccarat'
          ? `
            <div class="lucky7-result-panel">
              <div class="lucky7-result-header">
                <span>Baccarat</span>
                <strong>${escapeHtml(lastResult.result?.summary || 'Round complete')}</strong>
              </div>
              <div class="lucky7-result-grid">
                <div><span>Bet</span><strong>${escapeHtml((lastResult.result?.bet || lucky7State.baccaratSelection || 'Player').toString().replace(/\b\w/g, (char) => char.toUpperCase()))}</strong></div>
                <div><span>Winner</span><strong>${escapeHtml((lastResult.result?.winner || 'player').toString().replace(/\b\w/g, (char) => char.toUpperCase()))}</strong></div>
                <div><span>Wager</span><strong>${formatLucky7Currency(Number(lastResult.wager || lucky7State.wager))}</strong></div>
                <div><span>Payout</span><strong>${formatLucky7Currency(Number(lastResult.payout || 0))}</strong></div>
                <div><span>Net</span><strong>${formatLucky7Currency(Number(lastResult.net_change || 0))}</strong></div>
                <div><span>Balance</span><strong>${formatLucky7Currency(Number(lastResult.balance_after || player.balance))}</strong></div>
              </div>
            </div>
          `
          : `
            <div class="lucky7-result-panel">
              <div class="lucky7-result-header">
                <span>${escapeHtml(lastResult.game_type || selectedGame.name)}</span>
                <strong>${escapeHtml(lastResult.result?.summary || 'Round complete')}</strong>
              </div>
              <div class="lucky7-result-grid">
                <div><span>Wager</span><strong>${formatLucky7Currency(Number(lastResult.wager || lucky7State.wager))}</strong></div>
                <div><span>Payout</span><strong>${formatLucky7Currency(Number(lastResult.payout || 0))}</strong></div>
                <div><span>Net</span><strong>${formatLucky7Currency(Number(lastResult.net_change || 0))}</strong></div>
                <div><span>Balance</span><strong>${formatLucky7Currency(Number(lastResult.balance_after || player.balance))}</strong></div>
              </div>
            </div>
          `)
      : '<div class="lucky7-empty-state"><strong>Ready to play.</strong><p>Choose a wager and spin to see the round result.</p></div>')
    : '';

  body.innerHTML = `
    <div class="lucky7-shell">
      <div class="lucky7-topbar">
        <div>
          <div class="section-kicker">Casino</div>
          <h3>LUCKY 7</h3>
        </div>
        <div class="lucky7-wallet-chip">
          <span>Balance</span>
          <strong>${formatLucky7Currency(profileState.private?.balance ?? 0)}</strong>
        </div>
      </div>

      <div class="lucky7-tabs">
        ${['slots', 'roulette', 'baccarat'].map((gameId) => `
          <button type="button" class="lucky7-tab ${lucky7State.selectedGame === gameId ? 'selected' : ''}" data-lucky7-game="${gameId}">${escapeHtml(gameConfig[gameId].name)}</button>
        `).join('')}
      </div>

      <div class="lucky7-panel">
        <div class="lucky7-panel-head">
          <div>
            <h4>${escapeHtml(selectedGame.name)}</h4>
          </div>
        </div>

        <div class="lucky7-panel-body">
          ${gameContentMarkup}

          <div class="lucky7-control-row">
            <button type="button" class="lucky7-play-button" data-lucky7-play ${lucky7State.isBusy ? 'disabled' : ''}>
              ${lucky7State.isBusy ? 'Processing…' : 'Play now'}
            </button>
            <div class="lucky7-inline-balance">Current balance: <strong>${formatLucky7Currency(profileState.private?.balance ?? 0)}</strong></div>
          </div>

          ${resultBoxMarkup}
          ${lucky7State.error ? `<div class="lucky7-alert error">${escapeHtml(lucky7State.error)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  body.querySelectorAll('[data-lucky7-game]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextGame = button.dataset.lucky7Game;
      if (!nextGame) {
        return;
      }
      lucky7State.selectedGame = nextGame;
      renderLucky7App();
    });
  });

  body.querySelectorAll('[data-lucky7-wager]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = Number(button.dataset.lucky7Wager || 0);
      if (!Number.isFinite(value)) {
        return;
      }
      lucky7State.wager = value;
      renderLucky7App();
    });
  });

  body.querySelectorAll('[data-lucky7-baccarat-bet]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextChoice = button.dataset.lucky7BaccaratBet;
      if (!nextChoice) {
        return;
      }
      lucky7State.baccaratSelection = nextChoice;
      renderLucky7App();
    });
  });

  body.querySelectorAll('[data-lucky7-roulette-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.lucky7RouletteCategory;
      const option = button.dataset.lucky7RouletteOption;
      if (!category || !option) {
        return;
      }

      const previous = lucky7State.rouletteSelections[category];
      const selectedChipAmount = Number(lucky7State.rouletteSelectedChip || 5);

      if (previous && previous.type === option) {
        lucky7State.rouletteSelections[category] = null;
      } else {
        lucky7State.rouletteSelections[category] = {
          type: option,
          wager: Number(previous?.wager && previous.type !== option ? previous.wager : selectedChipAmount || 5),
        };
      }
      renderLucky7App();
    });
  });

  body.querySelectorAll('[data-lucky7-chip]').forEach((button) => {
    button.addEventListener('click', () => {
      const chipValue = Number(button.dataset.lucky7Chip || 0);
      if (!Number.isFinite(chipValue) || chipValue <= 0) {
        return;
      }
      lucky7State.rouletteSelectedChip = chipValue;
      renderLucky7App();
    });
  });

  body.querySelectorAll('[data-lucky7-adjust-bet]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.lucky7AdjustCategory;
      const action = button.dataset.lucky7AdjustBet;
      if (!category || !action) {
        return;
      }
      const selection = lucky7State.rouletteSelections[category];
      if (!selection) {
        return;
      }

      const delta = Number(lucky7State.rouletteSelectedChip || 1);
      if (action === 'increase') {
        selection.wager += delta;
      } else if (action === 'decrease') {
        selection.wager -= delta;
        if (selection.wager <= 0) {
          lucky7State.rouletteSelections[category] = null;
        }
      }
      renderLucky7App();
    });
  });

  const clearBetsButton = body.querySelector('[data-lucky7-clear-bets]');
  if (clearBetsButton) {
    clearBetsButton.addEventListener('click', () => {
      lucky7State.rouletteSelections = {
        color: null,
        parity: null,
        range: null,
      };
      renderLucky7App();
    });
  }

  const repeatBetsButton = body.querySelector('[data-lucky7-repeat-bets]');
  if (repeatBetsButton) {
    repeatBetsButton.addEventListener('click', () => {
      lucky7State.rouletteSelections = cloneRouletteSelections(lucky7State.previousRouletteSelections);
      renderLucky7App();
    });
  }

  const doubleBetsButton = body.querySelector('[data-lucky7-double-bets]');
  if (doubleBetsButton) {
    doubleBetsButton.addEventListener('click', () => {
      const source = getRouletteSelectedBets(lucky7State.previousRouletteSelections).length
        ? lucky7State.previousRouletteSelections
        : lucky7State.rouletteSelections;
      const doubled = cloneRouletteSelections(source);
      Object.keys(doubled).forEach((category) => {
        if (doubled[category]) {
          doubled[category].wager = Number(doubled[category].wager || 0) * 2;
        }
      });
      lucky7State.rouletteSelections = doubled;
      renderLucky7App();
    });
  }

  const playButton = body.querySelector('[data-lucky7-play]');
  if (playButton) {
    playButton.addEventListener('click', () => {
      playLucky7Round();
    });
  }
}

async function loadVotingData() {
  const supabase = getAuthClient();
  const session = (await supabase?.auth.getSession?.())?.data?.session;

  if (!supabase || !session?.user) {
    votingState.ownerAccess = false;
    votingState.ownerError = 'Sign in to access the Voting Booth.';
    votingState.ownerMessage = null;
    votingState.loading = false;
    votingState.error = 'You must be signed in before voting.';
    return;
  }

  votingState.loading = true;
  votingState.error = null;
  votingState.ownerError = null;
  votingState.ownerMessage = null;

  try {
    const { data: ownerCheckData, error: ownerCheckError } = await supabase.rpc('owner_balance_self_check');
    if (ownerCheckError) {
      throw ownerCheckError;
    }

    const ownerPayload = Array.isArray(ownerCheckData) ? ownerCheckData[0] : ownerCheckData;
    votingState.ownerAccess = Boolean(ownerPayload?.is_owner);

    if (votingState.ownerAccess) {
      const { data: ownerPolls, error: ownerPollsError } = await supabase.rpc('owner_get_polls');
      if (ownerPollsError) {
        throw ownerPollsError;
      }
      votingState.polls = Array.isArray(ownerPolls) ? ownerPolls : [];
    }

    const { data: citizenPolls, error: citizenPollsError } = await supabase.rpc('get_open_polls_for_citizen');
    if (citizenPollsError) {
      throw citizenPollsError;
    }
    votingState.citizenPolls = Array.isArray(citizenPolls) ? citizenPolls : [];

    const { data: closedPolls, error: closedPollsError } = await supabase.rpc('get_closed_polls_for_citizen');
    if (closedPollsError) {
      throw closedPollsError;
    }
    votingState.closedPolls = Array.isArray(closedPolls) ? closedPolls : [];
  } catch (error) {
    console.error('Voting booth load failed:', error);
    votingState.error = error?.message || 'Unable to load the voting booth right now.';
    votingState.polls = [];
    votingState.citizenPolls = [];
    votingState.closedPolls = [];
  } finally {
    votingState.loading = false;
    const votingWindow = document.getElementById('app-voting');
    if (votingWindow) {
      renderVotingApp();
    }
  }
}

function renderVotingApp() {
  const appWindow = ensureAppWindow('voting');
  const body = appWindow.querySelector('.app-body');
  if (!body) {
    return;
  }

  const citizenPanel = `
    <div class="moneytree-panel" style="margin-top: ${votingState.ownerAccess ? '24px' : '0'};">
      <div class="moneytree-panel-header">
        <div>
          <div class="section-kicker">${votingState.ownerAccess ? 'Citizen preview' : 'Citizen view'}</div>
          <h4>Open polls</h4>
        </div>
        <button type="button" class="secondary-button" data-action="refresh-voting-data">Refresh</button>
      </div>

      ${votingState.loading ? '<div class="moneytree-empty-state"><strong>Loading polls…</strong><p>Checking current ballot availability.</p></div>' : ''}
      ${votingState.error ? `<div class="moneytree-discussion-message error">${escapeHtml(votingState.error)}</div>` : ''}
      ${votingState.citizenPolls.length ? votingState.citizenPolls.map((poll) => {
        const optionButtons = Array.isArray(poll.options) ? poll.options : [];
        const hasVoted = Boolean(poll.user_has_voted);
        const canVote = Boolean(poll.is_eligible) && !hasVoted;

        return `
          <article class="voting-poll-card">
            <div class="voting-poll-header">
              <div>
                <h5 class="voting-poll-title">${escapeHtml(poll.question || 'Ballot')}</h5>
                <div class="voting-poll-meta">${poll.required_diploma ? 'Requires diploma' : 'Open to all citizens'} • ${hasVoted ? 'Vote locked in' : canVote ? 'Open for voting' : 'Not eligible'}</div>
              </div>
              <span class="voting-status-pill">${hasVoted ? 'Voted' : canVote ? 'Live' : 'Closed'}</span>
            </div>

            ${poll.description ? `
              <div class="moneytree-review-content">
                <p>${escapeHtml(poll.description)}</p>
              </div>
            ` : ''}

            <div class="voting-option-row">
              ${optionButtons.length ? optionButtons.map((option) => `
                <button
                  type="button"
                  class="voting-option-button ${poll.my_vote_option_id === option.id ? 'selected' : ''}"
                  data-action="vote-on-poll"
                  data-poll-id="${escapeHtml(poll.poll_id || poll.id || '')}"
                  data-option-id="${escapeHtml(option.id)}"
                  ${!canVote ? 'disabled' : ''}
                >
                  ${escapeHtml(option.option_text || 'Choice')}
                </button>
              `).join('') : '<div class="moneytree-empty-state"><strong>No options are available.</strong></div>'}
            </div>
          </article>
        `;
      }).join('') : '<div class="moneytree-empty-state"><strong>No open ballots right now.</strong><p>Check back when the owner opens a new poll.</p></div>'}
    </div>
  `;

  body.innerHTML = `
    <div class="voting-booth-shell">
      <div class="voting-booth-titlebar">
        <div>
          <h3>Voting Booth</h3>
        </div>
      </div>

      ${votingState.loading ? '<div class="voting-booth-card"><div class="moneytree-empty-state"><strong>Loading ballots…</strong><p>Checking the current voting schedule and eligibility.</p></div></div>' : ''}

      ${citizenPanel}

      <div class="voting-booth-card">
        <div class="voting-booth-header">
          <div>
            <div class="section-kicker">Citizen results</div>
            <h4>Closed ballots</h4>
          </div>
        </div>

        ${votingState.closedPolls.length ? votingState.closedPolls.map((poll) => {
          const options = Array.isArray(poll.options) ? poll.options : [];
          const winnerText = poll.winner_text ? `${escapeHtml(poll.winner_text)} (${Number(poll.winner_percent || 0).toFixed(1)}%)` : 'No winner yet';
          return `
            <article class="voting-poll-card">
              <div class="voting-poll-header">
                <div>
                  <h5 class="voting-poll-title">${escapeHtml(poll.question || 'Closed ballot')}</h5>
                  <div class="voting-poll-meta">Final result • ${poll.required_diploma ? 'Diploma required' : 'Open to all citizens'}</div>
                </div>
                <span class="voting-status-pill">Closed</span>
              </div>

              <div class="voting-stat-grid">
                <div class="voting-stat-item"><span>Winner</span><strong>${winnerText}</strong></div>
                <div class="voting-stat-item"><span>Turnout</span><strong>${Number(poll.turnout ?? 0).toFixed(2)}%</strong></div>
                <div class="voting-stat-item"><span>Total votes</span><strong>${Number(poll.total_votes ?? 0)}</strong></div>
                <div class="voting-stat-item"><span>Eligible</span><strong>${Number(poll.total_eligible ?? 0)}</strong></div>
              </div>

              <div class="moneytree-review-content">
                ${options.length ? options.map((option) => `
                  <div class="voting-stat-item" style="margin-top:8px;"><span>${escapeHtml(option.option_text || 'Option')}</span><strong>${Number(option.vote_count ?? 0)} votes • ${Number(option.percent ?? 0).toFixed(1)}%</strong></div>
                `).join('') : '<p>No result details are available.</p>'}
              </div>
            </article>
          `;
        }).join('') : '<div class="moneytree-empty-state"><strong>No closed ballots yet.</strong><p>Results will appear here once an owner closes a poll.</p></div>'}
      </div>
    </div>
  `;

  const refreshButton = body.querySelector('[data-action="refresh-voting-data"]');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      loadVotingData();
    });
  }

  const voteButtons = body.querySelectorAll('[data-action="vote-on-poll"]');
  voteButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const pollId = button.dataset.pollId;
      const optionId = button.dataset.optionId;
      if (!pollId || !optionId) {
        return;
      }

      const supabase = getAuthClient();
      if (!supabase) {
        return;
      }

      try {
        votingState.ownerError = null;
        votingState.ownerMessage = null;
        const { data, error } = await supabase.rpc('submit_poll_vote', {
          p_poll_id: pollId,
          p_option_id: optionId,
        });
        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : data;
        if (result?.result === 'voted') {
          await loadVotingData();
        } else {
          await loadVotingData();
        }
      } catch (error) {
        console.error('Vote submission failed:', error);
        votingState.error = error?.message || 'Unable to submit your vote.';
        renderVotingApp();
      }
    });
  });
}

async function loadCareerPathInventory(citizenId, supabase = getAuthClient()) {
  if (!supabase || !citizenId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('citizen_inventory')
      .select('item_name, quantity, is_active')
      .eq('citizen_id', citizenId)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Career path inventory load failed:', error);
    return [];
  }
}

function buildCareerPathTreeData(privateRecord = {}, inventoryItems = []) {
  const education = String(privateRecord.education || '').trim();
  const profession = String(privateRecord.profession || '').trim();
  const inventoryNames = inventoryItems
    .map((item) => String(item?.item_name || item?.name || item?.product_name || '').trim())
    .filter(Boolean)
    .map((name) => name.toLowerCase());

  const hasDiploma = /high school diploma/i.test(education);
  const hasLaptop = inventoryNames.some((name) => /laptop/i.test(name));
  const hasCriminalHandbook = inventoryNames.some((name) => /criminal handbook/i.test(name));
  const hasPoliticianRole = /politician|senator|assembly|campaign|mayor|council/i.test(profession);
  const hasPublicRole = /public servant|civil servant|bureaucrat|government|administration/i.test(profession);
  const hasCriminalRole = /criminal|smuggler|gangster|mob|bootlegger/i.test(profession);

  const currentPath = hasPoliticianRole
    ? 'Politician'
    : hasPublicRole
      ? 'Public Servant'
      : hasCriminalRole
        ? 'Criminal'
        : 'Citizen';

  const progressRows = [
    {
      label: 'Politician Path',
      percent: hasDiploma ? 100 : 18,
      color: '#34f29b',
      value: hasDiploma ? '1 / 6' : '0 / 6',
      labelText: hasDiploma ? 'Unlocked' : 'Locked',
    },
    {
      label: 'Public Servant Path',
      percent: hasDiploma ? 100 : 18,
      color: '#39d0ff',
      value: hasDiploma ? '1 / 6' : '0 / 6',
      labelText: hasDiploma ? 'Unlocked' : 'Locked',
    },
    {
      label: 'Criminal Path',
      percent: hasDiploma ? 100 : 18,
      color: '#ff5a78',
      value: hasDiploma ? '1 / 6' : '0 / 6',
      labelText: hasDiploma ? 'Unlocked' : 'Locked',
    },
  ];

  return {
    hasDiploma,
    hasLaptop,
    hasCriminalHandbook,
    currentPath,
    currentPathLabel: currentPath === 'Citizen' ? 'In Progress' : 'Current Path',
    currentPathDetail: currentPath === 'Citizen'
      ? 'You\'ve completed your HS Diploma. Keep meeting requirements to unlock your path.'
      : `You\'re currently aligned with the ${currentPath} path. Keep meeting requirements to advance.`,
    progressRows,
  };
}

function getCareerPathTreeLayout(mode = 'desktop') {
  if (mode === 'mobile') {
    return {
      width: 430,
      height: 850,
      headings: [
        { id: 'politicianHeading', x: 82, y: 88, label: 'Politician', color: '#83f0bd' },
        { id: 'publicHeading', x: 215, y: 88, label: 'Public Servant', color: '#86c9ff' },
        { id: 'criminalHeading', x: 348, y: 88, label: 'Criminal', color: '#ff8397' },
      ],
      nodes: [
        { id: 'citizen', x: 215, y: 760, radius: 34, label: 'Citizen', status: 'available' },
        { id: 'diploma', x: 215, y: 610, radius: 30, label: 'HS Diploma', status: 'locked' },
        { id: 'politicianFuture1', x: 82, y: 190, radius: 19, label: '?', status: 'unknown' },
        { id: 'politicianFuture2', x: 82, y: 286, radius: 19, label: '?', status: 'unknown' },
        { id: 'politicianReq', x: 82, y: 420, radius: 25, label: 'Laptop', status: 'locked' },
        { id: 'publicFuture1', x: 215, y: 190, radius: 19, label: '?', status: 'unknown' },
        { id: 'publicFuture2', x: 215, y: 286, radius: 19, label: '?', status: 'unknown' },
        { id: 'publicReq', x: 215, y: 420, radius: 25, label: 'Laptop', status: 'locked' },
        { id: 'criminalFuture1', x: 348, y: 190, radius: 19, label: '?', status: 'unknown' },
        { id: 'criminalFuture2', x: 348, y: 286, radius: 19, label: '?', status: 'unknown' },
        { id: 'criminalReq', x: 348, y: 420, radius: 25, label: 'Criminal Handbook', status: 'locked' },
      ],
      connectors: [
        { from: 'citizen', to: 'diploma', color: '#f2d264' },
        { from: 'diploma', to: 'politicianReq', color: '#7ae9b6' },
        { from: 'diploma', to: 'publicReq', color: '#7fbefb' },
        { from: 'diploma', to: 'criminalReq', color: '#ff7a8f' },
        { from: 'politicianReq', to: 'politicianFuture1', color: '#7ae9b6' },
        { from: 'politicianFuture1', to: 'politicianFuture2', color: '#7ae9b6' },
        { from: 'publicReq', to: 'publicFuture1', color: '#7fbefb' },
        { from: 'publicFuture1', to: 'publicFuture2', color: '#7fbefb' },
        { from: 'criminalReq', to: 'criminalFuture1', color: '#ff7a8f' },
        { from: 'criminalFuture1', to: 'criminalFuture2', color: '#ff7a8f' },
      ],
    };
  }

  return {
    width: 760,
    height: 880,
    headings: [
      { id: 'politicianHeading', x: 150, y: 95, label: 'Politician', color: '#83f0bd' },
      { id: 'publicHeading', x: 380, y: 95, label: 'Public Servant', color: '#86c9ff' },
      { id: 'criminalHeading', x: 610, y: 95, label: 'Criminal', color: '#ff8397' },
    ],
    nodes: [
      { id: 'citizen', x: 380, y: 795, radius: 38, label: 'Citizen', status: 'available' },
      { id: 'diploma', x: 380, y: 630, radius: 32, label: 'HS Diploma', status: 'locked' },
      { id: 'politicianFuture1', x: 150, y: 205, radius: 22, label: '?', status: 'unknown' },
      { id: 'politicianFuture2', x: 150, y: 320, radius: 22, label: '?', status: 'unknown' },
      { id: 'politicianReq', x: 150, y: 475, radius: 28, label: 'Laptop', status: 'locked' },
      { id: 'publicFuture1', x: 380, y: 205, radius: 22, label: '?', status: 'unknown' },
      { id: 'publicFuture2', x: 380, y: 320, radius: 22, label: '?', status: 'unknown' },
      { id: 'publicReq', x: 380, y: 475, radius: 28, label: 'Laptop', status: 'locked' },
      { id: 'criminalFuture1', x: 610, y: 205, radius: 22, label: '?', status: 'unknown' },
      { id: 'criminalFuture2', x: 610, y: 320, radius: 22, label: '?', status: 'unknown' },
      { id: 'criminalReq', x: 610, y: 475, radius: 28, label: 'Criminal Handbook', status: 'locked' },
    ],
    connectors: [
      { from: 'citizen', to: 'diploma', color: '#f2d264' },
      { from: 'diploma', to: 'politicianReq', color: '#7ae9b6' },
      { from: 'diploma', to: 'publicReq', color: '#7fbefb' },
      { from: 'diploma', to: 'criminalReq', color: '#ff7a8f' },
      { from: 'politicianReq', to: 'politicianFuture1', color: '#7ae9b6' },
      { from: 'politicianFuture1', to: 'politicianFuture2', color: '#7ae9b6' },
      { from: 'publicReq', to: 'publicFuture1', color: '#7fbefb' },
      { from: 'publicFuture1', to: 'publicFuture2', color: '#7fbefb' },
      { from: 'criminalReq', to: 'criminalFuture1', color: '#ff7a8f' },
      { from: 'criminalFuture1', to: 'criminalFuture2', color: '#ff7a8f' },
    ],
  };
}

function renderCareerPathTreeMarkup(privateRecord = {}, inventoryItems = []) {
  const state = buildCareerPathTreeData(privateRecord, inventoryItems);
  const layoutMode = window.innerWidth <= 560 ? 'mobile' : 'desktop';
  const layout = getCareerPathTreeLayout(layoutMode);

  const nodeMap = new Map(layout.nodes.map((node) => {
    let status = 'locked';
    if (node.id === 'citizen') {
      status = 'available';
    } else if (node.id === 'diploma') {
      status = state.hasDiploma ? 'completed' : 'locked';
    } else if (node.id === 'politicianReq' || node.id === 'publicReq') {
      status = state.hasLaptop ? 'completed' : 'locked';
    } else if (node.id === 'criminalReq') {
      status = state.hasCriminalHandbook ? 'completed' : 'locked';
    } else if (node.id.endsWith('Future1') || node.id.endsWith('Future2')) {
      status = 'unknown';
    }

    return [node.id, { ...node, status }];
  }));

  const connectorMarkup = layout.connectors.map((connector) => {
    const from = nodeMap.get(connector.from);
    const to = nodeMap.get(connector.to);
    if (!from || !to) {
      return '';
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const curve = `M ${from.x} ${from.y} Q ${from.x + dx * 0.5} ${from.y + dy * 0.5 - 20} ${to.x} ${to.y}`;
    const connectorState = from.status === 'completed'
      ? 'active'
      : 'locked';
    return `<path class="career-tree-connector status-${connectorState}" d="${curve}" stroke="${connector.color}" />`;
  }).join('');

  const headingsMarkup = layout.headings.map((heading) => `
    <text class="career-tree-heading" x="${heading.x}" y="${heading.y}" text-anchor="middle" fill="${heading.color}">${escapeHtml(heading.label)}</text>
  `).join('');

  const nodeMarkup = layout.nodes.map((node) => {
    const entry = nodeMap.get(node.id);
    if (!entry) {
      return '';
    }

    const branchClass = node.id.startsWith('politician')
      ? 'branch-politician'
      : node.id.startsWith('public')
        ? 'branch-public'
        : node.id.startsWith('criminal')
          ? 'branch-criminal'
          : node.id === 'citizen'
            ? 'branch-citizen'
            : node.id === 'diploma'
              ? 'branch-diploma'
              : '';

    const isUnknown = entry.status === 'unknown';
    const labelLines = entry.label.includes(' ') && entry.label.split(' ').length > 2
      ? entry.label.split(' ')
      : [entry.label];
    const multilineText = labelLines.length > 1
      ? labelLines.map((line, index) => `<tspan x="0" dy="${index === 0 ? 0 : 12}">${escapeHtml(line)}</tspan>`).join('')
      : `<tspan x="0" dy="0">${escapeHtml(entry.label)}</tspan>`;

    const qMarkMarkup = isUnknown
      ? `<text x="0" y="0" class="career-node-question" text-anchor="middle" dominant-baseline="middle">?</text>`
      : '';

    const iconMarkup = node.id === 'politicianReq' || node.id === 'publicReq'
      ? `
        <g class="career-node-icon" transform="translate(-10 -18) scale(0.54)">
          <rect x="4" y="6" width="16" height="10" rx="2" fill="none" stroke="${node.id.startsWith('politician') ? '#7ae9b6' : '#7fbefb'}" stroke-width="1.6"/>
          <path d="M 7 18.5h10l2.5 2.5H4.5z" fill="none" stroke="${node.id.startsWith('politician') ? '#7ae9b6' : '#7fbefb'}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 9 9.5h6" stroke="${node.id.startsWith('politician') ? '#7ae9b6' : '#7fbefb'}" stroke-width="1.4" stroke-linecap="round"/>
        </g>
      `
      : node.id === 'criminalReq'
        ? `
          <g class="career-node-icon" transform="translate(-10 -18) scale(0.52)">
            <path d="M 7 6.5c1.2-1.2 3.2-1.9 5.1-1.9 2.4 0 4.7 1.1 5.9 3.1v10.2c-1.2-1.2-3-2-4.8-2.1-2.7-.2-5.4 1.3-6.5 3.7-.5 1.1-.7 2.3-.7 3.5H5.5c0-1.4.3-2.8.9-4.1 1.1-2.3 3.3-4 5.7-4.4-1.2-1.8-2-3.9-2-6.1z" fill="none" stroke="#ff7a8f" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M 9 8.5c2.3 0 4.3 1.2 5.2 3.1" fill="none" stroke="#ff7a8f" stroke-width="1.2" stroke-linecap="round"/>
          </g>
        `
        : node.id === 'diploma'
          ? `
            <g class="career-node-icon" transform="translate(-10 -18) scale(0.5)">
              <path d="M 4 12l8-5 8 5-8 5-8-5zm9 5v4M 10 18h4" fill="none" stroke="#f5d46d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
          `
          : node.id === 'citizen'
            ? `
              <g class="career-node-icon" transform="translate(-9 -17) scale(0.5)">
                <path d="M 5 16L 10 5l5 11-5 3z" fill="none" stroke="#6df3c8" stroke-width="1.8" stroke-linejoin="round"/>
              </g>
            `
            : '';

    const iconYOffset = iconMarkup ? 12 : 0;
    const labelMarkup = isUnknown ? '' : `<text class="career-node-label" x="0" y="${iconYOffset}" text-anchor="middle" dominant-baseline="middle">${multilineText}</text>`;

    return `
      <g class="career-node ${branchClass} status-${entry.status}" transform="translate(${entry.x} ${entry.y})">
        <circle class="career-node-aura" r="${entry.radius + 18}" />
        <path class="career-node-ring" d="M 0 -${entry.radius + 8} L ${entry.radius + 8} 0 L 0 ${entry.radius + 8} L -${entry.radius + 8} 0 Z" />
        <path class="career-node-body" d="M 0 -${entry.radius} L ${entry.radius * 0.72} -${entry.radius * 0.72} L ${entry.radius} 0 L ${entry.radius * 0.72} ${entry.radius * 0.72} L 0 ${entry.radius} L -${entry.radius * 0.72} ${entry.radius * 0.72} L -${entry.radius} 0 L -${entry.radius * 0.72} -${entry.radius * 0.72} Z" />
        <path class="career-node-notch" d="M -${entry.radius - 5} 0 H -${entry.radius + 2} M ${entry.radius - 5} 0 H ${entry.radius + 2}" />
        ${qMarkMarkup}
        ${iconMarkup}
        ${labelMarkup}
      </g>
    `;
  }).join('');

  return `
    <div class="career-tree-overlay">
      <button type="button" class="career-tree-close" data-action="career-tree-close" aria-label="Close career path">×</button>
      <div class="career-tree-scroll" aria-label="Career path viewer">
        <div class="career-tree-viewport" data-zoom="1">
          <div class="career-path-shell">
            <div class="career-path-panel">
              <svg class="career-tree-svg" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="xMidYMid meet" aria-label="Career path tree">
                <defs>
                  <filter id="careerGlow">
                    <feGaussianBlur stdDeviation="2.5" result="blur"></feGaussianBlur>
                    <feMerge>
                      <feMergeNode in="blur"></feMergeNode>
                      <feMergeNode in="SourceGraphic"></feMergeNode>
                    </feMerge>
                  </filter>
                </defs>
                <rect x="0" y="0" width="${layout.width}" height="${layout.height}" class="career-path-background" rx="28" />
                <g class="career-tree-asset-layer" aria-hidden="true">
                  <image href="assets/skill%20tree%20asset%20pack.0/svg/components/03_circuit_connector_lattice.svg" x="${layout.width * 0.12}" y="${layout.height * 0.10}" width="${layout.width * 0.76}" height="${layout.height * 0.38}" preserveAspectRatio="xMidYMid slice" />
                  <image class="career-tree-badge-decal" href="assets/skill%20tree%20asset%20pack.0/svg/components/01_branch_header_badges.svg" x="${layout.width * 0.05}" y="24" width="${layout.width * 0.26}" height="48" preserveAspectRatio="xMidYMin slice" />
                  <image class="career-tree-badge-decal" href="assets/skill%20tree%20asset%20pack.0/svg/components/01_branch_header_badges.svg" x="${layout.width * 0.37}" y="24" width="${layout.width * 0.26}" height="48" preserveAspectRatio="xMidYMin slice" />
                  <image class="career-tree-badge-decal" href="assets/skill%20tree%20asset%20pack.0/svg/components/01_branch_header_badges.svg" x="${layout.width * 0.69}" y="24" width="${layout.width * 0.26}" height="48" preserveAspectRatio="xMidYMin slice" />
                </g>
                ${connectorMarkup}
                ${headingsMarkup}
                ${nodeMarkup}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAppContent(appId, mode = 'normal') {
  const appWindow = ensureAppWindow(appId);
  const body = appWindow.querySelector('.app-body');

  if (appId === 'social') {
    renderSocialApp();
    ensureCurrentCitizenHandleStatus();
    if (!socialState.loading && socialState.activeTab) {
      loadSocialFeed(socialState.activeTab);
    }
    return;
  }

  if (appId === 'associates') {
    renderAssociatesApp();
    loadAssociatesApp();
    return;
  }

  if (appId === 'messages') {
    renderMessagesApp();
    if (!messagesState.loading) {
      loadMessagesInbox();
    }
    return;
  }

  if (appId === 'mylife') {
    if (!socialState.currentCitizenHandle) {
      void ensureCurrentCitizenHandleStatus();
    }

    const citizen = profileState.citizen || {};
    const privateRecord = profileState.private || {};
    const avatarUrl = getCitizenAvatarUrl(citizen);
    const displayName = citizen.public_name || player.name;
    const party = citizen.political_party || player.party;
    const profession = getDisplayProfession(privateRecord.profession, 'Profile unavailable');
    const socialClass = privateRecord.social_class || 'Profile unavailable';
    const education = privateRecord.education || 'Profile unavailable';
    const accountStatus = privateRecord.account_status || 'Unavailable';
    const balanceValue = privateRecord.balance !== undefined && privateRecord.balance !== null ? formatCurrency(privateRecord.balance) : 'Unavailable';
    const createdAt = citizen.created_at ? new Date(citizen.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    const citizenHandle = formatSocialHandle(socialState.currentCitizenHandle || citizen.handle || '@citizen', '@citizen');
    const privateLoadError = profileState.privateLoadError ? `<div class="mylife-alert"><span>Profile unavailable</span><p>${profileState.privateLoadError}</p></div>` : '';

    if (profileState.isEditing) {
      const options = builtInAvatarAssets
        .map((option) => {
          const selected = option.url === avatarUrl ? 'selected' : '';
          return `
            <button type="button" class="avatar-option ${selected}" data-avatar-url="${option.url}">
              <img src="${option.url}" alt="${option.label}" />
              <span>${option.label}</span>
            </button>
          `;
        })
        .join('');

      body.innerHTML = `
        <div class="mylife-shell mylife-edit-shell">
          ${privateLoadError}
          <div class="mylife-header-row">
            <div>
              <div class="section-kicker">Edit profile</div>
              <h4 class="mylife-title">My identity</h4>
            </div>
            <button type="button" class="secondary-button" data-action="cancel-edit-profile">Cancel</button>
          </div>

          <form id="profileEditForm" class="profile-edit-form">
            <div class="field-group">
              <span>Public display name</span>
              <div class="read-only-field">${displayName}</div>
            </div>

            <label class="field-group">
              <span>Political affiliation</span>
              <select name="political_party">
                <option value="Independent" ${party === 'Independent' ? 'selected' : ''}>Independent</option>
                <option value="United Front" ${party === 'United Front' ? 'selected' : ''}>United Front</option>
                <option value="People's Assembly" ${party === "People's Assembly" ? 'selected' : ''}>People's Assembly</option>
                <option value="Civic Order" ${party === 'Civic Order' ? 'selected' : ''}>Civic Order</option>
              </select>
            </label>

            <input type="hidden" name="avatar_url" value="${avatarUrl}" />

            <div class="field-group">
              <span>Avatar</span>
              <div class="avatar-picker-grid">${options}</div>
            </div>

            <div class="profile-actions">
              <button type="submit" class="primary-button">Save changes</button>
            </div>
          </form>
        </div>
      `;

      const editForm = document.getElementById('profileEditForm');
      const avatarUrlInput = editForm.querySelector('input[name="avatar_url"]');
      editForm.querySelectorAll('.avatar-option').forEach((button) => {
        button.addEventListener('click', () => {
          editForm.querySelectorAll('.avatar-option').forEach((node) => node.classList.remove('selected'));
          button.classList.add('selected');
          avatarUrlInput.value = button.dataset.avatarUrl;
        });
      });
      editForm.addEventListener('submit', handleProfileEditSubmit);
      body.querySelector('[data-action="cancel-edit-profile"]').addEventListener('click', () => {
        profileState.isEditing = false;
        renderAppContent('mylife');
      });
      return;
    }

    const categoryCards = [
      { key: 'skills', title: 'Career Path Tree', value: 'Path overview', icon: '✦', accent: '#eb8a4f', description: 'Current progression and unlock pathway.' },
      { key: 'assets', title: 'Assets', value: 'Personal assets', icon: '▣', accent: '#9a6ef8', description: 'Personal holdings and resources.' },
    ];

    body.innerHTML = `
      <div class="shared-profile-shell profile-self-shell">
        ${privateLoadError}

        <div class="profile-hero-panel">
          <div class="profile-cover profile-cover-self">
            <div class="profile-cover-actions">
              <button type="button" class="profile-mini-button" data-action="edit-profile" aria-label="Edit profile">✎</button>
            </div>
          </div>

          <div class="profile-avatar-wrap">
            <div class="profile-avatar-ring">
              <div class="profile-avatar-photo" style="background-image: url('${avatarUrl}')"></div>
            </div>
          </div>

          <div class="profile-main-header">
            <div class="profile-header-row">
              <div class="profile-identity">
                <div class="profile-name-row">
                  <h2>${displayName}</h2>
                  <span class="profile-verified-badge" title="My profile">✓</span>
                </div>
                <div class="profile-role">${escapeHtml(citizenHandle)}</div>
              </div>
              <button type="button" class="profile-close-button" data-action="mylife-back">Back</button>
            </div>

          </div>

        </div>

        <section class="profile-section">
          <div class="mylife-category-grid">
            ${categoryCards
              .map(
                (category) => `
                  <button type="button" class="mylife-category-card" data-category="${category.key}" style="--category-accent:${category.accent};">
                    <span class="mylife-category-icon" style="background:${category.accent};">${category.icon}</span>
                    <div class="mylife-category-copy">
                      <span class="mylife-category-name">${category.title}</span>
                      <small>${category.value}</small>
                    </div>
                    <span class="mylife-category-arrow">›</span>
                  </button>
                `,
              )
              .join('')}
          </div>
        </section>

        <section class="profile-section">
          <div class="profile-detail-list">
            <div class="profile-detail-item"><span>Account balance</span><strong>${balanceValue}</strong></div>
            <div class="profile-detail-item"><span>Employment status</span><strong>${profession}</strong></div>
            <div class="profile-detail-item"><span>Social class</span><strong>${socialClass}</strong></div>
            <div class="profile-detail-item"><span>Education</span><strong>${education}</strong></div>
            <div class="profile-detail-item"><span>Account status</span><strong>${accountStatus}</strong></div>
            <div class="profile-detail-item"><span>Registered</span><strong>${createdAt}</strong></div>
          </div>
        </section>
      </div>
    `;

    const editButton = body.querySelector('[data-action="edit-profile"]');
    if (editButton) {
      editButton.addEventListener('click', () => {
        profileState.isEditing = true;
        renderAppContent('mylife');
      });
    }

    const mylifeBackButton = body.querySelector('[data-action="mylife-back"]');
    if (mylifeBackButton) {
      mylifeBackButton.addEventListener('click', () => {
        renderAppContent('mylife');
      });
    }

    const retryButton = body.querySelector('[data-action="retry-profile-load"]');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        profileState.privateLoadError = null;
        await loadCitizenProfile();
        renderAppContent('mylife');
      });
    }

    body.querySelectorAll('[data-category]').forEach((button) => {
      button.addEventListener('click', async () => {
        const category = button.dataset.category;
        if (!category) {
          return;
        }

        const categoryConfig = {
          skills: { title: 'Career Path Tree', icon: '✦', accent: '#eb8a4f', summary: 'Career path tree', description: 'Current progression and unlock pathway.', empty: 'No career path data is available yet.', isTree: true },
          assets: { title: 'Assets', icon: '▣', accent: '#9a6ef8', summary: 'Personal assets', description: 'No personal asset system is active yet.', empty: 'No asset information is available yet.', isEmpty: true },
        };

        const config = categoryConfig[category] || categoryConfig.skills;

        if (config.isEmpty) {
          body.innerHTML = `
            <div class="mylife-shell mylife-detail-shell">
              <div class="mylife-detail-top">
                <button type="button" class="mylife-back-button" data-action="mylife-back">‹ MyLife</button>
                <div class="mylife-detail-title-wrap">
                  <span class="mylife-detail-icon" style="background:${config.accent};">${config.icon}</span>
                  <div>
                    <div class="section-kicker">My life</div>
                    <h3>${config.title}</h3>
                  </div>
                </div>
              </div>

              <div class="mylife-detail-empty">
                <strong>No assets required yet</strong>
                <p>There are no active asset requirements for this citizen at the moment.</p>
              </div>
            </div>
          `;

          body.querySelector('[data-action="mylife-back"]').addEventListener('click', () => {
            renderAppContent('mylife');
          });
          return;
        }

        if (config.isTree) {
          const supabase = getAuthClient();
          const inventory = await loadCareerPathInventory(profileState.citizen?.id || null, supabase);
          const treeMarkup = renderCareerPathTreeMarkup(privateRecord, inventory);

          body.innerHTML = `
            <div class="mylife-shell mylife-detail-shell">
              <div class="mylife-detail-top">
                <button type="button" class="mylife-back-button" data-action="mylife-back">‹ MyLife</button>
                <div class="mylife-detail-title-wrap">
                  <span class="mylife-detail-icon" style="background:${config.accent};">${config.icon}</span>
                  <div>
                    <div class="section-kicker">My life</div>
                    <h3>${config.title}</h3>
                  </div>
                </div>
              </div>

              ${treeMarkup}
            </div>
          `;

          body.querySelector('[data-action="mylife-back"]').addEventListener('click', () => {
            renderAppContent('mylife');
          });

          const closeButton = body.querySelector('[data-action="career-tree-close"]');
          const zoomViewport = body.querySelector('.career-tree-viewport');

          if (closeButton) {
            closeButton.addEventListener('click', () => {
              renderAppContent('mylife');
            });
          }

          if (zoomViewport) {
            zoomViewport.style.transform = 'scale(1)';
            zoomViewport.dataset.zoom = '1';
            zoomViewport.onwheel = null;
          }

          return;
        }

        const detailRows = [
          ['Citizen', displayName],
          ['Profession', profession],
          ['Political affiliation', party],
          ['Account status', accountStatus],
          ['Account balance', balanceValue],
        ];

        body.innerHTML = `
          <div class="mylife-shell mylife-detail-shell">
            <div class="mylife-detail-top">
              <button type="button" class="mylife-back-button" data-action="mylife-back">‹ MyLife</button>
              <div class="mylife-detail-title-wrap">
                <span class="mylife-detail-icon" style="background:${config.accent};">${config.icon}</span>
                <div>
                  <div class="section-kicker">My life</div>
                  <h3>${config.title}</h3>
                </div>
              </div>
            </div>

            <div class="mylife-detail-card">
              <div class="mylife-detail-summary">
                <span>${config.summary}</span>
                <strong>${config.description}</strong>
              </div>
            </div>

            <div class="mylife-panel mylife-detail-panel">
              <div class="mylife-panel-header compact">
                <div>
                  <div class="section-kicker">Details</div>
                  <h3>${config.title}</h3>
                </div>
              </div>
              <div class="mylife-overview-grid">
                ${detailRows
                  .map(
                    ([label, value]) => `
                      <div class="mylife-stat-row">
                        <span>${label}</span>
                        <strong>${value}</strong>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>

            <div class="mylife-detail-empty">
              <strong>${config.empty}</strong>
              <p>Information for this category will appear here when the system is available.</p>
            </div>
          </div>
        `;

        body.querySelector('[data-action="mylife-back"]').addEventListener('click', () => {
          renderAppContent('mylife');
        });
      });
    });
  }

  if (appId === 'moneytree') {
    const formatMoney = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return '$0.00';
      }

      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    };

    const moneytreeState = {
      discussions: [],
      dashboardData: null,
      dashboardLoading: false,
      selectedDiscussionId: null,
      selectedDiscussionFeed: [],
      selectedDiscussionFeedLoading: false,
      selectedDiscussionFeedError: null,
      discussionError: null,
      submitError: null,
      submitSuccess: null,
      submitDraft: '',
      challengeDraft: '',
      submitRequestId: null,
      submitting: false,
      challengeParentContributionId: null,
      expandedChallengeIds: new Set(),
      isModerator: false,
      moderationQueue: [],
      moderationLoading: false,
      moderationMessage: null,
      moderationError: null,
      moderationProcessingIds: [],
      clockInStatus: null,
      clockInSubmitting: false,
      clockInNotice: null,
      clockInTimer: null,
      contributorNameCache: moneytreeContributorNameCache,
    };

    window.__moneytreeState = moneytreeState;

    const hydrateMoneytreeContributorNames = async (contributions) => {
      const items = Array.isArray(contributions) ? contributions : [];
      const citizenIds = [...new Set(items
        .map((item) => String(item?.citizen_id ?? item?.contributor_citizen_id ?? item?.author_citizen_id ?? '').trim())
        .filter(Boolean)
        .filter((citizenId) => !moneytreeState.contributorNameCache.has(citizenId)))];

      if (!citizenIds.length) {
        return items.map((item) => ({
          ...item,
          contributor_public_name: item?.contributor_public_name || item?.public_name || item?.author_public_name || item?.citizen_name || 'Citizen',
        }));
      }

      const supabase = getAuthClient();
      if (!supabase) {
        return items.map((item) => ({
          ...item,
          contributor_public_name: item?.contributor_public_name || item?.public_name || item?.author_public_name || item?.citizen_name || 'Citizen',
        }));
      }

      try {
        const { data, error } = await supabase
          .from('citizens')
          .select('id, public_name')
          .in('id', citizenIds);

        if (error) {
          throw error;
        }

        const rows = Array.isArray(data) ? data : [];
        rows.forEach((row) => {
          const id = String(row?.id ?? '').trim();
          const publicName = String(row?.public_name || 'Citizen').trim() || 'Citizen';
          if (id) {
            moneytreeState.contributorNameCache.set(id, publicName);
          }
        });
      } catch (error) {
        console.warn('MoneyTree contributor lookup failed:', error);
      }

      return items.map((item) => {
        const citizenId = String(item?.citizen_id ?? item?.contributor_citizen_id ?? item?.author_citizen_id ?? '').trim();
        const cachedName = citizenId ? moneytreeState.contributorNameCache.get(citizenId) : null;
        return {
          ...item,
          contributor_public_name: item?.contributor_public_name || item?.public_name || item?.author_public_name || item?.citizen_name || cachedName || 'Citizen',
          citizen_id: citizenId || item?.citizen_id || null,
        };
      });
    };

    const getDiscussionContributionType = (discussion) => {
      const type = typeof discussion?.discussion_type === 'string' ? discussion.discussion_type : '';
      switch (type) {
        case 'question':
          return 'question_answer';
        case 'career':
          return 'career_answer';
        case 'open_chat':
          return 'open_discussion';
        default:
          return 'question_answer';
      }
    };

    const createSubmissionRequestId = () => {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }

      return `moneytree-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const countMoneytreeWords = (value) => {
      const normalized = String(value ?? '').trim();
      if (!normalized) {
        return 0;
      }

      return normalized.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
    };

    const loadActiveDiscussions = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moneytreeState.discussions = [];
        moneytreeState.selectedDiscussionId = null;
        moneytreeState.discussionError = 'Your session has expired. Please sign in again.';
        return [];
      }

      try {
        const { data, error } = await supabase.functions.invoke('get-moneytree-discussions', {
          method: 'GET',
        });

        if (error) {
          throw error;
        }

        const discussions = Array.isArray(data)
          ? data
          : Array.isArray(data?.discussions)
            ? data.discussions
            : [];

        moneytreeState.discussions = discussions
          .map((discussion) => ({
            id: discussion?.id ?? null,
            discussion_type: discussion?.discussion_type ?? 'question',
            title: discussion?.title ?? 'Untitled discussion',
            prompt: discussion?.prompt ?? '',
            profession_gate: discussion?.profession_gate ?? null,
            created_at: discussion?.created_at ?? null,
          }))
          .filter((discussion) => discussion.id);

        if (!moneytreeState.discussions.length) {
          moneytreeState.selectedDiscussionId = null;
          moneytreeState.discussionError = null;
          return [];
        }

        if (moneytreeState.selectedDiscussionId) {
          const validSelection = moneytreeState.discussions.some((discussion) => discussion.id === moneytreeState.selectedDiscussionId);
          if (!validSelection) {
            moneytreeState.selectedDiscussionId = null;
          }
        }

        moneytreeState.discussionError = null;
        return moneytreeState.discussions;
      } catch (error) {
        console.error('MoneyTree discussion load failed:', error);
        moneytreeState.discussions = [];
        moneytreeState.selectedDiscussionId = null;
        moneytreeState.discussionError = 'We couldn\'t load the active discussions right now.';
        return [];
      }
    };

    const renderDiscussionThread = (contributions) => {
      const items = Array.isArray(contributions) ? contributions : [];
      if (!items.length) {
        return '<div class="moneytree-empty-state"><strong>No previous answers yet.</strong><p>Be the first to respond in this discussion.</p></div>';
      }

      const byId = new Map(items.map((item) => [String(item.id), item]));
      const childrenByParent = new Map();

      items.forEach((item) => {
        const parentId = item.parent_contribution_id ? String(item.parent_contribution_id) : null;
        if (parentId && byId.has(parentId)) {
          const list = childrenByParent.get(parentId) || [];
          list.push(item);
          childrenByParent.set(parentId, list);
        }
      });

      const sortedItems = [...items].sort((a, b) => {
        const left = new Date(a.created_at || 0).getTime();
        const right = new Date(b.created_at || 0).getTime();
        return left - right;
      });

      const roots = sortedItems.filter((item) => !item.parent_contribution_id || !byId.has(String(item.parent_contribution_id)));

      const getAuthorMarkup = (item) => {
        const citizenId = String(item?.contributor_citizen_id ?? item?.citizen_id ?? item?.author_citizen_id ?? '').trim();
        const publicName = String(item?.contributor_public_name ?? item?.public_name ?? item?.author_public_name ?? item?.citizen_name ?? 'Citizen').trim() || 'Citizen';

        if (citizenId) {
          return `<button type="button" class="moneytree-thread-author-button" data-social-action="open-citizen-profile" data-citizen-id="${escapeHtml(citizenId)}">${escapeHtml(publicName)}</button>`;
        }

        return `<span class="moneytree-thread-author">${escapeHtml(publicName)}</span>`;
      };

      const renderChallengeEntry = (item, depth = 0) => {
        const childItems = (childrenByParent.get(String(item.id)) || []).sort((a, b) => {
          const left = new Date(a.created_at || 0).getTime();
          const right = new Date(b.created_at || 0).getTime();
          return left - right;
        });
        const content = typeof item.content === 'string' ? item.content : '';
        const authorLabel = getAuthorMarkup(item);
        const moderationState = typeof item.moderation_state === 'string' ? item.moderation_state : 'pending';
        const statusLabel = moderationState === 'approved'
          ? 'Approved'
          : moderationState === 'rejected'
            ? 'Rejected'
            : 'Pending review';
        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const isOwnContribution = Boolean(currentCitizenId && item.citizen_id && String(item.citizen_id) === currentCitizenId);
        const isExpanded = moneytreeState.expandedChallengeIds.has(String(item.id));
        const isChallengeTarget = String(moneytreeState.challengeParentContributionId || '') === String(item.id || '');

        const nestedChallengeMarkup = childItems.length > 0
          ? `
            <div class="moneytree-challenge-toggle-row">
              <button
                type="button"
                class="moneytree-challenge-toggle"
                data-action="moneytree-toggle-challenge-section"
                data-contribution-id="${escapeHtml(item.id || '')}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
              >
                ${isExpanded ? 'Hide' : 'View'} ${childItems.length} ${childItems.length === 1 ? 'Challenge' : 'Challenges'}
              </button>
            </div>
            ${isExpanded ? `
              <div class="moneytree-challenge-section">
                ${childItems.map((child) => renderChallengeEntry(child, depth + 1)).join('')}
              </div>
            ` : ''}
          `
          : '';

        const challengeFormMarkup = isChallengeTarget ? `
          <div class="moneytree-discussion-form moneytree-inline-challenge-form">
            <label class="moneytree-discussion-label" for="moneytree-challenge-input">Challenge response</label>
            <textarea id="moneytree-challenge-input" rows="5" placeholder="Write your challenge here...">${escapeHtml(moneytreeState.challengeDraft)}</textarea>
            <div class="moneytree-discussion-meta">25-word minimum required</div>
            <button type="button" class="moneytree-submit-button" data-action="moneytree-submit-challenge" ${moneytreeState.submitting ? 'disabled' : ''}>
              ${moneytreeState.submitting ? 'Submitting…' : 'Submit challenge'}
            </button>
          </div>
        ` : '';

        return `
          <div class="moneytree-challenge-entry" style="margin-left:${depth * 12}px;" data-contribution-id="${escapeHtml(item.id || '')}">
            <div class="moneytree-thread-header">
              <div class="moneytree-thread-meta">
                ${authorLabel}
                <span class="moneytree-thread-date">${escapeHtml(item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'No date')}</span>
              </div>
              <span class="moneytree-thread-status ${escapeHtml(moderationState || 'pending')}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="moneytree-thread-content">${escapeHtml(content)}</div>
            ${nestedChallengeMarkup}
            <div class="moneytree-thread-actions">
              <button
                type="button"
                class="moneytree-thread-challenge-button"
                data-action="moneytree-challenge-contribution"
                data-contribution-id="${escapeHtml(item.id || '')}"
                ${isOwnContribution ? 'disabled' : ''}
              >
                ${isOwnContribution ? 'Own contribution' : 'Challenge'}
              </button>
            </div>
            ${challengeFormMarkup}
          </div>
        `;
      };

      const renderContributionCard = (item) => {
        const childItems = (childrenByParent.get(String(item.id)) || []).sort((a, b) => {
          const left = new Date(a.created_at || 0).getTime();
          const right = new Date(b.created_at || 0).getTime();
          return left - right;
        });
        const content = typeof item.content === 'string' ? item.content : '';
        const authorLabel = getAuthorMarkup(item);
        const moderationState = typeof item.moderation_state === 'string' ? item.moderation_state : 'pending';
        const statusLabel = moderationState === 'approved'
          ? 'Approved'
          : moderationState === 'rejected'
            ? 'Rejected'
            : 'Pending review';
        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const isOwnContribution = Boolean(currentCitizenId && item.citizen_id && String(item.citizen_id) === currentCitizenId);
        const isExpanded = moneytreeState.expandedChallengeIds.has(String(item.id));
        const isChallengeTarget = String(moneytreeState.challengeParentContributionId || '') === String(item.id || '');

        const nestedChallengeMarkup = childItems.length > 0
          ? `
            <div class="moneytree-challenge-toggle-row">
              <button
                type="button"
                class="moneytree-challenge-toggle"
                data-action="moneytree-toggle-challenge-section"
                data-contribution-id="${escapeHtml(item.id || '')}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
              >
                ${isExpanded ? 'Hide' : 'View'} ${childItems.length} ${childItems.length === 1 ? 'Challenge' : 'Challenges'}
              </button>
            </div>
            ${isExpanded ? `
              <div class="moneytree-challenge-section">
                ${childItems.map((child) => renderChallengeEntry(child)).join('')}
              </div>
            ` : ''}
          `
          : '';

        const challengeFormMarkup = isChallengeTarget ? `
          <div class="moneytree-discussion-form moneytree-inline-challenge-form">
            <label class="moneytree-discussion-label" for="moneytree-challenge-input">Challenge response</label>
            <textarea id="moneytree-challenge-input" rows="5" placeholder="Write your challenge here...">${escapeHtml(moneytreeState.challengeDraft)}</textarea>
            <div class="moneytree-discussion-meta">25-word minimum required</div>
            <button type="button" class="moneytree-submit-button" data-action="moneytree-submit-challenge" ${moneytreeState.submitting ? 'disabled' : ''}>
              ${moneytreeState.submitting ? 'Submitting…' : 'Submit challenge'}
            </button>
          </div>
        ` : '';

        return `
          <article class="moneytree-thread-card moneytree-contribution-card" data-contribution-id="${escapeHtml(item.id || '')}">
            <div class="moneytree-thread-header">
              <div class="moneytree-thread-meta">
                ${authorLabel}
                <span class="moneytree-thread-date">${escapeHtml(item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'No date')}</span>
              </div>
              <span class="moneytree-thread-status ${escapeHtml(moderationState || 'pending')}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="moneytree-thread-content">${escapeHtml(content)}</div>
            ${nestedChallengeMarkup}
            <div class="moneytree-thread-actions">
              <button
                type="button"
                class="moneytree-thread-challenge-button"
                data-action="moneytree-challenge-contribution"
                data-contribution-id="${escapeHtml(item.id || '')}"
                ${isOwnContribution ? 'disabled' : ''}
              >
                ${isOwnContribution ? 'Own contribution' : 'Challenge'}
              </button>
            </div>
            ${challengeFormMarkup}
          </article>
        `;
      };

      return roots.map((item) => renderContributionCard(item)).join('');
    };

    const loadSelectedDiscussionFeed = async (discussionId) => {
      if (!discussionId) {
        moneytreeState.selectedDiscussionFeed = [];
        moneytreeState.selectedDiscussionFeedError = null;
        moneytreeState.selectedDiscussionFeedLoading = false;
        return;
      }

      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.access_token) {
        moneytreeState.selectedDiscussionFeed = [];
        moneytreeState.selectedDiscussionFeedError = 'Your session has expired. Please sign in again.';
        moneytreeState.selectedDiscussionFeedLoading = false;
        return;
      }

      moneytreeState.selectedDiscussionFeedLoading = true;
      moneytreeState.selectedDiscussionFeedError = null;

      try {
        const supabaseUrl = supabase?.supabaseUrl || window.TYRANNY_SUPABASE_CONFIG?.url;
        if (!supabaseUrl) {
          throw new Error('Supabase project configuration is unavailable.');
        }

        const url = new URL(`${supabaseUrl}/functions/v1/get-moneytree-feed`);
        url.searchParams.set('discussion_id', discussionId);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          credentials: 'include',
          mode: 'cors',
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load discussion answers.');
        }

        const hydratedContributions = await hydrateMoneytreeContributorNames(payload?.contributions);
        moneytreeState.selectedDiscussionFeed = Array.isArray(hydratedContributions) ? hydratedContributions : [];
        moneytreeState.selectedDiscussionFeedError = null;
      } catch (error) {
        console.error('MoneyTree discussion feed load failed:', error);
        moneytreeState.selectedDiscussionFeed = [];
        moneytreeState.selectedDiscussionFeedError = error?.message || 'Unable to load discussion answers.';
      } finally {
        moneytreeState.selectedDiscussionFeedLoading = false;
      }
    };

    const loadModeratorQueue = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moneytreeState.isModerator = false;
        moneytreeState.moderationQueue = [];
        moneytreeState.moderationLoading = false;
        return [];
      }

      moneytreeState.moderationLoading = true;
      moneytreeState.moderationError = null;
      moneytreeState.moderationMessage = null;

      try {
        const { data, error } = await supabase.functions.invoke('get-moneytree-moderation-queue', {
          method: 'GET',
        });

        if (error) {
          const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
          const isAccessError = Number(error?.status) === 403 || message.includes('moderator') || message.includes('access');
          if (isAccessError) {
            moneytreeState.isModerator = false;
            moneytreeState.moderationQueue = [];
            return [];
          }

          throw error;
        }

        const queue = Array.isArray(data)
          ? data
          : Array.isArray(data?.pending_contributions)
            ? data.pending_contributions
            : [];

        moneytreeState.isModerator = true;
        moneytreeState.moderationQueue = queue.map((item) => ({
          id: item?.id ?? null,
          discussion_id: item?.discussion_id ?? null,
          discussion_title: item?.discussion_title ?? 'Unknown discussion',
          discussion_type: item?.discussion_type ?? 'question',
          contribution_type: item?.contribution_type ?? 'question_answer',
          contributor_citizen_id: item?.contributor_citizen_id ?? null,
          contributor_public_name: item?.contributor_public_name ?? 'Citizen',
          content: typeof item?.content === 'string' ? item.content : '',
          created_at: item?.created_at ?? null,
        })).filter((item) => item.id);

        return moneytreeState.moderationQueue;
      } catch (error) {
        console.error('MoneyTree moderator queue load failed:', error);
        moneytreeState.isModerator = false;
        moneytreeState.moderationQueue = [];
        moneytreeState.moderationError = error?.message || 'Unable to load the moderation queue right now.';
        return [];
      } finally {
        moneytreeState.moderationLoading = false;
      }
    };

    const handleModeratorDecision = async (contributionId, decision, rejectionReason = null) => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moneytreeState.moderationError = 'Your session has expired. Please sign in again.';
        moneytreeState.moderationMessage = null;
        return;
      }

      if (!contributionId) {
        moneytreeState.moderationError = 'A contribution is required to complete moderation.';
        moneytreeState.moderationMessage = null;
        return;
      }

      if (moneytreeState.moderationProcessingIds.includes(contributionId)) {
        return;
      }

      const nextProcessingIds = [...new Set([...moneytreeState.moderationProcessingIds, contributionId])];
      moneytreeState.moderationProcessingIds = nextProcessingIds;
      moneytreeState.moderationError = null;
      moneytreeState.moderationMessage = decision === 'approved' ? 'Approving contribution…' : 'Rejecting contribution…';

      try {
        const { data, error } = await supabase.rpc('moderate_moneytree_contribution', {
          p_contribution_id: contributionId,
          p_decision: decision,
          p_reason: decision === 'rejected' ? rejectionReason : null,
        });

        if (error) {
          throw error;
        }

        const firstResult = Array.isArray(data) ? data[0] : data;
        const moderationState = firstResult?.moderation_state || decision;
        const successMessage = moderationState === 'approved'
          ? 'Contribution approved successfully.'
          : 'Contribution rejected successfully.';

        moneytreeState.moderationMessage = successMessage;
        moneytreeState.moderationError = null;
        moneytreeState.moderationProcessingIds = moneytreeState.moderationProcessingIds.filter((id) => id !== contributionId);

        if (moderationState === 'approved') {
          await loadCitizenProfile();
        }

        await loadModeratorQueue();
        await loadMoneytreeView();
        return;
      } catch (error) {
        console.error('MoneyTree moderation action failed:', error);
        moneytreeState.moderationError = error?.message || 'Unable to complete the moderation decision.';
        moneytreeState.moderationMessage = null;
      } finally {
        moneytreeState.moderationProcessingIds = moneytreeState.moderationProcessingIds.filter((id) => id !== contributionId);
      }
    };

    const formatClockInCountdown = (secondsRemaining) => {
      const totalSeconds = Number.isFinite(secondsRemaining) ? Math.max(0, Math.floor(secondsRemaining)) : 0;
      const minutes = Math.floor(totalSeconds / 60);
      const remainingSeconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const formatClockInTimestamp = (value) => {
      if (!value) {
        return 'Next hourly window';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return 'Next hourly window';
      }

      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
      });
    };

    const loadClockInStatus = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moneytreeState.clockInStatus = null;
        moneytreeState.clockInNotice = 'Your session has expired. Please sign in again.';
        return null;
      }

      try {
        const { data, error } = await supabase.rpc('get_moneytree_clock_in_status');
        if (error) {
          throw error;
        }

        const row = Array.isArray(data) ? data[0] : data;
        moneytreeState.clockInStatus = row
          ? {
              ...row,
              reward_amount: Number(row.reward_amount ?? 25),
              remaining_seconds: Number(row.remaining_seconds ?? 0),
              already_claimed: Boolean(row.already_claimed),
              window_is_open: Boolean(row.window_is_open),
              can_claim: Boolean(row.can_claim),
              fetchedAtMs: Date.now(),
            }
          : null;

        return moneytreeState.clockInStatus;
      } catch (error) {
        console.error('MoneyTree Clock In status load failed:', error);
        moneytreeState.clockInStatus = null;
        moneytreeState.clockInNotice = error?.message || 'Unable to load the Clock In status right now.';
        return null;
      }
    };

    const handleClockInClaim = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moneytreeState.clockInNotice = 'Your session has expired. Please sign in again.';
        return;
      }

      let currentStatus = moneytreeState.clockInStatus;
      if (!currentStatus || (!currentStatus.window_is_open && !currentStatus.can_claim && !currentStatus.already_claimed)) {
        currentStatus = await loadClockInStatus();
      }

      const clockWindowOpen = Boolean(
        (currentStatus?.window_is_open || currentStatus?.can_claim || Number(currentStatus?.remaining_seconds ?? 0) > 0)
        && !currentStatus?.already_claimed
      );

      if (!currentStatus || !clockWindowOpen || moneytreeState.clockInSubmitting) {
        moneytreeState.clockInNotice = currentStatus?.message || 'Clock In is not available right now.';
        return;
      }

      moneytreeState.clockInSubmitting = true;
      moneytreeState.clockInNotice = null;

      try {
        const idempotencyKey = `${profileState.citizen?.id || session.user.id}:${currentStatus.window_start || 'current'}`;
        const { data, error } = await supabase.rpc('claim_moneytree_clock_in', {
          p_idempotency_key: idempotencyKey,
        });

        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : data;
        const success = Boolean(result?.success);
        const resultMessage = typeof result?.message === 'string' ? result.message : '';

        moneytreeState.clockInNotice = success ? resultMessage || 'Clocked in successfully. Reward credited.' : (resultMessage || 'Clock In was unavailable.');

        if (success && profileState.citizen?.id) {
          await refreshCitizenBalanceFromSupabase(profileState.citizen.id);
        }

        await loadClockInStatus();
        await loadMoneytreeView();
      } catch (error) {
        console.error('MoneyTree Clock In claim failed:', error);
        moneytreeState.clockInNotice = error?.message || 'Unable to process your Clock In request right now.';
      } finally {
        moneytreeState.clockInSubmitting = false;
      }
    };

    const renderDashboard = (state, discussions = moneytreeState.discussions) => {
      const dashboard = state || {};
      const availableBalance = Number(dashboard.available_balance ?? 0);
      const pendingEarnings = Number(dashboard.pending_earnings ?? 0);
      const activity = Array.isArray(dashboard.discussion_activity) ? dashboard.discussion_activity : [];
      const activeDiscussions = Array.isArray(discussions) ? discussions : [];
      const selectedDiscussion = moneytreeState.selectedDiscussionId
        ? activeDiscussions.find((discussion) => discussion.id === moneytreeState.selectedDiscussionId) || null
        : null;
      const clockInStatus = moneytreeState.clockInStatus || null;

      const effectiveNow = clockInStatus?.server_now && clockInStatus?.fetchedAtMs
        ? new Date(new Date(clockInStatus.server_now).getTime() + (Date.now() - clockInStatus.fetchedAtMs))
        : new Date();

      const clockInWindowActive = Boolean(
        (clockInStatus?.window_is_open || clockInStatus?.can_claim || Number(clockInStatus?.remaining_seconds ?? 0) > 0)
        && !clockInStatus?.already_claimed
      );
      const clockInButtonDisabled = !clockInWindowActive || moneytreeState.clockInSubmitting;
      const remainingSeconds = clockInWindowActive && clockInStatus?.window_end
        ? Math.max(0, Math.ceil((new Date(clockInStatus.window_end).getTime() - effectiveNow.getTime()) / 1000))
        : Number(clockInStatus?.remaining_seconds ?? 0);

      const clockInStatusLabel = clockInWindowActive
        ? 'Available now'
        : clockInStatus?.already_claimed
          ? 'Already claimed'
          : clockInStatus?.window_is_open
            ? 'Window closed'
            : 'Next window opens soon';

      const nextEligibleDisplay = clockInStatus?.next_eligible_at
        ? formatClockInTimestamp(clockInStatus.next_eligible_at)
        : 'the next hourly window';

      const clockInNotice = moneytreeState.clockInNotice || clockInStatus?.message || 'When the next window opens, you will be eligible to claim $25.00.';
      const countdownText = clockInWindowActive ? formatClockInCountdown(remainingSeconds) : '00:00';

      const clockInMarkup = `
        <div class="moneytree-panel moneytree-clockin-panel" data-moneytree-clockin-root>
          <div class="moneytree-panel-header">
            <h4>Clock In</h4>
          </div>
          <div class="moneytree-clockin-body">
            <div class="moneytree-clockin-header-row">
              <div>
                <div class="moneytree-clockin-label">Reward</div>
                <div class="moneytree-clockin-reward">$25.00</div>
              </div>
              <span class="moneytree-clockin-status ${clockInWindowActive ? 'active' : 'inactive'}">${escapeHtml(clockInStatusLabel)}</span>
            </div>
            <div class="moneytree-clockin-countdown-wrap">
              <div class="moneytree-clockin-countdown-label">Time remaining</div>
              <div class="moneytree-clockin-countdown" data-moneytree-clockin-countdown>${escapeHtml(countdownText)}</div>
            </div>
            <div class="moneytree-clockin-meta">
              <span>Window: 00:00–04:59 UTC</span>
              <span>Next eligible: ${escapeHtml(nextEligibleDisplay)}</span>
            </div>
            ${clockInNotice ? `<div class="moneytree-clockin-message ${clockInWindowActive ? 'success' : 'info'}">${escapeHtml(clockInNotice)}</div>` : ''}
            <button
              type="button"
              class="moneytree-submit-button moneytree-clockin-button"
              data-action="moneytree-clock-in"
              ${clockInButtonDisabled ? 'disabled' : ''}
            >
              ${moneytreeState.clockInSubmitting ? 'Claiming…' : (clockInWindowActive ? 'Clock In' : 'Unavailable')}
            </button>
          </div>
        </div>
      `;

      if (selectedDiscussion) {
        moneytreeState.selectedDiscussionId = selectedDiscussion.id;
      }

      const selectedDiscussionFeedMarkup = selectedDiscussion
        ? (() => {
            if (moneytreeState.selectedDiscussionFeedLoading) {
              return '<div class="moneytree-empty-state"><strong>Loading previous answers…</strong><p>Retrieving discussion history.</p></div>';
            }

            if (moneytreeState.selectedDiscussionFeedError) {
              return `<div class="moneytree-empty-state"><strong>Unable to load previous answers.</strong><p>${escapeHtml(moneytreeState.selectedDiscussionFeedError)}</p></div>`;
            }

            return `
              <div class="moneytree-thread-wrapper">
                <div class="moneytree-thread-label">Previous answers</div>
                ${renderDiscussionThread(moneytreeState.selectedDiscussionFeed)}
              </div>
            `;
          })()
        : '';

      const activityMarkup = activity.length > 0
        ? activity.map((entry) => {
            const titleLabel = typeof entry?.discussion_title === 'string' && entry.discussion_title.trim().length > 0
              ? entry.discussion_title
              : 'Unknown discussion';
            const safeTitle = escapeHtml(titleLabel);
            const moderationState = typeof entry?.moderation_state === 'string' ? entry.moderation_state : 'pending';
            const stateLabel = moderationState === 'pending'
              ? 'Awaiting Review'
              : moderationState === 'approved'
                ? 'Approved'
                : moderationState === 'rejected'
                  ? 'Rejected'
                  : 'Unknown';
            const rewardValue = Number(entry?.reward_amount ?? 10);
            const rewardMarkup = moderationState === 'approved' && Number.isFinite(rewardValue)
              ? `<span class="moneytree-reward-badge">${formatMoney(rewardValue)} credited to Available Balance.</span>`
              : '';

            return `
              <article class="moneytree-activity-item">
                <div class="moneytree-activity-header">
                  <div>
                    <div class="moneytree-activity-title">${safeTitle}</div>
                    <div class="moneytree-activity-meta">${escapeHtml(entry?.contribution_type || 'Contribution')}</div>
                  </div>
                  ${rewardMarkup}
                </div>
                <div class="moneytree-activity-status-row">
                  <span class="moneytree-status badge-${moderationState}">${stateLabel}</span>
                  <span class="moneytree-date">${escapeHtml(entry?.contribution_date ? new Date(entry.contribution_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }) : 'No date')}</span>
                </div>
              </article>
            `;
          }).join('')
        : '<div class="moneytree-empty-state"><strong>No discussion activity yet.</strong><p>Your submitted contributions will appear here after they are recorded.</p></div>';

      const moderationMarkup = '';

      const discussionListMarkup = activeDiscussions.length > 0
        ? activeDiscussions.map((discussion) => {
            const isSelected = selectedDiscussion && discussion.id === selectedDiscussion.id;
            const discussionType = typeof discussion.discussion_type === 'string' ? discussion.discussion_type : 'question';
            const typeLabel = discussionType === 'question'
              ? 'Question'
              : discussionType === 'career'
                ? 'Career'
                : discussionType === 'open_chat'
                  ? 'Open Chat'
                  : 'Discussion';

            return `
              <button
                type="button"
                class="moneytree-discussion-item ${isSelected ? 'selected' : ''}"
                data-action="moneytree-select-discussion"
                data-discussion-id="${escapeHtml(discussion.id)}"
              >
                <span class="moneytree-discussion-title">${escapeHtml(discussion.title)}</span>
                <span class="moneytree-discussion-type">${typeLabel}</span>
              </button>
            `;
          }).join('')
        : '<div class="moneytree-empty-state"><strong>No active discussions.</strong><p>New MoneyTree questions will appear here when they are published.</p></div>';

      const selectedDiscussionModalMarkup = selectedDiscussion
        ? `
          <div class="moneytree-modal-backdrop" data-action="moneytree-close-modal">
            <div class="moneytree-modal" role="dialog" aria-modal="true" aria-labelledby="moneytree-modal-title" data-action="moneytree-modal-card">
              <button type="button" class="moneytree-modal-close" aria-label="Close discussion" data-action="moneytree-close-modal">×</button>
              <div class="moneytree-discussion-detail">
                <div class="moneytree-discussion-header-row">
                  <div>
                    <div class="moneytree-discussion-detail-label">Selected discussion</div>
                    <h5 id="moneytree-modal-title">${escapeHtml(selectedDiscussion.title)}</h5>
                  </div>
                  <span class="moneytree-discussion-type-pill">${escapeHtml(
                    selectedDiscussion.discussion_type === 'question'
                      ? 'Question'
                      : selectedDiscussion.discussion_type === 'career'
                        ? 'Career'
                        : selectedDiscussion.discussion_type === 'open_chat'
                          ? 'Open Chat'
                          : 'Discussion'
                  )}</span>
                </div>
                <div class="moneytree-discussion-prompt">${escapeHtml(selectedDiscussion.prompt)}</div>
                ${selectedDiscussion.profession_gate ? `<div class="moneytree-discussion-gate">Profession gate: ${escapeHtml(selectedDiscussion.profession_gate)}</div>` : ''}
                <div class="moneytree-discussion-form">
                  <label class="moneytree-discussion-label" for="moneytree-answer-input">Your answer</label>
                  <textarea id="moneytree-answer-input" rows="7" placeholder="Write your answer here...">${escapeHtml(moneytreeState.submitDraft)}</textarea>
                  <div class="moneytree-discussion-meta">25-word minimum required</div>
                  ${moneytreeState.submitError ? `<div class="moneytree-discussion-message error">${escapeHtml(moneytreeState.submitError)}</div>` : ''}
                  ${moneytreeState.submitSuccess ? `<div class="moneytree-discussion-message success">${escapeHtml(moneytreeState.submitSuccess)}</div>` : ''}
                  <button type="button" class="moneytree-submit-button" data-action="moneytree-submit-answer" ${moneytreeState.submitting ? 'disabled' : ''}>
                    ${moneytreeState.submitting ? 'Submitting…' : 'Submit answer'}
                  </button>
                </div>
                ${selectedDiscussionFeedMarkup}
              </div>
            </div>
          </div>
        `
        : '';

      const modalScrollTop = document.querySelector('.moneytree-modal')?.scrollTop || 0;

      body.innerHTML = `
        <div class="moneytree-reference-shell">
          <header class="moneytree-app-header">
            <div class="moneytree-brand-lockup">
              <img class="moneytree-brand-mark" src="./images/icons/moneytree.PNG" alt="MoneyTree logo" />
              <div class="moneytree-brand-title">MoneyTree</div>
            </div>
            <div class="moneytree-header-actions">
              <button type="button" class="moneytree-icon-button" data-action="moneytree-refresh" aria-label="Refresh MoneyTree" title="Refresh MoneyTree">↻</button>
            </div>
          </header>

          <section class="moneytree-hero" aria-label="MoneyTree account overview">
            <span class="moneytree-stat-label">Available balance</span>
            <strong class="moneytree-hero-balance">${formatMoney(availableBalance)}</strong>
            <span class="moneytree-hero-subtitle">Money earned through your Tyranny: Rise to Power activity.</span>
            <span class="moneytree-pending-inline">Pending earnings: ${formatMoney(pendingEarnings)}</span>
          </section>

          <div class="moneytree-next-step" data-moneytree-clockin-section>
            <div class="moneytree-next-step-copy">
              <span class="moneytree-next-step-kicker">Welcome to MoneyTree Network!!</span>
              <h3>This is where you start to make your money.</h3>
              <p>We have gig work available to the general public, where you can get paid to participate in intelligent discussions.</p>
              <p>You can also get a bonus every hour for clocking in on time!!</p>
            </div>
          </div>

          <div class="moneytree-clockin-anchor">${clockInMarkup}</div>

          <div class="moneytree-panel moneytree-discussion-panel" data-moneytree-discussions-section>
            <div class="moneytree-panel-header">
              <h4>Available Discussions</h4>
              <button type="button" class="moneytree-refresh-button" data-action="moneytree-refresh">Refresh</button>
            </div>
            ${moneytreeState.discussionError ? `<div class="moneytree-empty-state"><strong>Unable to load discussions.</strong><p>${escapeHtml(moneytreeState.discussionError)}</p></div>` : ''}
            <div class="moneytree-discussion-wrapper">
              <div class="moneytree-discussion-list">${discussionListMarkup}</div>
            </div>
          </div>

          <div class="moneytree-panel" data-moneytree-activity-section>
            <div class="moneytree-panel-header">
              <h4>Discussion Activity</h4>
            </div>
            <div class="moneytree-activity-list">${activityMarkup}</div>
          </div>

          ${moderationMarkup}

          ${selectedDiscussionModalMarkup}

          <nav class="moneytree-bottom-nav" aria-label="MoneyTree navigation">
            <button type="button" class="moneytree-bottom-nav-item active" data-action="moneytree-scroll-top"><span aria-hidden="true">⌂</span>Home</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-scroll-discussions"><span aria-hidden="true">✦</span>Earn</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-scroll-activity"><span aria-hidden="true">◷</span>Activity</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-refresh"><span aria-hidden="true">↻</span>Refresh</button>
          </nav>
        </div>
      `;

      const restoredModal = body.querySelector('.moneytree-modal');
      if (restoredModal) {
        restoredModal.scrollTop = modalScrollTop;
      }

      body.querySelectorAll('[data-action="moneytree-refresh"]').forEach((refreshButton) => {
        refreshButton.addEventListener('click', async () => {
          moneytreeState.submitError = null;
          moneytreeState.submitSuccess = null;
          moneytreeState.submitDraft = '';
          moneytreeState.submitRequestId = null;
          moneytreeState.submitting = false;
          moneytreeState.clockInNotice = null;
          await loadMoneytreeView();
        });
      });

      const scrollToMoneytreeSection = (selector) => {
        body.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      body.querySelectorAll('[data-action="moneytree-scroll-clockin"]').forEach((button) => {
        button.addEventListener('click', () => scrollToMoneytreeSection('.moneytree-clockin-anchor'));
      });
      body.querySelectorAll('[data-action="moneytree-scroll-discussions"]').forEach((button) => {
        button.addEventListener('click', () => scrollToMoneytreeSection('[data-moneytree-discussions-section]'));
      });
      body.querySelectorAll('[data-action="moneytree-scroll-activity"]').forEach((button) => {
        button.addEventListener('click', () => scrollToMoneytreeSection('[data-moneytree-activity-section]'));
      });
      body.querySelectorAll('[data-action="moneytree-scroll-top"]').forEach((button) => {
        button.addEventListener('click', () => scrollToMoneytreeSection('.moneytree-reference-shell'));
      });

      const clockInButton = body.querySelector('[data-action="moneytree-clock-in"]');
      if (clockInButton) {
        clockInButton.addEventListener('click', handleClockInClaim);
      }

      body.querySelectorAll('[data-action="moneytree-select-discussion"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const nextId = button.getAttribute('data-discussion-id');
          if (!nextId) {
            return;
          }

          moneytreeState.selectedDiscussionId = nextId;
          moneytreeState.challengeParentContributionId = null;
          moneytreeState.expandedChallengeIds = new Set();
          moneytreeState.submitError = null;
          moneytreeState.submitSuccess = null;
          moneytreeState.submitDraft = '';
          moneytreeState.challengeDraft = '';
          moneytreeState.submitRequestId = null;
          moneytreeState.submitting = false;
          moneytreeState.selectedDiscussionFeed = [];
          moneytreeState.selectedDiscussionFeedError = null;
          moneytreeState.selectedDiscussionFeedLoading = true;
          renderDashboard(dashboard, activeDiscussions);
          await loadSelectedDiscussionFeed(nextId);
          renderDashboard(dashboard, activeDiscussions);
        });
      });

      body.querySelectorAll('[data-action="moneytree-toggle-challenge-section"]').forEach((button) => {
        button.addEventListener('click', () => {
          const contributionId = button.getAttribute('data-contribution-id');
          if (!contributionId) {
            return;
          }

          const key = String(contributionId);
          if (moneytreeState.expandedChallengeIds.has(key)) {
            moneytreeState.expandedChallengeIds.delete(key);
          } else {
            moneytreeState.expandedChallengeIds.add(key);
          }

          renderDashboard(dashboard, activeDiscussions);
        });
      });

      body.querySelectorAll('[data-action="moneytree-challenge-contribution"]').forEach((button) => {
        button.addEventListener('click', () => {
          const contributionId = button.getAttribute('data-contribution-id');
          if (!contributionId) {
            return;
          }

          moneytreeState.challengeParentContributionId = contributionId;
          moneytreeState.submitError = null;
          moneytreeState.submitSuccess = null;
          moneytreeState.submitDraft = '';
          moneytreeState.challengeDraft = '';
          moneytreeState.submitRequestId = null;
          moneytreeState.submitting = false;
          renderDashboard(dashboard, activeDiscussions);
        });
      });

      const closeMoneytreeModal = () => {
        moneytreeState.selectedDiscussionId = null;
        moneytreeState.challengeParentContributionId = null;
        moneytreeState.expandedChallengeIds = new Set();
        moneytreeState.submitError = null;
        moneytreeState.submitSuccess = null;
        moneytreeState.submitDraft = '';
        moneytreeState.challengeDraft = '';
        moneytreeState.submitRequestId = null;
        moneytreeState.submitting = false;
        renderDashboard(dashboard, activeDiscussions);
      };

      const backdrop = body.querySelector('.moneytree-modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (event) => {
          if (event.target === backdrop) {
            closeMoneytreeModal();
          }
        });
      }

      const modalCard = body.querySelector('.moneytree-modal');
      if (modalCard) {
        modalCard.addEventListener('click', (event) => {
          event.stopPropagation();
        });
        modalCard.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
        });
      }

      const closeButton = body.querySelector('.moneytree-modal-close');
      if (closeButton) {
        closeButton.addEventListener('click', (event) => {
          event.stopPropagation();
          closeMoneytreeModal();
        });
      }

      const submitButtons = body.querySelectorAll('[data-action="moneytree-submit-answer"], [data-action="moneytree-submit-challenge"]');
      submitButtons.forEach((submitButton) => {
        submitButton.addEventListener('click', async () => {
          if (!selectedDiscussion) {
            return;
          }

          const isChallenge = submitButton.getAttribute('data-action') === 'moneytree-submit-challenge';
          const answerInput = body.querySelector(isChallenge ? '#moneytree-challenge-input' : '#moneytree-answer-input');
          const draftStateKey = isChallenge ? 'challengeDraft' : 'submitDraft';
          const trimmedAnswer = (answerInput?.value ?? moneytreeState[draftStateKey] ?? '').trim();

          if (!trimmedAnswer) {
            moneytreeState.submitError = isChallenge
              ? 'Please enter your challenge before submitting.'
              : 'Please enter your answer before submitting.';
            moneytreeState.submitSuccess = null;
            moneytreeState[draftStateKey] = '';
            renderDashboard(dashboard, activeDiscussions);
            return;
          }

          const answerWordCount = countMoneytreeWords(trimmedAnswer);
          if (answerWordCount < 25) {
            moneytreeState.submitError = isChallenge
              ? 'Challenge responses must contain at least 25 words.'
              : 'Responses must contain at least 25 words.';
            moneytreeState.submitSuccess = null;
            moneytreeState[draftStateKey] = trimmedAnswer;
            renderDashboard(dashboard, activeDiscussions);
            return;
          }

          if (trimmedAnswer.length > 4000) {
            moneytreeState.submitError = 'Your answer is too long. Please keep it under 4,000 characters.';
            moneytreeState.submitSuccess = null;
            moneytreeState[draftStateKey] = trimmedAnswer;
            renderDashboard(dashboard, activeDiscussions);
            return;
          }

          const contributionType = isChallenge ? 'challenge' : getDiscussionContributionType(selectedDiscussion);
          const parentContributionId = isChallenge ? moneytreeState.challengeParentContributionId : null;
          const requestId = moneytreeState.submitRequestId ?? createSubmissionRequestId();
          moneytreeState.submitRequestId = requestId;
          moneytreeState[draftStateKey] = trimmedAnswer;
          moneytreeState.submitError = null;
          moneytreeState.submitting = true;
          moneytreeState.submitSuccess = null;
          renderDashboard(dashboard, activeDiscussions);

          const supabase = getAuthClient();
          const session = (await supabase?.auth.getSession())?.data?.session;

          if (!supabase || !session?.user) {
            moneytreeState.submitting = false;
            moneytreeState.submitError = 'Your session has expired. Please sign in again.';
            moneytreeState.submitSuccess = null;
            renderDashboard(dashboard, activeDiscussions);
            return;
          }

          let refreshAfterSuccessfulSubmission = false;

          try {
            const { data, error } = await supabase.rpc('submit_moneytree_contribution', {
              p_discussion_id: selectedDiscussion.id,
              p_contribution_type: contributionType,
              p_parent_contribution_id: parentContributionId,
              p_content: trimmedAnswer,
              p_submission_request_id: requestId,
            });

            if (error) {
              throw error;
            }

            const firstResult = Array.isArray(data) ? data[0] : data;
            const resultValue = firstResult?.result ?? firstResult?.moderation_state ?? 'submitted';

            if (resultValue === 'duplicate_request') {
              moneytreeState.submitSuccess = 'This submission has already been recorded.';
              moneytreeState.submitError = null;
            } else {
              moneytreeState.submitSuccess = isChallenge
                ? 'Your challenge was submitted for review.'
                : 'Your answer was submitted for review.';
              moneytreeState.submitError = null;
              moneytreeState[draftStateKey] = '';
              moneytreeState.submitRequestId = null;
              if (isChallenge) {
                moneytreeState.challengeParentContributionId = null;
                moneytreeState.challengeDraft = '';
              } else {
                moneytreeState.submitDraft = '';
              }

              try {
                if (moneytreeState.selectedDiscussionId === selectedDiscussion.id) {
                  await loadSelectedDiscussionFeed(selectedDiscussion.id);
                }
                await loadMoneytreeView();
                refreshAfterSuccessfulSubmission = true;
              } catch (refreshError) {
                console.error('MoneyTree dashboard refresh after successful submission failed:', refreshError);
              } finally {
                moneytreeState.submitting = false;
              }

              return;
            }
          } catch (error) {
            console.error('MoneyTree contribution submission failed:', error);
            moneytreeState.submitError = error?.message || 'Unable to submit your answer right now. Please try again.';
            moneytreeState.submitSuccess = null;
          } finally {
            if (!refreshAfterSuccessfulSubmission) {
              moneytreeState.submitting = false;
              renderDashboard(dashboard, activeDiscussions);
            }
          }
        });
      });
    };

    const renderLoadingState = () => {
      const placeholderBalance = formatMoney(Number(moneytreeState.dashboardData?.available_balance ?? 0));
      const placeholderPending = formatMoney(Number(moneytreeState.dashboardData?.pending_earnings ?? 0));

      body.innerHTML = `
        <div class="moneytree-reference-shell moneytree-loading-shell">
          <header class="moneytree-app-header">
            <div class="moneytree-brand-lockup">
              <img class="moneytree-brand-mark" src="./images/icons/moneytree.PNG" alt="MoneyTree logo" />
              <div class="moneytree-brand-title">MoneyTree</div>
            </div>
            <div class="moneytree-header-actions">
              <button type="button" class="moneytree-icon-button" data-action="moneytree-refresh" aria-label="Refresh MoneyTree" title="Refresh MoneyTree">↻</button>
            </div>
          </header>

          <section class="moneytree-hero" aria-label="MoneyTree account overview">
            <span class="moneytree-stat-label">Available balance</span>
            <strong class="moneytree-hero-balance">${escapeHtml(placeholderBalance)}</strong>
            <span class="moneytree-hero-subtitle">Money earned through your Tyranny: Rise to Power activity.</span>
            <span class="moneytree-pending-inline">Pending earnings: ${escapeHtml(placeholderPending)}</span>
          </section>

          <div class="moneytree-next-step" data-moneytree-clockin-section>
            <div class="moneytree-next-step-copy">
              <span class="moneytree-next-step-kicker">Welcome to MoneyTree Network!!</span>
              <h3>This is where you start to make your money.</h3>
              <p>We have gig work available to the general public, where you can get paid to participate in intelligent discussions.</p>
              <p>You can also get a bonus every hour for clocking in on time!!</p>
            </div>
          </div>

          <div class="moneytree-panel moneytree-discussion-panel" data-moneytree-discussions-section>
            <div class="moneytree-panel-header">
              <h4>Available Discussions</h4>
              <button type="button" class="moneytree-refresh-button" data-action="moneytree-refresh">Refresh</button>
            </div>
            <div class="moneytree-empty-state"><strong>Loading discussions…</strong><p>Fetching the latest MoneyTree questions.</p></div>
          </div>

          <div class="moneytree-panel" data-moneytree-activity-section>
            <div class="moneytree-panel-header">
              <h4>Discussion Activity</h4>
            </div>
            <div class="moneytree-empty-state"><strong>Loading your dashboard…</strong></div>
          </div>

          <nav class="moneytree-bottom-nav" aria-label="MoneyTree navigation">
            <button type="button" class="moneytree-bottom-nav-item active" data-action="moneytree-scroll-top"><span aria-hidden="true">⌂</span>Home</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-scroll-discussions"><span aria-hidden="true">✦</span>Earn</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-scroll-activity"><span aria-hidden="true">◷</span>Activity</button>
            <button type="button" class="moneytree-bottom-nav-item" data-action="moneytree-refresh"><span aria-hidden="true">↻</span>Refresh</button>
          </nav>
        </div>
      `;

      const refreshButton = body.querySelector('[data-action="moneytree-refresh"]');
      if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
          moneytreeState.submitError = null;
          moneytreeState.submitSuccess = null;
          moneytreeState.submitDraft = '';
          moneytreeState.submitRequestId = null;
          moneytreeState.submitting = false;
          moneytreeState.clockInNotice = null;
          await loadMoneytreeView();
        });
      }
    };

    const renderErrorState = (message) => {
      body.innerHTML = `
        <div class="moneytree-dashboard">
          <div class="moneytree-summary-grid">
            <div class="moneytree-stat-card moneytree-balance-card">
              <span class="moneytree-stat-label">Available Balance</span>
              <strong class="moneytree-stat-value">Unavailable</strong>
            </div>
            <div class="moneytree-stat-card moneytree-pending-card">
              <span class="moneytree-stat-label">Pending Earnings</span>
              <strong class="moneytree-stat-value">Unavailable</strong>
              <small>Not spendable yet</small>
            </div>
          </div>

          <div class="moneytree-panel moneytree-discussion-panel">
            <div class="moneytree-panel-header">
              <h4>Available Discussions</h4>
              <button type="button" class="moneytree-refresh-button" data-action="moneytree-refresh">Refresh</button>
            </div>
            <div class="moneytree-empty-state">
              <strong>Unable to load discussions.</strong>
              <p>${escapeHtml(message)}</p>
            </div>
          </div>

          <div class="moneytree-panel">
            <div class="moneytree-panel-header">
              <h4>Discussion Activity</h4>
            </div>
            <div class="moneytree-empty-state">
              <strong>Unable to load dashboard.</strong>
              <p>${escapeHtml(message)}</p>
            </div>
          </div>
        </div>
      `;

      const refreshButton = body.querySelector('[data-action="moneytree-refresh"]');
      if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
          moneytreeState.submitError = null;
          moneytreeState.submitSuccess = null;
          moneytreeState.submitDraft = '';
          moneytreeState.submitRequestId = null;
          moneytreeState.submitting = false;
          await loadMoneytreeView();
        });
      }
    };

    const loadMoneytreeView = async () => {
      if (moneytreeState.dashboardLoading) {
        return moneytreeState.dashboardLoading;
      }

      const sessionRequest = getAuthClient();
      const session = (await sessionRequest?.auth.getSession())?.data?.session;
      const hasValidSession = Boolean(sessionRequest && session?.user);

      if (!sessionRequest || !session?.user) {
        console.warn('MoneyTree dashboard request blocked: no valid authenticated session.', {
          hasSupabaseClient: Boolean(sessionRequest),
          hasValidSession,
          sessionUserId: session?.user?.id ? '[redacted]' : null,
        });
        renderErrorState('Your session has expired. Please sign in again.');
        return;
      }

      const dashboardRequest = async () => {
        const { data, error } = await sessionRequest.functions.invoke('get-moneytree-dashboard', {
          method: 'GET',
        });

        if (error) {
          const errorStatus = Number(error?.status ?? error?.details?.status ?? 0);
          const errorBody = typeof error?.context === 'object' && error.context !== null
            ? error.context
            : (typeof error?.message === 'string' ? { message: error.message } : {});

          console.error('MoneyTree dashboard Edge Function failure', {
            functionName: 'get-moneytree-dashboard',
            httpStatus: errorStatus || 'unknown',
            hasValidSession,
            responseBody: errorBody,
            supabaseError: {
              name: error?.name || 'SupabaseError',
              message: error?.message || 'Unknown error',
              status: error?.status || null,
              details: error?.details || null,
              hint: error?.hint || null,
              code: error?.code || null,
            },
            corsRejected: Boolean(errorStatus === 403 && typeof error?.message === 'string' && error.message.toLowerCase().includes('origin')),
            authorizationRejected: Boolean(errorStatus === 401 || errorStatus === 403),
          });
          throw error;
        }

        return data || {};
      };

      const essentialsPromise = async () => {
        const [dashboardData, clockInStatus] = await Promise.allSettled([
          dashboardRequest(),
          loadClockInStatus(),
        ]);

        if (dashboardData.status === 'rejected') {
          throw dashboardData.reason;
        }

        if (dashboardData.status === 'fulfilled') {
          moneytreeState.dashboardData = dashboardData.value || {};
        }

        if (clockInStatus.status === 'fulfilled' && clockInStatus.value) {
          moneytreeState.clockInStatus = clockInStatus.value;
        }

        return moneytreeState.dashboardData;
      };

      moneytreeState.dashboardLoading = (async () => {
        renderLoadingState();

        try {
          const dashboardData = await essentialsPromise();
          const discussions = await loadActiveDiscussions();
          await loadModeratorQueue();
          renderDashboard(dashboardData || {}, discussions);
          return dashboardData || {};
        } catch (error) {
          const httpStatus = Number(error?.status ?? 0);
          const responseBody = typeof error?.context === 'object' && error.context !== null
            ? error.context
            : (typeof error?.message === 'string' ? { message: error.message } : {});

          console.error('MoneyTree dashboard load failed:', {
            functionName: 'get-moneytree-dashboard',
            httpStatus: httpStatus || 'unknown',
            hasValidSession,
            responseBody,
            supabaseError: {
              name: error?.name || 'Error',
              message: error?.message || 'Unknown error',
              status: error?.status || null,
              details: error?.details || null,
              hint: error?.hint || null,
              code: error?.code || null,
            },
            corsRejected: Boolean(httpStatus === 403 && typeof error?.message === 'string' && error.message.toLowerCase().includes('origin')),
            authorizationRejected: Boolean(httpStatus === 401 || httpStatus === 403),
          });
          renderErrorState('We couldn\'t load your MoneyTree information. Please try again.');
          return {};
        } finally {
          moneytreeState.dashboardLoading = false;
        }
      })();

      return moneytreeState.dashboardLoading;
    };

    if (moneytreeState.clockInTimer) {
      clearInterval(moneytreeState.clockInTimer);
    }

    moneytreeState.clockInTimer = setInterval(() => {
      const root = document.querySelector('[data-moneytree-clockin-root]');
      if (!root || !moneytreeState.clockInStatus || !moneytreeState.clockInStatus.window_is_open || moneytreeState.clockInStatus.already_claimed) {
        return;
      }

      const endTime = new Date(moneytreeState.clockInStatus.window_end).getTime();
      if (!Number.isFinite(endTime)) {
        return;
      }

      const effectiveNow = moneytreeState.clockInStatus.server_now && moneytreeState.clockInStatus.fetchedAtMs
        ? new Date(new Date(moneytreeState.clockInStatus.server_now).getTime() + (Date.now() - moneytreeState.clockInStatus.fetchedAtMs))
        : new Date();

      const remainingSeconds = Math.max(0, Math.ceil((endTime - effectiveNow.getTime()) / 1000));
      const countdownEl = root.querySelector('[data-moneytree-clockin-countdown]');
      if (countdownEl) {
        countdownEl.textContent = formatClockInCountdown(remainingSeconds);
      }

      if (remainingSeconds <= 0) {
        loadClockInStatus();
      }
    }, 1000);

    loadMoneytreeView();
  }

  if (appId === 'moderator') {
    body.innerHTML = `
      <div class="moneytree-dashboard">
        <div class="moderator-subpage-nav" role="tablist" aria-label="Moderator tools">
          <button type="button" class="secondary-button moderator-subpage-button active" data-action="moderator-subpage" data-subpage="queue" aria-pressed="true">Moderation Queue</button>
          <button type="button" class="secondary-button moderator-subpage-button" data-action="moderator-subpage" data-subpage="owner" aria-pressed="false">Owner Balance</button>
          <button type="button" class="secondary-button moderator-subpage-button" data-action="moderator-subpage" data-subpage="polls" aria-pressed="false">Poll Management</button>
          <button type="button" class="secondary-button moderator-subpage-button" data-action="moderator-subpage" data-subpage="newsroom" aria-pressed="false">Newsroom</button>
        </div>

        <div class="moneytree-panel moneytree-discussion-panel moderator-subpage-panel" data-moderator-subpage="queue">
          <div class="moneytree-panel-header">
            <h4>Moderator Dashboard</h4>
            <button type="button" class="moneytree-refresh-button" data-action="moderator-refresh-queue">Refresh</button>
          </div>
          <div id="moderatorQueueState" class="moneytree-empty-state"><strong>Loading moderation queue…</strong><p>Verifying moderator authorization and fetching pending submissions.</p></div>
        </div>

        <div class="moneytree-panel moderator-subpage-panel" data-moderator-subpage="owner">
          <div class="moneytree-panel-header">
            <h4>Owner Balance Management</h4>
          </div>
          <div id="moderatorOwnerState" class="moneytree-empty-state"><strong>Checking owner access…</strong><p>Validating project owner authorization before you can adjust balances.</p></div>
        </div>

        <div class="moneytree-panel moderator-subpage-panel" data-moderator-subpage="polls">
          <div class="moneytree-panel-header">
            <h4>Poll Management</h4>
          </div>
          <div id="moderatorPollState" class="moneytree-empty-state"><strong>Checking owner access…</strong><p>Validating project owner authorization before managing civic polls.</p></div>
        </div>

        <div class="moneytree-panel moderator-subpage-panel" data-moderator-subpage="newsroom">
          <div class="moneytree-panel-header">
            <h4>Newsroom</h4>
          </div>
          <div id="moderatorNewsroomState" class="moneytree-empty-state"><strong>Loading newsroom…</strong><p>Checking moderator access before loading local articles.</p></div>
        </div>
      </div>
    `;

    const queueState = document.getElementById('moderatorQueueState');
    const ownerState = document.getElementById('moderatorOwnerState');
    const pollState = document.getElementById('moderatorPollState');
    const newsroomStateEl = document.getElementById('moderatorNewsroomState');

    const syncModeratorSubpageVisibility = () => {
      const activePage = moderatorAppState.currentSubpage || 'queue';
      document.querySelectorAll('.moderator-subpage-panel').forEach((panel) => {
        const isActive = panel.dataset.moderatorSubpage === activePage;
        panel.hidden = !isActive;
        panel.classList.toggle('is-active', isActive);
      });

      document.querySelectorAll('[data-action="moderator-subpage"]').forEach((button) => {
        const isActive = (button.getAttribute('data-subpage') || 'queue') === activePage;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const renderNewsroomPanel = () => {
      if (!newsroomStateEl) {
        return;
      }

      const articles = newsroomState.articles || [];
      const draft = newsroomState.draft || {
        headline: '',
        excerpt: '',
        featuredImageUrl: '',
        contentHtml: '',
        status: 'draft',
      };

      if (newsroomState.loading) {
        newsroomStateEl.className = 'moneytree-empty-state';
        newsroomStateEl.innerHTML = '<strong>Loading news articles…</strong><p>Checking the latest newsroom updates and draft status.</p>';
        initialiseNewsroomEditor();
        return;
      }

      const formMarkup = `
        <div class="moneytree-review-item newsroom-editor-shell">
          <div class="moneytree-review-header newsroom-editor-header">
            <div>
              <div class="moneytree-review-title">${newsroomState.editingId ? 'Edit article' : 'New article'}</div>
              <div class="moneytree-review-meta">Local newsroom update</div>
            </div>
          </div>

          <div class="newsroom-editor-stack">
            <div class="newsroom-field newsroom-field-wide">
              <label class="moneytree-review-label" for="newsroom-headline">Headline</label>
              <input id="newsroom-headline" class="moneytree-review-reason" type="text" value="${escapeHtml(draft.headline)}" placeholder="Headline" />
            </div>

            <div class="newsroom-field newsroom-field-wide">
              <label class="moneytree-review-label" for="newsroom-content-html">Article body</label>
              <textarea id="newsroom-content-html" class="moneytree-review-reason" rows="10" placeholder="Write the article here...">${escapeHtml(draft.contentHtml)}</textarea>
            </div>

            <div class="newsroom-field newsroom-field-wide">
              <label class="moneytree-review-label">Add image</label>
              <div class="newsroom-media-row">
                <input id="newsroom-featured-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                <button type="button" class="secondary-button" data-action="newsroom-upload-featured-image" ${newsroomState.uploadingImage ? 'disabled' : ''}>${newsroomState.uploadingImage ? 'Uploading…' : 'Upload image'}</button>
              </div>
              ${draft.featuredImageUrl ? `<div class="newsroom-upload-preview"><span>Selected image</span><small>${escapeHtml(draft.featuredImageUrl)}</small></div>` : ''}
            </div>
          </div>

          ${newsroomState.error ? `<div class="moneytree-discussion-message error">${escapeHtml(newsroomState.error)}</div>` : ''}
          ${newsroomState.message ? `<div class="moneytree-discussion-message success">${escapeHtml(newsroomState.message)}</div>` : ''}

          <div class="moneytree-review-actions">
            <button type="button" class="moneytree-review-button approve" data-action="newsroom-save-draft">Save draft</button>
            <button type="button" class="moneytree-review-button approve" data-action="newsroom-publish">Publish</button>
            ${newsroomState.editingId ? '<button type="button" class="moneytree-review-button reject" data-action="newsroom-new-article">New article</button>' : ''}
          </div>
        </div>
      `;

      const listMarkup = articles.length ? articles.map((article) => `
        <article class="moneytree-review-item newsroom-article-card">
          <div class="moneytree-review-header">
            <div>
              <div class="moneytree-review-title">${escapeHtml(article.headline || 'Untitled article')}</div>
              <div class="moneytree-review-meta">${escapeHtml(article.status || 'draft')} • ${escapeHtml(formatNewsDate(article.published_at || article.created_at))}</div>
            </div>
            <span class="moneytree-review-pill">${escapeHtml(article.status || 'draft')}</span>
          </div>

          <div class="moneytree-review-content">
            <p>${escapeHtml(article.excerpt || 'No synopsis has been added yet.')}</p>
          </div>

          <div class="moneytree-review-actions">
            <button type="button" class="moneytree-review-button approve" data-action="newsroom-edit-article" data-article-id="${escapeHtml(article.id || '')}">Edit</button>
            <button type="button" class="moneytree-review-button approve" data-action="newsroom-publish-existing" data-article-id="${escapeHtml(article.id || '')}">Publish</button>
            <button type="button" class="moneytree-review-button reject" data-action="newsroom-archive-article" data-article-id="${escapeHtml(article.id || '')}">Archive</button>
          </div>
        </article>
      `).join('') : '<div class="moneytree-empty-state"><strong>No newsroom articles yet.</strong><p>Draft a story to begin publishing local coverage.</p></div>';

      newsroomStateEl.className = 'moneytree-activity-list';
      newsroomStateEl.innerHTML = `${formMarkup}${listMarkup}`;
      initialiseNewsroomEditor();
    };

    const syncNewsroomDraft = (article) => {
      newsroomState.editingId = article?.id || null;
      newsroomState.draft = {
        headline: article?.headline || '',
        excerpt: article?.excerpt || '',
        featuredImageUrl: article?.featured_image_url || '',
        contentHtml: article?.content_html || '',
        status: article?.status || 'draft',
      };
      newsroomState.history = [article?.content_html || ''];
      newsroomState.historyIndex = 0;
    };

    const pushNewsroomHistory = (contentHtml) => {
      const cleaned = String(contentHtml ?? '');
      const current = newsroomState.history[newsroomState.historyIndex] ?? '';

      if (current === cleaned) {
        return;
      }

      newsroomState.history = newsroomState.history.slice(0, newsroomState.historyIndex + 1);
      newsroomState.history.push(cleaned);
      newsroomState.historyIndex = newsroomState.history.length - 1;

      if (newsroomState.history.length > 25) {
        newsroomState.history = newsroomState.history.slice(-25);
        newsroomState.historyIndex = newsroomState.history.length - 1;
      }
    };

    const updateNewsroomContentFromTextarea = () => {
      const textarea = document.getElementById('newsroom-content-html');
      if (!textarea) {
        return;
      }
      newsroomState.draft.contentHtml = textarea.value;
      pushNewsroomHistory(textarea.value);
    };

    const applyNewsroomFormatting = (formatName) => {
      const textarea = document.getElementById('newsroom-content-html');
      if (!textarea) {
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = textarea.value;
      const selectedText = currentValue.slice(start, end) || 'text';
      const insertPair = (openTag, closeTag) => {
        const nextValue = `${currentValue.slice(0, start)}${openTag}${selectedText}${closeTag}${currentValue.slice(end)}`;
        textarea.value = nextValue;
        textarea.focus();
        const nextStart = start + openTag.length;
        textarea.setSelectionRange(nextStart, nextStart + selectedText.length);
        updateNewsroomContentFromTextarea();
      };

      if (formatName === 'undo') {
        if (newsroomState.historyIndex <= 0) {
          return;
        }
        newsroomState.historyIndex -= 1;
        const previousValue = newsroomState.history[newsroomState.historyIndex] ?? '';
        textarea.value = previousValue;
        newsroomState.draft.contentHtml = previousValue;
        return;
      }

      if (formatName === 'redo') {
        if (newsroomState.historyIndex >= newsroomState.history.length - 1) {
          return;
        }
        newsroomState.historyIndex += 1;
        const nextValue = newsroomState.history[newsroomState.historyIndex] ?? '';
        textarea.value = nextValue;
        newsroomState.draft.contentHtml = nextValue;
        return;
      }

      switch (formatName) {
        case 'bold':
          insertPair('<strong>', '</strong>');
          break;
        case 'italic':
          insertPair('<em>', '</em>');
          break;
        case 'underline':
          insertPair('<u>', '</u>');
          break;
        case 'heading':
          insertPair('<h2>', '</h2>');
          break;
        case 'bullet-list':
          insertPair('<ul><li>', '</li></ul>');
          break;
        case 'numbered-list':
          insertPair('<ol><li>', '</li></ol>');
          break;
        case 'blockquote':
          insertPair('<blockquote>', '</blockquote>');
          break;
        default:
          textarea.focus();
          break;
      }
    };

    const getAllowedUploadMimeTypes = () => new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

    const uploadNewsroomMedia = async (file, mode = 'featured') => {
      if (!file) {
        return null;
      }

      if (!getAllowedUploadMimeTypes().has(file.type)) {
        throw new Error('Only PNG, JPG, WEBP, and GIF images are allowed.');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image files must be 5MB or smaller.');
      }

      const extension = file.name?.split('.').pop()?.toLowerCase() || 'png';
      const objectPath = `newsroom/${mode}/${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)}.${extension}`;
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const { data, error } = await supabase.storage.from('local-news-media').upload(objectPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

      if (error) {
        throw error;
      }

      return data?.path || objectPath;
    };

    const uploadFeaturedImage = async () => {
      const input = document.getElementById('newsroom-featured-image-input');
      const file = input?.files?.[0];
      if (!file) {
        newsroomState.error = 'Choose an image file before uploading it.';
        newsroomState.message = null;
        renderNewsroomPanel();
        return;
      }

      try {
        newsroomState.uploadingImage = true;
        newsroomState.error = null;
        newsroomState.message = 'Uploading featured image…';
        renderNewsroomPanel();

        const uploadedPath = await uploadNewsroomMedia(file, 'featured');
        newsroomState.draft.featuredImageUrl = uploadedPath;
        newsroomState.message = 'Featured image uploaded successfully.';
        if (input) {
          input.value = '';
        }
        renderNewsroomPanel();
      } catch (error) {
        console.error('Featured image upload failed:', error);
        newsroomState.error = error?.message || 'The featured image could not be uploaded.';
        newsroomState.message = null;
        renderNewsroomPanel();
      } finally {
        newsroomState.uploadingImage = false;
      }
    };

    const insertInlineImageIntoEditor = async () => {
      const input = document.getElementById('newsroom-inline-image-input');
      if (!input) {
        return;
      }

      input.click();
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          return;
        }

        try {
          newsroomState.uploadingImage = true;
          newsroomState.error = null;
          newsroomState.message = 'Uploading image…';
          renderNewsroomPanel();

          const uploadedPath = await uploadNewsroomMedia(file, 'inline');
          const textarea = document.getElementById('newsroom-content-html');
          if (!textarea) {
            throw new Error('The editor is unavailable.');
          }

          const imageHtml = `<img src="${uploadedPath}" alt="Newsroom inline image" />`;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const currentValue = textarea.value;
          textarea.value = `${currentValue.slice(0, start)}${imageHtml}${currentValue.slice(end)}`;
          textarea.focus();
          textarea.setSelectionRange(start + imageHtml.length, start + imageHtml.length);
          newsroomState.draft.contentHtml = textarea.value;
          pushNewsroomHistory(textarea.value);
          newsroomState.message = 'Inline image uploaded and inserted successfully.';
          renderNewsroomPanel();
        } catch (error) {
          console.error('Inline image upload failed:', error);
          newsroomState.error = error?.message || 'The inline image could not be uploaded.';
          newsroomState.message = null;
          renderNewsroomPanel();
        } finally {
          newsroomState.uploadingImage = false;
          input.value = '';
          input.onchange = null;
        }
      };
    };

    const loadNewsroomArticles = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        newsroomState.loading = false;
        newsroomState.error = 'Your session has expired. Please sign in again.';
        newsroomState.articles = [];
        renderNewsroomPanel();
        return [];
      }

      newsroomState.loading = true;
      newsroomState.error = null;
      newsroomState.message = null;
      renderNewsroomPanel();

      try {
        const { data, error } = await supabase.rpc('get_newsroom_articles_for_moderator');
        if (error) {
          throw error;
        }

        newsroomState.articles = Array.isArray(data)
          ? data.map((article) => ({
              id: article?.id ?? article?.article_id ?? null,
              headline: article?.headline ?? 'Untitled article',
              excerpt: article?.excerpt ?? '',
              featured_image_url: article?.featured_image_url ?? '',
              content_html: article?.content_html ?? '',
              status: article?.status ?? 'draft',
              created_at: article?.created_at ?? null,
              published_at: article?.published_at ?? null,
            })).filter((article) => article.id)
          : [];

        if (newsroomState.editingId && !newsroomState.articles.some((article) => article.id === newsroomState.editingId)) {
          newsroomState.editingId = null;
          newsroomState.draft = { headline: '', excerpt: '', featuredImageUrl: '', contentHtml: '', status: 'draft' };
        }
      } catch (error) {
        console.error('Newsroom load failed:', error);
        newsroomState.articles = [];
        newsroomState.error = error?.message || 'Unable to load the newsroom right now.';
      } finally {
        newsroomState.loading = false;
        renderNewsroomPanel();
      }
    };

    const saveNewsroomDraft = async (targetStatus = 'draft') => {
      const headlineInput = document.getElementById('newsroom-headline');
      const excerptInput = document.getElementById('newsroom-excerpt');
      const contentInput = document.getElementById('newsroom-content-html');
      const statusSelect = document.getElementById('newsroom-status-select');

      const headline = (headlineInput?.value || newsroomState.draft.headline || '').trim();
      const excerpt = (excerptInput?.value || newsroomState.draft.excerpt || '').trim();
      const featuredImageUrl = String(newsroomState.draft.featuredImageUrl || '').trim();
      const contentHtml = (contentInput?.value || newsroomState.draft.contentHtml || '').trim();
      const nextStatus = (statusSelect?.value || targetStatus || newsroomState.draft.status || 'draft');

      if (!headline) {
        newsroomState.error = 'A headline is required before saving the story.';
        newsroomState.message = null;
        renderNewsroomPanel();
        return;
      }

      if (!contentHtml) {
        newsroomState.error = 'Article content is required before saving or publishing.';
        newsroomState.message = null;
        renderNewsroomPanel();
        return;
      }

      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        newsroomState.error = 'Your session has expired. Please sign in again.';
        newsroomState.message = null;
        renderNewsroomPanel();
        return;
      }

      try {
        newsroomState.error = null;
        newsroomState.message = targetStatus === 'published' || nextStatus === 'published' ? 'Publishing article…' : 'Saving draft…';
        renderNewsroomPanel();

        const { data, error } = await supabase.rpc('upsert_news_article', {
          p_id: newsroomState.editingId || null,
          p_headline: headline,
          p_excerpt: excerpt,
          p_featured_image_url: featuredImageUrl || null,
          p_content_html: sanitizeRichTextHtml(contentHtml),
          p_status: targetStatus === 'published' || nextStatus === 'published' ? 'published' : (nextStatus === 'archived' ? 'archived' : 'draft'),
        });

        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : data;
        newsroomState.message = result?.result === 'published' ? 'Article published successfully.' : 'Article saved successfully.';
        newsroomState.error = null;
        newsroomState.editingId = result?.article_id || newsroomState.editingId || null;
        newsroomState.draft = {
          headline,
          excerpt,
          featuredImageUrl,
          contentHtml: sanitizeRichTextHtml(contentHtml),
          status: targetStatus === 'published' || nextStatus === 'published' ? 'published' : (nextStatus === 'archived' ? 'archived' : 'draft'),
        };
        await loadNewsroomArticles();
      } catch (error) {
        console.error('Newsroom save failed:', error);
        newsroomState.error = error?.message || 'Unable to save the newsroom article.';
        newsroomState.message = null;
        renderNewsroomPanel();
      }
    };

    const resetNewsroomDraft = () => {
      newsroomState.editingId = null;
      newsroomState.draft = {
        headline: '',
        excerpt: '',
        featuredImageUrl: '',
        contentHtml: '',
        status: 'draft',
      };
      renderNewsroomPanel();
    };

    const initialiseNewsroomEditor = () => {
      const saveButton = body.querySelector('[data-action="newsroom-save-draft"]');
      if (saveButton && !saveButton.dataset.localNewsroomBound) {
        saveButton.dataset.localNewsroomBound = 'true';
        saveButton.addEventListener('click', () => saveNewsroomDraft('draft'));
      }

      const publishButton = body.querySelector('[data-action="newsroom-publish"]');
      if (publishButton && !publishButton.dataset.localNewsroomBound) {
        publishButton.dataset.localNewsroomBound = 'true';
        publishButton.addEventListener('click', () => saveNewsroomDraft('published'));
      }

      const uploadImageButton = body.querySelector('[data-action="newsroom-upload-featured-image"]');
      if (uploadImageButton && !uploadImageButton.dataset.localNewsroomBound) {
        uploadImageButton.dataset.localNewsroomBound = 'true';
        uploadImageButton.addEventListener('click', uploadFeaturedImage);
      }

      const inlineImageButton = body.querySelector('[data-action="newsroom-insert-inline-image"]');
      if (inlineImageButton && !inlineImageButton.dataset.localNewsroomBound) {
        inlineImageButton.dataset.localNewsroomBound = 'true';
        inlineImageButton.addEventListener('click', insertInlineImageIntoEditor);
      }

      const formatButtons = body.querySelectorAll('[data-action="newsroom-format"]');
      formatButtons.forEach((button) => {
        if (button.dataset.localNewsroomFormatBound) {
          return;
        }
        button.dataset.localNewsroomFormatBound = 'true';
        button.addEventListener('click', () => applyNewsroomFormatting(button.dataset.format || 'bold'));
      });

      const textarea = document.getElementById('newsroom-content-html');
      if (textarea && !textarea.dataset.localNewsroomBound) {
        textarea.dataset.localNewsroomBound = 'true';
        textarea.addEventListener('input', updateNewsroomContentFromTextarea);
      }

      const newArticleButton = body.querySelector('[data-action="newsroom-new-article"]');
      if (newArticleButton && !newArticleButton.dataset.localNewsroomBound) {
        newArticleButton.dataset.localNewsroomBound = 'true';
        newArticleButton.addEventListener('click', resetNewsroomDraft);
      }

      body.querySelectorAll('[data-action="newsroom-edit-article"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const articleId = button.getAttribute('data-article-id');
          const article = newsroomState.articles.find((entry) => entry.id === articleId);
          if (!article) {
            return;
          }
          syncNewsroomDraft(article);
          renderNewsroomPanel();
          initialiseNewsroomEditor();
        });
      });

      body.querySelectorAll('[data-action="newsroom-publish-existing"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const articleId = button.getAttribute('data-article-id');
          const article = newsroomState.articles.find((entry) => entry.id === articleId);
          if (!article) {
            return;
          }
          syncNewsroomDraft(article);
          await saveNewsroomDraft('published');
        });
      });

      body.querySelectorAll('[data-action="newsroom-archive-article"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const articleId = button.getAttribute('data-article-id');
          const article = newsroomState.articles.find((entry) => entry.id === articleId);
          if (!article) {
            return;
          }
          syncNewsroomDraft(article);
          const currentValue = newsroomState.draft.status;
          newsroomState.draft.status = 'archived';
          const element = document.getElementById('newsroom-status-select');
          if (element) {
            element.value = 'archived';
          }
          await saveNewsroomDraft('archived');
          newsroomState.draft.status = currentValue;
        });
      });
    };

    renderNewsroomPanel();
    initialiseNewsroomEditor();
    loadNewsroomArticles();

    const renderModeratorPollPanel = () => {
      if (!pollState) {
        return;
      }

      if (moderatorAppState.ownerLoading) {
        pollState.className = 'moneytree-empty-state';
        pollState.innerHTML = '<strong>Checking owner access…</strong><p>Validating project owner authorization before you can manage civic polls.</p>';
        return;
      }

      if (moderatorPollState.loading) {
        pollState.className = 'moneytree-empty-state';
        pollState.innerHTML = '<strong>Loading polls…</strong><p>Checking the current civic ballot state for approved owner actions.</p>';
        return;
      }

      if (!moderatorAppState.ownerAccess) {
        pollState.className = 'moneytree-empty-state';
        pollState.innerHTML = `
          <strong>Owner access required.</strong>
          <p>${escapeHtml(moderatorAppState.ownerError || moderatorAppState.ownerMessage || 'Only the project owner may manage civic polls.')}</p>
        `;
        return;
      }

      const createPollMarkup = `
        <div class="moneytree-review-item">
          <div class="moneytree-review-header">
            <div>
              <div class="moneytree-review-title">Create draft poll</div>
              <div class="moneytree-review-meta">Owner-only civic ballot setup</div>
            </div>
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="moderator-poll-question">Question</label>
            <input id="moderator-poll-question" class="moneytree-review-reason" type="text" placeholder="What should the district prioritize?" value="" />
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="moderator-poll-description">Description</label>
            <textarea id="moderator-poll-description" class="moneytree-review-reason" rows="2" placeholder="Optional context for citizens."></textarea>
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="moderator-poll-diploma">
              <input id="moderator-poll-diploma" type="checkbox" /> Require High School Diploma
            </label>
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label">Answer choices</label>
            <div id="moderator-poll-choice-list">
              <input class="moneytree-review-reason" type="text" data-moderator-create-choice value="" placeholder="Choice 1" />
              <input class="moneytree-review-reason" type="text" data-moderator-create-choice value="" placeholder="Choice 2" />
            </div>
            <button type="button" class="secondary-button" data-action="moderator-add-poll-choice" style="margin-top:10px;">Add option</button>
          </div>

          ${moderatorPollState.error ? `<div class="moneytree-discussion-message error">${escapeHtml(moderatorPollState.error)}</div>` : ''}
          ${moderatorPollState.message ? `<div class="moneytree-discussion-message success">${escapeHtml(moderatorPollState.message)}</div>` : ''}

          <div class="moneytree-review-actions">
            <button type="button" class="moneytree-review-button approve" data-action="moderator-create-poll">Create draft poll</button>
          </div>
        </div>
      `;

      const pollsMarkup = moderatorPollState.polls.length ? moderatorPollState.polls.map((poll) => {
        const options = Array.isArray(poll.options) ? poll.options : [];
        const isDraft = poll.status === 'draft';
        const isOpen = poll.status === 'open';
        const isClosed = poll.status === 'closed';
        const draftEditing = moderatorPollState.editingPollId === poll.poll_id;

        const optionSummary = options.length ? options.map((option) => `
          <div class="info-row"><span>${escapeHtml(option.option_text || 'Option')}</span><span>${Number(option.vote_count ?? 0)} votes • ${Number(option.percent ?? 0).toFixed(1)}%</span></div>
        `).join('') : '<div class="moneytree-empty-state"><strong>No options available.</strong></div>';

        const draftEditMarkup = draftEditing ? (() => {
          const draft = moderatorPollState.draftEdits[poll.poll_id] || {
            question: poll.question || '',
            description: poll.description || '',
            required_diploma: Boolean(poll.required_diploma),
            options: options.map((option) => ({ id: option.id, text: option.option_text || '', removed: false })),
          };

          return `
            <div class="moneytree-review-content">
              <label class="moneytree-review-label" for="poll-edit-question-${escapeHtml(poll.poll_id || '')}">Question</label>
              <input id="poll-edit-question-${escapeHtml(poll.poll_id || '')}" class="moneytree-review-reason" type="text" value="${escapeHtml(draft.question)}" />
            </div>

            <div class="moneytree-review-content">
              <label class="moneytree-review-label" for="poll-edit-description-${escapeHtml(poll.poll_id || '')}">Description</label>
              <textarea id="poll-edit-description-${escapeHtml(poll.poll_id || '')}" class="moneytree-review-reason" rows="2">${escapeHtml(draft.description)}</textarea>
            </div>

            <div class="moneytree-review-content">
              <label class="moneytree-review-label" for="poll-edit-diploma-${escapeHtml(poll.poll_id || '')}">
                <input id="poll-edit-diploma-${escapeHtml(poll.poll_id || '')}" type="checkbox" ${draft.required_diploma ? 'checked' : ''} /> Require High School Diploma
              </label>
            </div>

            <div class="moneytree-review-content">
              <label class="moneytree-review-label">Answer choices</label>
              <div data-edit-choice-list="${escapeHtml(poll.poll_id || '')}">
                ${draft.options.length ? draft.options.map((option, index) => `
                  <div class="moneytree-review-content" style="padding:0; display:flex; gap:8px; align-items:center;">
                    <input class="moneytree-review-reason" type="text" data-poll-edit-choice="${escapeHtml(poll.poll_id || '')}" data-option-id="${escapeHtml(option.id || '')}" value="${escapeHtml(option.text)}" style="flex:1;" />
                    <button type="button" class="secondary-button" data-action="moderator-delete-edit-choice" data-poll-id="${escapeHtml(poll.poll_id || '')}" data-option-index="${index}">Remove</button>
                  </div>
                `).join('') : '<div class="moneytree-empty-state"><strong>No options yet.</strong></div>'}
              </div>
              <button type="button" class="secondary-button" data-action="moderator-add-edit-choice" data-poll-id="${escapeHtml(poll.poll_id || '')}" style="margin-top:10px;">Add option</button>
            </div>

            <div class="moneytree-review-actions">
              <button type="button" class="moneytree-review-button approve" data-action="moderator-save-draft-poll" data-poll-id="${escapeHtml(poll.poll_id || '')}">Save changes</button>
              <button type="button" class="moneytree-review-button reject" data-action="moderator-cancel-edit-poll" data-poll-id="${escapeHtml(poll.poll_id || '')}">Cancel</button>
            </div>
          `;
        })() : '';

        return `
          <article class="moneytree-review-item" style="margin-top:12px;">
            <div class="moneytree-review-header">
              <div>
                <div class="moneytree-review-title">${escapeHtml(poll.question || 'Untitled poll')}</div>
                <div class="moneytree-review-meta">${escapeHtml(poll.status || 'draft')} • ${poll.required_diploma ? 'Diploma required' : 'Open to all citizens'}</div>
              </div>
              <span class="moneytree-review-pill">${escapeHtml(isDraft ? 'Draft' : isOpen ? 'Open' : isClosed ? 'Closed' : poll.status || 'Draft')}</span>
            </div>

            ${draftEditing ? draftEditMarkup : `
              <div class="moneytree-review-content">
                <p>${escapeHtml(poll.description || 'No detailed description provided.')}</p>
                <div class="mylife-grid">
                  <div class="info-row"><span>Turnout</span><span>${Number(poll.turnout ?? 0).toFixed(2)}%</span></div>
                  <div class="info-row"><span>Votes</span><span>${Number(poll.total_votes ?? 0)}</span></div>
                  <div class="info-row"><span>Eligible</span><span>${Number(poll.total_eligible ?? 0)}</span></div>
                  <div class="info-row"><span>Winner</span><span>${escapeHtml(poll.winner_text || 'No votes yet')}</span></div>
                </div>
              </div>

              <div class="moneytree-review-content">
                ${optionSummary}
              </div>

              <div class="moneytree-review-actions">
                ${isDraft ? `<button type="button" class="moneytree-review-button approve" data-action="moderator-edit-poll" data-poll-id="${escapeHtml(poll.poll_id || '')}">Edit draft</button>` : ''}
                ${isDraft ? `<button type="button" class="moneytree-review-button approve" data-action="moderator-open-poll" data-poll-id="${escapeHtml(poll.poll_id || '')}">Start Poll</button>` : ''}
                ${isOpen ? `<button type="button" class="moneytree-review-button reject" data-action="moderator-close-poll" data-poll-id="${escapeHtml(poll.poll_id || '')}">End Poll</button>` : ''}
              </div>
            `}
          </article>
        `;
      }).join('') : '<div class="moneytree-empty-state"><strong>No polls available.</strong><p>Start a draft poll to begin the civic voting cycle.</p></div>';

      pollState.className = 'moneytree-activity-list';
      pollState.innerHTML = `${createPollMarkup}${pollsMarkup}`;
    };

    const syncPollDraft = (pollId, poll) => {
      const primary = {
        question: poll?.question || '',
        description: poll?.description || '',
        required_diploma: Boolean(poll?.required_diploma),
        options: Array.isArray(poll?.options) ? poll.options.map((option) => ({
          id: option?.id || null,
          text: option?.option_text || '',
          removed: false,
        })) : [],
        removedOptionIds: [],
      };

      moderatorPollState.draftEdits[pollId] = primary;
    };

    const loadModeratorPollData = async () => {
      if (!moderatorAppState.ownerAccess) {
        moderatorPollState.polls = [];
        moderatorPollState.error = null;
        moderatorPollState.message = null;
        moderatorPollState.editingPollId = null;
        moderatorPollState.draftEdits = {};
        renderModeratorPollPanel();
        return;
      }

      moderatorPollState.loading = true;
      moderatorPollState.error = null;
      moderatorPollState.message = null;
      renderModeratorPollPanel();

      try {
        const supabase = getAuthClient();
        if (!supabase) {
          throw new Error('Authentication unavailable.');
        }

        const { data, error } = await supabase.rpc('owner_get_polls');
        if (error) {
          throw error;
        }

        moderatorPollState.polls = Array.isArray(data) ? data : [];
        moderatorPollState.draftEdits = {};
        moderatorPollState.editingPollId = null;
        moderatorPollState.polls.forEach((poll) => {
          if (poll?.poll_id) {
            syncPollDraft(poll.poll_id, poll);
          }
        });
      } catch (error) {
        console.error('Moderator poll load failed:', error);
        moderatorPollState.error = error?.message || 'Unable to load the polls right now.';
        moderatorPollState.polls = [];
      } finally {
        moderatorPollState.loading = false;
        renderModeratorPollPanel();
      }
    };

    const renderOwnerBalancePanel = () => {
      if (moderatorAppState.ownerLoading) {
        ownerState.className = 'moneytree-empty-state';
        ownerState.innerHTML = '<strong>Checking owner access…</strong><p>Validating project owner authorization before you can adjust balances.</p>';
        return;
      }

      if (!moderatorAppState.ownerAccess) {
        ownerState.className = 'moneytree-empty-state';
        ownerState.innerHTML = `
          <strong>Owner access required.</strong>
          <p>${escapeHtml(moderatorAppState.ownerError || moderatorAppState.ownerMessage || 'Only the project owner may adjust citizen balances.')}</p>
        `;
        return;
      }

      ownerState.className = 'moneytree-activity-list';
      ownerState.innerHTML = `
        <div class="moneytree-review-item">
          <div class="moneytree-review-header">
            <div>
              <div class="moneytree-review-title">Citizen balance adjustment</div>
              <div class="moneytree-review-meta">Sensitive server-side ledger update</div>
            </div>
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="owner-balance-target-citizen-id">Target citizen ID</label>
            <input id="owner-balance-target-citizen-id" class="moneytree-review-reason" type="text" value="${escapeHtml(moderatorAppState.ownerTargetCitizenId)}" placeholder="citizen UUID" ${moderatorAppState.ownerSubmitting ? 'disabled' : ''} />
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="owner-balance-amount">Adjustment amount</label>
            <input id="owner-balance-amount" class="moneytree-review-reason" type="number" step="0.01" value="${escapeHtml(moderatorAppState.ownerAmount)}" placeholder="50.00" ${moderatorAppState.ownerSubmitting ? 'disabled' : ''} />
          </div>

          <div class="moneytree-review-content">
            <label class="moneytree-review-label" for="owner-balance-reason">Reason</label>
            <textarea id="owner-balance-reason" class="moneytree-review-reason" rows="2" placeholder="Explain the balance adjustment." ${moderatorAppState.ownerSubmitting ? 'disabled' : ''}>${escapeHtml(moderatorAppState.ownerReason)}</textarea>
          </div>

          ${moderatorAppState.ownerError ? `<div class="moneytree-discussion-message error">${escapeHtml(moderatorAppState.ownerError)}</div>` : ''}
          ${moderatorAppState.ownerMessage ? `<div class="moneytree-discussion-message success">${escapeHtml(moderatorAppState.ownerMessage)}</div>` : ''}

          ${moderatorAppState.ownerHistory.length ? `
            <div class="moneytree-discussion-message success">
              <strong>Recent credits</strong><br>
              ${moderatorAppState.ownerHistory.map((entry) => `
                <span>${escapeHtml(entry.targetCitizenId)} • ${escapeHtml(formatCurrency(entry.amount))} • ${escapeHtml(formatCurrency(entry.balanceAfter))}</span><br>
              `).join('')}
            </div>
          ` : ''}

          <div class="moneytree-review-actions">
            <button type="button" class="moneytree-review-button approve" data-action="owner-adjust-citizen-balance" ${moderatorAppState.ownerSubmitting ? 'disabled' : ''}>
              ${moderatorAppState.ownerSubmitting ? 'Applying…' : 'Apply adjustment'}
            </button>
          </div>
        </div>
      `;

      const targetInput = document.getElementById('owner-balance-target-citizen-id');
      const amountInput = document.getElementById('owner-balance-amount');
      const reasonInput = document.getElementById('owner-balance-reason');

      if (targetInput) {
        targetInput.addEventListener('input', (event) => {
          moderatorAppState.ownerTargetCitizenId = event.target.value || '';
          moderatorAppState.ownerError = null;
        });
      }

      if (amountInput) {
        amountInput.addEventListener('input', (event) => {
          moderatorAppState.ownerAmount = event.target.value || '';
          moderatorAppState.ownerError = null;
        });
      }

      if (reasonInput) {
        reasonInput.addEventListener('input', (event) => {
          moderatorAppState.ownerReason = event.target.value || '';
          moderatorAppState.ownerError = null;
        });
      }
    };

    const loadOwnerAccessForApp = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moderatorAppState.ownerAccess = false;
        moderatorAppState.ownerMessage = null;
        moderatorAppState.ownerError = null;
        return false;
      }

      try {
        moderatorAppState.ownerLoading = true;
        moderatorAppState.ownerError = null;
        moderatorAppState.ownerMessage = null;

        const { data, error } = await supabase.rpc('owner_balance_self_check');
        if (error) {
          throw error;
        }

        const firstResult = Array.isArray(data) ? data[0] : data;
        moderatorAppState.ownerAccess = Boolean(firstResult?.is_owner);
        if (!moderatorAppState.ownerAccess) {
          moderatorAppState.ownerMessage = 'Owner access required to adjust citizen balances.';
        }
        return moderatorAppState.ownerAccess;
      } catch (error) {
        console.error('Moderator owner access check failed:', error);
        moderatorAppState.ownerAccess = false;
        moderatorAppState.ownerError = error?.message || 'Unable to verify owner access.';
        moderatorAppState.ownerMessage = null;
        return false;
      } finally {
        moderatorAppState.ownerLoading = false;
      }
    };

    const refreshOwnerPanel = async () => {
      await loadOwnerAccessForApp();
      renderOwnerBalancePanel();
      renderModeratorPollPanel();

      if (moderatorAppState.ownerAccess) {
        await loadModeratorPollData();
      } else {
        moderatorPollState.polls = [];
        moderatorPollState.error = null;
        moderatorPollState.message = null;
        moderatorPollState.editingPollId = null;
        moderatorPollState.draftEdits = {};
        renderModeratorPollPanel();
      }
    };

    const loadOwnerBalanceForm = () => {
      if (!moderatorAppState.ownerAccess) {
        renderOwnerBalancePanel();
        return;
      }

      renderOwnerBalancePanel();
    };

    loadOwnerBalanceForm();
    renderModeratorPollPanel();

    const handleOwnerBalanceAdjustment = async () => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moderatorAppState.ownerError = 'Your session has expired. Please sign in again.';
        moderatorAppState.ownerMessage = null;
        return;
      }

      const targetCitizenId = (moderatorAppState.ownerTargetCitizenId || '').trim();
      const rawAmount = Number.parseFloat(String(moderatorAppState.ownerAmount ?? '').trim());
      const reason = (moderatorAppState.ownerReason || '').trim();

      if (!targetCitizenId) {
        moderatorAppState.ownerError = 'Enter a citizen ID before adjusting the balance.';
        moderatorAppState.ownerMessage = null;
        return;
      }

      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        moderatorAppState.ownerError = 'The adjustment amount must be a non-zero number.';
        moderatorAppState.ownerMessage = null;
        return;
      }

      if (!reason) {
        moderatorAppState.ownerError = 'Include a reason for the balance adjustment.';
        moderatorAppState.ownerMessage = null;
        return;
      }

      if (moderatorAppState.ownerSubmitting) {
        return null;
      }

      moderatorAppState.ownerSubmitting = true;
      moderatorAppState.ownerError = null;
      moderatorAppState.ownerMessage = 'Applying citizen balance adjustment…';

      try {
        const requestKey = globalThis.crypto?.randomUUID?.() || `owner-balance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const { data, error } = await supabase.rpc('owner_adjust_citizen_balance', {
          p_target_citizen_id: targetCitizenId,
          p_amount: rawAmount,
          p_reason: reason,
          p_idempotency_key: requestKey,
        });

        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : data;
        const creditedAmount = Number(result?.amount ?? rawAmount);
        const balanceAfter = Number(result?.balance_after ?? Number(profileState.private?.balance ?? 0) + creditedAmount);
        const resultLabel = result?.result === 'duplicate_request'
          ? 'This adjustment was already recorded.'
          : `Citizen balance adjustment applied successfully. Credited ${formatCurrency(creditedAmount)}. Updated balance: ${formatCurrency(balanceAfter)}.`;

        moderatorAppState.ownerHistory = [{
          targetCitizenId,
          amount: creditedAmount,
          balanceAfter,
          result: result?.result || 'adjusted',
        }, ...moderatorAppState.ownerHistory].slice(0, 5);

        moderatorAppState.ownerMessage = resultLabel;
        moderatorAppState.ownerError = null;
        moderatorAppState.ownerAmount = '';
        moderatorAppState.ownerReason = '';

        if (targetCitizenId === profileState.citizen?.id) {
          profileState.private = {
            ...(profileState.private || {}),
            balance: balanceAfter,
          };
          applyCitizenProfile(profileState.citizen);
          renderPlayerDetails();
          await loadCitizenProfile();
        } else {
          await refreshCitizenBalanceFromSupabase(targetCitizenId);
        }

        renderOwnerBalancePanel();
        await loadOwnerAccessForApp();
        return result;
      } catch (error) {
        console.error('Owner balance adjustment failed:', error);
        moderatorAppState.ownerError = error?.message || 'Unable to apply the balance adjustment.';
        moderatorAppState.ownerMessage = null;
      } finally {
        moderatorAppState.ownerSubmitting = false;
      }
    };

    const renderModeratorQueue = (queue) => {
      if (!queue.length) {
        queueState.className = 'moneytree-empty-state';
        queueState.innerHTML = '<strong>No pending submissions.</strong><p>Approved and rejected items clear from this queue automatically.</p>';
        return;
      }

      queueState.className = 'moneytree-activity-list';
      queueState.innerHTML = queue.map((item) => {
        const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }) : 'No date';
        const discussionContext = item.discussion_prompt ? escapeHtml(item.discussion_prompt) : 'No original discussion context available.';
        const parentContext = item.parent_contribution_context ? escapeHtml(item.parent_contribution_context) : 'No parent contribution context — this is a root contribution.';

        return `
          <article class="moneytree-review-item">
            <div class="moneytree-review-header">
              <div>
                <div class="moneytree-review-title">${escapeHtml(item.discussion_title || 'Unknown discussion')}</div>
                <div class="moneytree-review-meta">${escapeHtml(item.contributor_public_name || 'Citizen')} • ${escapeHtml(createdAt)}</div>
              </div>
              <span class="moneytree-review-pill">${escapeHtml(item.contribution_type || 'Contribution')}</span>
            </div>

            <div class="moneytree-review-content"><strong>Contribution</strong><br>${escapeHtml(item.content || 'No content provided.')}</div>

            <div class="moneytree-review-content">
              <strong>Original discussion context</strong><br>${discussionContext}
            </div>

            <div class="moneytree-review-content">
              <strong>Parent contribution context</strong><br>${parentContext}
            </div>

            <label class="moneytree-review-label" for="moderator-reject-${escapeHtml(item.id || '')}">Rejection reason</label>
            <textarea id="moderator-reject-${escapeHtml(item.id || '')}" class="moneytree-review-reason" data-action="moderator-reject-reason" data-contribution-id="${escapeHtml(item.id || '')}" rows="2" placeholder="Required when rejecting" ${moderatorAppState.processingIds.includes(item.id) ? 'disabled' : ''}></textarea>
            <div class="moneytree-review-actions">
              <button type="button" class="moneytree-review-button approve" data-action="moderator-approve-contribution" data-contribution-id="${escapeHtml(item.id || '')}" ${moderatorAppState.processingIds.includes(item.id) ? 'disabled' : ''}>${moderatorAppState.processingIds.includes(item.id) ? 'Processing…' : 'Approve'}</button>
              <button type="button" class="moneytree-review-button reject" data-action="moderator-reject-contribution" data-contribution-id="${escapeHtml(item.id || '')}" ${moderatorAppState.processingIds.includes(item.id) ? 'disabled' : ''}>${moderatorAppState.processingIds.includes(item.id) ? 'Processing…' : 'Reject'}</button>
            </div>
          </article>
        `;
      }).join('');
    };

    const applyModeratorQueueView = (queue) => {
      if (moderatorAppState.error) {
        queueState.className = 'moneytree-empty-state';
        queueState.innerHTML = `<strong>Unable to load the moderation queue.</strong><p>${escapeHtml(moderatorAppState.error)}</p>`;
        return;
      }

      renderModeratorQueue(queue);
    };

    const loadModeratorQueueForApp = async () => {
      if (moderatorAppState.loading) {
        return moderatorAppState.queue;
      }

      const requestToken = ++moderatorAppState.requestToken;
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moderatorAppState.loading = false;
        moderatorAppState.error = 'Your session has expired. Please sign in again.';
        applyModeratorQueueView([]);
        return [];
      }

      moderatorAppState.loading = true;
      moderatorAppState.error = null;
      moderatorAppState.message = null;

      try {
        const { data, error } = await supabase.functions.invoke('get-moneytree-moderation-queue', {
          method: 'GET',
        });

        if (requestToken !== moderatorAppState.requestToken) {
          return moderatorAppState.queue;
        }

        if (error) {
          const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
          if (Number(error?.status) === 403 || message.includes('moderator') || message.includes('access')) {
            moderatorAppState.visible = false;
            moderatorAppState.queue = [];
            renderAppGrid();
            queueState.className = 'moneytree-empty-state';
            queueState.innerHTML = '<strong>Access denied.</strong><p>Your account does not have moderator authorization.</p>';
            return [];
          }
          throw error;
        }

        const rawQueue = Array.isArray(data) ? data : Array.isArray(data?.pending_contributions) ? data.pending_contributions : [];
        const queue = rawQueue.map((item) => ({
          ...item,
          discussion_title: item?.discussion_title ?? 'Unknown discussion',
          discussion_prompt: item?.discussion_prompt ?? '',
          parent_contribution_context: item?.parent_contribution_context ?? 'No parent contribution context — this is a root contribution.',
          contributor_public_name: item?.contributor_public_name ?? 'Citizen',
          content: typeof item?.content === 'string' ? item.content : '',
        }));

        moderatorAppState.visible = true;
        moderatorAppState.queue = queue;
        moderatorAppState.error = null;
        renderAppGrid();
        applyModeratorQueueView(queue);
        return queue;
      } catch (error) {
        if (requestToken !== moderatorAppState.requestToken) {
          return moderatorAppState.queue;
        }

        console.error('Moderator dashboard queue load failed:', error);
        moderatorAppState.visible = false;
        moderatorAppState.queue = [];
        moderatorAppState.error = error?.message || 'Unable to load the moderation queue right now.';
        renderAppGrid();
        applyModeratorQueueView([]);
        return [];
      } finally {
        if (requestToken === moderatorAppState.requestToken) {
          moderatorAppState.loading = false;
        }
      }
    };

    const handleModeratorDecisionForApp = async (contributionId, decision, rejectionReason = null) => {
      const supabase = getAuthClient();
      const session = (await supabase?.auth.getSession())?.data?.session;

      if (!supabase || !session?.user) {
        moderatorAppState.error = 'Your session has expired. Please sign in again.';
        applyModeratorQueueView(moderatorAppState.queue);
        return;
      }

      if (!contributionId) {
        moderatorAppState.error = 'A contribution is required to complete moderation.';
        applyModeratorQueueView(moderatorAppState.queue);
        return;
      }

      if (moderatorAppState.processingIds.includes(contributionId)) {
        return;
      }

      moderatorAppState.processingIds = [...new Set([...moderatorAppState.processingIds, contributionId])];
      moderatorAppState.error = null;
      moderatorAppState.message = decision === 'approved' ? 'Approving contribution…' : 'Rejecting contribution…';
      applyModeratorQueueView(moderatorAppState.queue);

      try {
        const { data, error } = await supabase.rpc('moderate_moneytree_contribution', {
          p_contribution_id: contributionId,
          p_decision: decision,
          p_reason: decision === 'rejected' ? rejectionReason : null,
        });

        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : data;
        const moderationState = result?.moderation_state || decision;
        moderatorAppState.message = moderationState === 'approved'
          ? 'Contribution approved successfully.'
          : 'Contribution rejected successfully.';
        moderatorAppState.error = null;
        moderatorAppState.processingIds = moderatorAppState.processingIds.filter((id) => id !== contributionId);
        await loadModeratorQueueForApp();
      } catch (error) {
        console.error('Moderator dashboard action failed:', error);
        moderatorAppState.error = error?.message || 'Unable to complete the moderation decision.';
        moderatorAppState.message = null;
        moderatorAppState.processingIds = moderatorAppState.processingIds.filter((id) => id !== contributionId);
        applyModeratorQueueView(moderatorAppState.queue);
      }
    };

    const refreshButton = body.querySelector('[data-action="moderator-refresh-queue"]');
    if (refreshButton && !refreshButton.dataset.moderatorRefreshBound) {
      refreshButton.dataset.moderatorRefreshBound = 'true';
      refreshButton.addEventListener('click', async () => {
        moderatorAppState.error = null;
        moderatorAppState.message = null;
        await loadModeratorQueueForApp();
      });
    }

    if (!body.dataset.moderatorActionDelegationBound) {
      body.dataset.moderatorActionDelegationBound = 'true';
      body.addEventListener('click', async (event) => {
        const subpageButton = event.target.closest('[data-action="moderator-subpage"]');
        if (subpageButton) {
          const nextSubpage = subpageButton.getAttribute('data-subpage');
          if (nextSubpage) {
            moderatorAppState.currentSubpage = nextSubpage;
            syncModeratorSubpageVisibility();
          }
          return;
        }

        const approveButton = event.target.closest('[data-action="moderator-approve-contribution"]');
        if (approveButton) {
          const contributionId = approveButton.getAttribute('data-contribution-id');
          if (!contributionId) {
            return;
          }
          await handleModeratorDecisionForApp(contributionId, 'approved', null);
          return;
        }

        const rejectButton = event.target.closest('[data-action="moderator-reject-contribution"]');
        if (rejectButton) {
          const contributionId = rejectButton.getAttribute('data-contribution-id');
          if (!contributionId) {
            return;
          }
          const reasonField = body.querySelector(`#moderator-reject-${CSS.escape(contributionId)}`);
          const rejectionReason = (reasonField?.value ?? '').trim();
          if (!rejectionReason) {
            moderatorAppState.error = 'A rejection reason is required before rejecting a contribution.';
            moderatorAppState.message = null;
            applyModeratorQueueView(moderatorAppState.queue);
            return;
          }
          await handleModeratorDecisionForApp(contributionId, 'rejected', rejectionReason);
          return;
        }

        const ownerAdjustmentButton = event.target.closest('[data-action="owner-adjust-citizen-balance"]');
        if (ownerAdjustmentButton) {
          if (!moderatorAppState.ownerAccess) {
            moderatorAppState.ownerError = 'Owner access is required to apply balance adjustments.';
            moderatorAppState.ownerMessage = null;
            renderOwnerBalancePanel();
            return;
          }

          await handleOwnerBalanceAdjustment();
          renderOwnerBalancePanel();
        }

        const addPollChoiceButton = event.target.closest('[data-action="moderator-add-poll-choice"]');
        if (addPollChoiceButton) {
          const choiceList = document.getElementById('moderator-poll-choice-list');
          if (choiceList) {
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'moneytree-review-reason';
            newInput.setAttribute('data-moderator-create-choice', 'true');
            newInput.placeholder = `Choice ${choiceList.querySelectorAll('[data-moderator-create-choice]').length + 1}`;
            choiceList.appendChild(newInput);
          }
          return;
        }

        const createPollButton = event.target.closest('[data-action="moderator-create-poll"]');
        if (createPollButton) {
          if (!moderatorAppState.ownerAccess) {
            moderatorPollState.error = 'Owner access is required to create a poll.';
            renderModeratorPollPanel();
            return;
          }

          const questionInput = document.getElementById('moderator-poll-question');
          const descriptionInput = document.getElementById('moderator-poll-description');
          const diplomaInput = document.getElementById('moderator-poll-diploma');
          const choiceInputs = Array.from(document.querySelectorAll('[data-moderator-create-choice]'));
          const question = (questionInput?.value || '').trim();
          const description = (descriptionInput?.value || '').trim();
          const requiredDiploma = Boolean(diplomaInput?.checked);
          const choices = choiceInputs
            .map((input) => (input.value || '').trim())
            .filter((value) => value.length > 0)
            .filter((value, index, all) => all.indexOf(value) === index);

          if (!question) {
            moderatorPollState.error = 'A poll question is required.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
            return;
          }

          if (choices.length < 2) {
            moderatorPollState.error = 'Add at least two valid answer choices before creating a draft poll.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
            return;
          }

          try {
            moderatorPollState.loading = true;
            moderatorPollState.error = null;
            moderatorPollState.message = 'Creating draft poll…';
            renderModeratorPollPanel();

            const supabase = getAuthClient();
            const { error } = await supabase.rpc('owner_create_poll', {
              p_question: question,
              p_description: description,
              p_required_diploma: requiredDiploma,
              p_options: choices,
            });

            if (error) {
              throw error;
            }

            moderatorPollState.message = 'Draft poll created successfully.';
            moderatorPollState.error = null;
            await loadModeratorPollData();
          } catch (error) {
            console.error('Poll creation failed:', error);
            moderatorPollState.error = error?.message || 'Unable to create the poll.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
          } finally {
            moderatorPollState.loading = false;
          }
          return;
        }

        const refreshPollsButton = event.target.closest('[data-action="moderator-refresh-polls"]');
        if (refreshPollsButton) {
          await loadModeratorPollData();
          return;
        }

        const editPollButton = event.target.closest('[data-action="moderator-edit-poll"]');
        if (editPollButton) {
          const pollId = editPollButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }
          moderatorPollState.editingPollId = pollId;
          const poll = moderatorPollState.polls.find((item) => item.poll_id === pollId) || moderatorPollState.polls.find((item) => item.id === pollId);
          if (poll) {
            syncPollDraft(pollId, poll);
          }
          renderModeratorPollPanel();
          return;
        }

        const cancelEditButton = event.target.closest('[data-action="moderator-cancel-edit-poll"]');
        if (cancelEditButton) {
          const pollId = cancelEditButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }
          moderatorPollState.editingPollId = null;
          if (moderatorPollState.draftEdits[pollId]) {
            delete moderatorPollState.draftEdits[pollId];
          }
          renderModeratorPollPanel();
          return;
        }

        const addEditChoiceButton = event.target.closest('[data-action="moderator-add-edit-choice"]');
        if (addEditChoiceButton) {
          const pollId = addEditChoiceButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }
          const draft = moderatorPollState.draftEdits[pollId] || {
            question: '',
            description: '',
            required_diploma: false,
            options: [],
          };
          draft.options.push({ id: null, text: '', removed: false });
          moderatorPollState.draftEdits[pollId] = draft;
          moderatorPollState.editingPollId = pollId;
          renderModeratorPollPanel();
          return;
        }

        const deleteEditChoiceButton = event.target.closest('[data-action="moderator-delete-edit-choice"]');
        if (deleteEditChoiceButton) {
          const pollId = deleteEditChoiceButton.getAttribute('data-poll-id');
          const optionIndex = Number(deleteEditChoiceButton.getAttribute('data-option-index'));
          if (!pollId || Number.isNaN(optionIndex)) {
            return;
          }
          const draft = moderatorPollState.draftEdits[pollId];
          if (!draft) {
            return;
          }
          const removedOption = draft.options[optionIndex];
          if (removedOption && removedOption.id) {
            draft.removedOptionIds = [...(draft.removedOptionIds || []), removedOption.id];
          }
          draft.options.splice(optionIndex, 1);
          moderatorPollState.editingPollId = pollId;
          renderModeratorPollPanel();
          return;
        }

        const saveDraftPollButton = event.target.closest('[data-action="moderator-save-draft-poll"]');
        if (saveDraftPollButton) {
          const pollId = saveDraftPollButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }

          const draft = moderatorPollState.draftEdits[pollId];
          if (!draft) {
            return;
          }

          const questionInput = document.getElementById(`poll-edit-question-${pollId}`);
          const descriptionInput = document.getElementById(`poll-edit-description-${pollId}`);
          const diplomaInput = document.getElementById(`poll-edit-diploma-${pollId}`);
          const choiceInputs = Array.from(document.querySelectorAll(`[data-poll-edit-choice="${pollId}"]`));
          const question = (questionInput?.value || '').trim();
          const description = (descriptionInput?.value || '').trim();
          const requiredDiploma = Boolean(diplomaInput?.checked);
          const choices = choiceInputs
            .map((input) => ({
              id: input.getAttribute('data-option-id') || null,
              value: (input.value || '').trim(),
            }))
            .filter((entry) => entry.value.length > 0)
            .filter((entry, index, all) => all.findIndex((candidate) => candidate.value === entry.value) === index);

          if (!question) {
            moderatorPollState.error = 'A poll question is required.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
            return;
          }

          if (choices.length < 2) {
            moderatorPollState.error = 'A draft poll must contain at least two answer choices.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
            return;
          }

          try {
            moderatorPollState.loading = true;
            moderatorPollState.error = null;
            moderatorPollState.message = 'Saving draft poll changes…';
            renderModeratorPollPanel();

            const supabase = getAuthClient();
            const { error: updateError } = await supabase.rpc('owner_update_poll', {
              p_poll_id: pollId,
              p_question: question,
              p_description: description,
              p_required_diploma: requiredDiploma,
            });

            if (updateError) {
              throw updateError;
            }

            const removedIds = draft.removedOptionIds || [];
            for (const optionId of removedIds) {
              const { error: deleteError } = await supabase.rpc('owner_delete_poll_option', {
                p_option_id: optionId,
              });
              if (deleteError) {
                throw deleteError;
              }
            }

            for (const entry of choices) {
              const optionId = entry.id || null;
              const optionText = entry.value;
              const { error: optionError } = await supabase.rpc('owner_upsert_poll_option', {
                p_poll_id: pollId,
                p_option_id: optionId,
                p_option_text: optionText,
              });
              if (optionError) {
                throw optionError;
              }
            }

            moderatorPollState.message = 'Draft poll updated successfully.';
            moderatorPollState.error = null;
            moderatorPollState.editingPollId = null;
            delete moderatorPollState.draftEdits[pollId];
            await loadModeratorPollData();
          } catch (error) {
            console.error('Draft poll update failed:', error);
            moderatorPollState.error = error?.message || 'Unable to update the draft poll.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
          } finally {
            moderatorPollState.loading = false;
          }
          return;
        }

        const startPollButton = event.target.closest('[data-action="moderator-open-poll"]');
        if (startPollButton) {
          const pollId = startPollButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }
          try {
            moderatorPollState.loading = true;
            moderatorPollState.error = null;
            moderatorPollState.message = 'Starting poll…';
            renderModeratorPollPanel();
            const supabase = getAuthClient();
            const { error } = await supabase.rpc('owner_set_poll_status', {
              p_poll_id: pollId,
              p_status: 'open',
            });
            if (error) {
              throw error;
            }
            moderatorPollState.message = 'Poll started successfully.';
            await loadModeratorPollData();
          } catch (error) {
            console.error('Poll start failed:', error);
            moderatorPollState.error = error?.message || 'Unable to start the poll.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
          } finally {
            moderatorPollState.loading = false;
          }
          return;
        }

        const closePollButton = event.target.closest('[data-action="moderator-close-poll"]');
        if (closePollButton) {
          const pollId = closePollButton.getAttribute('data-poll-id');
          if (!pollId) {
            return;
          }
          try {
            moderatorPollState.loading = true;
            moderatorPollState.error = null;
            moderatorPollState.message = 'Closing poll…';
            renderModeratorPollPanel();
            const supabase = getAuthClient();
            const { error } = await supabase.rpc('owner_set_poll_status', {
              p_poll_id: pollId,
              p_status: 'closed',
            });
            if (error) {
              throw error;
            }
            moderatorPollState.message = 'Poll closed successfully.';
            await loadModeratorPollData();
          } catch (error) {
            console.error('Poll close failed:', error);
            moderatorPollState.error = error?.message || 'Unable to close the poll.';
            moderatorPollState.message = null;
            renderModeratorPollPanel();
          } finally {
            moderatorPollState.loading = false;
          }
          return;
        }
      });
    }

    syncModeratorSubpageVisibility();
    loadModeratorQueueForApp();
    refreshOwnerPanel();
    return;
  }

  if (appId === 'store') {
    renderStoreApp();
    if (!storeState.hasLoaded) {
      loadStoreCatalog();
    }
    return;
  }

  if (appId === 'lucky7') {
    renderLucky7App();
    loadLucky7History();
    return;
  }

  if (appId === 'localnews') {
    const localNewsCategories = ['Latest', 'Politics', 'Economy', 'Business', 'Society', 'Opinion'];
    const todaysDate = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());

    const renderLocalNewsMasthead = () => `
      <header class="localnews-masthead">
        <div class="localnews-brandbar">
          <div class="localnews-brand">
            <span class="brand-mark">TYRANNY NEWS</span>
            <span class="brand-sub">TODAY</span>
          </div>
          <span class="localnews-edition-label">Local edition</span>
        </div>
        <div class="localnews-date-display">${escapeHtml(todaysDate)}</div>
        <nav class="localnews-nav" aria-label="News categories">
          ${localNewsCategories.map((category) => `
            <button type="button" class="localnews-category ${localNewsState.activeCategory === category ? 'active' : ''}" data-action="localnews-category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
          `).join('')}
        </nav>
      </header>
    `;

    const renderLocalNewsShell = () => {
      const selectedArticle = localNewsState.articles.find((article) => article.id === localNewsState.activeArticleId) || null;

      if (localNewsState.loading) {
        body.innerHTML = `
          <div class="localnews-page">
            <div class="news-card localnews-shell">
              <div class="moneytree-empty-state"><strong>Loading the latest updates…</strong><p>Checking the newsroom for the newest published coverage.</p></div>
            </div>
          </div>
        `;
        return;
      }

      if (localNewsState.error) {
        body.innerHTML = `
          <div class="localnews-page">
            <div class="news-card localnews-shell">
              <div class="moneytree-empty-state"><strong>Local News is unavailable.</strong><p>${escapeHtml(localNewsState.error)}</p></div>
            </div>
          </div>
        `;
        return;
      }

      if (!localNewsState.articles.length) {
        body.innerHTML = `
          <div class="localnews-page">
            ${renderLocalNewsMasthead()}
            <div class="news-card localnews-shell">
              <div class="moneytree-empty-state"><strong>No published coverage yet.</strong><p>The newsroom has not published any stories.</p></div>
            </div>
          </div>
        `;

        body.querySelector('[data-action="localnews-refresh"]')?.addEventListener('click', async () => {
          await loadLocalNewsArticles();
        });

        body.querySelectorAll('[data-action="localnews-category"]').forEach((button) => {
          button.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            if (!category) {
              return;
            }
            localNewsState.activeCategory = category;
            renderLocalNewsShell();
          });
        });
        return;
      }

      const leadArticle = localNewsState.articles[0] || null;
      const secondaryArticles = localNewsState.articles.slice(1, 4);
      const latestArticles = localNewsState.articles.slice(0, 6);

      if (localNewsState.detailOpen && selectedArticle) {
        body.innerHTML = `
          <div class="localnews-page">
            ${renderLocalNewsMasthead()}

            <div class="news-card localnews-shell">
              <div class="localnews-article-reading">
                <button type="button" class="localnews-back-link" data-action="localnews-close-article">← Back to latest</button>
                <article class="localnews-reading-article">
                  <div class="localnews-reading-kicker">${escapeHtml(localNewsState.activeCategory || 'Latest')} • Local News</div>
                  <h1 class="localnews-reading-headline">${escapeHtml(selectedArticle.headline || 'Untitled article')}</h1>
                  ${selectedArticle.excerpt ? `<p class="localnews-reading-summary">${escapeHtml(selectedArticle.excerpt)}</p>` : ''}
                  <div class="localnews-reading-meta">
                    <span>By Tyranny Daily</span>
                    <span>•</span>
                    <span>${escapeHtml(formatNewsDate(selectedArticle.published_at || selectedArticle.created_at))}</span>
                  </div>
                  <div class="localnews-content">${sanitizeRichTextHtml(selectedArticle.content_html || '<p>No article content is available.</p>')}</div>
                </article>
              </div>
            </div>
          </div>
        `;

        body.querySelector('[data-action="localnews-close-article"]')?.addEventListener('click', () => {
          localNewsState.detailOpen = false;
          renderLocalNewsShell();
        });

        body.querySelectorAll('[data-action="localnews-category"]').forEach((button) => {
          button.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            if (!category) {
              return;
            }
            localNewsState.activeCategory = category;
            renderLocalNewsShell();
          });
        });

        return;
      }

      body.innerHTML = `
        <div class="localnews-page">
          ${renderLocalNewsMasthead()}

          <main class="localnews-homepage">
            <div class="localnews-top-stories-title">Top Stories</div>
            <section class="localnews-featured-story">
              ${leadArticle ? `
                <button type="button" class="localnews-story-lead" data-action="localnews-open-article" data-article-id="${escapeHtml(leadArticle.id || '')}">
                  <div class="localnews-featured-copy">
                    <div class="localnews-story-kicker">Lead Story</div>
                    <h1>${escapeHtml(leadArticle.headline || 'Untitled article')}</h1>
                    <p>${escapeHtml(leadArticle.excerpt || 'No summary available.')}</p>
                    <div class="localnews-story-meta">
                      <span>By Tyranny Daily</span>
                      <span>${escapeHtml(formatNewsDate(leadArticle.published_at || leadArticle.created_at))}</span>
                    </div>
                  </div>
                </button>
              ` : '<div class="moneytree-empty-state"><strong>No story available.</strong><p>Check back soon for the next briefing.</p></div>'}
            </section>

            <section class="localnews-secondary-stories">
              ${secondaryArticles.map((article) => `
                <button type="button" class="localnews-story-card" data-action="localnews-open-article" data-article-id="${escapeHtml(article.id || '')}">
                  <div class="localnews-card-copy">
                    <div class="localnews-story-kicker">${escapeHtml(localNewsState.activeCategory || 'Latest')}</div>
                    <h2>${escapeHtml(article.headline || 'Untitled article')}</h2>
                    <p>${escapeHtml(article.excerpt || 'No summary available.')}</p>
                    <span>${escapeHtml(formatNewsDate(article.published_at || article.created_at))}</span>
                  </div>
                </button>
              `).join('')}
            </section>

            <section class="localnews-latest-section">
              <div class="localnews-section-header">
                <span>Latest News</span>
                <button type="button" class="secondary-button localnews-refresh-button" data-action="localnews-refresh">Refresh</button>
              </div>

              <div class="localnews-feed-list">
                ${latestArticles.map((article) => `
                  <button type="button" class="localnews-feed-item" data-action="localnews-open-article" data-article-id="${escapeHtml(article.id || '')}">
                    <div class="localnews-feed-copy">
                      <span class="localnews-feed-date">${escapeHtml(formatNewsDate(article.published_at || article.created_at))}</span>
                      <h3>${escapeHtml(article.headline || 'Untitled article')}</h3>
                      <p>${escapeHtml(article.excerpt || 'No summary available.')}</p>
                    </div>
                  </button>
                `).join('')}
              </div>
            </section>
          </main>
        </div>
      `;

      body.querySelector('[data-action="localnews-refresh"]')?.addEventListener('click', async () => {
        await loadLocalNewsArticles();
      });

      body.querySelectorAll('[data-action="localnews-open-article"]').forEach((button) => {
        button.addEventListener('click', () => {
          const articleId = button.getAttribute('data-article-id');
          if (!articleId) {
            return;
          }
          localNewsState.activeArticleId = articleId;
          localNewsState.detailOpen = true;
          renderLocalNewsShell();
        });
      });

      body.querySelectorAll('[data-action="localnews-category"]').forEach((button) => {
        button.addEventListener('click', () => {
          const category = button.getAttribute('data-category');
          if (!category) {
            return;
          }
          localNewsState.activeCategory = category;
          renderLocalNewsShell();
        });
      });
    };

    const loadLocalNewsArticles = async () => {
      const supabase = getAuthClient();
      localNewsState.loading = true;
      localNewsState.error = null;
      renderLocalNewsShell();

      try {
        if (!supabase) {
          throw new Error('Authentication unavailable.');
        }

        const { data, error } = await supabase.rpc('get_published_news_articles');
        if (error) {
          throw error;
        }

        const rawArticles = Array.isArray(data)
          ? data.map((article) => ({
              id: article?.id ?? article?.article_id ?? null,
              headline: article?.headline ?? 'Untitled article',
              excerpt: article?.excerpt ?? '',
              featured_image_url: article?.featured_image_url ?? '',
              content_html: article?.content_html ?? '',
              created_at: article?.created_at ?? null,
              published_at: article?.published_at ?? article?.created_at ?? null,
              slug: article?.slug ?? '',
            })).filter((article) => article.id)
          : [];

        localNewsState.articles = await Promise.all(rawArticles.map((article) => resolveLocalNewsArticleForDisplay(article, supabase)));

        if (!localNewsState.activeArticleId || !localNewsState.articles.some((article) => article.id === localNewsState.activeArticleId)) {
          localNewsState.activeArticleId = localNewsState.articles[0]?.id || null;
        }
      } catch (error) {
        console.error('Local News load failed:', error);
        localNewsState.articles = [];
        localNewsState.activeArticleId = null;
        localNewsState.error = error?.message || 'Unable to load the latest local news updates.';
      } finally {
        localNewsState.loading = false;
        renderLocalNewsShell();
      }
    };

    renderLocalNewsShell();
    if (!localNewsState.articles.length && !localNewsState.loading) {
      loadLocalNewsArticles();
    }
    return;
  }

  if (appId === 'voting') {
    renderVotingApp();
    if (!votingState.loading) {
      loadVotingData();
    }
    return;
  }

  if (appId === 'history') {
    body.innerHTML = `
      <div class="news-card">
        <div class="mylife-grid">
          <div class="info-row"><span>Monarchic reform</span><span>Passed 1893</span></div>
          <div class="info-row"><span>Civic archive</span><span>North wing</span></div>
          <div class="info-row"><span>Timeline</span><span>1912-1958</span></div>
          <div class="info-row"><span>Featured chapter</span><span>Urban resilience</span></div>
        </div>
      </div>
    `;
  }

  if (appId === 'darkweb' && mode === 'locked') {
    body.innerHTML = `
      <div class="darkweb-card locked-panel">
        <div class="lock-sign">🔒</div>
        <strong>Access Key Required</strong>
        <p>Dark Web access is locked until the key is purchased.</p>
      </div>
    `;
  }
}

function openApp(appId, mode = 'normal') {
  const appWindow = ensureAppWindow(appId);
  const shouldRefreshApp = appId === 'moderator' || appId === 'voting' || appId === 'associates' || !appWindow.dataset.initialized || appWindow.dataset.mode !== mode;

  if (shouldRefreshApp) {
    renderAppContent(appId, mode);
    appWindow.dataset.initialized = 'true';
    appWindow.dataset.mode = mode;
  }

  document.querySelectorAll('.app-window').forEach((windowNode) => {
    const isActive = windowNode === appWindow;
    windowNode.classList.toggle('active', isActive);
  });

  activeAppId = appId;
  homeScreen.classList.add('hidden');
  lockScreen.classList.add('hidden');
  notificationCenter.classList.add('hidden');
  floatingHome.style.display = 'grid';
  lockVisible = false;
}

function returnHome() {
  document.querySelectorAll('.app-window').forEach((windowNode) => {
    windowNode.classList.remove('active');
  });
  activeAppId = null;
  homeScreen.classList.remove('hidden');
  lockScreen.classList.add('hidden');
  floatingHome.style.display = 'none';
}

function toggleNotifications() {
  notificationCenter.classList.toggle('hidden');
}

function setAuthMessage(message, type = '') {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message || '';
  authMessage.classList.remove('error', 'success');
  if (type) {
    authMessage.classList.add(type);
  }
}

function showAuthView(view) {
  authState.currentView = view;
  Object.entries(authViews).forEach(([key, element]) => {
    if (!element) {
      return;
    }
    const shouldShow = key === view;
    element.classList.toggle('hidden', !shouldShow);
  });

  if (view === 'login' || view === 'register' || view === 'recover' || view === 'newPassword') {
    verifyScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    lockScreen.classList.add('hidden');
    homeScreen.classList.add('hidden');
  }

  if (view === 'verify') {
    authScreen.classList.remove('hidden');
    verifyScreen.classList.remove('hidden');
    lockScreen.classList.add('hidden');
    homeScreen.classList.add('hidden');
  }
}

function setCitizenSetupMessage(message, type = '') {
  if (!citizenSetupMessage) {
    return;
  }

  citizenSetupMessage.textContent = message || '';
  citizenSetupMessage.classList.remove('error', 'success');
  if (type) {
    citizenSetupMessage.classList.add(type);
  }
}

function showCitizenSetup() {
  if (!citizenSetupScreen) {
    return;
  }

  citizenSetupScreen.classList.remove('hidden');
  authScreen.classList.add('hidden');
  lockScreen.classList.add('hidden');
  homeScreen.classList.add('hidden');
  setCitizenSetupMessage('', '');
}

function hideCitizenSetup() {
  if (!citizenSetupScreen) {
    return;
  }

  citizenSetupScreen.classList.add('hidden');
}

function generateCitizenName() {
  const first = citizenNameSeeds.first[Math.floor(Math.random() * citizenNameSeeds.first.length)];
  const last = citizenNameSeeds.last[Math.floor(Math.random() * citizenNameSeeds.last.length)];
  document.getElementById('citizenFirstName').value = first;
  document.getElementById('citizenLastName').value = last;
}

function initializeAvatarPicker() {
  const grid = document.getElementById('avatarPickerGrid');
  const hiddenInput = document.getElementById('citizenAvatar');
  if (!grid || !hiddenInput) {
    return;
  }

  const buttons = grid.querySelectorAll('.avatar-option');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((node) => node.classList.toggle('selected', node === button));
      hiddenInput.value = button.dataset.avatarUrl || './assets/avatars/aurelia-voss.svg';
    });
  });

  if (!hiddenInput.value) {
    hiddenInput.value = './assets/avatars/aurelia-voss.svg';
  }
}

async function checkCitizenRecord(session) {
  const supabase = getAuthClient();
  if (!supabase || !session?.user) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('citizens')
      .select('id, citizen_id, auth_user_id, public_name, avatar_type, avatar_url, political_party, registration_date, created_at')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        authState.hasCitizen = false;
        showCitizenSetup();
        return false;
      }

      console.error('citizen lookup failed', error);
      setAuthMessage('Unable to verify your citizen record right now. Please try again.', 'error');
      return null;
    }

    authState.hasCitizen = Boolean(data);
    if (data) {
      const hasCompleteCitizenState = Boolean(
        profileState.citizen && (
          profileState.citizen.id ||
          profileState.citizen.citizen_id ||
          profileState.citizen.registration_date ||
          profileState.citizen.created_at ||
          profileState.citizen.avatar_type
        )
      );

      if (!hasCompleteCitizenState) {
        profileState.citizen = null;
      }

      hideCitizenSetup();
      return true;
    }

    showCitizenSetup();
    return false;
  } catch (error) {
    console.error('citizen lookup threw', error);
    setAuthMessage('Unable to verify your citizen record right now. Please try again.', 'error');
    return null;
  }
}

async function handleRecoveryCallback() {
  const supabase = getAuthClient();
  if (!supabase) {
    setAuthMessage('Supabase is not available. Please check the client setup.', 'error');
    showAuthView('login');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('code') || hash.get('code');
  const type = params.get('type') || hash.get('type');

  if (type !== 'recovery' && !code) {
    return;
  }

  showAuthView('newPassword');
  setAuthMessage('Reset your password using the link below.', 'success');

  if (!code) {
    return;
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      setAuthMessage(error.message || 'The recovery link could not be verified.', 'error');
      return;
    }

    if (data?.session?.user?.email) {
      authState.pendingEmail = data.session.user.email;
      setAuthMessage('Recovery link verified. Choose a new password.', 'success');
    }
  } catch (error) {
    console.error('recovery callback failed', error);
    setAuthMessage('The recovery link could not be processed.', 'error');
  }
}

async function handleAuthSession() {
  authState.initializing = true;
  authState.ready = false;

  const supabase = window.TYRANNY_SUPABASE;
  if (!supabase) {
    setAuthMessage('Supabase is not available. Please check the client setup.', 'error');
    showAuthView('login');
    authState.initializing = false;
    return;
  }

  if (isRecoveryUrl()) {
    await handleRecoveryCallback();
    authState.initializing = false;
    authState.ready = Boolean(window.TYRANNY_SUPABASE && window.TYRANNY_SUPABASE.auth);
    return;
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    const diagnostics = window.TYRANNY_AUTH_DIAGNOSTICS || (window.TYRANNY_AUTH_DIAGNOSTICS = {});
    diagnostics.projectUrl = window.TYRANNY_SUPABASE_CONFIG?.url ?? null;
    diagnostics.persistedSessionKeys = Object.keys(localStorage).filter((key) => /supabase|sb-|auth/.test(key)).length;
    diagnostics.lastUpdatedAt = new Date().toISOString();

    if (error) {
      diagnostics.sessionExists = false;
      diagnostics.userId = null;
      setAuthMessage(error.message || 'Authentication error.', 'error');
      showAuthView('login');
      authState.initializing = false;
      authState.ready = false;
      return;
    }

    if (!session) {
      diagnostics.sessionExists = false;
      diagnostics.userId = null;
      showAuthView('login');
      authState.initializing = false;
      authState.ready = false;
      return;
    }

    diagnostics.sessionExists = true;
    diagnostics.userId = session.user?.id ?? null;

    const user = session.user;
    if (!user || !user.email) {
      showAuthView('login');
      authState.initializing = false;
      authState.ready = false;
      return;
    }

    if (!user.email_confirmed_at) {
      authState.pendingEmail = user.email;
      verifyEmailText.textContent = `A verification email was sent to ${user.email}.`;
      showAuthView('verify');
      authState.initializing = false;
      authState.ready = true;
      return;
    }

    const citizenStatus = await checkCitizenRecord(session);
    if (citizenStatus === null) {
      showAuthView('login');
      authState.initializing = false;
      authState.ready = false;
      return;
    }

    if (!citizenStatus) {
      showCitizenSetup();
      authState.initializing = false;
      authState.ready = true;
      return;
    }

    moneytreeContributorNameCache.clear();
    if (typeof window !== 'undefined') {
      const currentMoneytreeState = window.__moneytreeState;
      if (currentMoneytreeState) {
        currentMoneytreeState.selectedDiscussionFeed = [];
        currentMoneytreeState.selectedDiscussionFeedError = null;
        currentMoneytreeState.selectedDiscussionFeedLoading = false;
      }
    }

    await loadCitizenProfile();
    await refreshModeratorAppVisibility();

    hideCitizenSetup();
    authScreen.classList.add('hidden');
    verifyScreen.classList.add('hidden');
    lockScreen.classList.remove('hidden');
    homeScreen.classList.add('hidden');
    setAuthMessage('', '');
    authState.initializing = false;
    authState.ready = true;
  } catch (error) {
    console.error('session handling failed', error);
    const diagnostics = window.TYRANNY_AUTH_DIAGNOSTICS || (window.TYRANNY_AUTH_DIAGNOSTICS = {});
    diagnostics.sessionExists = false;
    diagnostics.userId = null;
    diagnostics.lastUpdatedAt = new Date().toISOString();
    setAuthMessage('Unable to verify your session right now.', 'error');
    showAuthView('login');
    authState.initializing = false;
    authState.ready = false;
  }
}

function getAuthClient() {
  return window.TYRANNY_SUPABASE;
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function handleRegister(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (!email || !password || !confirmPassword) {
    setAuthMessage('Please complete every field.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    setAuthMessage('Passwords do not match.', 'error');
    return;
  }

  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });

    if (error) {
      setAuthMessage(error.message || 'Registration failed.', 'error');
      return;
    }

    authState.pendingEmail = email;
    verifyEmailText.textContent = `A verification email was sent to ${email}.`;
    setAuthMessage('Account created. Please verify your email to continue.', 'success');
    showAuthView('verify');
  } catch (error) {
    console.error('registration failed', error);
    setAuthMessage('Registration failed. Please try again.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    setAuthMessage('Email and password are required.', 'error');
    return;
  }

  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message && error.message.toLowerCase().includes('email')) {
        setAuthMessage('Please verify your email before signing in.', 'error');
        authState.pendingEmail = email;
        verifyEmailText.textContent = `A verification email was sent to ${email}.`;
        showAuthView('verify');
        return;
      }
      setAuthMessage(error.message || 'Login failed. Please check your credentials.', 'error');
      return;
    }

    if (!data.user || !data.user.email_confirmed_at) {
      authState.pendingEmail = email;
      verifyEmailText.textContent = `A verification email was sent to ${email}.`;
      showAuthView('verify');
      return;
    }

    const citizenStatus = await checkCitizenRecord(data.session);
    if (citizenStatus === null) {
      return;
    }

    if (!citizenStatus) {
      showCitizenSetup();
      return;
    }

    await loadCitizenProfile();
    await refreshModeratorAppVisibility();

    const diagnostics = window.TYRANNY_AUTH_DIAGNOSTICS || (window.TYRANNY_AUTH_DIAGNOSTICS = {});
    diagnostics.sessionExists = Boolean(data.session);
    diagnostics.userId = data.user.id;
    diagnostics.persistedSessionKeys = Object.keys(localStorage).filter((key) => /supabase|sb-|auth/.test(key)).length;
    diagnostics.lastUpdatedAt = new Date().toISOString();

    setAuthMessage('', '');
    showAuthView('login');
    authScreen.classList.add('hidden');
    lockScreen.classList.remove('hidden');
    authState.initializing = false;
    authState.ready = true;
  } catch (error) {
    console.error('login failed', error);
    authState.initializing = false;
    authState.ready = false;
    setAuthMessage('Login failed. Please try again.', 'error');
  }
}

async function handleSendRecovery(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const email = document.getElementById('recoverEmail').value.trim();

  if (!email) {
    setAuthMessage('Please enter an email address.', 'error');
    return;
  }

  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  const redirectUrl = getAuthRedirectUrl();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      setAuthMessage(error.message || 'Recovery email could not be sent.', 'error');
      return;
    }

    authState.pendingEmail = email;
    setAuthMessage('A password recovery email has been sent. Use the link to finish resetting your password.', 'success');
    showAuthView('login');
  } catch (error) {
    console.error('password recovery failed', error);
    setAuthMessage('Password recovery failed. Please try again.', 'error');
  }
}

async function handleCitizenSetup(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const session = (await supabase.auth.getSession()).data.session;

  if (!supabase || !session?.user) {
    setCitizenSetupMessage('You must be signed in to create a citizen record.', 'error');
    return;
  }

  if (!session.user.email_confirmed_at) {
    setCitizenSetupMessage('Your email must be verified before creating a citizen.', 'error');
    return;
  }

  const firstName = document.getElementById('citizenFirstName').value.trim();
  const lastName = document.getElementById('citizenLastName').value.trim();
  const avatarUrl = document.getElementById('citizenAvatar').value || './assets/avatars/aurelia-voss.svg';
  const avatarType = 'builtin';
  const party = document.getElementById('citizenParty').value || 'Independent';

  if (!firstName || !lastName) {
    setCitizenSetupMessage('Please enter both a first and last name.', 'error');
    return;
  }

  const safeFirst = firstName.replace(/[^a-zA-Z' -]/g, '').slice(0, 32);
  const safeLast = lastName.replace(/[^a-zA-Z' -]/g, '').slice(0, 32);

  if (!safeFirst || !safeLast) {
    setCitizenSetupMessage('Names can only include letters, spaces, apostrophes, and hyphens.', 'error');
    return;
  }

  const publicName = `${safeFirst} ${safeLast}`.trim();

  try {
    const { data, error } = await supabase.functions.invoke('create-citizen', {
      body: {
        public_name: publicName,
        avatar_type: avatarType,
        avatar_url: avatarUrl,
        political_party: party,
      },
    });

    if (error) {
      const message = error.message || 'Citizen creation failed.';
      const normalized = message.toLowerCase();

      if (normalized.includes('already exists')) {
        setCitizenSetupMessage('A citizen is already associated with this account.', 'error');
        return;
      }

      if (normalized.includes('email') && normalized.includes('verified')) {
        setCitizenSetupMessage('Your email must be verified before creating a citizen.', 'error');
        return;
      }

      if (normalized.includes('not found') || normalized.includes('missing') || normalized.includes('permission')) {
        setCitizenSetupMessage('The citizen creation service is not available yet. Please check the Supabase deployment.', 'error');
        return;
      }

      setCitizenSetupMessage(message, 'error');
      return;
    }

    authState.hasCitizen = true;
    hideCitizenSetup();
    authScreen.classList.add('hidden');
    lockScreen.classList.remove('hidden');
    setCitizenSetupMessage('', '');
    setAuthMessage('Citizen profile created successfully.', 'success');
  } catch (error) {
    console.error('citizen setup failed', error);
    setCitizenSetupMessage('Citizen creation failed. Please try again.', 'error');
  }
}

async function handleUpdatePassword(event) {
  event.preventDefault();
  const supabase = getAuthClient();
  const password = document.getElementById('newPasswordInput').value.trim();
  const confirm = document.getElementById('newPasswordConfirmInput').value.trim();

  if (!password || !confirm) {
    setAuthMessage('Please complete both password fields.', 'error');
    return;
  }

  if (password.length < 8) {
    setAuthMessage('Password must be at least 8 characters long.', 'error');
    return;
  }

  if (password !== confirm) {
    setAuthMessage('Passwords do not match.', 'error');
    return;
  }

  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthMessage(error.message || 'Password update failed.', 'error');
      return;
    }

    setAuthMessage('Password updated successfully. You can now sign in with your new password.', 'success');
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('newPasswordConfirmInput').value = '';
    showAuthView('login');
  } catch (error) {
    console.error('password update failed', error);
    setAuthMessage('Password update failed. Please try again.', 'error');
  }
}

async function handleResendVerification() {
  const supabase = getAuthClient();
  const email = authState.pendingEmail || document.getElementById('registerEmail').value.trim() || document.getElementById('loginEmail').value.trim();

  if (!email) {
    setAuthMessage('An email address is required to resend verification.', 'error');
    return;
  }

  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });

    if (error) {
      setAuthMessage(error.message || 'Verification email could not be resent.', 'error');
      return;
    }

    setAuthMessage('Verification email sent again.', 'success');
  } catch (error) {
    console.error('resend verification failed', error);
    setAuthMessage('Verification email could not be resent.', 'error');
  }
}

async function handleLogout() {
  const supabase = getAuthClient();
  if (!supabase) {
    setAuthMessage('Supabase is unavailable.', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthMessage(error.message || 'Logout failed.', 'error');
      return;
    }

    authState.hasCitizen = false;
    hideCitizenSetup();
    setAuthMessage('', '');
    showAuthView('login');
  } catch (error) {
    console.error('logout failed', error);
    setAuthMessage('Logout failed.', 'error');
  }
}

function initializeAuthUi() {
  const loginSubmitForm = document.getElementById('loginSubmitForm');
  const loginSubmitButton = document.getElementById('loginSubmitButton');

  loginSubmitForm.addEventListener('submit', handleLogin);
  loginSubmitButton?.addEventListener('click', (event) => {
    event.preventDefault();
    loginSubmitForm.requestSubmit();
  });

  document.getElementById('registerSubmitForm').addEventListener('submit', handleRegister);
  document.getElementById('recoverSubmitForm').addEventListener('submit', handleSendRecovery);
  document.getElementById('newPasswordSubmitForm').addEventListener('submit', handleUpdatePassword);
  document.getElementById('citizenSetupForm').addEventListener('submit', handleCitizenSetup);
  document.getElementById('generateCitizenName').addEventListener('click', generateCitizenName);
  initializeAvatarPicker();

  document.getElementById('showRegister').addEventListener('click', () => showAuthView('register'));
  document.getElementById('showRecover').addEventListener('click', () => showAuthView('recover'));
  document.getElementById('backToLogin').addEventListener('click', () => showAuthView('login'));
  document.getElementById('recoverBackToLogin').addEventListener('click', () => showAuthView('login'));
  document.getElementById('newPasswordBackToLogin').addEventListener('click', () => showAuthView('login'));
  document.getElementById('verifyBackToLogin').addEventListener('click', () => showAuthView('login'));
  document.getElementById('resendVerification').addEventListener('click', handleResendVerification);

  const supabase = getAuthClient();
  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMessage('Choose a new password to finish resetting your account.', 'success');
        showAuthView('newPassword');
        return;
      }

      if (event === 'SIGNED_OUT') {
        setAuthMessage('', '');
        showAuthView('login');
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        handleAuthSession();
      }

      if (event === 'USER_UPDATED' && session && !session.user.email_confirmed_at) {
        handleAuthSession();
      }
    });
  }
}

function toggleNotifications() {
  notificationCenter.classList.toggle('hidden');
}

function openSettingsMenu() {
  if (settingsMenu) {
    settingsMenu.classList.remove('hidden');
  }
}

function closeSettingsMenu() {
  if (settingsMenu) {
    settingsMenu.classList.add('hidden');
  }
}

function initializePhone() {
  authScreen.classList.add('hidden');
  lockScreen.classList.add('hidden');

  renderPlayerDetails();
  renderAppGrid();
  renderNotificationCenter();
  setClock();
  floatingHome.style.display = 'none';

  const unlockHome = async () => {
    const supabase = getAuthClient();
    if (!supabase) {
      showAuthView('login');
      return;
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      showAuthView('login');
      return;
    }

    if (!session.user?.email_confirmed_at) {
      authState.pendingEmail = session.user?.email || '';
      verifyEmailText.textContent = `A verification email was sent to ${session.user?.email || 'your email address'}.`;
      showAuthView('verify');
      return;
    }

    const citizenStatus = await checkCitizenRecord(session);
    if (citizenStatus === null) {
      return;
    }

    if (!citizenStatus) {
      showCitizenSetup();
      return;
    }

    await loadCitizenProfile();
    await refreshModeratorAppVisibility();

    homeScreen.classList.remove('hidden');
    lockScreen.classList.add('hidden');
    authScreen.classList.add('hidden');
    lockVisible = false;
  };

  const lockScreenElement = document.getElementById('lock-screen');
  const lockCard = document.getElementById('lockCard');
  const unlockButton = document.getElementById('unlockButton');

  lockScreenElement?.addEventListener('click', unlockHome);
  lockCard?.addEventListener('click', (event) => {
    event.stopPropagation();
    unlockHome();
  });
  unlockButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    unlockHome();
  });

  document.getElementById('profileWidget').addEventListener('click', () => {
    openApp('mylife');
  });

  document.getElementById('floatingHome').addEventListener('click', () => {
    returnHome();
    authScreen.classList.add('hidden');
  });

  document.getElementById('dockMessages').addEventListener('click', () => {
    closeSettingsMenu();
    openApp('messages', 'normal');
  });

  document.getElementById('dockContacts').addEventListener('click', () => {
    closeSettingsMenu();
    openApp('associates', 'normal');
  });

  document.getElementById('dockSettings').addEventListener('click', () => {
    if (settingsMenu && !settingsMenu.classList.contains('hidden')) {
      closeSettingsMenu();
      return;
    }
    openSettingsMenu();
  });

  document.getElementById('closeSettings').addEventListener('click', closeSettingsMenu);
  document.getElementById('logoutButton').addEventListener('click', async () => {
    closeSettingsMenu();
    await handleLogout();
  });

  document.getElementById('notificationToggle').addEventListener('click', toggleNotifications);
  document.getElementById('closeNotifications').addEventListener('click', () => {
    notificationCenter.classList.add('hidden');
  });

  const lockAvatar = document.getElementById('lockAvatar');
  const profileAvatar = document.getElementById('profileAvatar');

  if (lockAvatar) {
    lockAvatar.textContent = player.avatarText;
  }

  if (profileAvatar) {
    profileAvatar.textContent = player.avatarText;
  }

  initializeAuthUi();
  setAuthMessage('', '');
  handleAuthSession();
  setInterval(setClock, 30000);
}

initializePhone();
