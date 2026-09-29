// Focus-block lifecycle: focus → (time up | end early | left site) → rating → break → next block.
// S.session persists in localStorage so a reload resumes, and a long gap is logged as "left".

const LEFT_GRACE_MS = 3 * 60 * 1000; // heartbeat gap after which we assume the user left
const HEARTBEAT_SAVE_MS = 10 * 1000;

const Session = (() => {
  let lastHeartbeatSave = 0;

  const cur = () => S.session;
  const block = () => cur() && findBlock(cur().blockId, cur().date);
  const endsAt = () => cur().startedAt + cur().plannedMins * 60000;
  const remainingMs = () => endsAt() - Date.now();
  const elapsedMins = (to = Date.now()) => (to - cur().startedAt) / 60000;

  function start(blockId) {
    const b = findBlock(blockId);
    if (!b || b.status !== 'pending') return;
    if (cur() && (cur().phase === 'focus' || cur().phase === 'timeup')) {
      toast('Finish the current block first.');
      return;
    }
    // Move the chosen block to the front of the pending queue so the plan reflects reality.
    const day = getDay();
    day.blocks = day.blocks.filter(x => x !== b);
    const firstPending = day.blocks.findIndex(x => x.status === 'pending');
    day.blocks.splice(firstPending === -1 ? day.blocks.length : firstPending, 0, b);

    const now = Date.now();
    S.session = { phase: 'focus', date: todayKey(), blockId, startedAt: now, plannedMins: b.mins, lastSeen: now, losses: [] };
    save();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    go('focus');
  }

  function startNext() {
    const next = pendingBlocks()[0];
    if (next) start(next.id);
  }

  function extend() {
    const s = cur();
    s.plannedMins += S.settings.extendMins;
    // If time ran out a while ago, extend from now rather than from the old end.
    if (endsAt() < Date.now()) s.plannedMins = elapsedMins() + S.settings.extendMins;
    s.phase = 'focus';
    const b = block();
    if (b) b.extendedBy = (b.extendedBy || 0) + S.settings.extendMins;
    save();
    closeTimeUp();
    rerender();
  }

  function lostFocus(context) {
    const s = cur();
    const now = Date.now();
    const b = block();
    const prev = s.losses.length ? s.losses[s.losses.length - 1] : s.startedAt;
    const row = {
      date: s.date,
      blockId: s.blockId,
      projectId: b && b.projectId,
      activityId: b && b.activityId,
      at: now,
      minutesIntoBlock: round1(elapsedMins(now)),
      minutesSincePrevious: round1((now - prev) / 60000),
      suggestedMins: b && b.mins,
      lossIndex: s.losses.length + 1,
      context: context || '',
    };
    s.losses.push(now);
    S.logs.focusLoss.push(row);
    save();
    return row;
  }

  function endBlock(reason, rating) {
    const s = cur();
    const b = block();
    const a = b && getActivity(b.activityId);
    const endedAt = reason === 'timeout' ? endsAt() : reason === 'left' ? s.lastSeen : Date.now();
    const worked = round1(Math.max(0, elapsedMins(endedAt)));
    const suggested = a ? a.userSuggestedDurationMins : (b ? b.mins : s.plannedMins);
    const day = S.days[s.date] || getDay();

    S.logs.blocks.push({
      date: s.date,
      blockId: s.blockId,
      projectId: b && b.projectId,
      activityId: b && b.activityId,
      activityName: a ? a.activityName : '(deleted)',
      suggestedMins: suggested,
      plannedMins: b ? b.mins : s.plannedMins,
      extendedMins: (b && b.extendedBy) || 0,
      startedAt: s.startedAt,
      endedAt,
      workedMins: worked,
      deltaMins: round1(worked - suggested),
      reason, // 'early' | 'timeout' | 'left'
      rating: rating || null,
      focusLosses: s.losses.length,
      happiness: day.checkin && day.checkin.happiness,
      energy: day.checkin && day.checkin.energy,
      blockIndex: day.blocks.filter(x => x.status === 'done').length,
    });

    if (b) {
      b.status = 'done';
      b.result = { reason, workedMins: worked, rating: rating || null, startedAt: s.startedAt, endedAt, losses: s.losses.length };
    }

    const today = s.date === todayKey();
    if (today && pendingBlocks().length) {
      S.session = reason === 'left' ? null : { phase: 'break', date: s.date, lastBlockId: s.blockId, breakStartedAt: Date.now(), breakMins: S.settings.breakMins };
      save();
      if (reason !== 'left') go('break');
    } else {
      S.session = null;
      if (today) finishDay(reason !== 'left');
      else save();
    }
  }

  function finishDay(celebrate = true) {
    getDay().completedAt = Date.now();
    save();
    go('done');
    if (celebrate) confetti();
  }

  function skipBreak() {
    S.session = null;
    save();
  }

  // Called every second by app.js.
  function tick() {
    const s = cur();
    if (!s) return;
    const now = Date.now();
    if (s.phase === 'focus' || s.phase === 'timeup') {
      s.lastSeen = now;
      if (now - lastHeartbeatSave > HEARTBEAT_SAVE_MS) { lastHeartbeatSave = now; save(); }
    }
    if (s.phase === 'focus' && remainingMs() <= 0) {
      s.phase = 'timeup';
      save();
      beep(3);
      const a = block() && getActivity(block().activityId);
      notify("Time's up!", a ? `${a.activityName} block finished.` : 'Block finished.');
      showTimeUp();
    }
    if (s.phase === 'break' && !s.breakAlerted && now >= s.breakStartedAt + s.breakMins * 60000) {
      s.breakAlerted = true;
      save();
      beep(2);
      notify('Break is over', 'Ready for the next block?');
    }
  }

  // On page load: detect a gap in the heartbeat → the user left mid-block.
  function recover() {
    const s = cur();
    if (!s) return;
    if (s.phase === 'break' && s.date !== todayKey()) { S.session = null; save(); return; }
    if (s.phase !== 'focus') return;
    const gap = Date.now() - s.lastSeen;
    const timedOutWhileHere = s.lastSeen >= endsAt();
    if (gap > LEFT_GRACE_MS && !timedOutWhileHere) {
      const b = block();
      const a = b && getActivity(b.activityId);
      endBlock('left', null);
      toast(`You left during ${a ? a.activityName : 'a block'} — logged ${fmtMins((s.lastSeen - s.startedAt) / 60000)} of work, ended ${fmtTime(s.lastSeen)}.`, 7000);
    }
  }

  return { cur, block, start, startNext, extend, lostFocus, endBlock, skipBreak, finishDay, tick, recover, remainingMs, elapsedMins };
})();
