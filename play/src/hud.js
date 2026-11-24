// ---------------------------------------------------------------------------
// HUD — DOM overlay: face indicator, counters, crosshair, hit marker,
// damage vignette, directional damage arrows, toasts.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _v3 = new THREE.Vector3();

/**
 * The DOM overlay: counters, face, crosshair, compass, energy and power slots, boss bar, prompts, toasts.
 */
export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.face = document.getElementById('face');
    this.fctx = this.face.getContext('2d');
    this.elHealth = document.getElementById('health');
    this.elArmor = document.getElementById('armor');
    this.elAmmo = document.getElementById('ammo');
    this.elWeapon = document.getElementById('weapon');
    this.elWave = document.getElementById('wave');
    this.elKills = document.getElementById('kills');
    this.elEnemies = document.getElementById('enemies');
    this.elScore = document.getElementById('score');
    this.elEnergy = document.getElementById('energy');
    this.elSlots = document.getElementById('powerSlots');
    this.elRelics = document.getElementById('relics');
    this.elBoss = document.getElementById('bossbar');
    this.elBossFill = document.getElementById('bossfill');
    this.elBossName = document.getElementById('bossname');
    this.elPrompt = document.getElementById('prompt');
    this.elFeed = document.getElementById('killfeed');
    this.elStamina = document.getElementById('stamina');
    this.elGrenades = document.getElementById('grenades');
    this.elExitState = document.getElementById('exitstate');
    this.elObjective = document.getElementById('objective');
    this.elWaypoint = document.getElementById('waypoint');
    this.staminaBar = this.elStamina ? this.elStamina.firstElementChild : null;
    this.damageNumbers = true;
    this.elBuffs = document.getElementById('buffs');
    this.promptText = '';
    this.slotSig = '';
    this.slotEls = [];
    this.elKey = document.getElementById('keycard');
    this.keyHeld = null;
    this.crosshair = document.getElementById('crosshair');
    this.hitEl = document.getElementById('hitmarker');
    this.dmgWrap = document.getElementById('dmgnums');
    // A small pool of number elements: a DOM node per hit would be a garbage
    // problem in a game that fires ten times a second.
    this.dmgPool = [];
    this.dmgCursor = 0;
    this.vignette = document.getElementById('vignette');
    this.dmgLayer = document.getElementById('dmgdir');
    this.toastEl = document.getElementById('toast');
    this.compass = document.getElementById('compass');

    this.lastFaceHp = -1;
    this.lastHealth = -1;
    this.lastArmor = -1;
    this.lastAmmo = -1;
    this.lastWeapon = '';
    this.vig = 0;
    this.hitT = 0;
    this.toastT = 0;
    this.drawFace(100);
  }

  /** One line in the corner: who died, and to what. */
  feed(what, how) {
    if (!this.elFeed) return;
    const row = document.createElement('div');
    row.className = 'feedrow';
    // both are internal strings, but an innerHTML that trusts its caller is the
    // habit that produces the bug later
    const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    row.innerHTML = `<b>${esc(what)}</b><i>${esc(how)}</i>`;
    // prepend, with an append fallback: the test DOM has no prepend
    if (this.elFeed.prepend) this.elFeed.prepend(row);
    else this.elFeed.appendChild(row);
    while (this.elFeed.children.length > 5) {
      const last = this.elFeed.lastChild;
      if (!last) break;
      this.elFeed.removeChild(last);
    }
    setTimeout(() => row.classList.add('fade'), 3200);
    setTimeout(() => row.remove(), 4200);
  }

  setPrompt(text) {
    if (!this.elPrompt) return;
    if (text === this.promptText) return;
    this.promptText = text;
    this.elPrompt.textContent = text;
    this.elPrompt.classList.toggle('on', !!text);
  }

  setVisible(on) {
    this.root.classList.toggle('on', !!on);
  }

  update(dt, player, weapons, state) {
    const hp = Math.ceil(player.health);
    if (hp !== this.lastHealth) {
      this.elHealth.textContent = hp;
      this.lastHealth = hp;
      this.drawFace(hp);
      this.elHealth.classList.toggle('low', hp <= 30);
    }
    const ar = Math.ceil(player.armor);
    if (ar !== this.lastArmor) {
      this.elArmor.textContent = ar;
      this.lastArmor = ar;
    }
    const ammo = weapons.ammoFor(player);
    if (ammo !== this.lastAmmo) {
      this.elAmmo.textContent = ammo;
      this.lastAmmo = ammo;
    }
    const wname = weapons.weapon.name;
    if (wname !== this.lastWeapon) {
      this.elWeapon.textContent = wname;
      this.lastWeapon = wname;
    }
    // ---- objective -------------------------------------------------------
    // The one line that answers "what am I supposed to be doing". It changes
    // with the wave, and it is the reason the gate never opens for a player who
    // is standing in front of it without the keycard.
    if (this.elObjective && state) {
      let text = '';
      let tone = '';
      if (state.exitOpen) {
        text = 'REACH THE EXIT';
        tone = 'go';
      } else if (state.objectiveType === 'survive') {
        // the clock is the objective: a number that does not move is a lie
        const t = Math.max(0, Math.ceil(state.objectiveT || 0));
        text = 'SURVIVE \u00b7 ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
        tone = t <= 10 ? 'warn' : '';
      } else if (state.objectiveType === 'relics') {
        const left = Math.max(0, (state.relicsTotal || 0) - (state.relics || 0));
        text = 'BREAK THE RELICS \u00b7 ' + left + ' LEFT';
        tone = 'warn';
      } else if (state.enemies > 0) {
        text = 'CLEAR THE WAVE \u00b7 ' + state.enemies + ' LEFT';
      } else if (state.wave >= 3 && !state.hasKey) {
        text = 'FIND THE KEYCARD';
        tone = 'warn';
      } else {
        text = 'THE EXIT IS OPEN';
        tone = 'go';
      }
      if (this.objectiveText !== text) {
        this.objectiveText = text;
        this.elObjective.textContent = text;
      }
      // the boss bar owns the strip above the objective
      this.elObjective.className = tone + (state.boss ? ' bossed' : '');
    }

    // ---- grenades --------------------------------------------------------
    if (this.elGrenades && state && state.player) {
      const n = state.player.grenades || 0;
      this.elGrenades.textContent = '\u25cf '.repeat(Math.min(5, n)) + (n > 5 ? '+' + (n - 5) : '');
      this.elGrenades.classList.toggle('empty', n === 0);
    }

    // ---- stamina ---------------------------------------------------------
    if (this.elStamina && this.staminaBar && state && state.player) {
      const v = Math.max(0, Math.min(1, state.player.stamina));
      const show = v < 0.995;
      this.elStamina.classList.toggle('on', show);
      this.elStamina.classList.toggle('spent', v < 0.25);
      this.staminaBar.style.transform = 'scaleX(' + v.toFixed(3) + ')';
    }

    // ---- timed buffs -----------------------------------------------------
    if (this.elBuffs && state && state.buffs) {
      const parts = [];
      if (state.buffs.damage > 0) parts.push(`<span class="buff dmg">DMG ${Math.ceil(state.buffs.damage)}s</span>`);
      if (state.buffs.speed > 0) parts.push(`<span class="buff spd">SPD ${Math.ceil(state.buffs.speed)}s</span>`);
      this.elBuffs.innerHTML = parts.join('');
    }

    // ---- boss bar --------------------------------------------------------
    if (this.elBoss) {
      const boss = state && state.boss;
      if (boss) {
        this.elBoss.classList.add('on');
        const roman = ['', 'I', 'II', 'III'][boss.phase || 1] || '';
        this.elBossName.textContent = (boss.T.label || 'BOSS') + (boss.phase > 1 ? '  ·  ' + roman : '');
        this.elBossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1) + '%';
      } else {
        this.elBoss.classList.remove('on');
      }
    }

    // ---- powers: energy bar and three slots ------------------------------
    if (state && state.powers) {
      const pw = state.powers;
      if (this.elEnergy) this.elEnergy.style.width = ((pw.energy / pw.maxEnergy) * 100).toFixed(1) + '%';

      const sig = pw.slots.map((p) => p.id).join(',');
      if (sig !== this.slotSig && this.elSlots) {
        this.slotSig = sig;
        this.elSlots.innerHTML = pw.slots
          .map((p, i) => `<div class="pslot" data-i="${i}"><b>${p.key}</b><span>${p.name}</span><i></i></div>`)
          .join('');
        this.slotEls = Array.from(this.elSlots.querySelectorAll('.pslot'));
      }
      for (let i = 0; i < this.slotEls.length; i++) {
        const p = pw.slots[i];
        const el = this.slotEls[i];
        if (!p) continue;
        const cd = pw.cd[p.id] || 0;
        const frac = cd > 0 ? cd / p.cd : 0;
        el.querySelector('i').style.height = (frac * 100).toFixed(0) + '%';
        el.classList.toggle('cool', cd > 0 || pw.energy < p.cost);
        el.classList.toggle('ready', cd <= 0 && pw.energy >= p.cost);
      }

      if (this.elRelics) {
        const parts = [];
        if (state.zone) parts.push(state.zone.name);
        if (state.relicsTotal > 0) parts.push('RELICS ' + state.relics + '/' + state.relicsTotal);
        if (state.sideDone) parts.push('SIDE CLEAR');
        this.elRelics.textContent = parts.join('  ·  ');
      }
    }

    if (state) {
      // The compass points at whatever the objective needs: the keycard while
      // it is missing, the exit once it is open.
      // where to go: the exit when it is open, the keycard when it is needed,
      // otherwise the nearest enemy — a wave you cannot find is a wave you
      // cannot clear, and a wave you cannot clear is a locked door
      const waypoint = state.exitOpen ? state.exit
        : (state.wave >= 3 && !state.hasKey ? state.keycard : null)
        || state.nearest || null;

      // exit compass: a chevron pointing at the pad once the wave is cleared.
      // exit compass: a chevron pointing at the pad once the wave is cleared
      if (waypoint && state.camera) {
        const cam = state.camera;
        const dir = cam.getWorldDirection(_fwd);
        const dx = waypoint.x - cam.position.x;
        const dz = waypoint.z - cam.position.z;
        const ang = Math.atan2(dir.x * dz - dir.z * dx, dir.x * dx + dir.z * dz);
        this.compass.style.transform = `rotate(${(-ang * 180) / Math.PI}deg)`;
        this.compass.classList.add('on');
        // the distance makes the chevron a waypoint instead of decoration
        if (this.elWaypoint) {
          const d = Math.round(Math.hypot(waypoint.x - cam.position.x, waypoint.z - cam.position.z));
          const label = state.exitOpen ? 'EXIT ' : (state.wave >= 3 && !state.hasKey ? 'KEYCARD ' : 'ENEMY ');
          this.elWaypoint.textContent = label + d + ' m';
        }
      } else {
        this.compass.classList.remove('on');
        if (this.elWaypoint) this.elWaypoint.textContent = '';
      }
      this.elScore.textContent = String(state.score || 0);
      this.elWave.textContent = String(state.wave);
      this.elKills.textContent = String(state.kills);
      this.elEnemies.textContent = String(state.enemies);
      // shape as well as colour: the chip has to read in greyscale
      if (this.keyHeld !== !!state.hasKey) {
        this.keyHeld = !!state.hasKey;
        this.elKey.classList.toggle('on', this.keyHeld);
        this.elKey.textContent = this.keyHeld ? '\u25c6 KEYCARD' : '\u25c7 KEYCARD';
      }
    }

    // vignette decay
    if (this.vig > 0) {
      this.vig = Math.max(0, this.vig - dt * 1.6);
      this.vignette.style.opacity = this.vig.toFixed(3);
    }

    // crosshair flash
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) {
        this.crosshair.classList.remove('hit');
        this.hitEl.classList.remove('on');
      }
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('on');
    }
  }

  /**
   * A damage number over the thing that was hit. World position in, screen
   * position out — no sprite, no draw call, and the animation is CSS.
   */
  damageNumber(pos, amount, camera, kill = false) {
    // The reduced-motion toggle turns these off. This guard used to live in a
    // second copy of the method further up the class — the copy that never ran,
    // because the later definition wins — so the setting did nothing.
    if (!this.damageNumbers) return;
    if (!this.dmgWrap || !camera || !(amount > 0)) return;
    if (!this.dmgPool.length) {
      for (let i = 0; i < 10; i++) {
        const el = document.createElement('div');
        el.className = 'dmgnum';
        this.dmgWrap.appendChild(el);
        this.dmgPool.push(el);
      }
    }
    const el = this.dmgPool[this.dmgCursor];
    this.dmgCursor = (this.dmgCursor + 1) % this.dmgPool.length;
    _v3.copy(pos).project(camera);
    if (_v3.z > 1) return;                       // behind the camera
    const w = this.dmgWrap.clientWidth || 1;
    const h = this.dmgWrap.clientHeight || 1;
    const x = (_v3.x * 0.5 + 0.5) * w;
    const y = (-_v3.y * 0.5 + 0.5) * h;
    if (x < 0 || y < 0 || x > w || y > h) return; // off screen
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.textContent = kill ? '\u2715' : String(Math.round(amount));
    el.className = kill ? 'dmgnum kill' : 'dmgnum';
    // restart the animation: removing the class and forcing a reflow is the
    // only reliable way in every browser
    void el.offsetWidth;
    el.classList.add('on');
  }

  hitmarker() {
    this.hitT = 0.14;
    this.crosshair.classList.add('hit');
    this.hitEl.classList.add('on');
  }

  hurt(amount) {
    this.vig = Math.min(0.85, this.vig + 0.18 + amount * 0.01);
    this.vignette.style.opacity = this.vig.toFixed(3);
  }

  damageFrom(sourcePos, camera) {
    if (!sourcePos) return;
    const dir = camera.getWorldDirection(_fwd);
    const fx = dir.x;
    const fz = dir.z;
    const dx = sourcePos.x - camera.position.x;
    const dz = sourcePos.z - camera.position.z;
    // signed angle between forward and the damage source, on the ground plane
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    const el = document.createElement('div');
    el.className = 'dmgarrow';
    el.style.transform = `rotate(${(-ang * 180) / Math.PI}deg)`;
    this.dmgLayer.appendChild(el);
    const anim = el.animate(
      [{ opacity: 0.95, offset: 0 }, { opacity: 0.8, offset: 0.35 }, { opacity: 0, offset: 1 }],
      { duration: 1100, easing: 'ease-out' }
    );
    anim.onfinish = () => el.remove();
  }

  toast(msg, seconds = 1.8) {
    this.toastEl.textContent = msg;
    // a long line wraps rather than running off both edges: 48 characters is
    // about what fits on one line at this letter spacing
    this.toastEl.classList.toggle('wrap', String(msg).length > 48);
    this.toastEl.classList.add('on');
    this.toastT = seconds;
  }

  drawFace(hp) {
    const c = this.fctx;
    const S = 72;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#120f0c';
    c.fillRect(0, 0, S, S);
    const t = Math.max(0, Math.min(1, hp / 100));

    c.fillStyle = t > 0.6 ? '#c9a97b' : t > 0.3 ? '#b08a5e' : '#8f5f3f';
    c.fillRect(16, 12, 40, 48);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(16, 52, 40, 8);
    c.fillStyle = '#3a2a1c';
    c.fillRect(14, 8, 44, 8);

    const eyeCol = t > 0.35 ? '#f2e6c8' : '#ff6a4a';
    c.fillStyle = eyeCol;
    c.fillRect(24, 28, 8, 6);
    c.fillRect(40, 28, 8, 6);
    c.fillStyle = '#101010';
    c.fillRect(26, 30, 4, 4);
    c.fillRect(42, 30, 4, 4);

    c.fillStyle = '#2a1c12';
    c.fillRect(23, 24, 10, 3);
    c.fillRect(39, 24, 10, 3);

    c.fillStyle = '#2a0f0c';
    if (t > 0.6) {
      c.fillRect(28, 46, 16, 5);
    } else if (t > 0.3) {
      c.fillRect(28, 47, 16, 6);
    } else {
      c.fillRect(26, 46, 20, 8);
      c.fillStyle = '#8a1a12';
      c.fillRect(30, 48, 12, 4);
    }

    if (t < 0.62) {
      c.fillStyle = '#8a1208';
      c.fillRect(22, 14, 3, 9);
      c.fillRect(48, 18, 3, 7);
    }
    if (t < 0.32) {
      c.fillStyle = '#a0160a';
      c.fillRect(46, 20, 4, 16);
      c.fillRect(22, 34, 3, 12);
    }
  }
}
