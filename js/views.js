// Every screen is a function returning a DOM node. app.js mounts the one matching the hash route.

const projectDot = p => h('span', { class: 'dot', style: { background: p ? p.color : '#999' } });

function blockLabel(b) {
  const a = getActivity(b.activityId), p = getProject(b.projectId);
  return { a, p, name: a ? a.activityName : '(deleted activity)', project: p ? p.name : '(deleted project)' };
}

function pageHeader(title, sub, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null),
    h('div', { class: 'row' }, actions));
}

// ------------------------------------------------------------------ check-in
function checkinForm(initial, onDone, submitLabel = 'Continue') {
  const val = { happiness: initial && initial.happiness, energy: initial && initial.energy };
  const wrap = h('div', { class: 'checkin' });
  const draw = () => {
    wrap.replaceChildren(
      h('h3', {}, 'How happy are you right now?'),
      scalePicker(MOODS, val.happiness, v => { val.happiness = v; draw(); }),
      h('h3', {}, 'How is your energy?'),
      scalePicker(ENERGY, val.energy, v => { val.energy = v; draw(); }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn filled', disabled: !(val.happiness && val.energy),
          onclick: () => onDone({ ...val, at: Date.now() }) }, submitLabel, icon('arrow_forward'))));
  };
  draw();
  return wrap;
}

function viewCheckin() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return h('section', { class: 'center-page' },
    h('div', { class: 'card pad-lg narrow' },
      h('h1', {}, greet),
      h('p', { class: 'muted' }, 'A quick check-in before you plan the day. It helps find what predicts losing focus.'),
      checkinForm(null, v => { getDay().checkin = v; save(); rerender(); })));
}

// ------------------------------------------------------------------ today
function viewToday() {
  const day = getDay();
  if (!day.checkin) return viewCheckin();

  const s = Session.cur();
  const pending = pendingBlocks();
  const planned = plannedMins();
  const workday = S.settings.workdayMins;
  const counts = SRS.counts();
  const hasActivities = S.activities.length > 0;

  const mood = MOODS.find(m => m.v === day.checkin.happiness), en = ENERGY.find(m => m.v === day.checkin.energy);
  const checkinChip = h('button', { class: 'chip', title: 'Edit check-in', onclick: () => openModal(close =>
    h('div', {}, h('h2', {}, 'Update check-in'), checkinForm(day.checkin, v => { day.checkin = v; save(); close(); rerender(); }, 'Save'))) },
  icon(mood.icon), mood.label, h('span', { class: 'sep' }), icon(en.icon), en.label);

  // Hero action
  let hero = null;
  if (s && (s.phase === 'focus' || s.phase === 'timeup')) {
    const { name } = blockLabel(Session.block() || {});
    hero = h('a', { class: 'hero', href: '#/focus' }, h('span', { class: 'hero-play' }, icon('center_focus_strong')),
      h('div', {}, h('strong', {}, 'Back to focus'), h('div', { class: 'muted' }, name)), h('span', { class: 'hero-clock', 'data-clock': 'focus' }));
  } else if (s && s.phase === 'break') {
    hero = h('a', { class: 'hero', href: '#/break' }, h('span', { class: 'hero-play' }, icon('directions_walk')),
      h('div', {}, h('strong', {}, 'On a break'), h('div', { class: 'muted' }, 'Back to the break screen')), h('span', { class: 'hero-clock', 'data-clock': 'break' }));
  } else if (pending.length) {
    const { name, project } = blockLabel(pending[0]);
    hero = h('button', { class: 'hero', onclick: () => Session.startNext() },
      h('span', { class: 'hero-play' }, icon('play_arrow')),
      h('div', {}, h('strong', {}, `Start ${name}`), h('div', { class: 'muted' }, `${project} · ${fmtMins(pending[0].mins)}`)));
  } else if (day.completedAt) {
    hero = h('div', { class: 'hero done' }, h('span', { class: 'hero-play' }, icon('celebration')),
      h('div', {}, h('strong', {}, 'Day complete'), h('div', { class: 'muted' }, 'Add more blocks below if you want to keep going.')));
  }

  const list = h('div', { class: 'blocks' });
  let dragId = null;
  day.blocks.forEach((b, i) => {
    const { p, name, project } = blockLabel(b);
    const active = s && s.blockId === b.id && s.phase !== 'break';
    if (b.status === 'done') {
      const r = b.result || {};
      const reasonIcon = { timeout: 'task_alt', early: 'skip_next', left: 'logout' }[r.reason] || 'check';
      const reasonText = { timeout: 'Completed', early: 'Ended early', left: 'Left site' }[r.reason] || 'Done';
      list.append(h('div', { class: 'block done' },
        icon(reasonIcon, 'muted'), projectDot(p),
        h('div', { class: 'grow' }, h('div', { class: 'b-name' }, name), h('div', { class: 'muted small' }, `${project} · ${reasonText} · ${fmtMins(r.workedMins || 0)} of ${fmtMins(b.mins)}`)),
        r.rating ? icon(MOODS[r.rating - 1].icon, 'muted') : null));
      return;
    }
    const prevPending = i > 0 && day.blocks[i - 1].status === 'pending';
    if (prevPending || (i > 0 && day.blocks[i - 1].status === 'done')) {
      list.append(h('div', { class: 'break-sep' }, icon('directions_walk'), `${S.settings.breakMins} min break`));
    }
    const row = h('div', { class: 'block' + (active ? ' active' : ''), draggable: active ? null : 'true', 'data-id': b.id },
      h('span', { class: 'handle', title: 'Drag to reorder' }, icon('drag_indicator')),
      projectDot(p),
      h('div', { class: 'grow' }, h('div', { class: 'b-name' }, name), h('div', { class: 'muted small' }, project)),
      active ? h('span', { class: 'badge' }, 'In progress') :
        h('label', { class: 'mins' }, h('input', { type: 'number', min: 5, step: 5, value: b.mins,
          onchange: e => { b.mins = Math.max(1, +e.target.value || b.mins); save(); rerender(); } }), 'min'),
      active ? null : h('button', { class: 'icon-btn', title: 'Start this block', disabled: !!(s && s.phase !== 'break'), onclick: () => Session.start(b.id) }, icon('play_arrow')),
      active ? null : h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { day.blocks = day.blocks.filter(x => x !== b); save(); rerender(); } }, icon('delete')));
    if (!active) {
      row.addEventListener('dragstart', e => { dragId = b.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', e => {
        e.preventDefault();
        const r = row.getBoundingClientRect();
        row.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
        row.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        const after = row.classList.contains('drop-after');
        row.classList.remove('drop-before', 'drop-after');
        if (!dragId || dragId === b.id) return;
        const moving = day.blocks.find(x => x.id === dragId);
        day.blocks = day.blocks.filter(x => x !== moving);
        const idx = day.blocks.indexOf(b) + (after ? 1 : 0);
        day.blocks.splice(idx, 0, moving);
        // Never let a pending block sit above the one in progress.
        const activeIdx = s ? day.blocks.findIndex(x => x.id === s.blockId && s.phase !== 'break') : -1;
        if (activeIdx > -1 && day.blocks.indexOf(moving) < activeIdx) {
          day.blocks = day.blocks.filter(x => x !== moving);
          day.blocks.splice(activeIdx, 0, moving);
        }
        save(); rerender();
      });
    }
    list.append(row);
  });
  if (!day.blocks.length) list.append(h('div', { class: 'empty' }, icon('event_note'), hasActivities ? 'No blocks planned yet. Add some below or auto-fill your day.' : 'Create a project with activities to start planning.'));

  const select = h('select', {},
    S.projects.map(p => h('optgroup', { label: p.name },
      activitiesOf(p.id).map(a => h('option', { value: a.activityId }, `${a.activityName} (${a.userSuggestedDurationMins}m)`)))));

  const addRow = hasActivities
    ? h('div', { class: 'add-row' }, select,
      h('button', { class: 'btn tonal', onclick: () => { addBlock(select.value); rerender(); } }, icon('add'), 'Add block'),
      h('button', { class: 'btn text', title: 'Fill the rest of the work day by cycling through activities', onclick: () => { const n = autoFillDay(); toast(n ? `Added ${n} blocks.` : 'Your day is already full.'); rerender(); } }, icon('auto_awesome'), 'Auto-fill day'))
    : h('div', { class: 'add-row' }, h('a', { class: 'btn filled', href: '#/projects' }, icon('create_new_folder'), 'Create a project'));

  const pct = Math.min(100, (planned / workday) * 100);
  return h('section', {},
    pageHeader('Today', new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), checkinChip),
    hero,
    h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', {}, h('strong', {}, `${fmtMins(planned)} planned`), h('span', { class: 'muted' }, ` of a ${fmtMins(workday)} work day`)),
        counts.due + counts.fresh > 0
          ? h('a', { class: 'chip', href: '#/review' }, icon('style'), `${counts.due} due · ${counts.fresh} new`)
          : h('span', { class: 'muted small' }, 'No cards due')),
      h('div', { class: 'progress' + (planned > workday ? ' over' : '') }, h('div', { style: { width: pct + '%' } })),
      list, addRow));
}

// ------------------------------------------------------------------ projects
function viewProjects() {
  const nameInput = h('input', { placeholder: 'New project name', onkeydown: e => { if (e.key === 'Enter') create(); } });
  const create = () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const p = addProject(name);
    ['Develop', 'Test', 'Review'].forEach(n => addActivity(p.id, n));
    rerender();
  };

  const cards = S.projects.map(p => {
    const actName = h('input', { placeholder: 'Activity name' });
    const actMins = h('input', { type: 'number', min: 5, step: 5, value: S.settings.defaultActivityMins, class: 'num' });
    const addAct = () => { if (!actName.value.trim()) return; addActivity(p.id, actName.value.trim(), +actMins.value); rerender(); };
    actName.addEventListener('keydown', e => { if (e.key === 'Enter') addAct(); });
    return h('div', { class: 'card project' },
      h('div', { class: 'row between' },
        h('div', { class: 'row' },
          h('input', { type: 'color', class: 'swatch', value: p.color, title: 'Project color', onchange: e => { p.color = e.target.value; save(); rerender(); } }),
          h('input', { class: 'title-input', value: p.name, onchange: e => { p.name = e.target.value.trim() || p.name; save(); } })),
        h('div', { class: 'row' },
          h('a', { class: 'btn tonal', href: `#/project/${p.id}` }, icon('dashboard'), 'Canvas'),
          h('button', { class: 'icon-btn', title: 'Delete project', onclick: () => confirmModal(`Delete "${p.name}", its activities and canvas? Logged history is kept.`, () => { deleteProject(p.id); rerender(); }) }, icon('delete')))),
      h('div', { class: 'acts' },
        activitiesOf(p.id).map(a => h('div', { class: 'act' },
          h('input', { value: a.activityName, onchange: e => { a.activityName = e.target.value.trim() || a.activityName; save(); } }),
          h('label', { class: 'mins' }, h('input', { type: 'number', min: 5, step: 5, value: a.userSuggestedDurationMins,
            onchange: e => { a.userSuggestedDurationMins = Math.max(1, +e.target.value || 30); save(); } }), 'min'),
          h('button', { class: 'icon-btn', title: 'Add to today', onclick: () => { addBlock(a.activityId); toast(`Added ${a.activityName} to today.`); } }, icon('playlist_add')),
          h('button', { class: 'icon-btn', title: 'Delete activity', onclick: () => { deleteActivity(a.activityId); rerender(); } }, icon('close')))),
        h('div', { class: 'act new' }, actName, h('label', { class: 'mins' }, actMins, 'min'),
          h('button', { class: 'icon-btn', title: 'Add activity', onclick: addAct }, icon('add')))));
  });

  return h('section', {},
    pageHeader('Projects', 'Each project has activities (like develop, test, review) and its own canvas.'),
    h('div', { class: 'card add-row' }, nameInput, h('button', { class: 'btn filled', onclick: create }, icon('add'), 'Create project')),
    cards.length ? cards : h('div', { class: 'empty' }, icon('folder_open'), 'No projects yet. New projects start with Develop, Test and Review activities.'));
}

function viewProject(id) {
  const p = getProject(id);
  if (!p) { go('projects'); return h('div'); }
  const stage = h('div', { class: 'stage' });
  onCleanup(mountCanvas(stage, p.id));
  return h('section', { class: 'full' },
    h('div', { class: 'focus-bar' },
      h('a', { class: 'icon-btn', href: '#/projects', title: 'Back' }, icon('arrow_back')),
      projectDot(p), h('strong', { class: 'grow' }, p.name),
      activitiesOf(p.id).map(a => h('button', { class: 'chip', title: 'Add to today', onclick: () => { addBlock(a.activityId); toast(`Added ${a.activityName} to today.`); } }, icon('playlist_add'), a.activityName))),
    stage);
}

// ------------------------------------------------------------------ focus
function viewFocus() {
  const s = Session.cur();
  if (!s || (s.phase !== 'focus' && s.phase !== 'timeup')) { go('today'); return h('div'); }
  const b = Session.block();
  const { p, name, project } = blockLabel(b || {});
  const stage = h('div', { class: 'stage' });
  if (p) onCleanup(mountCanvas(stage, p.id));
  if (s.phase === 'timeup') setTimeout(showTimeUp, 0);

  return h('section', { class: 'full' },
    h('div', { class: 'focus-bar' },
      projectDot(p),
      h('div', { class: 'grow' }, h('strong', {}, name), h('div', { class: 'muted small' }, project)),
      h('div', { class: 'focus-clock' }, h('span', { 'data-clock': 'focus' }), h('div', { class: 'progress thin' }, h('div', { 'data-progress': 'focus' }))),
      h('button', { class: 'btn tonal warn', onclick: openLostFocus }, icon('psychology_alt'), 'Lost focus',
        s.losses.length ? h('span', { class: 'count' }, s.losses.length) : null),
      h('button', { class: 'btn text', onclick: openEndEarly }, icon('stop_circle'), 'End early')),
    stage);
}

function openLostFocus() {
  const row = Session.lostFocus(''); // timestamp the moment of the click
  const chips = ['Phone', 'Tired', 'Stuck', 'Bored', 'Interrupted', 'Hungry', 'Anxious', 'Noise'];
  const picked = new Set();
  const ta = h('textarea', { rows: 2, placeholder: 'What pulled you away? (optional)' });
  openModal(close => {
    const finish = () => {
      row.context = [...picked, ta.value.trim()].filter(Boolean).join(' · ');
      row.tags = [...picked];
      save(); close(); rerender();
    };
    return h('div', {},
      h('h2', {}, icon('psychology_alt'), ' Lost focus'),
      h('p', { class: 'muted' }, `Logged at ${round1(row.minutesIntoBlock)} min into the block. The timer keeps running. Take a breath and come back.`),
      h('div', { class: 'chips' }, chips.map(c => h('button', { class: 'chip', type: 'button',
        onclick: e => { picked.has(c) ? picked.delete(c) : picked.add(c); e.currentTarget.classList.toggle('selected'); } }, c))),
      ta,
      h('div', { class: 'row end' }, h('button', { class: 'btn filled', onclick: finish }, 'Back to work')));
  }, { dismissable: false });
}

function ratingPrompt(title, sub, onRate, extra) {
  return h('div', { class: 'rate' },
    h('h2', {}, title),
    sub ? h('p', { class: 'muted' }, sub) : null,
    h('div', { class: 'scale big' }, MOODS.map(m => h('button', { class: 'scale-btn', title: m.label, onclick: () => onRate(m.v) }, icon(m.icon), h('small', {}, m.label)))),
    extra);
}

function openEndEarly() {
  const s = Session.cur();
  openModal(close => ratingPrompt('End this block early?',
    `You've worked ${fmtMins(Session.elapsedMins())} of ${fmtMins(s.plannedMins)}. Rate the block to end it.`,
    v => { close(); Session.endBlock('early', v); },
    h('div', { class: 'row center' }, h('button', { class: 'btn text', onclick: close }, 'Keep going'))));
}

let closeTimeUpModal = null;
function showTimeUp() {
  if (closeTimeUpModal) return;
  const b = Session.block();
  const { name } = blockLabel(b || {});
  closeTimeUpModal = openModal(close => ratingPrompt("Time's up!", `How did ${name} go? Rating starts your break.`,
    v => { closeTimeUp(); Session.endBlock('timeout', v); },
    h('div', { class: 'row center' }, h('button', { class: 'btn tonal', onclick: () => Session.extend() }, icon('more_time'), `or extend this activity +${S.settings.extendMins} min`))),
  { dismissable: false });
}
function closeTimeUp() {
  if (closeTimeUpModal) { closeTimeUpModal(); closeTimeUpModal = null; }
}

// ------------------------------------------------------------------ break
function viewBreak() {
  const s = Session.cur();
  if (!s || s.phase !== 'break') { go('today'); return h('div'); }
  const counts = SRS.counts();
  const next = pendingBlocks()[0];
  const nx = next && blockLabel(next);
  const suggestions = [
    h('div', { class: 'card suggest' }, icon('directions_walk', 'big'),
      h('div', {}, h('strong', {}, `Take a ${s.breakMins} minute walk`), h('p', { class: 'muted' }, 'Stand up, move, look at something far away. No screens.'))),
  ];
  if (counts.due + counts.fresh > 0) {
    suggestions.push(h('a', { class: 'card suggest link', href: '#/review' }, icon('style', 'big'),
      h('div', {}, h('strong', {}, 'Spaced repetition'), h('p', { class: 'muted' }, `${counts.due} cards due · ${counts.fresh} new to learn`)),
      icon('chevron_right')));
  }
  return h('section', { class: 'center-page' },
    h('div', { class: 'narrow' },
      h('p', { class: 'eyebrow' }, 'Break'),
      h('div', { class: 'break-clock', 'data-clock': 'break' }),
      h('div', { class: 'suggestions' }, suggestions),
      next ? h('button', { class: 'hero', onclick: () => Session.start(next.id) },
        h('span', { class: 'hero-play' }, icon('play_arrow')),
        h('div', {}, h('strong', {}, `Start ${nx.name}`), h('div', { class: 'muted' }, `${nx.project} · ${fmtMins(next.mins)}`))) : null,
      h('div', { class: 'row center' }, h('button', { class: 'btn text', onclick: () => { Session.skipBreak(); go('today'); } }, 'End break without starting'))));
}

// ------------------------------------------------------------------ done
function viewDone() {
  const day = getDay();
  const done = day.blocks.filter(b => b.status === 'done');
  const worked = done.reduce((t, b) => t + (b.result ? b.result.workedMins : 0), 0);
  const losses = done.reduce((t, b) => t + ((b.result && b.result.losses) || 0), 0);
  return h('section', { class: 'center-page' },
    h('div', { class: 'card pad-lg narrow center-text' },
      icon('celebration', 'huge'),
      h('h1', {}, 'Congrats on finishing your day!'),
      h('p', { class: 'muted' }, 'See you again tomorrow.'),
      h('div', { class: 'tiles' },
        tile('Blocks', done.length), tile('Focused', fmtMins(worked)), tile('Focus lost', losses)),
      h('div', { class: 'row center' },
        SRS.counts().due ? h('a', { class: 'btn tonal', href: '#/review' }, icon('style'), 'Review cards') : null,
        h('a', { class: 'btn text', href: '#/today' }, 'Back to today'))));
}

const tile = (label, value) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, value), h('div', { class: 'tile-l' }, label));

// ------------------------------------------------------------------ cards
function cardForm(card, onSave) {
  const c = card ? { ...card } : { front: '', back: '', mirrored: false, bottom: '' };
  const front = h('textarea', { rows: 2, placeholder: 'Front', value: c.front });
  const back = h('textarea', { rows: 2, placeholder: 'Back', value: c.back });
  const bottom = h('textarea', { rows: 2, placeholder: 'Bottom (shown on the flipped face of both directions)', value: c.bottom || '' });
  const bottomWrap = h('div', { class: c.mirrored ? '' : 'hidden' }, bottom);
  const mirrored = h('input', { type: 'checkbox', checked: c.mirrored, onchange: e => bottomWrap.classList.toggle('hidden', !e.target.checked) });
  const submit = () => {
    if (!front.value.trim() || !back.value.trim()) { toast('Front and back are required.'); return; }
    onSave({ front: front.value.trim(), back: back.value.trim(), mirrored: mirrored.checked, bottom: mirrored.checked ? bottom.value.trim() : undefined });
    if (!card) { front.value = back.value = bottom.value = ''; front.focus(); }
  };
  [front, back, bottom].forEach(t => t.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }));
  return h('div', { class: 'card-form' },
    h('div', { class: 'two' }, front, back),
    h('label', { class: 'check' }, mirrored, 'Mirrored (also quiz back → front)'),
    bottomWrap,
    h('div', { class: 'row end' }, h('span', { class: 'muted small' }, 'Ctrl+Enter to save'),
      h('button', { class: 'btn filled', onclick: submit }, icon(card ? 'save' : 'add'), card ? 'Save' : 'Add card')));
}

function viewCards() {
  const counts = SRS.counts();
  const search = h('input', { type: 'search', placeholder: 'Search cards' });
  const list = h('div', { class: 'card-list' });
  const drawList = () => {
    const q = search.value.toLowerCase();
    const cards = S.cards.filter(c => !q || [c.front, c.back, c.bottom].some(t => t && t.toLowerCase().includes(q)));
    list.replaceChildren(...(cards.length ? cards.slice().reverse().map(c => {
      const st = S.srs[`${c.id}:f`];
      const dueTxt = !st ? 'New' : st.due <= Date.now() ? 'Due' : `Due ${new Date(st.due).toLocaleDateString()}`;
      return h('div', { class: 'fc-row' },
        h('div', { class: 'grow' },
          h('div', {}, h('strong', {}, c.front), c.mirrored ? icon('swap_horiz', 'muted inline') : ' → ', c.mirrored ? '' : c.back),
          c.mirrored ? h('div', { class: 'muted small' }, c.back, c.bottom ? ` · ${c.bottom}` : '') : null),
        h('span', { class: 'badge' }, dueTxt),
        h('button', { class: 'icon-btn', title: 'Edit', onclick: () => openModal(close => h('div', {}, h('h2', {}, 'Edit card'),
          cardForm(c, v => { const wasMirrored = c.mirrored; Object.assign(c, v); if (!c.mirrored) delete c.bottom; if (wasMirrored && !c.mirrored) delete S.srs[`${c.id}:r`]; save(); close(); rerender(); }))) }, icon('edit')),
        h('button', { class: 'icon-btn', title: 'Delete', onclick: () => confirmModal('Delete this card?', () => { S.cards = S.cards.filter(x => x !== c); SRS.forgetCard(c.id); save(); rerender(); }) }, icon('delete')));
    }) : [h('div', { class: 'empty' }, icon('style'), S.cards.length ? 'No matches.' : 'No cards yet. Add your first one above.')]));
  };
  search.addEventListener('input', drawList);
  drawList();

  return h('section', {},
    pageHeader('Flashcards', `${S.cards.length} cards · ${counts.due} due · ${counts.fresh} new available today`,
      h('label', { class: 'mins', title: 'Maximum new cards introduced per day' }, 'New/day',
        h('input', { type: 'number', min: 0, value: S.settings.maxNewCards, onchange: e => { S.settings.maxNewCards = Math.max(0, +e.target.value || 0); save(); rerender(); } })),
      h('a', { class: 'btn filled' + (counts.due + counts.fresh ? '' : ' disabled'), href: '#/review' }, icon('school'), 'Review')),
    h('div', { class: 'card' }, h('h3', {}, 'New card'), cardForm(null, v => {
      S.cards.push({ id: uid(), ...v, createdAt: Date.now() });
      save(); toast('Card added.'); drawList();
    })),
    h('div', { class: 'card' }, search, list));
}

// ------------------------------------------------------------------ review
function viewReview() {
  const queue = SRS.queue();
  const total = queue.length;
  let done = 0, item = null, shownAt = 0, revealed = false, recallMs = 0;
  const wrap = h('div', { class: 'narrow' });
  const inBreak = Session.cur() && Session.cur().phase === 'break';
  const exitHref = inBreak ? '#/break' : '#/today';

  const draw = () => {
    if (!item) {
      wrap.replaceChildren(h('div', { class: 'card pad-lg center-text' }, icon('task_alt', 'huge'),
        h('h2', {}, total ? 'Review complete' : 'Nothing to review'),
        h('p', { class: 'muted' }, total ? `You went through ${done} reviews.` : 'No cards are due and no new cards are available today.'),
        h('a', { class: 'btn filled', href: exitHref }, inBreak ? 'Back to break' : 'Back to today')));
      return;
    }
    const f = SRS.faces(item);
    const isNew = !S.srs[item.key];
    wrap.replaceChildren(
      h('div', { class: 'row between review-head' },
        h('a', { class: 'icon-btn', href: exitHref, title: 'Stop reviewing' }, icon('close')),
        h('span', { class: 'muted' }, `${queue.length + 1} left`, isNew ? ' · new' : '', item.dir === 'r' ? ' · reversed' : ''),
        inBreak ? h('span', { class: 'chip' }, icon('directions_walk'), h('span', { 'data-clock': 'break' })) : h('span')),
      h('div', { class: 'flashcard' + (revealed ? ' revealed' : '') },
        h('div', { class: 'fc-q' }, f.question),
        revealed ? [h('hr'), h('div', { class: 'fc-a' }, f.answer), f.bottom ? h('div', { class: 'fc-b' }, f.bottom) : null] : null),
      revealed
        ? h('div', { class: 'grades' }, ['Again', 'Hard', 'Good', 'Easy'].map((l, g) =>
          h('button', { class: `btn grade g${g}`, onclick: () => answer(g) }, l, h('kbd', {}, g + 1))))
        : h('div', { class: 'row center' }, h('button', { class: 'btn filled wide', onclick: reveal }, 'Show answer', h('kbd', {}, 'Space'))));
  };
  const nextItem = () => { item = queue.shift() || null; revealed = false; shownAt = performance.now(); draw(); };
  const reveal = () => { if (revealed || !item) return; recallMs = Math.round(performance.now() - shownAt); revealed = true; draw(); };
  const answer = g => {
    if (!revealed || !item) return;
    const again = SRS.grade(item, g, recallMs);
    done++;
    if (again) queue.push(item);
    nextItem();
  };
  const onKey = e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); reveal(); }
    else if (revealed && ['1', '2', '3', '4'].includes(e.key)) answer(+e.key - 1);
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));
  nextItem();
  return h('section', { class: 'center-page' }, wrap);
}

// ------------------------------------------------------------------ stats
function bars(rows, fmt = v => v) {
  // rows: [{label, value, note?}] — one series, one color; values in text ink.
  const max = Math.max(1, ...rows.map(r => r.value));
  return h('div', { class: 'bars' }, rows.map(r =>
    h('div', { class: 'bar-row', title: `${r.label}: ${fmt(r.value)}${r.note ? ' · ' + r.note : ''}` },
      h('span', { class: 'bar-l' }, r.label),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: { width: (r.value / max) * 100 + '%' } })),
      h('span', { class: 'bar-v' }, fmt(r.value)))));
}

function table(head, rows) {
  if (!rows.length) return h('p', { class: 'muted' }, 'No data yet.');
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, head.map(c => h('th', {}, c)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c == null ? '–' : c)))))));
}

function bucketize(values, edges, labels) {
  const counts = labels.map(() => 0);
  values.forEach(v => { let i = edges.findIndex(e => v < e); if (i === -1) i = labels.length - 1; counts[i]++; });
  return labels.map((label, i) => ({ label, value: counts[i] }));
}

function groupBy(arr, fn) {
  const m = new Map();
  arr.forEach(x => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

const pctStr = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '–');
const fmt1 = n => (n == null ? '–' : round1(n));

function viewStats() {
  const L = S.logs;
  const blocks = L.blocks, losses = L.focusLoss, recalls = L.recalls;
  const totalWorked = blocks.reduce((t, b) => t + b.workedMins, 0);
  const correct = recalls.filter(r => r.correct).length;

  // Per activity
  const byAct = [...groupBy(blocks, b => b.activityId + '|' + b.activityName)].map(([k, bs]) => {
    const a = getActivity(bs[0].activityId), p = a && getProject(a.projectId);
    const n = r => bs.filter(b => b.reason === r).length;
    return [
      h('span', {}, projectDot(p), ' ', a ? a.activityName : bs[0].activityName, p ? h('span', { class: 'muted' }, ` · ${p.name}`) : null),
      bs.length, fmt1(avg(bs.map(b => b.workedMins))), fmt1(avg(bs.map(b => b.deltaMins))),
      n('timeout'), n('early'), n('left'),
      fmt1(avg(bs.filter(b => b.rating).map(b => b.rating))),
      fmt1(avg(bs.map(b => b.focusLosses))),
    ];
  });

  // End reasons by delta
  const deltaEdges = [-20, -10, -5, -0.01, 0.01];
  const deltaLabels = ['≤ −20m', '−20 to −10m', '−10 to −5m', '−5 to 0m', 'On time', 'Extended'];
  const reasonName = { early: 'Ended early', timeout: 'Timed out', left: 'Left website' };
  const reasonRows = Object.keys(reasonName).map(r => {
    const bs = blocks.filter(b => b.reason === r);
    return [reasonName[r], bs.length, pctStr(bs.length, blocks.length), fmt1(avg(bs.map(b => b.workedMins))), fmt1(avg(bs.map(b => b.deltaMins)))];
  }).filter(r => r[1] > 0);
  const nonTimeout = blocks.filter(b => b.reason !== 'timeout');

  // Focus loss
  const lossMins = losses.map(l => l.minutesIntoBlock);
  const sortedLoss = [...lossMins].sort((a, b) => a - b);
  const medianLoss = sortedLoss.length ? sortedLoss[Math.floor(sortedLoss.length / 2)] : null;
  const firstLoss = losses.filter(l => l.lossIndex === 1).map(l => l.minutesIntoBlock);
  const tagCounts = {};
  losses.forEach(l => (l.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  // Check-in predictors
  const byLevel = key => [1, 2, 3, 4, 5].map(v => {
    const bs = blocks.filter(b => b[key] === v);
    const mins = bs.reduce((t, b) => t + b.workedMins, 0);
    const ls = bs.reduce((t, b) => t + b.focusLosses, 0);
    return [(key === 'energy' ? ENERGY : MOODS)[v - 1].label, bs.length, fmt1(avg(bs.map(b => b.workedMins))),
      mins ? round1(ls / (mins / 60)) : null, pctStr(bs.filter(b => b.reason === 'early').length, bs.length)];
  }).filter(r => r[1] > 0);

  // Recall vs fatigue
  const fatigue = [0, 1, 2, 3, 4].map(n => {
    const rs = recalls.filter(r => (n === 4 ? r.blocksDoneToday >= 4 : r.blocksDoneToday === n));
    return [n === 4 ? '4+' : String(n), rs.length, pctStr(rs.filter(r => r.correct).length, rs.length), fmt1(avg(rs.map(r => r.recallMs / 1000)))];
  }).filter(r => r[1] > 0);
  const recallByEnergy = [1, 2, 3, 4, 5].map(v => {
    const rs = recalls.filter(r => r.energy === v);
    return [ENERGY[v - 1].label, rs.length, pctStr(rs.filter(r => r.correct).length, rs.length), fmt1(avg(rs.map(r => r.recallMs / 1000)))];
  }).filter(r => r[1] > 0);

  // Days
  const days = Object.entries(S.days).filter(([, d]) => d.checkin || d.blocks.length).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([k, d]) => {
    const bs = blocks.filter(b => b.date === k);
    return [k, d.checkin ? MOODS[d.checkin.happiness - 1].label : null, d.checkin ? ENERGY[d.checkin.energy - 1].label : null,
      bs.length, fmtMins(bs.reduce((t, b) => t + b.workedMins, 0)), losses.filter(l => l.date === k).length,
      recalls.filter(r => r.date === k).length];
  });

  return h('section', {},
    pageHeader('Stats', 'What predicts sustained focus? Everything here is computed from your local logs.'),
    h('div', { class: 'tiles' },
      tile('Focused time', fmtMins(totalWorked)),
      tile('Blocks', blocks.length),
      tile('Avg block', blocks.length ? fmtMins(totalWorked / blocks.length) : '–'),
      tile('Focus lost / hour', totalWorked ? round1(losses.length / (totalWorked / 60)) : '–'),
      tile('Recall', pctStr(correct, recalls.length))),

    h('div', { class: 'card' }, h('h2', {}, 'Per activity'),
      table(['Activity', 'Blocks', 'Avg min', 'Avg Δ min', 'Timed out', 'Early', 'Left', 'Rating', 'Losses/block'], byAct)),

    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'How blocks end'),
        table(['Reason', 'Count', 'Share', 'Avg worked', 'Avg Δ vs suggested'], reasonRows)),
      h('div', { class: 'card' }, h('h2', {}, 'Early / left: minutes short of suggested'),
        h('p', { class: 'muted small' }, 'Δ = worked − suggested duration. Blocks that ended before the timer.'),
        nonTimeout.length ? bars(bucketize(nonTimeout.map(b => b.deltaMins), deltaEdges, deltaLabels), v => v) : h('p', { class: 'muted' }, 'No early ends yet.'))),

    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'When focus is lost'),
        h('p', { class: 'muted small' }, `Minutes into the block. Median ${fmt1(medianLoss)} min · first loss avg ${fmt1(avg(firstLoss))} min.`),
        losses.length ? bars(bucketize(lossMins, [5, 10, 15, 20, 30], ['0–5m', '5–10m', '10–15m', '15–20m', '20–30m', '30m+'])) : h('p', { class: 'muted' }, 'No focus losses logged.')),
      h('div', { class: 'card' }, h('h2', {}, 'What pulled you away'),
        Object.keys(tagCounts).length ? bars(Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))) : h('p', { class: 'muted' }, 'No tagged focus losses yet.'),
        losses.filter(l => l.context).slice(-5).reverse().map(l => h('div', { class: 'small loss-note' },
          h('span', { class: 'muted' }, `${l.date} · ${l.minutesIntoBlock}m in · `), l.context)))),

    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'Energy at check-in'), table(['Energy', 'Blocks', 'Avg min', 'Losses/h', 'Early %'], byLevel('energy'))),
      h('div', { class: 'card' }, h('h2', {}, 'Happiness at check-in'), table(['Happiness', 'Blocks', 'Avg min', 'Losses/h', 'Early %'], byLevel('happiness')))),

    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'Recall vs blocks done today'),
        h('p', { class: 'muted small' }, 'A rough mental-fatigue proxy.'),
        table(['Blocks done', 'Reviews', 'Correct', 'Avg recall s'], fatigue)),
      h('div', { class: 'card' }, h('h2', {}, 'Recall vs energy'), table(['Energy', 'Reviews', 'Correct', 'Avg recall s'], recallByEnergy))),

    h('div', { class: 'card' }, h('h2', {}, 'Daily log'), table(['Date', 'Happiness', 'Energy', 'Blocks', 'Focused', 'Focus lost', 'Reviews'], days)));
}

// ------------------------------------------------------------------ settings
function viewSettings() {
  const num = (label, key, opts = {}) => h('label', { class: 'field' }, h('span', {}, label),
    h('input', { type: 'number', min: opts.min ?? 1, step: opts.step ?? 1,
      value: opts.scale ? S.settings[key] / opts.scale : S.settings[key],
      onchange: e => { const v = +e.target.value; if (v >= (opts.min ?? 1)) { S.settings[key] = opts.scale ? Math.round(v * opts.scale) : v; save(); toast('Saved.', 1500); } } }),
    opts.hint ? h('small', { class: 'muted' }, opts.hint) : null);

  const importInput = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.state || !data.state.settings) throw new Error('bad file');
      confirmModal('Replace all current data with this backup?', async () => {
        await Images.clear();
        for (const [id, url] of Object.entries(data.images || {})) await Images.put(await dataURLToBlob(url), id);
        replaceState({ ...defaultState(), ...data.state });
        toast('Backup imported.'); go('today'); rerender();
      }, 'Import');
    } catch { toast('That file is not a Rhythm backup.'); }
    e.target.value = '';
  } });

  const exportData = async () => {
    const images = {};
    for (const id of await Images.keys()) images[id] = await blobToDataURL(await Images.get(id));
    download(`rhythm-backup-${todayKey()}.json`, JSON.stringify({ app: 'rhythm', version: 1, exportedAt: new Date().toISOString(), state: S, images }));
  };

  return h('section', {},
    pageHeader('Settings'),
    h('div', { class: 'card settings' },
      num('Work day length (hours)', 'workdayMins', { scale: 60, step: 0.25, min: 0.25, hint: 'Used for planning and auto-fill.' }),
      num('Max new cards per day', 'maxNewCards', { min: 0, hint: 'Each direction of a mirrored card counts as one.' }),
      num('Break length (minutes)', 'breakMins', { hint: 'A 10 minute walk is a good default.' }),
      num('Extend step (minutes)', 'extendMins'),
      num('Default activity length (minutes)', 'defaultActivityMins', { step: 5 })),
    h('div', { class: 'card' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'muted' }, 'Everything is stored only in this browser. Export a backup regularly, or to move to another device.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn tonal', onclick: exportData }, icon('download'), 'Export backup'),
        h('button', { class: 'btn tonal', onclick: () => importInput.click() }, icon('upload'), 'Import backup'), importInput,
        h('button', { class: 'btn danger', onclick: () => confirmModal('Erase all projects, cards, canvases and logs from this browser?', async () => {
          await Images.clear(); replaceState(defaultState()); go('today'); rerender();
        }, 'Erase everything') }, icon('delete_forever'), 'Erase all'))));
}
