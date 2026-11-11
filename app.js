const player = {
  name: 'Aurelia Voss',
  avatarText: 'AV',
  profession: 'Profile unavailable',
  className: 'Profile unavailable',
  education: 'Profile unavailable',
  party: 'United Front',
  balance: 'Loading...',
};

const builtInAvatarAssets = [
  { url: './assets/avatars/aurelia-voss.svg', label: 'Aurelia Voss' },
  { url: './assets/avatars/jasper-reed.svg', label: 'Jasper Reed' },
  { url: './assets/avatars/mira-sloane.svg', label: 'Mira Sloane' },
  { url: './assets/avatars/dorian-kestrel.svg', label: 'Dorian Kestrel' },
  { url: './assets/avatars/leah-cortez.svg', label: 'Leah Cortez' },
  { url: './assets/avatars/omar-tate.svg', label: 'Omar Tate' },
];

const profileState = {
  citizen: null,
  private: null,
  privateLoadError: null,
  isEditing: false,
  citizenLoadToken: 0,
};

const appCatalog = {
  social: {
    name: 'Social Media',
    icon: './images/icons/socialmedia.PNG',
    color: '#8bc4ff',
    unread: 1,
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
  activeTab: 'following',
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
};

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

const appState = {};
let activeAppId = null;
let lockVisible = true;

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
};

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
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

function normalizeSocialPostRecord(record) {
  const author = record?.author || {};
  const authorId = author?.id ?? record?.author_citizen_id ?? record?.authorCitizenId ?? null;
  const authorName = author?.public_name ?? record?.author_name ?? record?.author ?? 'Citizen';
  const authorAvatar = author?.avatar_url ?? record?.avatar_url ?? './assets/avatars/aurelia-voss.svg';
  const resolvedAvatar = builtInAvatarAssets.some((option) => option.url === authorAvatar)
    ? authorAvatar
    : './assets/avatars/aurelia-voss.svg';

  return {
    id: String(record?.id ?? `social-${Date.now()}`),
    authorCitizenId: authorId,
    author: String(authorName || 'Citizen'),
    handle: '@' + String(authorName || 'citizen').toLowerCase().replace(/[^a-z0-9]+/g, ''),
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
          rows="3"
          maxlength="2000"
          placeholder="Write a message…"
          data-message-composer
          aria-label="Write a message"
        >${escapeHtml(messagesState.composerDraft)}</textarea>
        <div class="messages-composer-row">
          <span class="message-composer-count">${Array.from(messagesState.composerDraft).length}/2000</span>
          <button type="button" class="primary-button" data-action="send-message" ${messagesState.sending ? 'disabled' : ''}>
            ${messagesState.sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    `;

    const conversationMarkup = `
      <div class="messages-card">
        <div class="messages-header-row">
          <button type="button" class="secondary-button" data-action="back-to-inbox">Back to Inbox</button>
          <div class="messages-conversation-header">
            <div class="message-thread-avatar" style="background-image: url('${escapeHtml(partnerAvatar)}')"></div>
            <div>
              <div class="section-kicker">Conversation</div>
              <h3>${escapeHtml(messagesState.activePartnerName)}</h3>
            </div>
          </div>
          <button type="button" class="secondary-button" data-action="open-partner-profile" data-partner-citizen-id="${escapeHtml(String(messagesState.activePartnerCitizenId ?? ''))}">To profile</button>
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
        <div>
          <div class="section-kicker">Private messages</div>
          <h3>Inbox</h3>
        </div>
        <button type="button" class="secondary-button" data-action="refresh-messages">Refresh</button>
      </div>
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

  const nextRequestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: true,
    targetCitizenId: normalizedCitizenId,
    data: null,
    loading: true,
    error: null,
    requestToken: nextRequestToken,
  };

  renderSocialApp();
}

function closeSocialProfileView() {
  const nextRequestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: false,
    targetCitizenId: null,
    data: null,
    loading: false,
    error: null,
    requestToken: nextRequestToken,
  };

  renderSocialApp();
}

async function loadSocialProfileView(targetCitizenId) {
  const normalizedCitizenId = String(targetCitizenId ?? '').trim();
  if (!normalizedCitizenId) {
    return;
  }

  const requestToken = Number(socialState.profileView?.requestToken || 0) + 1;
  socialState.profileView = {
    active: true,
    targetCitizenId: normalizedCitizenId,
    data: null,
    loading: true,
    error: null,
    requestToken,
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

    socialState.profileView = {
      ...socialState.profileView,
      loading: false,
      error: null,
      data: {
        ...profileRow,
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
    following: 'get_following_feed',
    trending: 'get_trending_feed',
  };

  const requestId = ++socialState.feedRequestToken;
  const rpcName = rpcMap[tabName] || rpcMap.following;

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
    socialState.posts = feedRows.map((record) => normalizeSocialPostRecord(record));
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
      partnerName: String(profileName || 'Citizen').trim() || 'Citizen',
      avatar: getSafeAvatarUrl(profileAvatarUrl || './assets/avatars/aurelia-voss.svg'),
    });
  } catch (error) {
    console.error('profile message action failed', error);
  } finally {
    delete socialState.profileMessageBusyByCitizen[normalizedTargetCitizenId];
    renderSocialApp();
  }
}

function renderSocialApp() {
  const appWindow = ensureAppWindow('social');
  const body = appWindow.querySelector('.app-body');
  const profileView = socialState.profileView || {
    active: false,
    targetCitizenId: null,
    data: null,
    loading: false,
    error: null,
    requestToken: 0,
  };

  if (profileView.active) {
    const profileHeading = profileView.loading
      ? 'Loading citizen profile…'
      : profileView.error
        ? 'Citizen profile unavailable'
        : (profileView.data?.public_name || 'Citizen profile');
    const profileAvatarUrl = getSafeAvatarUrl(profileView.data?.avatar_url || './assets/avatars/aurelia-voss.svg');
    const profilePosts = Array.isArray(profileView.data?.posts) ? profileView.data.posts : [];
    const registrationDate = profileView.data?.registration_date
      ? new Date(profileView.data.registration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recent';
    const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
    const profileTargetCitizenId = profileView.targetCitizenId ? String(profileView.targetCitizenId) : null;
    const isOwnProfile = Boolean(profileTargetCitizenId && currentCitizenId && profileTargetCitizenId === currentCitizenId);
    const isFollowingProfile = Boolean(profileView.data?.current_user_following || (profileTargetCitizenId && socialState.followSet.has(profileTargetCitizenId)));
    const profileFollowPending = Boolean(profileTargetCitizenId && socialState.pendingFollowAuthorIds.has(profileTargetCitizenId));
    const profileFollowLabel = profileFollowPending
      ? (isFollowingProfile ? 'Unfollowing...' : 'Following...')
      : (isFollowingProfile ? 'Unfollow' : 'Follow');
    const profileFollowTitle = isFollowingProfile
      ? 'Click to unfollow this citizen'
      : 'Follow this citizen';
    const profileMessageBusy = Boolean(profileTargetCitizenId && socialState.profileMessageBusyByCitizen[profileTargetCitizenId]);
    const profileHeaderActions = !isOwnProfile && profileTargetCitizenId && !profileView.loading && !profileView.error ? `
      <button
        type="button"
        class="secondary-button"
        data-social-action="message-profile"
        data-target-citizen-id="${escapeHtml(profileTargetCitizenId)}"
        title="Send a message to this citizen"
        ${profileMessageBusy ? 'disabled aria-disabled="true"' : ''}
      >${profileMessageBusy ? 'Opening…' : 'Message'}</button>
      <button
        type="button"
        class="secondary-button social-follow-toggle ${isFollowingProfile ? 'following' : ''}"
        data-social-action="toggle-profile-follow"
        data-follow-author-id="${escapeHtml(profileTargetCitizenId)}"
        title="${escapeHtml(profileFollowTitle)}"
        ${profileFollowPending ? 'disabled aria-disabled="true"' : ''}
      >${profileFollowLabel}</button>
    ` : '';

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
          <div class="mylife-panel">
            <div class="mylife-overview-grid">
              <div class="mylife-stat-row"><span>Followers</span><strong>${escapeHtml(String(profileView.data?.follower_count ?? 0))}</strong></div>
              <div class="mylife-stat-row"><span>Political party</span><strong>${escapeHtml(profileView.data?.political_party || 'Independent')}</strong></div>
              <div class="mylife-stat-row"><span>Social class</span><strong>${escapeHtml(profileView.data?.social_class || 'Unknown')}</strong></div>
              <div class="mylife-stat-row"><span>Career</span><strong>${escapeHtml(getDisplayProfession(profileView.data?.profession, 'Unknown'))}</strong></div>
              <div class="mylife-stat-row"><span>Registration date</span><strong>${escapeHtml(registrationDate)}</strong></div>
            </div>
          </div>

          ${profilePosts.length ? `
            <div class="mylife-panel">
              <div class="mylife-panel-header compact">
                <div>
                  <div class="section-kicker">Recent posts</div>
                  <h3>Latest activity</h3>
                </div>
              </div>
              <div class="social-feed">
                ${profilePosts.map((post) => {
                  const author = post?.author || {};
                  const authorName = author.public_name || 'Citizen';
                  const authorAvatar = getSafeAvatarUrl(author.avatar_url || './assets/avatars/aurelia-voss.svg');
                  const postId = String(post?.id ?? '');
                  const content = String(post?.content ?? '');
                  const createdAt = post?.created_at ? formatSocialTimestamp(post.created_at) : 'Recent';
                  const likeCount = Number(post?.like_count ?? 0) || 0;
                  const commentCount = Number(post?.comment_count ?? 0) || 0;

                  return `
                    <article class="social-post" data-post-id="${escapeHtml(postId)}">
                      <div class="social-post-header">
                        <div class="social-post-author">
                          <div class="social-post-avatar" style="background-image: url('${escapeHtml(authorAvatar)}')"></div>
                          <div>
                            <strong>${escapeHtml(authorName)}</strong>
                            <span>@${escapeHtml(String(authorName).toLowerCase().replace(/\s+/g, ''))} · ${escapeHtml(createdAt)}</span>
                          </div>
                        </div>
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
            </div>
          ` : `
            <div class="mylife-alert">
              <span>No posts yet</span>
              <p>This citizen has not posted anything recent.</p>
            </div>
          `}
        `;

    body.innerHTML = `
      <div class="social-shell">
        <div class="social-profile-card">
          <div class="social-avatar" style="background-image: url('${escapeHtml(profileAvatarUrl)}')"></div>
          <div class="social-profile-copy">
            <strong>${escapeHtml(profileHeading)}</strong>
            <span>${escapeHtml(profileView.targetCitizenId ? `Citizen ${profileView.targetCitizenId}` : 'Citizen profile')}</span>
          </div>
          <div class="social-profile-actions">
            ${profileHeaderActions}
            <button type="button" class="secondary-button" data-social-action="close-profile-view">Back to Feed</button>
          </div>
        </div>
        ${profileBody}
      </div>
    `;
    bindSocialFollowButtons(body);
    return;
  }

  const currentUserName = profileState.citizen?.public_name || player.name || 'Aurelia Voss';
  const currentUserHandle = '@' + String(currentUserName).toLowerCase().replace(/\s+/g, '');
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
        const isFollowing = post.isCurrentUser || post.currentUserFollowingAuthor || socialState.followSet.has(authorCitizenId);
        const followError = authorCitizenId ? socialState.followErrorByAuthor[authorCitizenId] || null : null;
        const followPending = Boolean(authorCitizenId && socialState.pendingFollowAuthorIds.has(authorCitizenId));
        const followButtonLabel = followPending
          ? (isFollowing ? 'Following…' : 'Follow…')
          : (isFollowing ? 'Following' : 'Follow');
        const followButtonTitle = followError
          ? `Follow failed: ${followError}`
          : (isFollowing ? 'Click to unfollow this citizen' : 'Follow this citizen');
        const likeLabel = post.liked ? 'Liked' : 'Like';
        const postId = escapeHtml(String(post.id));
        const normalizedPostId = String(post.id ?? '');
        const postAuthor = escapeHtml(post.author);
        const postHandle = escapeHtml(post.handle);
        const postContent = escapeHtml(post.content);
        const postAvatar = escapeHtml(post.avatar);
        const escapedAuthorCitizenId = escapeHtml(authorCitizenId);
        const currentCitizenId = profileState.citizen?.id ? String(profileState.citizen.id) : null;
        const postOwnerCitizenId = post.authorCitizenId ? String(post.authorCitizenId) : null;
        const isOwnPost = Boolean(currentCitizenId && postOwnerCitizenId && postOwnerCitizenId === currentCitizenId);
        const shouldRenderFollowButton = !isOwnPost && Boolean(authorCitizenId);
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
                aria-label="Open ${postAuthor}'s profile"
                style="background: none; border: none; color: inherit; text-align: left; padding: 0; cursor: pointer;"
              >
                <div class="social-post-avatar" style="background-image: url('${postAvatar}')"></div>
                <div>
                  <strong>${postAuthor}</strong>
                  <span>${postHandle} · ${escapeHtml(formatSocialTimestamp(post.createdAt))}</span>
                </div>
              </button>
              <div class="social-post-header-actions">
                ${shouldRenderFollowButton ? `
                  <div class="social-follow-wrap">
                    <button
                      type="button"
                      class="social-follow-toggle ${isFollowing ? 'following' : ''}"
                      data-follow-author-id="${escapedAuthorCitizenId}"
                      title="${escapeHtml(followButtonTitle)}"
                      ${followPending ? 'disabled' : ''}
                      aria-disabled="${String(Boolean(followPending))}"
                    >
                      ${followButtonLabel}
                    </button>
                    ${followError ? `<div class="social-post-editor-error">${escapeHtml(followError)}</div>` : ''}
                  </div>
                ` : ''}
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
      <div class="social-profile-card">
        <div class="social-avatar" style="background-image: url('${escapeHtml(currentUserAvatar)}')"></div>
        <div class="social-profile-copy">
          <strong>${escapeHtml(currentUserName)}</strong>
          <span>${escapeHtml(currentUserHandle)}</span>
        </div>
      </div>

      <div class="social-search-box">
        <span>⌕</span>
        <input type="text" aria-label="Search citizens or discussions" value="Search citizens or discussions" readonly />
      </div>

      <div class="social-tabs" aria-label="Social media feed tabs">
        <button type="button" class="social-tab ${socialState.activeTab === 'following' ? 'active' : ''}" data-social-tab="following">Following</button>
        <button type="button" class="social-tab ${socialState.activeTab === 'trending' ? 'active' : ''}" data-social-tab="trending">Trending</button>
        <button type="button" class="social-tab ${socialState.activeTab === 'latest' ? 'active' : ''}" data-social-tab="latest">Latest</button>
      </div>

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
                          const commentAuthorName = escapeHtml(String(comment.author_public_name || 'Citizen'));
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
                                  <div class="social-comment-author">
                                    <div class="social-comment-avatar" style="background-image: url('${escapeHtml(commentAvatarUrl)}')"></div>
                                    <div>
                                      <strong>${commentAuthorName}</strong>
                                      <span>${escapeHtml(createdAt)}</span>
                                    </div>
                                  </div>
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
                                <div class="social-comment-author">
                                  <div class="social-comment-avatar" style="background-image: url('${escapeHtml(commentAvatarUrl)}')"></div>
                                  <div>
                                    <strong>${commentAuthorName}</strong>
                                    <span>${escapeHtml(createdAt)}</span>
                                  </div>
                                </div>
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

  if (body && !body.dataset.profileViewNavigationBound) {
    body.dataset.profileViewNavigationBound = 'true';
    body.addEventListener('click', async (event) => {
      const closeProfileButton = event.target.closest('[data-social-action="close-profile-view"]');
      if (closeProfileButton) {
        closeSocialProfileView();
      }

      const messageProfileButton = event.target.closest('[data-social-action="message-profile"]');
      if (messageProfileButton) {
        event.preventDefault();
        const targetCitizenId = String(messageProfileButton.dataset.targetCitizenId || '').trim();
        if (!targetCitizenId || socialState.profileMessageBusyByCitizen[targetCitizenId]) {
          return;
        }

        const profileName = profileView.data?.public_name || 'Citizen';
        const profileAvatarUrl = profileView.data?.avatar_url || './assets/avatars/aurelia-voss.svg';
        await startProfileMessageAction(targetCitizenId, profileName, profileAvatarUrl);
      }
    });
  }

  const socialFeed = body.querySelector('.social-feed');

  if (socialFeed && !socialFeed.dataset.postEditDelegationBound) {
    socialFeed.dataset.postEditDelegationBound = 'true';
    socialFeed.addEventListener('click', async (event) => {
      const profileOpenButton = event.target.closest('[data-social-action="open-citizen-profile"]');
      if (profileOpenButton) {
        const targetCitizenId = String(profileOpenButton.dataset.citizenId || '').trim();
        if (!targetCitizenId) {
          return;
        }

        await loadSocialProfileView(targetCitizenId);
        return;
      }

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
}

function renderAppGrid() {
  const keys = Object.keys(appCatalog);
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
    const icon = appCatalog[appId].icon;
    const miniMark = icon.startsWith('.')
      ? `<span class="mini-mark-image" style="background-image: url('${icon}'); background-size: cover; background-position: center; background-repeat: no-repeat;"></span>`
      : `<span class="mini-mark">${icon}</span>`;

    appWindow.innerHTML = `
      <header class="app-header">
        <h3>${appCatalog[appId].name}</h3>
        ${miniMark}
      </header>
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

function renderAppContent(appId, mode = 'normal') {
  const appWindow = ensureAppWindow(appId);
  const body = appWindow.querySelector('.app-body');

  if (appId === 'social') {
    renderSocialApp();
    if (!socialState.loading && socialState.activeTab) {
      loadSocialFeed(socialState.activeTab);
    }
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
      { key: 'career', title: 'Career', value: profession, icon: '◈', accent: '#5b7cff', description: 'Overview of current profession and work profile.' },
      { key: 'education', title: 'Education', value: education, icon: '◍', accent: '#2bb673', description: 'Education status and records.' },
      { key: 'skills', title: 'Skills', value: 'Skill tree', icon: '✦', accent: '#eb8a4f', description: 'Current capabilities and development.' },
      { key: 'assets', title: 'Assets', value: 'Personal assets', icon: '▣', accent: '#9a6ef8', description: 'Personal holdings and resources.' },
    ];

    body.innerHTML = `
      <div class="mylife-shell">
        ${privateLoadError}

        <section class="mylife-header-card">
          <div class="mylife-header-top">
            <div class="mylife-avatar-lg" style="background-image: url('${avatarUrl}')"></div>
            <button type="button" class="mylife-edit-button" data-action="edit-profile">Edit</button>
          </div>

          <div class="mylife-header-copy">
            <div class="section-kicker">My identity</div>
            <h2>${displayName}</h2>
            <div class="mylife-header-meta">
              <span>${citizen.citizen_id || 'Citizen ID unavailable'}</span>
              <span>${profession}</span>
              <span>${party}</span>
            </div>
          </div>
        </section>

        <section class="mylife-panel">
          <div class="mylife-panel-header">
            <div>
              <div class="section-kicker">My overview</div>
              <h3>Account summary</h3>
            </div>
          </div>

          <div class="mylife-overview-grid">
            <div class="mylife-stat-row"><span>Account balance</span><strong>${balanceValue}</strong></div>
            <div class="mylife-stat-row"><span>Social class</span><strong>${socialClass}</strong></div>
            <div class="mylife-stat-row"><span>Education</span><strong>${education}</strong></div>
            <div class="mylife-stat-row"><span>Account status</span><strong>${accountStatus}</strong></div>
            <div class="mylife-stat-row"><span>Registered</span><strong>${createdAt}</strong></div>
          </div>
        </section>

        <section class="mylife-panel">
          <div class="mylife-panel-header">
            <div>
              <div class="section-kicker">My life</div>
              <h3>Life categories</h3>
            </div>
          </div>

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
      </div>
    `;

    const editButton = body.querySelector('[data-action="edit-profile"]');
    if (editButton) {
      editButton.addEventListener('click', () => {
        profileState.isEditing = true;
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
      button.addEventListener('click', () => {
        const category = button.dataset.category;
        if (!category) {
          return;
        }

        const categoryConfig = {
          career: { title: 'Career', icon: '◈', accent: '#5b7cff', summary: 'Current profession and work profile', description: profession, empty: 'No career data is available yet.' },
          education: { title: 'Education', icon: '◍', accent: '#2bb673', summary: 'Education status', description: education, empty: 'No education records are available yet.' },
          skills: { title: 'Skills', icon: '✦', accent: '#eb8a4f', summary: 'Skill tree', description: 'Skill progression is not active in this beta.', empty: 'No skill records are available yet.' },
          assets: { title: 'Assets', icon: '▣', accent: '#9a6ef8', summary: 'Personal assets', description: 'No personal asset system is active yet.', empty: 'No asset information is available yet.' },
        };

        const config = categoryConfig[category] || categoryConfig.career;
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
    body.innerHTML = `
      <div class="money-card">
        <div class="chat-thread" aria-label="MoneyTree conversation">
          <div class="chat-bubble">You’ve been flagged for a new regional donor campaign.</div>
          <div class="chat-bubble user">I can route a $3,200 transfer to the district office.</div>
          <div class="chat-bubble">Your allies approved the operation. Secure the route before sunset.</div>
          <div class="chat-bubble user">Understood. I’ll direct resources to the new harbor contracts.</div>
        </div>
        <div class="chat-input">
          <input type="text" aria-label="Message MoneyTree" value="Send a discreet transfer" />
          <button type="button">Send</button>
        </div>
      </div>
    `;

    const thread = body.querySelector('.chat-thread');
    if (thread) {
      thread.scrollTop = appState[appId].scrollTop || thread.scrollHeight;
      thread.addEventListener('scroll', () => {
        appState[appId].scrollTop = thread.scrollTop;
      }, { passive: true });
    }
  }

  if (appId === 'store') {
    body.innerHTML = `
      <div class="store-card">
        <div class="store-grid">
          <div class="store-item"><strong>Influence Kit</strong><span>Boost campaign reach</span><small>$820</small></div>
          <div class="store-item"><strong>Backroom Access</strong><span>Secure a private channel</span><small>$2,400</small></div>
          <div class="store-item"><strong>Field Agents</strong><span>Hire local operators</span><small>$1,350</small></div>
          <div class="store-item"><strong>Signal Jammer</strong><span>Disrupt competitor chatter</span><small>$3,100</small></div>
        </div>
      </div>
    `;

    const storeArea = body.querySelector('.store-card');
    if (storeArea) {
      storeArea.scrollTop = appState[appId].scrollTop || 0;
      storeArea.addEventListener('scroll', () => {
        appState[appId].scrollTop = storeArea.scrollTop;
      }, { passive: true });
    }
  }

  if (appId === 'localnews') {
    body.innerHTML = `
      <div class="news-card">
        <div class="news-list">
          <article class="news-item"><strong>Regional vote turns</strong><span>Coalition momentum grows across the capital district.</span></article>
          <article class="news-item"><strong>Private donors mobilize</strong><span>Funding circuits reopened after last week’s scandal.</span></article>
          <article class="news-item"><strong>Public safety review</strong><span>Officials promise tighter control over transit corridors.</span></article>
        </div>
      </div>
    `;
  }

  if (appId === 'voting') {
    body.innerHTML = `
      <div class="news-card">
        <div class="mylife-grid">
          <div class="info-row"><span>Precinct</span><span>West Ward 17</span></div>
          <div class="info-row"><span>Ballot status</span><span>Ready</span></div>
          <div class="info-row"><span>Turnout</span><span>64%</span></div>
          <div class="info-row"><span>Deadline</span><span>6:00 PM</span></div>
        </div>
      </div>
    `;
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

  if (!appWindow.dataset.initialized || appWindow.dataset.mode !== mode) {
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
  const supabase = window.TYRANNY_SUPABASE;
  if (!supabase) {
    setAuthMessage('Supabase is not available. Please check the client setup.', 'error');
    showAuthView('login');
    return;
  }

  if (isRecoveryUrl()) {
    await handleRecoveryCallback();
    return;
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      setAuthMessage(error.message || 'Authentication error.', 'error');
      showAuthView('login');
      return;
    }

    if (!session) {
      showAuthView('login');
      return;
    }

    const user = session.user;
    if (!user || !user.email) {
      showAuthView('login');
      return;
    }

    if (!user.email_confirmed_at) {
      authState.pendingEmail = user.email;
      verifyEmailText.textContent = `A verification email was sent to ${user.email}.`;
      showAuthView('verify');
      return;
    }

    const citizenStatus = await checkCitizenRecord(session);
    if (citizenStatus === null) {
      showAuthView('login');
      return;
    }

    if (!citizenStatus) {
      showCitizenSetup();
      return;
    }

    await loadCitizenProfile();

    hideCitizenSetup();
    authScreen.classList.add('hidden');
    verifyScreen.classList.add('hidden');
    lockScreen.classList.remove('hidden');
    homeScreen.classList.add('hidden');
    setAuthMessage('', '');
  } catch (error) {
    console.error('session handling failed', error);
    setAuthMessage('Unable to verify your session right now.', 'error');
    showAuthView('login');
  }
}

function getAuthClient() {
  return window.TYRANNY_SUPABASE;
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

    setAuthMessage('', '');
    showAuthView('login');
    authScreen.classList.add('hidden');
    lockScreen.classList.remove('hidden');
  } catch (error) {
    console.error('login failed', error);
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

  const redirectUrl = `${window.location.origin}${window.location.pathname}`;

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

  document.getElementById('dockPhone').addEventListener('click', () => {
    returnHome();
    closeSettingsMenu();
  });

  document.getElementById('dockMessages').addEventListener('click', () => {
    closeSettingsMenu();
    openApp('messages', 'normal');
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
