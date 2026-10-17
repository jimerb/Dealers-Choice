// All custom (non-build) solitaires, keyed by id.
import removal from './removal.js';
import grid from './grid.js';
import misc from './misc.js';
import arcade from './arcade.js';

export const CUSTOM = Object.fromEntries([...removal, ...grid, ...misc, ...arcade].map((m) => [m.id, m]));
