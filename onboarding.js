/* A read-only guided tour: actions navigate; they never purchase, claim, post or vote. */
window.TyrannyOnboarding = (() => {
  const steps = [
    {id:'welcome', title:'Welcome to Tyranny', text:'Enter a society of real people, real ambitions, and competing agendas. Tyranny: Rise to Power is a multiplayer, text-based political and social simulation RPG. Start with nothing, build your reputation, and discover how far ambition can take you.', note:'This is the Tyranny beta: an early taste of a much bigger world. More features are coming soon. Expect unfinished areas and changes as the experience grows.'},
    {id:'loop', title:'Start at the bottom. Find your way up.', text:'Join discussions and earn → check your balance and notifications → work toward your diploma and available assets → review your progress → build relationships and take part in the world.', note:'This is the core loop you can explore in the beta today. Rewards require eligibility and, where applicable, review. Your first move is yours to choose.'},
    {id:'home', title:'Your phone is your command center', text:'Open apps from the homescreen. The floating home button brings you back. The notification bell holds your account activity and world updates.', highlight:'#appGrid'},
    {id:'mylife', app:'mylife', title:'This is your starting line', text:'A new citizen begins with no money, no diploma, and no assets. MyLife is where you watch that story change: check your balance, education, employment, and account status, then customize your profile.', note:'Build from what you have. Your profile shows your actual citizen records, including any progress you have already made.', highlight:'#app-mylife .profile-hero-panel'},
    {id:'moneytree', app:'moneytree', title:'Put your ideas to work', text:'Step into MoneyTree, join a discussion, and make your voice count. Offer a thoughtful response or challenge another contribution. Check the clock-in section for your current daily reward availability.', note:'Earn through the beta’s available reward systems. Contributions may require review; posting alone does not guarantee approval or payment.'},
    {id:'notifications', title:'Follow your results', text:'The homescreen bell shows review decisions, rewards, replies, and world announcements. You can also opt in to phone alerts here.', note:'On iPhone, phone alerts require the installed Home Screen web app.', highlight:'#notificationToggle'},
    {id:'store', app:'store', title:'Build something you can call yours', text:'Every available purchase is a chance to move beyond your starting point. Explore the Store, read the details, and plan your next move. The High School Diploma comes first under the current game rules.', note:'The beta catalog is still growing. Price TBD and unavailable items cannot be purchased. After the diploma, buy in any order allowed by the current rules.'},
    {id:'assets', app:'mylife', section:'assets', title:'See what you own', text:'Your Asset Map shows the diploma, laptop, handbook, home, and vehicle. Owned assets regain color; unowned assets stay dim.', note:'Tap an asset to review its Store listing. This is an ownership map, not a timeline.'},
    {id:'career', app:'mylife', section:'skills', title:'Imagine how high you could climb', text:'Public service, wealth, political influence, or a darker ambition: Tyranny’s vision has more than one path to power. Use the Career Path Tree to review the progress and requirements currently shown for your citizen.', note:'This beta is the beginning. Expanded careers, political leadership, and crime systems belong to the broader vision; a visible path is not a promise that every feature is playable yet.'},
    {id:'social', app:'social', title:'Make a name for yourself', text:'Tyranny is a society shaped by its citizens. On FakeBook, debate ideas, gain a following, meet rivals, and find people who share your ambitions. Read, post, reply, repost, follow, or join public chat.', note:'Real people bring their own agendas. Your conversations and reputation are part of the experience you build together.'},
    {id:'contacts', app:'associates', title:'Know your friends. Remember your rivals.', text:'Who will stand beside you? Contacts keeps track of citizens you mark as friends or enemies. Visit a citizen’s public profile to change your association.', note:'These are personal relationship labels, not a formal alliance system. Adding an associate does not notify them.'},
    {id:'messages', app:'messages', title:'Take the conversation behind closed doors', text:'Make an introduction, debate an idea, or talk through your next move. Start a private conversation with Message on another citizen’s public profile, then return to it from your inbox.', note:'Friendships and rivalries start with real conversations. New messages appear in your notifications.'},
    {id:'news', app:'localnews', title:'Keep your finger on the pulse', text:'A society never stands still. Read published stories in Local News to follow the world around you and discover what other citizens are talking about.', note:'Watch for beta updates and new features as Tyranny grows. Published stories also appear in world notifications.'},
    {id:'voting', app:'voting', title:'Let your voice be heard', text:'Public opinion starts with citizens. Read the civic polls in the Voting booth and make your choice when a poll is open and you are eligible.', note:'Today’s beta offers civic polls. Campaigning for office, the presidency, taxation, and wider political powers are part of the future vision, not features unlocked by voting here.'},
    {id:'casino', app:'lucky7', title:'Explore LUCKY 7', text:'Slots, roulette, and baccarat use your in-game balance. Review a wager and the rules before starting a round.', note:'Casino play is optional and can lose money. It is not a guaranteed way to progress.'},
    {id:'history', app:'history', title:'The next chapter is still unwritten', text:'Every new citizen brings another personality, another ambition, and another unpredictable element into Tyranny. The History book is reserved for a world whose story is still taking shape.', note:'Coming in a future update: a fuller history experience. This beta screen is currently a placeholder; use Local News for published stories.'},
    {id:'darkweb', app:'darkweb', title:'A glimpse of the darker path', text:'Wealth and influence may one day lead you into crime, deception, and corruption. The locked Dark Web hints at that side of Tyranny’s broader vision.', note:'Still in development: this beta has no active Dark Web marketplace. The access screen does not mean a working key or criminal career is available to buy.'},
    {id:'tutorial', app:'tutorial', title:'Help is always here', text:'The Tutorial app contains short guides to every app. Search for a topic or restart this interactive tour using the button at the top.', note:'You can return here any time.'},
    {id:'finish', title:'How far will your ambition take you?', text:'Start a conversation. Earn your first money. Work toward your diploma. Build relationships and a reputation. In Tyranny, power is earned, negotiated, taken, and sometimes lost. Your story starts with your next move.', note:'You are here at the beginning. This is a beta experience, with more features coming soon and a bigger world still taking shape. Welcome to Tyranny: Rise to Power.'},
  ];
  let context=null, index=0, active=false, compact=false, lastFocus=null;
  const memory=new Map();
  const key=id=>'tyranny-tour-v1:'+id;
  const read=k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return memory.get(k);}};
  const write=(k,v)=>{memory.set(k,v);try{localStorage.setItem(k,JSON.stringify(v));}catch{/* Tour remains usable without browser storage. */}};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function clearHighlight(){document.querySelectorAll('.tour-highlight').forEach(el=>el.classList.remove('tour-highlight'));}
  function save(status='active'){if(context)write(key(context.citizenId),{step:steps[index].id,status});}
  function stop(){
    active=false; clearHighlight(); document.getElementById('citizenTour')?.remove();
    document.body.classList.remove('citizen-tour-active');
    document.querySelector('.page-shell')?.removeAttribute('inert');
  }
  function end(status){
    save(status); stop(); context.home();
    if(lastFocus?.isConnected && lastFocus.getClientRects().length) lastFocus.focus();
  }
  function navigate(){
    clearHighlight();
    const step=steps[index];
    context.home();
    if(step.app) context.open(step.app,step.section);
    if(step.highlight) document.querySelector(step.highlight)?.classList.add('tour-highlight');
  }
  function render(){
    let root=document.getElementById('citizenTour');
    if(!root){root=document.createElement('section');root.id='citizenTour';document.body.append(root);}
    const welcome=index===0;
    document.querySelector('.page-shell')?.toggleAttribute('inert',welcome);
    root.className=welcome?'citizen-tour welcome-tour':'citizen-tour';
    root.setAttribute('role',welcome?'dialog':'region');
    if(welcome)root.setAttribute('aria-modal','true');else root.removeAttribute('aria-modal');
    root.setAttribute('aria-labelledby','tourTitle');
    const step=steps[index];
    root.innerHTML=`<div class="tour-card ${compact?'tour-compact':''}">
      <div class="tour-top"><span>TYRANNY <b>BETA</b> · ${index+1} / ${steps.length}</span>
      <button type="button" data-tour="skip" aria-label="Skip interactive tutorial">Skip tour</button></div>
      <progress value="${index+1}" max="${steps.length}" aria-label="Tutorial progress"></progress>
      <h2 id="tourTitle" tabindex="-1">${escape(step.title)}</h2>
      ${compact?'':`<p>${escape(step.text)}</p><p class="tour-note">${escape(step.note||'Use Next when you are ready to continue.')}</p>`}
      <div class="tour-controls">
        ${index>0?'<button type="button" data-tour="back">Back</button>':''}
        ${!welcome && index<steps.length-1?`<button type="button" data-tour="compact">${compact?'Show guide':'Explore screen'}</button>`:''}
        <button type="button" class="tour-next" data-tour="next">${welcome?'Start tour':index===steps.length-1?'Start playing':'Next'} <span aria-hidden="true">→</span></button>
      </div></div>`;
    root.querySelectorAll('[data-tour]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.tour;
      if(action==='skip'){end('skipped');return;}
      if(action==='compact'){compact=!compact;render();root.querySelector('[data-tour="compact"]')?.focus();return;}
      if(action==='next' && index===steps.length-1){end('completed');return;}
      index+=action==='back'?-1:1;compact=false;save();navigate();render();
      root.querySelector('h2').focus({preventScroll:true});
    });
  }
  function begin(ctx,restart=false){
    if(!ctx?.citizenId)return;
    if(active && context?.citizenId===ctx.citizenId && !restart)return;
    stop();context=ctx;lastFocus=document.activeElement;
    const stored=read(key(ctx.citizenId));
    const savedStep=stored?.step==='moderator'?'tutorial':stored?.step;
    index=restart?0:Math.max(0,steps.findIndex(step=>step.id===savedStep));
    compact=false;active=true;save();document.body.classList.add('citizen-tour-active');
    navigate();render();document.getElementById('tourTitle').focus({preventScroll:true});
  }
  function created(userId){write('tyranny-tour-new:'+userId,true);}
  function ready(ctx){
    if(!ctx?.citizenId)return;
    const pending=read('tyranny-tour-new:'+ctx.userId);
    if(pending){write('tyranny-tour-new:'+ctx.userId,false);begin(ctx,true);return;}
    if(read(key(ctx.citizenId))?.status==='active')begin(ctx);
  }
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();end('skipped');return;}
    if(index===0 && event.key==='Tab'){
      const buttons=[...document.querySelectorAll('#citizenTour button')];
      if(event.shiftKey && (document.activeElement===buttons[0] || document.activeElement.id==='tourTitle')){
        event.preventDefault();buttons.at(-1).focus();
      }else if(!event.shiftKey && document.activeElement===buttons.at(-1)){
        event.preventDefault();buttons[0].focus();
      }
    }
  });
  return {created,ready,restart:ctx=>begin(ctx,true),stop};
})();
