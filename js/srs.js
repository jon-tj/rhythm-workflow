// Spaced repetition (SM-2 variant, Anki-style grades).
// A mirrored card yields two review items: forward (f) and reverse (r).

const SRS = (() => {
  const DAY = 86400000;
  const key = (cardId, dir) => `${cardId}:${dir}`;

  function items() {
    return S.cards.flatMap(c => (c.mirrored ? ['f', 'r'] : ['f']).map(dir => ({ card: c, dir, key: key(c.id, dir) })));
  }

  const introducedToday = () => Object.values(S.srs).filter(s => s.introduced === todayKey()).length;

  function due(now = Date.now()) {
    return items().filter(i => S.srs[i.key] && S.srs[i.key].due <= now)
      .sort((a, b) => S.srs[a.key].due - S.srs[b.key].due);
  }

  function fresh() {
    const allowed = Math.max(0, S.settings.maxNewCards - introducedToday());
    return items().filter(i => !S.srs[i.key]).slice(0, allowed);
  }

  const queue = () => [...due(), ...fresh()];
  const counts = () => ({ due: due().length, fresh: fresh().length });

  // grade: 0 again, 1 hard, 2 good, 3 easy
  function grade(item, g, recallMs) {
    const isNew = !S.srs[item.key];
    const s = S.srs[item.key] || { ease: 2.5, interval: 0, reps: 0, lapses: 0, introduced: todayKey() };
    const now = Date.now();
    if (g === 0) {
      s.reps = 0;
      s.lapses++;
      s.interval = 0;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.due = now + 60 * 1000; // back in the queue shortly
    } else {
      if (s.reps === 0) s.interval = g === 3 ? 4 : 1;
      else if (s.reps === 1) s.interval = g === 1 ? 3 : g === 2 ? 6 : 8;
      else s.interval = Math.round(s.interval * s.ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1));
      const q = g + 2; // map to SM-2 quality 3..5
      s.ease = Math.max(1.3, s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      s.reps++;
      s.due = now + s.interval * DAY;
    }
    S.srs[item.key] = s;

    const day = getDay();
    S.logs.recalls.push({
      cardId: item.card.id,
      dir: item.dir,
      at: now,
      date: todayKey(),
      grade: g,
      correct: g > 0,
      recallMs,
      isNew,
      blocksDoneToday: day.blocks.filter(b => b.status === 'done').length,
      happiness: day.checkin && day.checkin.happiness,
      energy: day.checkin && day.checkin.energy,
      duringBreak: !!(S.session && S.session.phase === 'break'),
    });
    save();
    return g === 0; // true => requeue in this session
  }

  // Face text for an item: what you're asked, and what's revealed.
  function faces(item) {
    const c = item.card;
    const q = item.dir === 'f' ? c.front : c.back;
    const a = item.dir === 'f' ? c.back : c.front;
    return { question: q, answer: a, bottom: c.mirrored ? c.bottom : '' };
  }

  function forgetCard(cardId) {
    delete S.srs[key(cardId, 'f')];
    delete S.srs[key(cardId, 'r')];
  }

  return { items, due, fresh, queue, counts, grade, faces, forgetCard };
})();
