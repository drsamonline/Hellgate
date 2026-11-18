// ---------------------------------------------------------------------------
// SETTINGS — the handful of numbers a player actually wants to change, kept in
// localStorage next to the best run. Roadmap item 1.
// ---------------------------------------------------------------------------

const KEY = 'hellgate.settings';

export const DEFAULTS = {
  sensitivity: 1.0,     // multiplier on the base look speed
  fov: 76,              // degrees
  reducedMotion: false, // kills screen shake and weapon bob
  volume: 0.32,         // 0..1 master gain
  muted: false,
  difficulty: 'normal', // easy | normal | hard
  classId: 'marine',    // marine | ranger | warden
};

export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) || {};
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof s[k] === typeof DEFAULTS[k]) out[k] = s[k];
    }
    return clampSettings(out);
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* private mode: settings just do not persist */ }
}

export function clampSettings(s) {
  s.sensitivity = Math.min(3, Math.max(0.2, Number(s.sensitivity) || DEFAULTS.sensitivity));
  s.fov = Math.min(100, Math.max(65, Number(s.fov) || DEFAULTS.fov));
  s.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
  s.muted = !!s.muted;
  s.reducedMotion = !!s.reducedMotion;
  if (!DIFFICULTIES.includes(s.difficulty)) s.difficulty = 'normal';
  return s;
}
