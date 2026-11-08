const player = {
  name: 'Aurelia Voss',
  avatarText: 'AV',
  profession: 'Political Strategist',
  className: 'Urban Elite',
  education: 'Master of Public Policy',
  party: 'United Front',
  balance: '$8,420',
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
const appGrid = document.getElementById('appGrid');
const notificationCenter = document.getElementById('notificationCenter');
const notificationList = document.getElementById('notificationList');
const notificationBubble = document.getElementById('notificationBubble');
const floatingHome = document.getElementById('floatingHome');

function renderPlayerDetails() {
  document.getElementById('lockName').textContent = player.name;
  document.getElementById('profileName').textContent = player.name;
  document.querySelectorAll('.avatar').forEach((avatar) => {
    avatar.textContent = player.avatarText;
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
    body.innerHTML = `
      <div class="mylife-card">
        <div class="player-summary" style="margin: 0 0 18px; width: 100%; justify-content: flex-start;">
          <div class="avatar avatar-medium">${player.avatarText}</div>
          <div class="player-text">
            <span class="player-name">${player.name}</span>
            <span class="player-tag">${player.profession}</span>
          </div>
        </div>

        <div class="mylife-grid">
          <div class="info-row"><span>Profession</span><span>${player.profession}</span></div>
          <div class="info-row"><span>Social class</span><span>${player.className}</span></div>
          <div class="info-row"><span>Education</span><span>${player.education}</span></div>
          <div class="info-row"><span>Political Party</span><span>${player.party}</span></div>
        </div>
      </div>
    `;
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

function initializePhone() {
  renderPlayerDetails();
  renderAppGrid();
  renderNotificationCenter();
  setClock();
  floatingHome.style.display = 'none';

  document.getElementById('unlockButton').addEventListener('click', () => {
    homeScreen.classList.remove('hidden');
    lockScreen.classList.add('hidden');
    lockVisible = false;
  });

  document.getElementById('profileWidget').addEventListener('click', () => {
    openApp('mylife');
  });

  document.getElementById('floatingHome').addEventListener('click', returnHome);
  document.getElementById('notificationToggle').addEventListener('click', toggleNotifications);
  document.getElementById('closeNotifications').addEventListener('click', () => {
    notificationCenter.classList.add('hidden');
  });

  document.getElementById('lockAvatar').textContent = player.avatarText;
  document.getElementById('profileAvatar').textContent = player.avatarText;

  setInterval(setClock, 30000);
}

initializePhone();
