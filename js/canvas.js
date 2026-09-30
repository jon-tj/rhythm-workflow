// Figma-like project board: pan (drag background / scroll), zoom (ctrl+scroll / pinch / buttons),
// notes and images you can move and resize. Paste text → note, paste/drop images → image.

function mountCanvas(container, projectId) {
  if (!S.canvases[projectId]) S.canvases[projectId] = { view: { x: 40, y: 40, z: 1 }, items: [] };
  const board = S.canvases[projectId];
  const view = board.view;

  let saveTimer;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
  let activeTool = null;
  let lastShapeClick = null;

  const world = h('div', { class: 'cv-world' });
  const zoomLabel = h('span', { class: 'cv-zoom' });
  const hint = h('div', { class: 'cv-hint' }, 'Paste text or images · drag to pan · Ctrl+scroll to zoom');
  const stampChoices = [
    { label: 'Star', emoji: '⭐' }, { label: 'Heart', emoji: '❤️' },
    { label: 'Laughing', emoji: '😂' }, { label: 'Happy', emoji: '😊' }, { label: 'Mad', emoji: '😡' },
  ];
  const drawChoices = [
    { label: 'Box', shape: 'box', icon: 'crop_square' },
    { label: 'Circle', shape: 'circle', icon: 'circle' },
    { label: 'Triangle', shape: 'triangle', icon: 'change_history' },
    { label: 'Line', shape: 'line', icon: 'horizontal_rule' },
    { label: 'Arrow', shape: 'arrow', icon: 'arrow_right_alt' },
  ];
  const wrap = h('div', { class: 'cv-wrap', tabindex: '-1' },
    world,
    h('div', { class: 'cv-tools' },
      h('button', { class: 'icon-btn', title: 'Add note', onclick: () => addNoteAtCenter('') }, icon('sticky_note_2')),
      h('label', { class: 'icon-btn', title: 'Add image' }, icon('add_photo_alternate'),
        h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
          onchange: e => { const c = centerWorld(); [...e.target.files].forEach((f, i) => addImage(f, c.x + i * 30, c.y + i * 30)); e.target.value = ''; } })),
      toolGroup('add_reaction', 'Emoji stamps', stampChoices.map(choice => ({
        label: choice.label, content: choice.emoji, tool: { type: 'stamp', emoji: choice.emoji },
      }))),
      toolGroup('shapes', 'Shapes and lines', drawChoices.map(choice => ({
        label: choice.label, content: icon(choice.icon), tool: { type: 'shape', shape: choice.shape },
      }))),
      h('span', { class: 'sep' }),
      h('button', { class: 'icon-btn', title: 'Zoom out', onclick: () => zoomAt(1 / 1.2) }, icon('remove')),
      zoomLabel,
      h('button', { class: 'icon-btn', title: 'Zoom in', onclick: () => zoomAt(1.2) }, icon('add')),
      h('button', { class: 'icon-btn', title: 'Reset view', onclick: () => { Object.assign(view, { x: 40, y: 40, z: 1 }); applyView(); } }, icon('center_focus_strong'))),
    hint);
  container.append(wrap);

  function toolGroup(iconName, label, choices) {
    const group = h('div', { class: 'cv-toolgroup' });
    const panel = h('div', { class: 'cv-toolmenu', role: 'group', 'aria-label': label },
      ...choices.map(choice => h('button', {
        class: 'cv-tool-option', type: 'button', title: choice.label, 'aria-label': choice.label,
        onclick: e => activateTool(choice, e.currentTarget),
      }, choice.content)));
    const trigger = h('button', {
      class: 'icon-btn', type: 'button', title: label, 'aria-label': label, 'aria-expanded': 'false',
      onclick: () => {
        const opening = !group.classList.contains('open');
        wrap.querySelectorAll('.cv-toolgroup').forEach(item => item.classList.remove('open'));
        group.classList.toggle('open', opening);
        trigger.setAttribute('aria-expanded', String(opening));
      },
    }, icon(iconName));
    group.append(trigger, panel);
    return group;
  }

  function activateTool(choice, button) {
    activeTool = choice.tool;
    wrap.classList.add('tool-active');
    wrap.classList.toggle('stamp-active', choice.tool.type === 'stamp');
    hint.textContent = choice.tool.type === 'stamp'
      ? `Click canvas to place ${choice.label.toLowerCase()} · Esc to pan`
      : `Drag on canvas to draw ${choice.label.toLowerCase()} · Esc to pan`;
    wrap.querySelectorAll('.cv-toolgroup').forEach(item => item.classList.remove('open'));
    wrap.querySelectorAll('.cv-tool-option').forEach(item => item.classList.toggle('selected', item === button));
  }

  function clearActiveTool() {
    activeTool = null;
    wrap.classList.remove('tool-active');
    wrap.classList.remove('stamp-active');
    hint.textContent = 'Paste text or images · drag to pan · Ctrl+scroll to zoom';
    wrap.querySelectorAll('.cv-tool-option').forEach(item => item.classList.remove('selected'));
  }

  const onCanvasKeydown = e => { if (e.key === 'Escape' && activeTool) clearActiveTool(); };
  document.addEventListener('keydown', onCanvasKeydown);

  const onStampPointerDown = e => {
    if (activeTool?.type !== 'stamp' || e.target.closest('.cv-del') || e.target.closest('.cv-tools')) return;
    e.preventDefault();
    e.stopPropagation();
    const point = toWorld(e.clientX, e.clientY);
    addStamp(activeTool.emoji, point.x - 32, point.y - 32);
  };
  wrap.addEventListener('pointerdown', onStampPointerDown, true);

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
    if (activeTool) {
      e.preventDefault();
      const point = toWorld(e.clientX, e.clientY);
      startShapeDraw(activeTool.shape, point, e.pointerId);
      return;
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('panning');
    const move = ev => { view.x = ox + ev.clientX - sx; view.y = oy + ev.clientY - sy; applyView(); };
    const up = () => { wrap.removeEventListener('pointermove', move); wrap.classList.remove('panning'); };
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', up, { once: true });
  });

  function startShapeDraw(shape, start, pointerId) {
    const it = { id: uid(), type: 'shape', shape, x: start.x, y: start.y, w: 1, h: 1, angle: 0,
      color: shape === 'line' || shape === 'arrow' ? 'rose' : 'blue' };
    board.items.push(it);
    const el = renderItem(it);
    wrap.setPointerCapture(pointerId);
    const move = e => {
      const end = toWorld(e.clientX, e.clientY);
      if (shape === 'line' || shape === 'arrow') {
        const dx = end.x - start.x, dy = end.y - start.y;
        it.w = Math.max(8, Math.hypot(dx, dy));
        it.h = 28;
        it.x = (start.x + end.x) / 2 - it.w / 2;
        it.y = (start.y + end.y) / 2 - it.h / 2;
        it.angle = Math.atan2(dy, dx) * 180 / Math.PI;
      } else {
        it.x = Math.min(start.x, end.x);
        it.y = Math.min(start.y, end.y);
        it.w = Math.max(8, Math.abs(end.x - start.x));
        it.h = Math.max(8, Math.abs(end.y - start.y));
      }
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
      el.style.setProperty('--shape-angle', it.angle + 'deg');
    };
    const finish = () => {
      wrap.removeEventListener('pointermove', move);
      wrap.removeEventListener('pointerup', finish);
      wrap.removeEventListener('pointercancel', finish);
      wrap.removeEventListener('lostpointercapture', finish);
      saveSoon();
    };
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', finish, { once: true });
    wrap.addEventListener('pointercancel', finish, { once: true });
    wrap.addEventListener('lostpointercapture', finish, { once: true });
  }
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
  const noteColors = ['white', 'yellow', 'rose', 'blue', 'green', 'lavender'];

  function renderItem(it) {
    const style = { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px' };
    if (it.h != null) style.height = it.h + 'px';
    if (it.angle != null) style['--shape-angle'] = it.angle + 'deg';
    const el = h('div', { class: `cv-item cv-${it.type}`, style });
    el.dataset.itemId = it.id;
    const del = h('button', { class: 'cv-del', title: 'Delete', onclick: () => removeItem(it, el) }, icon('close'));
    const resize = h('div', { class: 'cv-resize' });

    if (it.type === 'note') {
      if (!noteColors.includes(it.color)) it.color = 'white';
      el.dataset.color = it.color;
      const colors = h('div', { class: 'cv-item-colors', role: 'group', 'aria-label': 'Note color' },
          ...noteColors.map(color => h('button', {
            class: 'cv-note-color', type: 'button', title: `${color} note color`, 'aria-label': `${color} note color`,
            'aria-pressed': String(it.color === color), 'data-color': color,
            onclick: e => {
              e.stopPropagation();
              it.color = color;
              el.dataset.color = color;
              colors.querySelectorAll('.cv-note-color').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)));
              saveSoon();
            },
          })));
      const controls = h('div', { class: 'cv-item-controls' }, colors, del);
      const handle = h('div', { class: 'cv-handle' }, icon('drag_indicator'));
      const ta = h('textarea', { placeholder: 'Write something…', value: it.text });
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', () => { it.text = ta.value; grow(); saveSoon(); });
      el.append(handle, ta, controls, resize);
      requestAnimationFrame(grow);
      dragBy(handle, el, it);
      el._focus = () => ta.focus();
    } else if (it.type === 'image') {
      const img = h('img', { alt: '', draggable: 'false' });
      Images.url(it.imageId).then(u => { if (u) img.src = u; else el.classList.add('missing'); });
      el.append(img, del, resize);
      dragBy(img, el, it);
    } else if (it.type === 'stamp') {
      const face = h('div', { class: 'cv-stamp-face', 'aria-label': `${it.emoji} stamp` }, it.emoji);
      face.style.fontSize = it.w * 0.82 + 'px';
      el.append(face, del, resize);
      dragBy(face, el, it);
    } else if (it.type === 'shape') {
      if (!noteColors.includes(it.color)) it.color = it.shape === 'line' || it.shape === 'arrow' ? 'rose' : 'blue';
      el.dataset.color = it.color;
      const face = h('div', { class: `cv-shape-face cv-shape-${it.shape}` });
      const colors = h('div', { class: 'cv-item-colors', role: 'group', 'aria-label': 'Shape color' },
          ...noteColors.map(color => h('button', {
            class: 'cv-note-color', type: 'button', title: `${color} shape color`, 'aria-label': `${color} shape color`,
            'aria-pressed': String(it.color === color), 'data-color': color,
            onclick: e => {
              e.stopPropagation();
              it.color = color;
              el.dataset.color = color;
              colors.querySelectorAll('.cv-note-color').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)));
              saveSoon();
            },
          })));
      const controls = h('div', { class: 'cv-item-controls' },
        h('button', {
          class: 'cv-shape-back', type: 'button', title: 'Send to back', 'aria-label': 'Send to back',
          onclick: e => { e.stopPropagation(); sendToBack(it, el); },
        }, icon('vertical_align_bottom')),
        colors,
        del
      );
      el.append(face, controls, resize);
      dragBy(face, el, it);
    }
    resizeBy(resize, el, it);
    world.append(el);
    return el;
  }

  function dragBy(handle, el, it) {
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      if (it.type === 'shape' && lastShapeClick && lastShapeClick.id === it.id &&
          Date.now() - lastShapeClick.time < 500 && Math.hypot(e.clientX - lastShapeClick.x, e.clientY - lastShapeClick.y) < 18) {
        e.preventDefault();
        e.stopPropagation();
        lastShapeClick = null;
        const point = toWorld(e.clientX, e.clientY);
        addNote('', point.x, point.y, true);
        return;
      }
      e.stopPropagation(); e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
      let moved = false;
      const moving = [{ item: it, el, x: ox, y: oy }];
      if (it.type === 'shape' && it.shape === 'box') {
        board.items.forEach(candidate => {
          if (candidate === it || !isContainedByBox(candidate, it)) return;
          const candidateEl = world.querySelector(`[data-item-id="${candidate.id}"]`);
          if (candidateEl) moving.push({ item: candidate, el: candidateEl, x: candidate.x, y: candidate.y });
        });
      }
      el.classList.add('dragging');
      wrap.setPointerCapture(e.pointerId);
      const movingByItem = new Map(moving.map(entry => [entry.item, entry]));
      const movingOrder = board.items.filter(item => movingByItem.has(item));
      board.items = board.items.filter(item => !movingByItem.has(item)).concat(movingOrder);
      movingOrder.forEach(item => world.append(movingByItem.get(item).el));
      const move = ev => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true;
        const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
        moving.forEach(({ item, el: movingEl, x, y }) => {
          item.x = x + dx; item.y = y + dy;
          movingEl.style.left = item.x + 'px'; movingEl.style.top = item.y + 'px';
        });
      };
      const finish = ev => {
        wrap.removeEventListener('pointermove', move);
        wrap.removeEventListener('pointerup', finish);
        wrap.removeEventListener('pointercancel', finish);
        wrap.removeEventListener('lostpointercapture', finish);
        el.classList.remove('dragging');
        if (it.type === 'shape' && !moved && ev.type === 'pointerup') {
          lastShapeClick = { id: it.id, time: Date.now(), x: sx, y: sy };
        }
        saveSoon();
      };
      wrap.addEventListener('pointermove', move);
      wrap.addEventListener('pointerup', finish, { once: true });
      wrap.addEventListener('pointercancel', finish, { once: true });
      wrap.addEventListener('lostpointercapture', finish, { once: true });
    });
  }

  function isContainedByBox(item, box) {
    const left = box.x, top = box.y, right = box.x + box.w, bottom = box.y + box.h;
    if (item.type === 'stamp' || (item.type === 'shape' && item.shape === 'arrow')) {
      return item.x + item.w / 2 >= left && item.x + item.w / 2 <= right &&
        item.y + item.h / 2 >= top && item.y + item.h / 2 <= bottom;
    }
    const itemEl = world.querySelector(`[data-item-id="${item.id}"]`);
    const width = itemEl ? itemEl.offsetWidth : item.w || 0;
    const height = itemEl ? itemEl.offsetHeight : item.h || 0;
    return item.x >= left && item.y >= top && item.x + width <= right && item.y + height <= bottom;
  }

  function sendToBack(it, el) {
    const index = board.items.indexOf(it);
    if (index > 0) {
      board.items.splice(index, 1);
      board.items.unshift(it);
      world.insertBefore(el, world.firstChild);
      saveSoon();
    }
  }

  function resizeBy(grip, el, it) {
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ow = it.w, oh = it.h;
      wrap.setPointerCapture(e.pointerId);
      const move = ev => {
        it.w = Math.max(40, ow + (ev.clientX - sx) / view.z);
        el.style.width = it.w + 'px';
        if (it.type === 'stamp') {
          it.h = it.w; el.style.height = it.h + 'px';
          el.querySelector('.cv-stamp-face').style.fontSize = it.w * 0.82 + 'px';
        } else if (it.type === 'shape' && it.shape !== 'line' && it.shape !== 'arrow') {
          it.h = Math.max(40, oh + (ev.clientY - sy) / view.z); el.style.height = it.h + 'px';
        }
      };
      const finish = () => {
        wrap.removeEventListener('pointermove', move);
        wrap.removeEventListener('pointerup', finish);
        wrap.removeEventListener('pointercancel', finish);
        wrap.removeEventListener('lostpointercapture', finish);
        saveSoon();
      };
      wrap.addEventListener('pointermove', move);
      wrap.addEventListener('pointerup', finish, { once: true });
      wrap.addEventListener('pointercancel', finish, { once: true });
      wrap.addEventListener('lostpointercapture', finish, { once: true });
    });
  }

  function removeItem(it, el) {
    board.items = board.items.filter(i => i !== it);
    el.remove();
    if (it.type === 'image') Images.remove(it.imageId).catch(() => {});
    save();
  }

  function addNote(text, x, y, focus) {
    const it = { id: uid(), type: 'note', x, y, w: 220, text, color: 'white' };
    board.items.push(it);
    const el = renderItem(it);
    save();
    if (focus) setTimeout(() => el._focus && el._focus(), 20);
  }
  function addNoteAtCenter(text) { const c = centerWorld(); addNote(text, c.x, c.y, !text); }

  function addStamp(emoji, x, y) {
    const it = { id: uid(), type: 'stamp', emoji, x, y, w: 64, h: 64 };
    board.items.push(it);
    renderItem(it);
    save();
  }

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

  return () => {
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('keydown', onCanvasKeydown);
    wrap.removeEventListener('pointerdown', onStampPointerDown, true);
    clearTimeout(saveTimer);
    save();
  };
}
