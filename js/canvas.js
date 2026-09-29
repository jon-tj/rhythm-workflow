// Figma-like project board: pan (drag background / scroll), zoom (ctrl+scroll / pinch / buttons),
// notes and images you can move and resize. Paste text → note, paste/drop images → image.

function mountCanvas(container, projectId) {
  if (!S.canvases[projectId]) S.canvases[projectId] = { view: { x: 40, y: 40, z: 1 }, items: [] };
  const board = S.canvases[projectId];
  const view = board.view;

  let saveTimer;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };

  const world = h('div', { class: 'cv-world' });
  const zoomLabel = h('span', { class: 'cv-zoom' });
  const wrap = h('div', { class: 'cv-wrap', tabindex: '-1' },
    world,
    h('div', { class: 'cv-tools' },
      h('button', { class: 'icon-btn', title: 'Add note', onclick: () => addNoteAtCenter('') }, icon('sticky_note_2')),
      h('label', { class: 'icon-btn', title: 'Add image' }, icon('add_photo_alternate'),
        h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
          onchange: e => { const c = centerWorld(); [...e.target.files].forEach((f, i) => addImage(f, c.x + i * 30, c.y + i * 30)); e.target.value = ''; } })),
      h('span', { class: 'sep' }),
      h('button', { class: 'icon-btn', title: 'Zoom out', onclick: () => zoomAt(1 / 1.2) }, icon('remove')),
      zoomLabel,
      h('button', { class: 'icon-btn', title: 'Zoom in', onclick: () => zoomAt(1.2) }, icon('add')),
      h('button', { class: 'icon-btn', title: 'Reset view', onclick: () => { Object.assign(view, { x: 40, y: 40, z: 1 }); applyView(); } }, icon('center_focus_strong'))),
    h('div', { class: 'cv-hint' }, 'Paste text or images · drag to pan · Ctrl+scroll to zoom'));
  container.append(wrap);

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    wrap.style.backgroundPosition = `${view.x}px ${view.y}px`;
    wrap.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`;
    zoomLabel.textContent = Math.round(view.z * 100) + '%';
    saveSoon();
  }

  function toWorld(clientX, clientY) {
    const r = wrap.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.z, y: (clientY - r.top - view.y) / view.z };
  }
  function centerWorld() {
    const r = wrap.getBoundingClientRect();
    return toWorld(r.left + r.width / 2 - 100, r.top + r.height / 2 - 60);
  }
  function zoomAt(factor, clientX, clientY) {
    const r = wrap.getBoundingClientRect();
    const cx = clientX == null ? r.width / 2 : clientX - r.left;
    const cy = clientY == null ? r.height / 2 : clientY - r.top;
    const z = Math.min(4, Math.max(0.15, view.z * factor));
    view.x = cx - (cx - view.x) * (z / view.z);
    view.y = cy - (cy - view.y) * (z / view.z);
    view.z = z;
    applyView();
  }

  // ---- pan ----
  wrap.addEventListener('pointerdown', e => {
    if (e.target !== wrap && e.target !== world) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('panning');
    const move = ev => { view.x = ox + ev.clientX - sx; view.y = oy + ev.clientY - sy; applyView(); };
    const up = () => { wrap.removeEventListener('pointermove', move); wrap.classList.remove('panning'); };
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', up, { once: true });
  });
  wrap.addEventListener('dblclick', e => {
    if (e.target !== wrap && e.target !== world) return;
    const p = toWorld(e.clientX, e.clientY);
    addNote('', p.x, p.y, true);
  });
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }, { passive: false });

  // ---- items ----
  function renderItem(it) {
    const el = h('div', { class: `cv-item cv-${it.type}`, style: { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px' } });
    const del = h('button', { class: 'cv-del', title: 'Delete', onclick: () => removeItem(it, el) }, icon('close'));
    const resize = h('div', { class: 'cv-resize' });

    if (it.type === 'note') {
      const handle = h('div', { class: 'cv-handle' }, icon('drag_indicator'));
      const ta = h('textarea', { placeholder: 'Write something…', value: it.text });
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', () => { it.text = ta.value; grow(); saveSoon(); });
      el.append(handle, ta, del, resize);
      requestAnimationFrame(grow);
      dragBy(handle, el, it);
      el._focus = () => ta.focus();
    } else {
      const img = h('img', { alt: '', draggable: 'false' });
      Images.url(it.imageId).then(u => { if (u) img.src = u; else el.classList.add('missing'); });
      el.append(img, del, resize);
      dragBy(img, el, it);
    }
    resizeBy(resize, el, it);
    world.append(el);
    return el;
  }

  function dragBy(handle, el, it) {
    handle.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
      handle.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      world.append(el); // bring to front
      const idx = board.items.indexOf(it);
      board.items.splice(idx, 1); board.items.push(it);
      const move = ev => {
        it.x = ox + (ev.clientX - sx) / view.z; it.y = oy + (ev.clientY - sy) / view.z;
        el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      };
      const up = () => { handle.removeEventListener('pointermove', move); el.classList.remove('dragging'); saveSoon(); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
  }

  function resizeBy(grip, el, it) {
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const sx = e.clientX, ow = it.w;
      grip.setPointerCapture(e.pointerId);
      const move = ev => { it.w = Math.max(120, ow + (ev.clientX - sx) / view.z); el.style.width = it.w + 'px'; };
      const up = () => { grip.removeEventListener('pointermove', move); saveSoon(); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
    });
  }

  function removeItem(it, el) {
    board.items = board.items.filter(i => i !== it);
    el.remove();
    if (it.type === 'image') Images.remove(it.imageId).catch(() => {});
    save();
  }

  function addNote(text, x, y, focus) {
    const it = { id: uid(), type: 'note', x, y, w: 220, text };
    board.items.push(it);
    const el = renderItem(it);
    save();
    if (focus) setTimeout(() => el._focus && el._focus(), 20);
  }
  function addNoteAtCenter(text) { const c = centerWorld(); addNote(text, c.x, c.y, !text); }

  async function addImage(file, x, y) {
    try {
      const imageId = await Images.put(file);
      const w = await new Promise(res => {
        const i = new Image();
        i.onload = () => { res(Math.min(420, i.naturalWidth || 300)); URL.revokeObjectURL(i.src); };
        i.onerror = () => res(300);
        i.src = URL.createObjectURL(file);
      });
      const it = { id: uid(), type: 'image', x, y, w, imageId };
      board.items.push(it);
      renderItem(it);
      save();
    } catch {
      toast('Could not store the image.');
    }
  }

  // ---- paste & drop ----
  function onPaste(e) {
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    if (document.querySelector('.modal-back')) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [...cd.items].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
    const c = centerWorld();
    if (files.length) {
      e.preventDefault();
      files.forEach((f, i) => addImage(f, c.x + i * 30, c.y + i * 30));
      return;
    }
    const text = cd.getData('text/plain');
    if (text && text.trim()) { e.preventDefault(); addNote(text.trim(), c.x, c.y); }
  }
  document.addEventListener('paste', onPaste);

  wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drop'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.classList.remove('drop');
    const p = toWorld(e.clientX, e.clientY);
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length) files.forEach((f, i) => addImage(f, p.x + i * 30, p.y + i * 30));
    else {
      const text = e.dataTransfer.getData('text/plain');
      if (text && text.trim()) addNote(text.trim(), p.x, p.y);
    }
  });

  board.items.forEach(renderItem);
  applyView();

  return () => { document.removeEventListener('paste', onPaste); clearTimeout(saveTimer); save(); };
}
