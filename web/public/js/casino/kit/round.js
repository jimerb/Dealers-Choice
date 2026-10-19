// The money side of a round, shared by every game (no DOM). The rule (one for all games):
//   - a bet is taken from the bank when it is committed (Deal, Spin, Roll, Double, Split ...);
//   - when the round is decided, the hand is recorded and everything won is paid at once, before any
//     animation, so leaving or reloading during a reveal never loses a payout;
//   - leaving mid-round hands back the bets the rules would let you take down (craps place bets,
//     odds ...) and forfeits the rest.
//
//   const round = createRound(bank, 'blackjack');
//   round.wager(10)                    -> true (debited) or false (the bank can't cover it)
//   round.wager(10, { returnable: true })   a bet you may take down, handed back if you leave
//   round.refund(10)                   a bet taken down: back to the bank, off the wagered total
//   round.settle({ returned: 25 })     records the hand (net = 25 - wagered) and pays 25
//   round.apply(stepResult)            an engine step's cash events and `done`, in one go (see GAMES.md)
//   round.leave()                      returnable bets back, the rest forfeited; -> { back, lost }
//
// Machines play on credits instead: createMachine(bank, game, denom) (see below).

const whole = (n) => Number.isSafeInteger(n) && n >= 0;

export function createRound(bank, game) {
  let onTable = 0;     // dollars debited and not yet settled
  let returnable = 0;  // of those, what leaving would hand back
  let paid = 0;        // paid out before the round settled (counts toward this round's net)

  const self = {
    get onTable() { return onTable; },
    get returnable() { return returnable; },
    /** What leaving now would cost: the bets on the table that can't be taken down. */
    get atRisk() { return onTable - returnable; },
    get game() { return game; },

    /** Take a committed bet from the bank. False (nothing changes) if the bank can't cover it. */
    wager(n, { returnable: canTakeDown = false } = {}) {
      if (!whole(n) || n === 0) return n === 0;
      if (!bank.debit(n, { game })) return false;
      onTable += n;
      if (canTakeDown) returnable += n;
      return true;
    },

    /** Hand back a bet taken down (Let It Ride pull back, a craps take-down). */
    refund(n) {
      n = Math.min(n, onTable);
      if (!whole(n) || n === 0) return 0;
      bank.credit(n, { game, refund: true });
      onTable -= n;
      returnable = Math.min(returnable, onTable);
      return n;
    },

    /** How much of what is on the table leaving would hand back (the game keeps this up to date). */
    setReturnable(n) { returnable = Math.max(0, Math.min(onTable, Math.floor(n) || 0)); },

    /** Pay something before the round ends (e.g. an insurance win); counted in the round's net. */
    pay(n) {
      if (!whole(n) || n === 0) return 0;
      bank.credit(n, { game });
      paid += n;
      return n;
    },

    /**
     * The round is decided: record the hand and pay `returned` (stakes plus winnings) at once.
     * `wagered` is the part of the table that this result settles (default: all of it; craps
     * settles only the bets the roll decided; pass `returnable` too, for what is left).
     * Returns { wagered, returned, net }.
     */
    settle({ returned = 0, wagered = onTable, returnable: left } = {}) {
      wagered = Math.max(0, Math.min(wagered, onTable));
      if (!whole(returned)) throw new RangeError(`settle: ${returned} is not a whole number of dollars`);
      const net = returned + paid - wagered;
      // the hand is recorded before the payout: a payout that reaches the Hall of Fame clears the stats
      bank.recordHand(game, net);
      if (returned) bank.credit(returned, { game });
      onTable -= wagered;
      returnable = Math.min(left ?? returnable, onTable);
      paid = 0;
      return { wagered, returned, net };
    },

    /**
     * Apply an engine step's money in order. result.cash is a list of
     *   { kind: 'stake' | 'vig', amount, returnable? }  taken from the bank
     *   { kind: 'refund', amount }                       a bet taken back
     *   { kind: 'pay', amount }                          paid (with `done`: at settlement)
     * result.done = { wagered?, won? } settles the round; result.returnable (dollars) updates what
     * leaving would hand back. Every debit is checked first: if the bank can't cover them all,
     * nothing happens and { ok: false, error } comes back (keep the old state).
     */
    apply(result) {
      const cash = result?.cash ?? [];
      const debits = cash.filter((e) => e.kind === 'stake' || e.kind === 'vig').reduce((t, e) => t + e.amount, 0);
      if (debits > bank.balance) return { ok: false, error: 'The bank can\'t cover that bet.' };
      let pays = 0;
      for (const e of cash) {
        if (e.kind === 'stake' || e.kind === 'vig') self.wager(e.amount, { returnable: Boolean(e.returnable) });
        else if (e.kind === 'refund') self.refund(e.amount);
        else if (e.kind === 'pay') pays += e.amount;
      }
      let settled = null;
      if (result?.done) settled = self.settle({ returned: result.done.won ?? pays, wagered: result.done.wagered ?? onTable });
      else if (pays) self.pay(pays);
      if (Number.isFinite(result?.returnable)) self.setReturnable(result.returnable);
      return { ok: true, settled };
    },

    /** Leaving mid-round: hand back what may be taken down, forfeit the rest (counted as one lost hand). */
    leave() {
      const back = returnable, lost = onTable - returnable;
      if (back) bank.credit(back, { game, refund: true });
      if (lost) bank.recordHand(game, -lost);
      onTable = 0; returnable = 0; paid = 0;
      return { back, lost };
    },
  };
  return self;
}

/**
 * A machine's credit meter (Video Poker, Slots). Credits are bought from the bank with insert(),
 * bets come off the meter and wins go onto it with no bank change, and cashOut() pays the meter
 * back into the bank (which is when loans are repaid and tiers go up). Stats are kept in dollars.
 *
 *   const m = createMachine(bank, 'slots', 5);
 *   m.insert(100)       -> { ok, credits }   ($100 buys 20 credits of $5)
 *   m.bet(3)            -> true, or false if the meter is short (or another window cashed it out)
 *   m.pay(30)           -> records the round (bet 3, won 30 credits, in dollars) and adds 30 credits
 *   m.cashOut()         -> { credits, dollars }
 */
export function createMachine(bank, game, denom) {
  let betting = 0; // credits bet on a round that hasn't been paid yet (a dealt video poker hand)
  const mine = () => { const m = bank.machine; return m && m.game === game && m.denom === denom ? m : null; };
  return {
    denom,
    get credits() { return mine()?.credits ?? 0; },
    /** True when the bank's machine is this one. */
    get held() { return Boolean(mine()); },
    /** Another game (or denomination) holds credits: cash it out before this machine can take bills. */
    get blocked() { const m = bank.machine; return Boolean(m && !mine()); },
    get betting() { return betting; },
    /** Dollars at risk if the player leaves now (a dealt, undrawn hand). */
    get atRisk() { return betting * denom; },
    insert(dollars) { return bank.machineIn(game, denom, dollars); },
    bet(credits) {
      if (!Number.isSafeInteger(credits) || credits <= 0) return false;
      if (!bank.machineAdjust(game, -credits)) return false;
      betting += credits;
      return true;
    },
    /** The round is decided: `won` credits go onto the meter and the round is recorded. */
    pay(won = 0) {
      const bet = betting;
      betting = 0;
      if (won > 0) bank.machineAdjust(game, won);
      bank.recordRound(game, { wagered: bet * denom, won: won * denom });
      return { bet, won, net: won - bet };
    },
    /** Leaving with a hand dealt: the bet is lost (recorded as a lost round). */
    leave() {
      const lost = betting;
      if (lost) { betting = 0; bank.recordRound(game, { wagered: lost * denom, won: 0 }); }
      return { lost: lost * denom };
    },
    cashOut() {
      if (!mine()) return { credits: 0, dollars: 0 };
      const r = bank.machineOut();
      return { credits: r.credits, dollars: r.dollars };
    },
  };
}
