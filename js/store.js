// All app state lives in one object persisted to localStorage.
// Images for project canvases live separately in IndexedDB (see images.js).

const STORE_KEY = 'rhythm.v1';

const PROJECT_COLORS = ['#6750a4', '#00796b', '#c2185b', '#ef6c00', '#1565c0', '#558b2f', '#6d4c41', '#00838f'];

function defaultState() {
  return {
    settings: { workdayMins: 300, maxNewCards: 10, breakMins: 10, extendMins: 15, defaultActivityMins: 30 },
    projects: [],   // { id, name, color }
    activities: [], // { projectId, activityId, activityName, userSuggestedDurationMins }
    cards: [],      // { id, front, back, mirrored, bottom?, createdAt }
    srs: {},        // "cardId:f|r" -> { ease, interval, reps, lapses, due, introduced }
    days: {},       // "YYYY-MM-DD" -> { checkin: {happiness, energy, at}, blocks: [...], completedAt }
    session: null,  // current focus/break session (survives reloads)
    canvases: {},   // projectId -> { view: {x,y,z}, items: [...] }
    logs: {
      blocks: [],    // one row per finished activity block
      focusLoss: [], // one row per "Lost focus" click
      recalls: [],   // one row per card review
    },
  };
}

let S = loadState();

function loadState() {
  const d = defaultState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!raw) return d;
    return {
      ...d, ...raw,
      settings: { ...d.settings, ...raw.settings },
      logs: { ...d.logs, ...raw.logs },
    };
  } catch {
    return d;
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Could not save — browser storage is full or blocked.');
  }
}

function replaceState(next) {
  S = next;
  save();
}

// ---- lookups ----
const getProject = id => S.projects.find(p => p.id === id);
const getActivity = id => S.activities.find(a => a.activityId === id);
const activitiesOf = projectId => S.activities.filter(a => a.projectId === projectId);

function getDay(key = todayKey()) {
  if (!S.days[key]) S.days[key] = { checkin: null, blocks: [], completedAt: null };
  return S.days[key];
}

function findBlock(blockId, key) {
  const day = S.days[key || todayKey()];
  return day && day.blocks.find(b => b.id === blockId);
}

// ---- mutations ----
function addProject(name) {
  const p = { id: uid(), name, color: PROJECT_COLORS[S.projects.length % PROJECT_COLORS.length] };
  S.projects.push(p);
  save();
  return p;
}

function addActivity(projectId, activityName, mins) {
  const a = {
    projectId,
    activityId: uid(),
    activityName,
    userSuggestedDurationMins: mins || S.settings.defaultActivityMins,
  };
  S.activities.push(a);
  save();
  return a;
}

function deleteProject(id) {
  S.projects = S.projects.filter(p => p.id !== id);
  S.activities = S.activities.filter(a => a.projectId !== id);
  const day = S.days[todayKey()];
  if (day) day.blocks = day.blocks.filter(b => b.status === 'done' || b.projectId !== id);
  delete S.canvases[id];
  save();
}

function deleteActivity(activityId) {
  S.activities = S.activities.filter(a => a.activityId !== activityId);
  const day = S.days[todayKey()];
  if (day) day.blocks = day.blocks.filter(b => b.status === 'done' || b.activityId !== activityId);
  save();
}

function addBlock(activityId) {
  const a = getActivity(activityId);
  if (!a) return;
  getDay().blocks.push({
    id: uid(),
    projectId: a.projectId,
    activityId: a.activityId,
    mins: a.userSuggestedDurationMins,
    status: 'pending',
  });
  getDay().completedAt = null;
  save();
}

const pendingBlocks = () => getDay().blocks.filter(b => b.status === 'pending');
const plannedMins = () => getDay().blocks.reduce((t, b) => t + (b.status === 'done' ? b.result.workedMins : b.mins), 0);

// Fill the rest of the work day by cycling through all activities.
function autoFillDay() {
  if (!S.activities.length) return 0;
  let remaining = S.settings.workdayMins - plannedMins();
  let added = 0, i = 0;
  const pending = pendingBlocks();
  const last = pending.length ? pending[pending.length - 1].activityId : null;
  i = Math.max(0, S.activities.findIndex(a => a.activityId === last) + 1);
  while (remaining >= 10 && added < 50) {
    const a = S.activities[i % S.activities.length];
    const mins = Math.min(a.userSuggestedDurationMins, remaining);
    getDay().blocks.push({ id: uid(), projectId: a.projectId, activityId: a.activityId, mins, status: 'pending' });
    remaining -= mins;
    added++; i++;
  }
  getDay().completedAt = null;
  save();
  return added;
}
