// ---------------------------------------------------------------------------
// TOUCH — the mobile controls. Left half walks, right half looks, a tap fires.
// Buttons for jump, the three powers and the weapon wheel.
// Enabled on a touch device, or with ?touch=1.
// ---------------------------------------------------------------------------

export function isTouchDevice() {
  return (
    (typeof window !== 'undefined' && 'ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    /[?&]touch=1/.test(typeof location !== 'undefined' ? location.search : '')
  );
}

export function initTouch(input, handlers) {
  const root = document.getElementById('touch');
  if (!root) return () => {};
  root.classList.add('on');

  const stick = document.getElementById('tStick');
  const knob = document.getElementById('tKnob');
  const look = document.getElementById('tLook');

  let stickId = null;
  let stickOrigin = { x: 0, y: 0 };
  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  let lookStart = { x: 0, y: 0, t: 0 };
  let moved = 0;

  const RADIUS = 52;

  function onStickDown(e) {
    if (stickId !== null) return;
    stickId = e.pointerId;
    stickOrigin = { x: e.clientX, y: e.clientY };
    stick.setPointerCapture?.(e.pointerId);
    if (knob) {
      knob.style.transform = 'translate(-50%,-50%)';
      knob.style.opacity = '1';
    }
    e.preventDefault();
  }

  function onStickMove(e) {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - stickOrigin.x;
    let dy = e.clientY - stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    input.move.x = dx / RADIUS;
    input.move.y = dy / RADIUS;
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    e.preventDefault();
  }

  function onStickUp(e) {
    if (e.pointerId !== stickId) return;
    stickId = null;
    input.move.x = 0;
    input.move.y = 0;
    if (knob) {
      knob.style.transform = 'translate(-50%,-50%)';
      knob.style.opacity = '0.55';
    }
  }

  function onLookDown(e) {
    if (lookId !== null) return;
    lookId = e.pointerId;
    lookLast = { x: e.clientX, y: e.clientY };
    lookStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    moved = 0;
    look.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onLookMove(e) {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lookLast.x;
    const dy = e.clientY - lookLast.y;
    moved += Math.abs(dx) + Math.abs(dy);
    lookLast = { x: e.clientX, y: e.clientY };
    input.lookDx += dx * 1.6;
    input.lookDy += dy * 1.6;
    e.preventDefault();
  }

  function onLookUp(e) {
    if (e.pointerId !== lookId) return;
    const quick = performance.now() - lookStart.t < 260 && moved < 14;
    lookId = null;
    if (quick) handlers.fire(); // tap to shoot
  }

  stick.addEventListener('pointerdown', onStickDown, { passive: false });
  stick.addEventListener('pointermove', onStickMove, { passive: false });
  stick.addEventListener('pointerup', onStickUp);
  stick.addEventListener('pointercancel', onStickUp);

  look.addEventListener('pointerdown', onLookDown, { passive: false });
  look.addEventListener('pointermove', onLookMove, { passive: false });
  look.addEventListener('pointerup', onLookUp);
  look.addEventListener('pointercancel', () => { lookId = null; });

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }, { passive: false });
  };

  bind('tJump', handlers.jump);
  bind('tFire', handlers.fire);
  bind('tP1', () => handlers.power(0));
  bind('tP2', () => handlers.power(1));
  bind('tP3', () => handlers.power(2));
  bind('tWeap', handlers.weapon);

  return () => root.classList.remove('on');
}
