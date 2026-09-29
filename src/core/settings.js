// Player settings persisted in localStorage. Storage may be unavailable (private mode), so every access is guarded.
const KEY = 'elden-kart:settings';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 1, postfx: false, shadows: false, msaa: 0 },
  medium: { label: 'Medium', pixelRatio: 1.5, postfx: true, shadows: true, msaa: 0 },
  high: { label: 'High', pixelRatio: 2, postfx: true, shadows: true, msaa: 4 },
};

export const DEFAULT_SETTINGS = { master: 0.8, music: 0.75, sfx: 0.9, quality: 'high' };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS, ...raw };
    if (!QUALITY[s.quality]) s.quality = DEFAULT_SETTINGS.quality;
    for (const k of ['master', 'music', 'sfx']) s[k] = Math.max(0, Math.min(1, Number(s[k]) || 0));
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings stay for this session only
  }
}
