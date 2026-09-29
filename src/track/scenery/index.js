import { buildLimgrave } from './limgrave.js';
import { buildCaelid } from './caelid.js';
import { buildLeyndell } from './leyndell.js';
import { buildHaligtree } from './haligtree.js';

export const SCENERY = {
  limgrave: buildLimgrave,
  caelid: buildCaelid,
  leyndell: buildLeyndell,
  haligtree: buildHaligtree,
};
