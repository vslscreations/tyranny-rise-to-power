(() => {
  'use strict';

  // Editorial content lives separately from rendering so more guides can be added.
  const articles = [
    {
      id: 'welcome', category: 'Start here', title: 'What is Tyranny: Rise to Power?',
      summary: 'Start with nothing. Build a reputation. Discover how far ambition can take you.',
      paragraphs: [
        'Tyranny: Rise to Power is a multiplayer, text-based political and social simulation RPG. You enter a society of real people with no starting money, assets, or diploma. From the moment you become a citizen, you begin shaping your own story.',
        'This is the beta experience: the first taste of a much bigger world. Today, explore social discussions and available rewards, work toward your diploma and available assets, build relationships, read the news, and take part in civic polls. Check each app for its current rules and availability.',
        'Tyranny is about people as much as progress. Debate ideas, gain a following, make friends, meet rivals, and discover that other citizens have ambitions of their own. Every new player adds another personality and another unpredictable element to society.',
        'The broader vision includes expanded careers, entrepreneurship, campaigns for office, a presidency with economic and taxation powers, and darker paths through crime and corruption. These are future ambitions for the game, not a list of systems already playable in this beta.',
        'More features are coming soon. Expect unfinished areas and changes as Tyranny develops. Start with the interactive tutorial, explore what is available now, and help bring this growing society to life.',
      ], tip: 'In Tyranny, power is earned, negotiated, taken, and sometimes lost. Your rise starts with your next move.',
    },
    {
      id: 'mylife', category: 'Your citizen', title: 'MyLife: know your citizen',
      summary: 'Your profile, balance, career progress, and personal assets in one place.',
      paragraphs: [
        'MyLife is your personal dashboard. View your account balance, employment status, social class, education, registration date, and account status.',
        'Use the edit button on your profile to customize your avatar and political affiliation. Your public citizen name stays permanent.',
        'Open Career Path Tree to review your progression, or Assets to see your Asset Map. Your profile reflects the records attached to your signed-in citizen.',
      ], tip: 'Start here when you want to check what you own or where you stand.', target: 'mylife',
    },
    {
      id: 'moneytree', category: 'Earn & progress', title: 'MoneyTree: join the discussion',
      summary: 'Take part in discussions, submit contributions, and track rewards.',
      paragraphs: [
        'MoneyTree brings together discussions and citizen contributions. Open a discussion to read the feed, contribute your response, or challenge a contribution.',
        'Submissions may need moderator review. Approval, rejection, and reward updates appear in your notifications; submitting a contribution does not guarantee a reward.',
        'Check the clock-in section for your current daily reward availability. The app shows whether you can claim and records successful claims on your account.',
      ], tip: 'Read the discussion and its instructions before submitting.', target: 'moneytree',
    },
    {
      id: 'social', category: 'Community', title: 'FakeBook: connect with citizens',
      summary: 'Publish posts, join conversations, and discover public citizen profiles.',
      paragraphs: [
        'FakeBook is the game’s social app. Share posts, read the available feeds, and interact through likes, comments, replies, and reposts.',
        'Tap a citizen’s name or avatar to open their public profile. From there you can follow them, manage your association, or start a private message.',
        'Public chat offers another place to talk with citizens. Use reporting tools when content needs moderator attention.',
      ], tip: 'Your handle identifies you in social conversations and mentions.', target: 'social',
    },
    {
      id: 'associates', category: 'Community', title: 'Contacts: manage your associations',
      summary: 'Keep track of citizens you have marked as friends or enemies.',
      paragraphs: [
        'Contacts organizes your saved associations into friends and enemies. Tap a listed citizen to open the same public profile used in FakeBook.',
        'To change an association, open that citizen’s public profile and use the association menu. You can mark them as a friend or enemy, or remove the relationship.',
        'Associations and social follows are separate features. Adding an associate does not send that citizen a notification.',
      ], tip: 'Use profiles to review a citizen before changing an association.', target: 'associates',
    },
    {
      id: 'messages', category: 'Community', title: 'Messages: talk privately',
      summary: 'Read your inbox and hold direct conversations with other citizens.',
      paragraphs: [
        'Messages contains your private conversations. Open an inbox entry to read the thread and send a reply.',
        'You can start a conversation from another citizen’s public profile using Message. Your inbox shows recent activity and unread messages.',
        'New private messages generate an in-game notification. Open it to return to the conversation.',
      ], tip: 'Public posts and chat are separate from your private message threads.', target: 'messages',
    },
    {
      id: 'store', category: 'Earn & progress', title: 'Store: build your inventory',
      summary: 'Browse products, check eligibility, and buy available assets.',
      paragraphs: [
        'The Store lists products with their current availability, prices, and details. Open a product to review it before confirming a purchase.',
        'The High School Diploma is the first prerequisite under the current game rules. After that, purchases depend on each product’s availability, your balance, and the existing eligibility rules.',
        'Basic Home and Basic Vehicle currently have prices to be determined and cannot be purchased. Other unavailable listings also remain disabled until configured. Successful purchases update your citizen’s ownership records.',
      ], tip: 'Price TBD means a purchase is unavailable; it does not mean free.', target: 'store',
    },
    {
      id: 'lucky7', category: 'Earn & progress', title: 'LUCKY 7: visit the casino',
      summary: 'Play the available casino games using your citizen’s game balance.',
      paragraphs: [
        'LUCKY 7 contains slots, roulette, and baccarat. Choose a game and review its betting controls before starting a round.',
        'Bets and results affect your in-game balance. A round can result in a loss as well as a win; rewards are not guaranteed.',
        'Use the app’s results and transaction history to review completed play. Account notifications also report round results.',
      ], tip: 'Check your wager before starting each round.', target: 'lucky7',
    },
    {
      id: 'localnews', category: 'World', title: 'Local News: follow the world',
      summary: 'Read published stories and stay informed about the game world.',
      paragraphs: [
        'Local News is the game’s news reader. Browse the available stories and open an article to read it in full.',
        'Stories are prepared through the newsroom tools. Draft articles are not public; published stories become available to citizens.',
        'Newly published stories also create world notifications, so you can open the news directly from your inbox.',
      ], tip: 'Check Local News regularly for published world updates.', target: 'localnews',
    },
    {
      id: 'voting', category: 'World', title: 'Voting booth: have your say',
      summary: 'Review civic polls, choose an option, and see available results.',
      paragraphs: [
        'The Voting booth displays civic polls. Open a poll and read its question and choices before voting.',
        'Whether you can vote depends on the poll’s status and the game’s eligibility checks. Follow the status shown in the app; closed polls no longer accept votes.',
        'World notifications announce newly opened polls and poll closures. Results are available according to the poll’s settings.',
      ], tip: 'Review your choice carefully before submitting your vote.', target: 'voting',
    },
    {
      id: 'history', category: 'World', title: 'History book: a record to come',
      summary: 'The future home for the world’s recorded history.',
      paragraphs: [
        'The History book currently displays “History is yet to be made.” A browsable historical archive is not available in this version.',
        'For current published stories, use Local News. For your own current status and assets, open MyLife.',
      ], tip: 'This app is a placeholder while the history feature is developed.', target: 'history',
    },
    {
      id: 'darkweb', category: 'World', title: 'Dark Web: understand access',
      summary: 'A restricted app that currently shows an access-key requirement.',
      paragraphs: [
        'The Dark Web currently opens a locked access screen explaining that an access key is required.',
        'The current app does not provide an active Dark Web marketplace. Check actual Store availability before expecting any access-related purchase to be possible.',
      ], tip: 'A locked screen describes the current access restriction, not an available purchase.', target: 'darkweb',
    },
    {
      id: 'tutorial', category: 'Your citizen', title: 'Tutorial: find your way around',
      summary: 'Browse short guides to the apps and features inside Tyranny.',
      paragraphs: [
        'This library contains a short article for each game app. Search by an app name or a topic, then choose an article to read more.',
        'Use Open app at the end of a guide to try the feature. All articles returns you to the library, and the floating home button returns you to the homescreen.',
      ], tip: 'More articles can be added as the game grows.',
    },
    {
      id: 'asset-map', category: 'Earn & progress', title: 'Asset Map: see what you own',
      summary: 'Find your diploma, laptop, handbook, home, and vehicle in MyLife.',
      paragraphs: [
        'Open MyLife and choose Assets to see the Asset Map. It displays the High School Diploma, Laptop, Criminal Handbook, Basic Home, and Basic Vehicle.',
        'Owned assets appear in color; unowned assets are dimmed. Tap an asset to open its matching Store listing and check its details and availability.',
        'The map is not a purchase timeline. The diploma comes first under the existing rules, and later purchases depend on the Store’s eligibility and availability.',
      ], tip: 'Your map uses your actual ownership records.', target: 'mylife',
    },
    {
      id: 'notifications', category: 'Your citizen', title: 'Notifications: keep up with activity',
      summary: 'Find account updates and world announcements from the homescreen.',
      paragraphs: [
        'Tap the notification bell on the homescreen to open your inbox. It includes account activity, MoneyTree review updates, social interactions, messages, and world announcements.',
        'Use All or Unread to browse, open an activity to visit its destination, or mark notifications as read. Announcements can be read directly in the inbox.',
        'New polls and published news stories generate world updates. Adding someone as an associate stays silent.',
      ], tip: 'The bell lives on the homescreen.',
    },
  ];

  let selectedId = null;
  let query = '';
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function render(root, context) {
    const tourButton = '<button type="button" class="tutorial-restart-tour">↻ Restart interactive tutorial</button>';
    const bindTour = () => root.querySelector('.tutorial-restart-tour')?.addEventListener('click', () => context.restartTour?.());
    const article = articles.find((item) => item.id === selectedId);
    const icon = (item) => {
      const app = context.catalog[item.target || item.id];
      return app?.icon.startsWith('.')
        ? `<img src="${escape(app.icon)}" alt="" loading="lazy">`
        : `<span aria-hidden="true">${escape(app?.icon || '✦')}</span>`;
    };
    const focusTitle = () => root.querySelector('h1')?.focus({ preventScroll: true });
    if (article) {
      const allowedTarget = article.target && context.catalog[article.target]
        && (article.target !== 'moderator' || context.canModerate);
      root.innerHTML = `
        <div class="tutorial-shell">
          ${tourButton}
          <button type="button" class="tutorial-back">‹ All articles</button>
          <article class="tutorial-article">
            <div class="tutorial-icon">${icon(article)}</div>
            <p class="tutorial-kicker">${escape(article.category)} · Quick guide</p>
            <h1 tabindex="-1">${escape(article.title)}</h1>
            <p class="tutorial-lead">${escape(article.summary)}</p>
            <div class="tutorial-prose">${article.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('')}</div>
            <aside class="tutorial-tip"><strong>Good to know</strong><p>${escape(article.tip)}</p></aside>
            ${allowedTarget ? `<button type="button" class="tutorial-open">Open ${escape(context.catalog[article.target].name)} <span aria-hidden="true">↗</span></button>` : ''}
          </article>
        </div>`;
      root.querySelector('.tutorial-back').onclick = () => {
        selectedId = null;
        render(root, context);
        root.querySelector(`[data-guide="${article.id}"]`)?.focus();
      };
      root.querySelector('.tutorial-open')?.addEventListener('click', () => context.openApp(article.target));
      bindTour();
      return;
    }

    root.innerHTML = `
      <div class="tutorial-shell">
        ${tourButton}
        <header class="tutorial-header">
          <p class="tutorial-kicker">Tyranny · Beta citizen handbook</p>
          <h1 tabindex="-1">Your rise starts here.</h1>
          <p>Real people. Competing ambitions. A society taking shape. Explore the beta today—with more features coming soon.</p>
        </header>
        <label class="tutorial-search"><span>Search articles</span><input type="search" placeholder="Try MoneyTree, polls, or assets" value="${escape(query)}" maxlength="100"></label>
        <p class="tutorial-count" role="status" aria-live="polite"></p>
        <div class="tutorial-list"></div>
      </div>`;
    const updateList = () => {
      const term = query.trim().toLowerCase();
      const matches = articles.filter((item) => [item.title, item.summary, item.category, ...item.paragraphs].join(' ').toLowerCase().includes(term));
      root.querySelector('.tutorial-count').textContent = `${matches.length} ${matches.length === 1 ? 'article' : 'articles'}`;
      root.querySelector('.tutorial-list').innerHTML = matches.length
        ? matches.map((item) => `
          <button type="button" class="tutorial-card" data-guide="${item.id}">
            <span class="tutorial-icon">${icon(item)}</span>
            <span class="tutorial-card-copy"><small>${escape(item.category)}</small><strong>${escape(item.title)}</strong><span>${escape(item.summary)}</span></span>
            <span class="tutorial-chevron" aria-hidden="true">›</span>
          </button>`).join('')
        : '<div class="tutorial-empty"><strong>No articles found</strong><p>Try another app name or a shorter search.</p><button type="button" class="tutorial-clear">Clear search</button></div>';
      root.querySelectorAll('[data-guide]').forEach((button) => {
        button.onclick = () => {
          selectedId = button.dataset.guide;
          render(root, context);
          root.scrollTop = 0;
          focusTitle();
        };
      });
      root.querySelector('.tutorial-clear')?.addEventListener('click', () => {
        query = '';
        const input = root.querySelector('input');
        input.value = '';
        updateList();
        input.focus();
      });
    };
    root.querySelector('input').addEventListener('input', (event) => {
      query = event.target.value;
      updateList();
    });
    updateList();
    bindTour();
  }

  window.TyrannyTutorial = Object.freeze({ render });
})();
