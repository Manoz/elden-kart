import { Track } from './Track.js';
import { LAYOUTS } from './layouts/index.js';
import { SCENERY } from './scenery/index.js';

export function createTrack(id, scene) {
  const layout = LAYOUTS[id];
  if (!layout) throw new Error(`Unknown track "${id}"`);
  return new Track(layout, scene, SCENERY[id]);
}
