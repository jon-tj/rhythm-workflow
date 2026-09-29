// Hash router, 1-second tick loop and live clocks.

let cleanups = [];
const onCleanup = fn => { if (fn) cleanups.push(fn); };

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return { name: name || 'today', arg };
}

function go(name) {
  if (route().name === name) rerender();
  else location.hash = '#/' + name;
}

const VIEWS = {
  today: viewToday,
  projects: viewProjects,
  project: viewProject,
  focus: viewFocus,
  break: viewBreak,
  review: viewReview,
  cards: viewCards,
  stats: viewStats,
  settings: viewSettings,
  done: viewDone,
};

let rendering = false;
function rerender() {
  if (rendering) return;
  rendering = true;
  cleanups.forEach(fn => fn());
  cleanups = [];
  const r = route();
  const view = VIEWS[r.name] || viewToday;
  const root = document.getElementById('view');
  const node = view(r.arg);
  root.replaceChildren(node);
  root.classList.toggle('is-full', node.classList.contains('full'));
  document.querySelectorAll('#nav a[data-route]').forEach(a => a.classList.toggle('active',
    a.dataset.route === r.name || (a.dataset.route === 'projects' && r.name === 'project') || (a.dataset.route === 'cards' && r.name === 'review')));
  drawPill();
  updateClocks();
  rendering = false;
}

// Small status pill in the nav so the running session is reachable from any page.
function drawPill() {
  const s = Session.cur();
  const pill = document.getElementById('session-pill');
  if (!s) { pill.replaceChildren(); return; }
  const focus = s.phase !== 'break';
  pill.replaceChildren(h('a', { class: 'pill' + (focus ? '' : ' break'), href: focus ? '#/focus' : '#/break' },
    icon(focus ? 'timer' : 'directions_walk'), h('span', { 'data-clock': focus ? 'focus' : 'break' })));
}

function updateClocks() {
  const s = Session.cur();
  let title = 'Rhythm';
  if (s && s.phase !== 'break') {
    const rem = Session.remainingMs();
    const txt = s.phase === 'timeup' ? "Time's up" : fmtClock(rem);
    document.querySelectorAll('[data-clock="focus"]').forEach(el => { el.textContent = txt; });
    const pct = Math.min(100, (Session.elapsedMins() / s.plannedMins) * 100);
    document.querySelectorAll('[data-progress="focus"]').forEach(el => { el.style.width = pct + '%'; });
    title = `${txt} · Rhythm`;
  } else if (s && s.phase === 'break') {
    const rem = s.breakStartedAt + s.breakMins * 60000 - Date.now();
    const txt = rem >= 0 ? fmtClock(rem) : `Break over ${fmtClock(rem)}`;
    document.querySelectorAll('[data-clock="break"]').forEach(el => {
      el.textContent = txt;
      el.classList.toggle('over', rem < 0);
    });
    title = `${rem >= 0 ? fmtClock(rem) : 'Break over'} · Rhythm`;
  }
  document.title = title;
}

window.addEventListener('hashchange', rerender);
window.addEventListener('pagehide', () => { if (S.session && S.session.phase !== 'break') { S.session.lastSeen = Date.now(); save(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.session) save(); });

// Keep tabs in sync if the app is open twice.
window.addEventListener('storage', e => { if (e.key === STORE_KEY) { S = loadState(); rerender(); } });

Session.recover();
rerender();
if (S.session && S.session.phase === 'timeup') showTimeUp();

setInterval(() => {
  const before = S.session && S.session.phase;
  Session.tick();
  const after = S.session && S.session.phase;
  if (before !== after) drawPill();
  // A new calendar day while idle: re-render to ask for the new check-in.
  if (route().name === 'today' && !S.days[todayKey()]) rerender();
  updateClocks();
}, 1000);
