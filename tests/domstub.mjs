function makeCtx(canvas) {
  const g = { addColorStop() {} };
  return { canvas, imageSmoothingEnabled: true, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    clearRect(){}, fillRect(){}, strokeRect(){}, beginPath(){}, closePath(){}, arc(){}, fill(){}, stroke(){},
    moveTo(){}, lineTo(){}, rect(){}, clip(){}, save(){}, restore(){}, translate(){}, scale(){},
    createRadialGradient(){return g;}, createLinearGradient(){return g;},
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
    putImageData(){}, drawImage(){} };
}
function makeEl(id='',tag='div'){
  const el = { id, tagName: tag, textContent:'', innerHTML:'', value:'', width:0, height:0,
    children:[], dataset:{}, _listeners:{},
    style:{ setProperty(){}, removeProperty(){}, getPropertyValue(){ return ''; } },
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);},
      toggle(c,on){ if(on===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);} else if(on) this._s.add(c); else this._s.delete(c); }},
    addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
    removeEventListener(){}, dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); },
    appendChild(c){this.children.push(c);return c;},
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    setPointerCapture(){}, releasePointerCapture(){}, removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);},
    remove(){}, animate(){return {onfinish:null,cancel(){}};}, focus(){},
    getBoundingClientRect(){return {left:0,top:0,width:1280,height:720};},
    requestPointerLock(){ document.pointerLockElement = this; },
    requestFullscreen(){ document.fullscreenElement = this; },
    getContext(){ return (this._ctx || (this._ctx = makeCtx(this))); } };
  // className and classList must agree: the game sets className directly to
  // reset a CSS animation, and a Set that ignores it lies to every test
  let _cn = '';
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._s].join(' '); },
    set(v) {
      el.classList._s.clear();
      for (const c of String(v || '').split(/\s+/)) if (c) el.classList._s.add(c);
      _cn = v;
    },
  });
  return el;
}
const els = new Map();
// The real page ships these as <div class="screen">. The stub creates elements on
// demand, so they have to exist before a class selector can find them.
const SCREEN_IDS = ['title', 'intro', 'class', 'map', 'inventory', 'diary', 'codex', 'lore', 'cleared', 'dead', 'gameover', 'settings'];
const document = {
  pointerLockElement: null, _listeners: {},
  getElementById(id){ if(!els.has(id)) els.set(id, makeEl(id, (id==='game'||id==='face')?'canvas':'div')); return els.get(id); },
  createElement(tag){ return makeEl('', tag); },
  // every element that carries the class, not a hard-coded four: the game shows
  // inventory, diary, codex, map and lore screens too, and a list of four made
  // every panel assertion in the harness blind
  querySelectorAll(sel){
    if (sel && sel[0] === '.') {
      const cls = sel.slice(1);
      const out = [];
      for (const el of els.values()) if (el.classList && el.classList.contains(cls)) out.push(el);
      return out;
    }
    return [];
  },
  addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
  dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); },
  exitPointerLock(){ this.pointerLockElement = null; },
  body: makeEl('body'),
  fullscreenElement: null,
  exitFullscreen() { document.fullscreenElement = null; },
};
document.documentElement = makeEl('html');
const store = new Map();
const window = { innerWidth:1280, innerHeight:720, devicePixelRatio:2, _listeners:{},
  addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
  dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); } };
globalThis.window = window;
globalThis.document = document;
globalThis.location = window.location = {
  search: '', href: 'http://localhost/play/', pathname: '/play/',
};
globalThis.history = window.history = {
  replaceState(_state, _title, url) {
    if (url == null) return;
    globalThis.location.search = url.startsWith('?') ? url : '';
    globalThis.location.href = 'http://localhost' + globalThis.location.pathname + (url.startsWith('?') ? url : '');
  },
  pushState() {},
};
globalThis.localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };
globalThis.__RAF = [];
globalThis.requestAnimationFrame = fn => { globalThis.__RAF.push(fn); return 1; };
globalThis.__FAKE_DT = 1/60;
// create the screens up front, with the class the real page gives them
for (const id of SCREEN_IDS) document.getElementById(id).classList.add('screen');

export {};
