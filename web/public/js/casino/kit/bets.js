// Staged chips on a layout's betting spots, before they are committed (no DOM). The casino shell
// wraps this as ctx.bets() (clicks, messages, the bet bar, Rebet memory); engines and tests can use
// it directly.
//
//   const st = createStaging({ spot: (key) => ({ label: 'Ante', min: 5, max: 1000 }) | null,
//                              available: () => bank.balance });
//   st.place('ante', 25)   -> { ok: true, amount: 25 } or { ok: false, error: 'Table max is $1,000.' }
//   st.remove('ante', 5), st.undo(), st.clear(), st.total(), st.amounts()  ({ ante: 20 })
//   st.check()             -> null, or { key, min, label } for a spot below its minimum
//   st.rebet(layout, 2)    -> refill a saved layout ([{ spot, amount }]) twice over, as much as fits
//
// spot(key) says whether a spot takes chips now and its limits: null = closed (wrong phase, not a
// spot). min/max default to the table limits (max null = no limit).

const usd = (n) => `$${n.toLocaleString('en-US')}`;

export function createStaging({ spot = () => ({}), limits = { min: 0, max: null }, available = () => Infinity, validate = null } = {}) {
  const amounts = new Map(); // key -> dollars, in the order first placed
  let history = [];          // [{ key, delta }] for Undo
  let locked = false;

  const info = (key) => {
    const s = spot(key);
    if (!s) return null;
    return { label: s.label ?? key, min: s.min ?? limits.min ?? 0, max: s.max === undefined ? (limits.max ?? null) : s.max };
  };
  const total = () => [...amounts.values()].reduce((t, v) => t + v, 0);
  const set = (key, v) => { if (v > 0) amounts.set(key, v); else amounts.delete(key); };

  const self = {
    get locked() { return locked; },
    /** Lock while the round plays (committed chips can't be moved); unlock for the next bet. */
    lock(on = true) { locked = on; },
    total,
    amount: (key) => amounts.get(key) ?? 0,
    amounts: () => Object.fromEntries(amounts),
    /** The staged layout for Rebet: [{ spot, amount }] in the order placed. */
    layout: () => [...amounts].map(([s, amount]) => ({ spot: s, amount })),
    get empty() { return amounts.size === 0; },

    place(key, chip) {
      if (locked) return { ok: false, error: 'Bets are closed until this round is over.' };
      const s = info(key);
      if (!s) return { ok: false, error: 'You can\'t bet there now.' };
      if (!Number.isSafeInteger(chip) || chip <= 0) return { ok: false, error: 'Pick a chip first.' };
      const now = self.amount(key);
      if (s.max != null && now + chip > s.max) return { ok: false, error: `Table max is ${usd(s.max)} on ${s.label}.` };
      if (total() + chip > available()) return { ok: false, error: `Not enough in the bank for another ${usd(chip)} chip.` };
      set(key, now + chip);
      history.push({ key, delta: chip });
      return { ok: true, amount: now + chip };
    },

    remove(key, chip) {
      if (locked) return { ok: false, error: 'Bets are closed until this round is over.' };
      const now = self.amount(key);
      if (!now) return { ok: false, error: '' };
      const take = Math.min(now, chip > 0 ? chip : now);
      set(key, now - take);
      history.push({ key, delta: -take });
      return { ok: true, amount: now - take };
    },

    /** Take back the last placement (or put back the last removal). */
    undo() {
      if (locked) return null;
      const h = history.pop();
      if (!h) return null;
      set(h.key, self.amount(h.key) - h.delta);
      return h;
    },

    clear() { if (locked) return false; amounts.clear(); history = []; return true; },

    /** Replace everything (a game restoring a layout); no checks. */
    set(obj) { amounts.clear(); history = []; for (const [k, v] of Object.entries(obj)) set(k, v); },

    /** The first problem before committing: a spot under its minimum, or the game's own rule. */
    check() {
      if (validate) { const e = validate(self.amounts()); if (e) return typeof e === 'string' ? { error: e } : e; }
      for (const [key, v] of amounts) {
        const s = info(key);
        if (s && v < s.min) return { key, min: s.min, label: s.label, error: `Your bet on ${s.label} doesn't cover the ${usd(s.min)} minimum.` };
      }
      return null;
    },

    /**
     * Put a saved layout back (times 2 = doubled), as much as the bank and the limits allow, in
     * the order it was placed. Returns { placed (dollars), short (true if not all of it fitted) }.
     */
    rebet(saved, times = 1) {
      if (locked || !Array.isArray(saved)) return { placed: 0, short: false };
      self.clear();
      let placed = 0, short = false;
      for (const { spot: key, amount } of saved) {
        const s = info(key);
        const want = amount * times;
        if (!s || !Number.isSafeInteger(want) || want <= 0) { short = true; continue; }
        const room = Math.min(available() - total(), s.max == null ? Infinity : s.max);
        const put = Math.max(0, Math.min(want, room));
        if (put < want) short = true;
        if (put > 0) { set(key, put); placed += put; }
      }
      history = [];
      return { placed, short };
    },
  };
  return self;
}
