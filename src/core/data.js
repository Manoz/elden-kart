// Static game data shared by all modules. Do not put logic here.

export const CHARACTERS = [
  {
    id: 'tarnished',
    name: 'The Tarnished',
    title: 'Maidenless',
    color: 0xc9a227,
    accent: 0x2b2b2b,
    stats: { speed: 3, accel: 3, handling: 3, weight: 3 },
  },
  {
    id: 'ranni',
    name: 'Ranni',
    title: 'The Witch',
    color: 0x3f6fd1,
    accent: 0xbfe3ff,
    stats: { speed: 3, accel: 4, handling: 4, weight: 1 },
  },
  {
    id: 'malenia',
    name: 'Malenia',
    title: 'Blade of Miquella',
    color: 0xb3261e,
    accent: 0xf1d38a,
    stats: { speed: 5, accel: 2, handling: 3, weight: 2 },
  },
  {
    id: 'radahn',
    name: 'Radahn',
    title: 'Starscourge',
    color: 0x7a4b1e,
    accent: 0xff8a2a,
    stats: { speed: 4, accel: 1, handling: 1, weight: 5 },
  },
  {
    id: 'melina',
    name: 'Melina',
    title: 'Kindling Maiden',
    color: 0xd97b29,
    accent: 0x4a2a12,
    stats: { speed: 2, accel: 4, handling: 4, weight: 2 },
  },
  {
    id: 'blaidd',
    name: 'Blaidd',
    title: 'The Half-Wolf',
    color: 0x6b7b8c,
    accent: 0xe6e6e6,
    stats: { speed: 4, accel: 3, handling: 2, weight: 4 },
  },
  {
    id: 'patches',
    name: 'Patches',
    title: 'The Untethered',
    color: 0x4c7a34,
    accent: 0xe2c275,
    stats: { speed: 2, accel: 5, handling: 4, weight: 1 },
  },
  {
    id: 'godrick',
    name: 'Godrick',
    title: 'The Grafted',
    color: 0x8c2f6b,
    accent: 0xd4af37,
    stats: { speed: 3, accel: 2, handling: 2, weight: 5 },
  },
];

export const TRACKS = [
  {
    id: 'limgrave',
    name: 'Limgrave Circuit',
    subtitle: 'Where grace first guides you',
    laps: 3,
    music: 'limgrave',
  },
  {
    id: 'caelid',
    name: 'Scarlet Rot Speedway',
    subtitle: 'The red sky burns',
    laps: 3,
    music: 'caelid',
  },
  {
    id: 'leyndell',
    name: 'Leyndell Royal Run',
    subtitle: 'Ascend to the Erdtree',
    laps: 3,
    music: 'leyndell',
  },
  {
    id: 'haligtree',
    name: 'Haligtree Descent',
    subtitle: 'Petals of the last tree',
    laps: 3,
    music: 'haligtree',
  },
];

// Item ids. Rarity/weights per race position are owned by src/items/ItemSystem.js.
export const ITEMS = {
  CRIMSON_FLASK: 'crimson_flask', // instant short boost (mushroom)
  GOLDEN_RUNE: 'golden_rune', // 3 boosts in a row (triple mushroom)
  ROT_POT: 'rot_pot', // dropped hazard behind (banana); leaves poison puddle
  FIRE_POT: 'fire_pot', // thrown forward, bounces, explodes (green shell)
  GLINTSTONE_MISSILE: 'glintstone_missile', // homing on the kart ahead (red shell)
  BLACK_KNIFE: 'black_knife', // lethal homing to 1st place (blue shell)
  ERDTREE_BLESSING: 'erdtree_blessing', // invincible + speed (star)
  BLOODHOUND_STEP: 'bloodhound_step', // brief phase-dash, invincible + big burst
  STONESWORD_KEY: 'stonesword_key', // shield orbiting the kart, blocks one hit
  TORRENT_CALL: 'torrent_call', // long speed boost with ghost horse trail (bullet bill)
};

// Engine classes, Mario Kart style. speed scales every kart's top speed; ai is the [min, max] AI skill range.
export const CLASSES = [
  {
    id: '100cc',
    label: '100cc',
    rank: 'Tarnished',
    pips: 1,
    desc: 'Gentle rivals. Learn the roads of the Lands Between.',
    speed: 0.86,
    ai: [0.3, 0.6],
  },
  {
    id: '150cc',
    label: '150cc',
    rank: 'Lord',
    pips: 2,
    desc: 'The classic trial. Fair duels and fast laps.',
    speed: 1,
    ai: [0.62, 0.92],
  },
  {
    id: '200cc',
    label: '200cc',
    rank: 'Elden Lord',
    pips: 3,
    desc: 'Merciless demigods. Brake, or be broken.',
    speed: 1.17,
    ai: [0.85, 1],
  },
];

// Grand Prix points by finishing place (8 racers).
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
