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
  return { id, tagName: tag, className:'', textContent:'', innerHTML:'', value:'', width:0, height:0,
    children:[], style:{}, dataset:{}, _listeners:{},
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);},
      toggle(c,on){ if(on===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);} else if(on) this._s.add(c); else this._s.delete(c); }},
    addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
    removeEventListener(){}, dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); },
    appendChild(c){this.children.push(c);return c;}, removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);},
    remove(){}, animate(){return {onfinish:null,cancel(){}};}, focus(){},
    getBoundingClientRect(){return {left:0,top:0,width:1280,height:720};},
    requestPointerLock(){ document.pointerLockElement = this; },
    getContext(){ return (this._ctx || (this._ctx = makeCtx(this))); } };
}
const els = new Map();
const document = {
  pointerLockElement: null, _listeners: {},
  getElementById(id){ if(!els.has(id)) els.set(id, makeEl(id, (id==='game'||id==='face')?'canvas':'div')); return els.get(id); },
  createElement(tag){ return makeEl('', tag); },
  querySelectorAll(sel){ if(sel==='.screen') return ['title','pause','gameover'].map(i=>this.getElementById(i)); return []; },
  addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
  dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); },
  exitPointerLock(){ this.pointerLockElement = null; },
  body: makeEl('body'),
};
const store = new Map();
const window = { innerWidth:1280, innerHeight:720, devicePixelRatio:2, _listeners:{},
  addEventListener(t,fn){(this._listeners[t]||(this._listeners[t]=[])).push(fn);},
  dispatch(t,ev={}){ for(const fn of this._listeners[t]||[]) fn(ev); } };
globalThis.window = window;
globalThis.document = document;
globalThis.location = window.location = { search: '', href: 'http://localhost/play/' };
globalThis.localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };
globalThis.__RAF = [];
globalThis.requestAnimationFrame = fn => { globalThis.__RAF.push(fn); return 1; };
globalThis.__FAKE_DT = 1/60;
export {};
