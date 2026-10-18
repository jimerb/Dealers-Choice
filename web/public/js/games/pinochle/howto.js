// How to play Pinochle: one guide per variant (see core/howto.js for the format), plus the meld
// table they share. The dialog opens on the variant being played, with the others folded below it.
import { sectionsHTML, figHTML } from '../../core/howto.js';
import { VARIANTS, VARIANT_IDS } from './engine.js';

const OPTIONS = 'Pick this game or one of the other four ways to play when you deal a <b>New game</b>. Starting a new game ends the one in progress.';
const PLAY_RULES = 'Follow suit and play higher than the winning card if you can (any card of the suit will do once the trick has been trumped). If you can’t follow, play a <b>trump</b>, higher than any trump already in the trick if you can. Otherwise play anything.';
const AUCTION_CONTROLS = 'When it’s your turn to bid, {click} Pass or one of the bid buttons (your own meld in each suit is shown to help). If you win the bid, {click} the suit you want as trump. {Click} Play the hand once you’ve looked over the meld, then {click} a highlighted card to play it. {Click} Deal next hand when the hand is scored.';
const TURNUP_CONTROLS = 'If you hold the dix, {click} Trade or Keep my 9. {Click} Play the hand once you’ve looked over the meld, then {click} a highlighted card to play it. {Click} Deal next hand when the hand is scored.';

export const HOWTO = {
  auction: {
    goal: 'Win the bidding with your partner, then make your bid in <b>meld</b> and <b>counters</b>. The first team to 1,000 wins.',
    deal: 'Four players; your partner sits across from you, against the two players beside you. Each player gets 12 cards from the 48-card deck.',
    play: [
      '<b>Bidding</b> starts left of the dealer at 100 and goes up by 10 or more. Once you pass you’re out of the bidding. If everyone else passes without a bid, the last player is stuck with the bid at 100.',
      'The high bidder names <b>trump</b>. Then every hand’s meld is shown and counted (see <b>Meld values</b> below).',
      `The bidder leads the first trick and the winner of each trick leads the next. ${PLAY_RULES}`,
      'Your team’s meld counts only if your team wins at least one trick.',
    ],
    score: [
      '<b>Counters</b>: each ace, ten and king you take is worth 10, and the last trick is worth 10 more.',
      'If the bidding team’s meld plus counters reaches the bid, both teams score what they made. If not, the bidders are <b>set</b>: they lose the amount of the bid, and the other team still scores its own meld and counters.',
      'The first team to 1,000 wins. If both teams pass 1,000 on the same hand, the bidding team wins.',
    ],
    options: OPTIONS,
    controls: AUCTION_CONTROLS,
    tip: 'Bid on your meld plus a share of the 250 points in the tricks. The meld shown beside each bid is only yours; your partner’s meld comes on top.',
  },
  'two-handed': {
    goal: 'Score 1,000 points from melds and the cards you win in tricks.',
    deal: 'Just you and one opponent, 12 cards each. The next card is turned up for <b>trump</b> and the rest of the deck lies across it as the <b>stock</b>. If the turned card is a 9, the dealer scores 10. The non-dealer leads.',
    play: [
      '<b>While the stock lasts</b> you may play any card; you don’t have to follow suit. A trump, or the higher card of the suit led, wins the trick (of two identical cards, the first one played wins).',
      'The trick winner may lay down <b>one meld</b>. Its cards stay face up in front of them and can still be played later. The winner may also trade the 9 of trump (the <b>dix</b>) for the turned card, or meld it: 10 points either way.',
      'A card can score again only in a different kind of meld, or in a bigger meld of its own kind: a run laid on a royal marriage adds 110, and a double pinochle laid on a pinochle adds 260.',
      'Then the winner draws from the stock, the loser draws, and the winner leads. On the last draw the loser takes the turned card.',
      '<b>The last 12 tricks</b>: melding stops and melded cards go back in hand. Now you must follow suit (beating a trump lead if you can), and play a trump when you can’t follow.',
    ],
    score: [
      'Melds score as soon as they’re laid down.',
      'Cards won in tricks score ace 11, ten 10, king 4, queen 3, jack 2 (nines nothing), and the last trick is worth 10.',
      'The first player to 1,000 at the end of a hand wins. A tie at the top plays another hand.',
    ],
    options: OPTIONS,
    controls: 'While the stock lasts, {click} any card to play it; later only the highlighted cards can be played. When you win a trick, {click} a meld button to lay that meld down (or skip it), then {click} Draw. {Click} Deal next hand when the hand is scored.',
    tip: 'While the stock lasts, win tricks you can meld from and throw cheap cards on the rest. Save your aces and tens for the last 12 tricks, when everyone has to follow suit.',
  },
  'double-pack': {
    goal: 'Partnership Auction with a bigger deck: make your bid in meld and counters, and be the first team to 3,550.',
    deal: 'Four players in two teams, partners across. The deck has 80 cards, four each of A, 10, K, Q and J in every suit (no nines), and each player gets 20.',
    play: [
      '<b>Bidding</b> starts at 500 and goes up by 10 or more. Bidding, naming <b>trump</b>, meld and play otherwise follow the Partnership Auction rules.',
      'There are no nines, so there’s no dix.',
      'Doubled, tripled and quadrupled melds pay far more than single ones (see <b>Meld values</b> below).',
      PLAY_RULES,
      'Your team’s meld counts only if your team wins at least one trick.',
    ],
    score: [
      '<b>Counters</b> (aces, tens and kings) are 10 each and the last trick is worth 20, so 500 points are in the tricks.',
      'Make the bid and both teams score what they made; miss it and the bidders lose the bid.',
      'The first team to 3,550 wins. If both teams pass it on the same hand, the bidding team wins.',
    ],
    options: OPTIONS,
    controls: AUCTION_CONTROLS,
    tip: 'With 20 cards each, meld runs big: double aces alone are 1,000. Count your doubles before you bid.',
  },
  partnership: {
    goal: 'With your partner, score meld and counters every hand. The first team to 1,000 wins.',
    deal: 'Four players; your partner sits across from you. Each gets 12 cards, and the dealer’s last card is turned up for <b>trump</b> (it stays in the dealer’s hand).',
    play: [
      'There’s no bidding. If the turned card is a 9, the dealer scores the <b>dix</b> (10). Otherwise the first player left of the dealer holding the 9 of trump may trade it for the turned card and score 10.',
      'Every hand’s meld is shown and counted (see <b>Meld values</b> below). Then the player left of the dealer leads.',
      PLAY_RULES,
      'Your team’s meld counts only if your team wins at least one trick.',
    ],
    score: [
      'Each team scores its meld (if it took a trick) plus its <b>counters</b>: aces, tens and kings are 10 each, and the last trick is worth 10.',
      'The first team to 1,000 wins. If both teams pass it on the same hand, the higher score wins; a tie plays another hand.',
    ],
    options: OPTIONS,
    controls: TURNUP_CONTROLS,
    tip: 'Without a bid to make, every point counts the same: lead your aces early to cash them, and give your partner’s winning tricks your tens and kings.',
  },
  cutthroat: {
    goal: 'Every player for themselves: score your own meld and counters, and be the first to 1,000.',
    deal: 'Four players, no partners, 12 cards each. The dealer’s last card is turned up for <b>trump</b>.',
    play: [
      'There’s no bidding. The turned-up trump and the <b>dix</b> trade work as in Partnership: a turned 9 gives the dealer 10, otherwise the first player holding the 9 of trump may trade it for the turned card and score 10.',
      'Every hand’s meld is shown and counted (see <b>Meld values</b> below). Then the player left of the dealer leads.',
      PLAY_RULES,
      'Your meld counts only if you win at least one trick yourself.',
    ],
    score: [
      'Each player scores their own meld (if they took a trick) plus the <b>counters</b> they took: aces, tens and kings are 10 each, and the last trick is worth 10.',
      'The first player to 1,000 wins. If two pass it on the same hand, the higher score wins; a tie plays another hand.',
    ],
    options: OPTIONS,
    controls: TURNUP_CONTROLS,
    tip: 'Nobody is on your side, so don’t drop counters on a trick unless you’re sure to win it.',
  },
};

/** The meld table, shared by every variant (drawn when shown, so the cards follow the chosen card style). */
const meldHTML = () => `<section class="howto-section"><h3>Meld values</h3>
  <p>The deck has two each of A, 10, K, Q, J and 9 in every suit. Cards rank A 10 K Q J 9.</p>
  <ul>
    <li><b>Run</b> (A 10 K Q J of trump): 150. Its king and queen don’t also count as a royal marriage.</li>
    <li><b>Royal marriage</b> (K Q of trump): 40 · <b>marriage</b> (K Q of another suit): 20</li>
    <li><b>Pinochle</b> (J♦ and Q♠): 40 · <b>double pinochle</b>: 300</li>
    <li><b>Dix</b> (9 of trump): 10 each</li>
    <li><b>Around</b> (one of a rank in every suit): aces 100, kings 80, queens 60, jacks 40</li>
    <li><b>Double-Pack</b>: a double meld scores 10 times the single one, a triple 15 times and a quadruple 20 times; pinochles go 40, 300, 600, 900.</li>
  </ul>
  ${figHTML({ cards: 'JD QS', caption: 'A pinochle: the J♦ and Q♠, worth 40.' })}
</section>`;

/** The body of the Pinochle How to play dialog: the variant being played first and open, then the rest. */
export function pinochleHowtoHTML(current) {
  const order = [current, ...VARIANT_IDS.filter((id) => id !== current)];
  return order.map((id) => `<details class="howto-variant" data-v="${id}"${id === current ? ' open' : ''}>
    <summary>${VARIANTS[id].name}${id === current ? ' <small>playing now</small>' : ''}</summary>${sectionsHTML(HOWTO[id])}</details>`).join('') + meldHTML();
}
