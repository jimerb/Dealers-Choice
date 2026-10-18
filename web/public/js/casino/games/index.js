// Every casino game module, by id (ids match js/casino/catalog.js).
import blackjack from './blackjack.js';
import roulette from './roulette.js';
import craps from './craps.js';
import baccarat from './baccarat.js';
import threeCardPoker from './three-card-poker.js';
import letItRide from './let-it-ride.js';
import caribbeanStud from './caribbean-stud.js';
import paiGowPoker from './pai-gow-poker.js';
import videoPoker from './video-poker.js';
import slots from './slots.js';
import keno from './keno.js';

export const MODULES = Object.fromEntries([blackjack, roulette, craps, baccarat, threeCardPoker, letItRide, caribbeanStud, paiGowPoker, videoPoker, slots, keno].map((m) => [m.id, m]));
