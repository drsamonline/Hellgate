// ---------------------------------------------------------------------------
// DIALOGUE — the story, written down.
//
// The plot used to live on wall terminals, which a player could walk past. This
// is the alternative: lines with a speaker, letterboxed over the game, typed out
// one at a time, advanced by a click and skipped by a key.
//
// The scenes are data. A level row from `story-levels.js` asks for
// `<level-id>-intro`; if there is no scene written for that level, the act's own
// scene plays instead, and if that is missing too there is no dialogue at all —
// never an empty letterbox.
//
// Nothing here touches game state. It is a caption and a clock.
// ---------------------------------------------------------------------------

/** Characters a second while a line types out. Fast enough to read at once. */
export const TYPE_SPEED = 52;

/** Seconds a finished line waits before it advances itself. */
export const BEAT = 2.1;

/**
 * The written scenes: id → the lines, in order.
 *
 * `who` is the speaker shown above the line; `text` is what they say.
 */
export const SCENES = {
  // ---- act I -------------------------------------------------------------
  'act1-intro': [
    { who: 'KESSLER', text: 'You are through. That is the whole of the good news.' },
    { who: 'KESSLER', text: 'The gate does not open twice. Whatever is on this side, we finish it here.' },
  ],
  'act1-outro': [
    { who: 'KESSLER', text: 'One room. Then another. That is how a place gets taken back.' },
  ],
  'the-door-intro': [
    { who: 'KESSLER', text: 'The far side of the yard. Walk it. Do not stop to count them.' },
    { who: 'VESNA', text: 'I have the door from here. It is already open. It has been open a while.' },
  ],
  'the-door-outro': [
    { who: 'VESNA', text: 'You crossed. Good. The next one is warmer and it has company.' },
  ],
  'broken-idols-intro': [
    { who: 'VESNA', text: 'Three of them are holding this floor together. Break all three and the door lets go.' },
    { who: 'KESSLER', text: 'They are stone, sergeant. Stone does not argue with a shotgun.' },
  ],
  'broken-idols-outro': [
    { who: 'VESNA', text: 'That is the floor released. Do not ask me what it was holding up.' },
  ],
  'the-shift-intro': [
    { who: 'VESNA', text: 'The door on the foundry line runs on a timer. Sixty seconds. Stay alive for them.' },
  ],
  'the-shift-outro': [
    { who: 'KESSLER', text: 'Sixty seconds is a long time when it is being spent on you.' },
  ],

  // ---- act II ------------------------------------------------------------
  'act2-intro': [
    { who: 'VESNA', text: 'Past the gate the air changes. Keep the mask on and keep moving.' },
  ],
  'act2-outro': [
    { who: 'VESNA', text: 'Two relics down the road. I would rather you found them than it did.' },
  ],
  // ---- the four bosses, and what each says on the way down ----------------
  // keyed by the LEVEL's id, not by the boss: a level with its own outro never
  // falls through to an act scene, so `the-cinder-outro` would never have fired
  'the-warden-outro': [
    { who: 'THE WARDEN', text: 'Eight rooms. That is how far a man gets on stubbornness.' },
    { who: 'KESSLER', text: 'It is not the last of them. It is the first of them.' },
  ],

  'the-first-relic-intro': [
    { who: 'VESNA', text: 'Four relics. This is the first place they were ever kept.' },
    { who: 'KESSLER', text: 'And the last thing that guarded them is still in here. Break them anyway.' },
  ],
  'the-first-relic-outro': [
    { who: 'THE CINDER', text: 'Everything down here was fired in me. You are standing in the kiln.' },
    { who: 'VESNA', text: 'The heat is going out of the walls. One of the two relics is yours; the other is deeper.' },
  ],
  'the-second-relic-outro': [
    { who: 'VESNA', text: 'That is both. Whatever it was keeping shut is open now, and it knows you did it.' },
    { who: 'THE GATE', text: 'Bring them up here. I would like to see you carry them.' },
  ],
  'the-throne-outro': [
    { who: 'THE GATE', text: 'I was the door. Not the reason for it.' },
    { who: 'VESNA', text: 'It is quiet. Not dead-quiet. Finished-quiet.' },
    { who: 'KESSLER', text: 'Then we walk out the way we came, and we do not look at the relics.' },
  ],

  // ---- act III -----------------------------------------------------------
  'the-hinge-outro': [
    { who: 'THE SPINE', text: 'The roof was mine to hold. See what it does without me.' },
    { who: 'VESNA', text: 'It did not fall. That is worse than if it had.' },
  ],
  'act3-intro': [
    { who: 'KESSLER', text: 'The spine holds the roof up. Everything above this is the same building.' },
  ],
  'act3-outro': [
    { who: 'VESNA', text: 'Higher. It gets quieter up there, and that is not a comfort.' },
  ],

  // ---- act IV ------------------------------------------------------------
  'act4-intro': [
    { who: 'VESNA', text: 'This is the throne floor. Whatever has been counting your kills is in here.' },
  ],
  'act4-outro': [
    { who: 'KESSLER', text: 'That is the building. Now we find out what it was for.' },
  ],
  'the-second-relic-intro': [
    { who: 'VESNA', text: 'Five. Break five and the way to the throne is open, and so is everything under it.' },
    { who: 'THE WARDEN', text: 'You are carrying my relics around like a purse.' },
  ],
  'the-throne-intro': [
    { who: 'THE GATE', text: 'You came up the whole building to be told no.' },
    { who: 'KESSLER', text: 'Ignore it. It talks because it is losing.' },
  ],
};

/**
 * The scene for a level, or null when nothing is written for it.
 * @param {object|null} level A row from `STORY_LEVELS`.
 * @param {string} kind `intro` or `outro`.
 * @returns {{who:string,text:string}[]|null} The lines.
 */
export function sceneFor(level, kind) {
  if (!level || !kind) return null;
  const exact = SCENES[level.id + '-' + kind];
  if (exact) return exact;
  const act = SCENES['act' + level.act + '-' + kind];
  return act || null;
}

/**
 * The letterboxed dialogue: a caption, a clock and a typing cursor.
 *
 * It renders into the same elements the boss entrance uses, so there is one
 * letterbox and one place it is styled.
 */
export class Dialogue {
  constructor(els = {}) {
    this.root = els.root || null;
    this.nameEl = els.name || null;
    this.lineEl = els.line || null;
    this.lines = [];
    this.i = 0;
    this.chars = 0;
    this.holdT = 0;
    this.playing = false;
    this.onDone = null;
  }

  /**
   * Start a scene.
   * @param {{who:string,text:string}[]} lines The lines, from `sceneFor`.
   * @param {object} [opts] `onDone` when the last line has gone.
   * @returns {boolean} True when there was something to play.
   */
  play(lines, opts = {}) {
    if (!lines || !lines.length) {
      if (opts.onDone) opts.onDone();
      return false;
    }
    this.lines = lines;
    this.i = 0;
    this.chars = 0;
    this.holdT = 0;
    this.playing = true;
    this.onDone = opts.onDone || null;
    if (this.root) {
      this.root.classList.add('on');
      this.root.classList.add('talking');
      this.root.style.opacity = '1';
      this.root.style.setProperty('--bar', '18%');
    }
    this.render();
    return true;
  }

  /** Show the line being typed, as far as it has got. */
  render() {
    const line = this.lines[this.i];
    if (!line) return;
    if (this.nameEl) this.nameEl.textContent = line.who || '';
    if (this.lineEl) this.lineEl.textContent = line.text.slice(0, Math.floor(this.chars));
  }

  /** A click or a key: finish the line, or move to the next one. */
  advance() {
    if (!this.playing) return;
    const line = this.lines[this.i];
    if (!line) { this.finish(); return; }
    if (this.chars < line.text.length) {
      this.chars = line.text.length;
      this.render();
      this.holdT = 0;
      return;
    }
    this.i++;
    this.chars = 0;
    this.holdT = 0;
    if (this.i >= this.lines.length) { this.finish(); return; }
    this.render();
  }

  /** Abandon the scene without running its callback, for a level change. */
  stop() {
    this.playing = false;
    this.onDone = null;
    this.lines = [];
    this.i = 0;
    if (this.root) {
      this.root.classList.remove('on');
      this.root.classList.remove('talking');
      this.root.style.opacity = '';
      this.root.style.removeProperty('--bar');
    }
  }

  /** Leave the whole scene at once. */
  skip() {
    if (!this.playing) return;
    this.finish();
  }

  finish() {
    this.playing = false;
    if (this.root) {
      this.root.classList.remove('on');
      this.root.classList.remove('talking');
      this.root.style.opacity = '';
      this.root.style.removeProperty('--bar');
    }
    const fn = this.onDone;
    this.onDone = null;
    if (fn) fn();
  }

  /**
   * Advance the typing and, once a line is fully out, hold it for a beat and
   * move on by itself. A cutscene the player has to click through 32 times is a
   * reading test, not a story.
   * @param {number} dt Seconds.
   */
  update(dt) {
    if (!this.playing) return;
    const line = this.lines[this.i];
    if (!line) { this.finish(); return; }
    if (this.chars < line.text.length) {
      this.chars = Math.min(line.text.length, this.chars + TYPE_SPEED * dt);
      this.render();
      return;
    }
    this.holdT += dt;
    if (this.holdT >= BEAT) this.advance();
  }
}
