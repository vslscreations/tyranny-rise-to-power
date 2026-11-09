const player = {
  name: 'Aurelia Voss',
  avatarText: 'AV',
  profession: 'Political Strategist',
  className: 'Urban Elite',
  education: 'Master of Public Policy',
  party: 'United Front',
  balance: '$8,420',
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
  isEditing: false,
};

const appCatalog = {
  social: {
    name: 'Social Media',
    icon: '◉',
    color: '#8bc4ff',
    unread: 1,
  },
  moneytree: {
    name: 'MoneyTree',
    icon: '◎',
    color: '#8ae5a5',
    unread: 2,
  },
  mylife: {
    name: 'MyLife',
    icon: '▣',
    color: '#d6b765',
    unread: 0,
  },
  store: {
    name: 'Store',
    icon: '◌',
    color: '#ff9f7d',
    unread: 0,
  },
  localnews: {
    name: 'Local News',
    icon: '◍',
    color: '#c76dff',
    unread: 5,
  },
  darkweb: {
    name: 'Dark Web',
    icon: '▤',
    color: '#6bcab7',
    unread: 1,
    locked: true,
  },
  voting: {
    name: 'Voting booth',
    icon: '◔',
    color: '#7db4ff',
    unread: 0,
  },
  history: {
    name: 'History book',
    icon: '⚙',
    color: '#a7a4c7',
    unread: 0,
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

function getCitizenAvatarUrl(citizen) {
  if (citizen?.avatar_url && builtInAvatarAssets.some((option) => option.url === citizen.avatar_url)) {
    return citizen.avatar_url;
  }

  return './assets/avatars/aurelia-voss.svg';
}

function applyCitizenProfile(citizen) {
  if (!citizen) {
    return;
  }

  if (citizen.public_name) {
    player.name = citizen.public_name;
  }

  if (citizen.political_party) {
    player.party = citizen.political_party;
  }

  player.avatarText = deriveAvatarText(player.name);
  renderPlayerDetails();
}

function renderPlayerDetails() {
  const activeAvatarUrl = getCitizenAvatarUrl(profileState.citizen || null);

  document.getElementById('lockName').textContent = player.name;
  document.getElementById('profileName').textContent = player.name;
  document.querySelectorAll('.avatar').forEach((avatar) => {
    if (activeAvatarUrl) {
      avatar.style.backgroundImage = `linear-gradient(135deg, rgba(18, 24, 28, 0.15), rgba(18, 24, 28, 0.05)), url("${activeAvatarUrl}")`;
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = player.avatarText;
    }
  });
  document.getElementById('walletBalance').textContent = player.balance;
}

function renderAppGrid() {
  const keys = Object.keys(appCatalog);
  appGrid.innerHTML = keys
    .map((appId) => {
      const app = appCatalog[appId];
      const badge = app.unread > 0 ? `<span class="badge">${app.unread}</span>` : '';
      const lockedClass = app.locked ? 'locked' : '';
      return `
        <button
          type="button"
          class="app-icon ${lockedClass}"
          data-app-id="${appId}"
          aria-label="${app.name}"
        >
          <span class="icon-graphic" style="background: linear-gradient(135deg, rgba(255,255,255,0.18), ${app.color}55); color: ${app.color};">${app.icon}</span>
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  document.getElementById('clockLabel').textContent = formatter.format(now);
  const lockDate = document.querySelector('.lock-welcome');
  lockDate.textContent = `Welcome back · ${dateFormatter.format(now)}`;
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
      <header class="app-header">
        <h3>${appCatalog[appId].name}</h3>
        <span class="mini-mark">${appCatalog[appId].icon}</span>
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

  if (!supabase || !session?.user) {
    return null;
  }

  const { data: citizen, error: citizenError } = await supabase
    .from('citizens')
    .select('id, auth_user_id, citizen_id, public_name, avatar_url, political_party, created_at')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (citizenError && citizenError.code !== 'PGRST116') {
    console.error('citizen profile load failed', citizenError);
    return null;
  }

  if (!citizen) {
    profileState.citizen = null;
    profileState.private = null;
    return null;
  }

  const { data: privateRecord, error: privateError } = await supabase
    .from('citizen_private')
    .select('citizen_id, profession, social_class, education, account_status, balance, privileges')
    .eq('citizen_id', citizen.id)
    .maybeSingle();

  if (privateError && privateError.code !== 'PGRST116') {
    console.error('citizen private profile load failed', privateError);
  }

  profileState.citizen = citizen;
  profileState.private = privateRecord || null;
  applyCitizenProfile(citizen);
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
  const publicName = form.public_name.value.trim();
  const politicalParty = form.political_party.value;
  const avatarUrl = form.avatar_url.value || getCitizenAvatarUrl(profileState.citizen);

  if (!publicName) {
    setAuthMessage('Public name is required.', 'error');
    return;
  }

  const cleanedName = publicName.replace(/[^a-zA-Z' -]/g, '').trim();
  if (!cleanedName || cleanedName.length > 64) {
    setAuthMessage('Public name must be valid and under 64 characters.', 'error');
    return;
  }

  if (!builtInAvatarAssets.some((asset) => asset.url === avatarUrl)) {
    setAuthMessage('Please select a valid built-in avatar.', 'error');
    return;
  }

  const { error } = await supabase
    .from('citizens')
    .update({
      public_name: cleanedName,
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
    body.innerHTML = `
      <div class="mylife-card">
        <div class="chat-thread" aria-label="Social Media feed">
          <div class="chat-bubble">The neighborhood council approved a new community charter.</div>
          <div class="chat-bubble user">We’re moving faster than the opposition expected.</div>
          <div class="chat-bubble">Supporters are sharing your campaign posters across district channels.</div>
          <div class="chat-bubble user">Keep the momentum up and release the donor update tonight.</div>
        </div>
      </div>
    `;
  }

  if (appId === 'mylife') {
    const citizen = profileState.citizen || {};
    const privateRecord = profileState.private || {};
    const avatarUrl = getCitizenAvatarUrl(citizen);
    const displayName = citizen.public_name || player.name;
    const party = citizen.political_party || player.party;
    const profession = privateRecord.profession || player.profession;
    const socialClass = privateRecord.social_class || player.className;
    const education = privateRecord.education || player.education;
    const accountStatus = privateRecord.account_status || 'Active';
    const createdAt = citizen.created_at ? new Date(citizen.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

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
        <div class="mylife-card">
          <div class="mylife-header-row">
            <div>
              <div class="section-kicker">Edit profile</div>
              <h4 class="mylife-title">Public identity</h4>
            </div>
            <button type="button" class="secondary-button" data-action="cancel-edit-profile">Cancel</button>
          </div>

          <form id="profileEditForm" class="profile-edit-form">
            <label class="field-group">
              <span>Public display name</span>
              <input name="public_name" type="text" value="${displayName}" maxlength="64" />
            </label>

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

    body.innerHTML = `
      <div class="mylife-card">
        <div class="mylife-profile-header">
          <div class="profile-avatar-large" style="background-image: url('${avatarUrl}')"></div>
          <div class="profile-copy">
            <div class="section-kicker">Citizen profile</div>
            <h4 class="mylife-title">${displayName}</h4>
            <div class="mini-meta">${profession} · ${party}</div>
          </div>
          <button type="button" class="secondary-button" data-action="edit-profile">Edit</button>
        </div>

        <div class="mylife-grid mylife-overview-grid">
          <div class="info-row"><span>Citizen ID</span><span>${citizen.citizen_id || '—'}</span></div>
          <div class="info-row"><span>Political affiliation</span><span>${party}</span></div>
          <div class="info-row"><span>Profession</span><span>${profession}</span></div>
          <div class="info-row"><span>Social class</span><span>${socialClass}</span></div>
          <div class="info-row"><span>Education</span><span>${education}</span></div>
          <div class="info-row"><span>Account status</span><span>${accountStatus}</span></div>
          <div class="info-row"><span>Registered</span><span>${createdAt}</span></div>
        </div>
      </div>

      <div class="mylife-section">
        <div class="section-kicker">Career</div>
        <div class="info-card">
          <strong>${profession}</strong>
          <p>Current profession and work profile are shown here. Career progression, applications, and salary systems remain deferred for beta.</p>
        </div>
      </div>

      <div class="mylife-section">
        <div class="section-kicker">Education</div>
        <div class="info-card">
          <strong>${education}</strong>
          <p>Education status is viewable here. Future degree and enrollment systems are deferred for beta.</p>
        </div>
      </div>

      <div class="mylife-section">
        <div class="section-kicker">Skills</div>
        <div class="info-card">
          <strong>Skill tree</strong>
          <p>Future skill progression is planned. This beta focuses on profile display and personal status management.</p>
        </div>
      </div>

      <div class="mylife-section">
        <div class="section-kicker">Assets</div>
        <div class="info-card empty-state">
          <strong>Personal assets</strong>
          <p>No personal asset system is active yet. This section will populate when the system is introduced.</p>
        </div>
      </div>
    `;

    const editButton = body.querySelector('[data-action="edit-profile"]');
    if (editButton) {
      editButton.addEventListener('click', () => {
        profileState.isEditing = true;
        renderAppContent('mylife');
      });
    }
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
  floatingHome.style.display = 'grid';
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
      .select('id, public_name, avatar_url, political_party')
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
      profileState.citizen = data;
      applyCitizenProfile(data);
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
      return;
    }

    if (!citizenStatus) {
      showCitizenSetup();
      return;
    }

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
  document.getElementById('loginSubmitForm').addEventListener('submit', handleLogin);
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
  renderPlayerDetails();
  renderAppGrid();
  renderNotificationCenter();
  setClock();
  floatingHome.style.display = 'none';

  document.getElementById('unlockButton').addEventListener('click', () => {
    homeScreen.classList.remove('hidden');
    lockScreen.classList.add('hidden');
    authScreen.classList.add('hidden');
    lockVisible = false;
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
    setAuthMessage('Messages placeholder', 'success');
  });

  document.getElementById('dockSettings').addEventListener('click', () => {
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

  document.getElementById('lockAvatar').textContent = player.avatarText;
  document.getElementById('profileAvatar').textContent = player.avatarText;

  initializeAuthUi();
  setAuthMessage('', '');
  handleAuthSession();
  setInterval(setClock, 30000);
}

initializePhone();
