// Small DOM + formatting helpers shared by every module.

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const icon = (name, cls) => h('span', { class: 'ms' + (cls ? ' ' + cls : '') }, name);

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);

function dateKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const todayKey = () => dateKey();

function fmtClock(ms) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const str = `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return neg ? '+' + str : str;
}

function fmtMins(mins) {
  mins = Math.round(mins);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const round1 = n => Math.round(n * 10) / 10;
const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

const MOODS = [
  { v: 1, icon: 'sentiment_very_dissatisfied', label: 'Awful' },
  { v: 2, icon: 'sentiment_dissatisfied', label: 'Meh' },
  { v: 3, icon: 'sentiment_neutral', label: 'Okay' },
  { v: 4, icon: 'sentiment_satisfied', label: 'Good' },
  { v: 5, icon: 'sentiment_very_satisfied', label: 'Great' },
];
const ENERGY = [
  { v: 1, icon: 'battery_1_bar', label: 'Drained' },
  { v: 2, icon: 'battery_2_bar', label: 'Low' },
  { v: 3, icon: 'battery_4_bar', label: 'Okay' },
  { v: 4, icon: 'battery_5_bar', label: 'Good' },
  { v: 5, icon: 'battery_full', label: 'Charged' },
];

// A row of big icon buttons for picking a 1–5 value.
function scalePicker(options, selected, onPick) {
  return h('div', { class: 'scale' },
    options.map(o => h('button', {
      class: 'scale-btn' + (selected === o.v ? ' selected' : ''),
      title: o.label, type: 'button',
      onclick: () => onPick(o.v),
    }, icon(o.icon), h('small', {}, o.label))));
}

function toast(msg, ms = 4000) {
  const t = h('div', { class: 'toast' }, msg);
  document.getElementById('toast-root').append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// Modal: returns a close() function. content can be a node or a fn(close) => node.
function openModal(content, { dismissable = true } = {}) {
  const root = document.getElementById('modal-root');
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
  const body = typeof content === 'function' ? content(close) : content;
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back && dismissable) close(); } },
    h('div', { class: 'modal' }, body));
  root.append(back);
  document.addEventListener('keydown', onKey);
  const focusable = back.querySelector('textarea, input');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return close;
}

function confirmModal(message, onYes, yesLabel = 'Delete') {
  openModal(close => h('div', {},
    h('p', {}, message),
    h('div', { class: 'row end' },
      h('button', { class: 'btn text', onclick: close }, 'Cancel'),
      h('button', { class: 'btn danger', onclick: () => { close(); onYes(); } }, yesLabel))));
}

let audioCtx;
function beep(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.35;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.32);
    }
  } catch { /* audio unavailable */ }
}

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title, { body }); } catch { /* ignore */ }
}

function download(filename, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
  document.body.append(a); a.click(); a.remove();
}
