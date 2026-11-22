// ---------------------------------------------------------------------------
// SETTINGS — the handful of numbers a player actually wants to change, kept in
// localStorage next to the best run. Roadmap item 1.
// ---------------------------------------------------------------------------

const KEY = 'hellgate.settings';

/**
 * Default settings, and the shape every stored setting is validated against.
 */
export const DEFAULTS = {
  sensitivity: 1.0,     // multiplier on the base look speed
  fov: 76,              // degrees
  reducedMotion: false, // kills screen shake and weapon bob
  volume: 0.32,         // 0..1 master gain
  muted: false,
  difficulty: 'normal', // easy | normal | hard
  classId: 'marine',    // marine | ranger | warden
  quality: 'balanced',  // performance | balanced | pretty — performance drops bloom
};

/**
 * The three difficulty presets.
 */
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

/** The class ids, kept here so a stored setting can be validated against them. */
export const CLASS_IDS = ['marine', 'ranger', 'warden'];

/**
 * Read settings from localStorage, falling back to the default for any key that is missing or the wrong type.
 */
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

/**
 * Persist settings. Silently does nothing in private mode.
 */
export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* private mode: settings just do not persist */ }
}

/**
 * Clamp every setting into its legal range. Called on read and on write.
 */
export function clampSettings(s) {
  s.sensitivity = Math.min(3, Math.max(0.2, Number(s.sensitivity) || DEFAULTS.sensitivity));
  s.fov = Math.min(100, Math.max(65, Number(s.fov) || DEFAULTS.fov));
  s.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
  s.muted = !!s.muted;
  s.reducedMotion = !!s.reducedMotion;
  s.quality = ['performance', 'balanced', 'pretty'].includes(s.quality) ? s.quality : 'balanced';
  if (!DIFFICULTIES.includes(s.difficulty)) s.difficulty = 'normal';
  // every other field is validated here; classId was not, so a stale or edited
  // setting carried a name no class has into the run. getClass() falls back, but
  // the setting itself should never hold a value the game cannot use.
  s.classId = CLASS_IDS.includes(s.classId) ? s.classId : DEFAULTS.classId;
  return s;
}
