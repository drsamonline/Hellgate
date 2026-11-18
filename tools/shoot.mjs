// Screenshot tool: runs the real game in headless Chromium (SwiftShader WebGL)
// and captures the shots used in the README and the landing page.
//
//   node tools/shoot.mjs            # all shots
//   node tools/shoot.mjs arena      # one shot by name
//
// Requires puppeteer-core + a Chromium binary. Nothing here ships to the game.
// Writes PNG. Run tools/optimise_assets.py afterwards to produce the WebP files
// the README and the landing page actually load.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const PORT = 8731;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.md': 'text/markdown',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

// Each shot: where to go, what to do once there, how long to let it settle.
// Posing helpers run inside the page. Everything below drives the real game
// through its own debug handle (window.HG) — nothing is faked or composited.
const HELPERS = `
  const HG = window.HG;
  const P = HG.player;
  const put = (x, z, yawDeg, pitchDeg) => {
    P.pos.set(x, 0, z);
    P.pos.y = HG.level.cells[HG.level.idx(Math.round(x/2), Math.round(z/2))].floor;
    P.vel.set(0, 0, 0);
    P.yaw = yawDeg * Math.PI / 180;
    P.pitch = pitchDeg * Math.PI / 180;
    P.eyeY = P.pos.y + 1.62;
    P.syncCamera();
    // drop any mouse-look delta the harness itself generated
    HG.input.lookDx = 0; HG.input.lookDy = 0;
  };
  const pickRoom = (minH, minW) => {
    const rs = HG.level.rooms.slice().sort((a, b) => (b.h - a.h) || (b.w - a.w));
    return rs.find((r) => r.h >= minH && r.w >= minW) || rs[0];
  };
  const aimAt = (i, aimY) => {
    const e = HG.enemies.list.filter((x) => x.alive)[i];
    if (!e) return;
    const dx = e.pos.x - P.pos.x;
    const dz = e.pos.z - P.pos.z;
    P.yaw = Math.atan2(-dx, -dz);
    P.pitch = Math.atan2((e.pos.y + (aimY == null ? 1.0 : aimY)) - P.eyeY, Math.hypot(dx, dz));
    P.syncCamera();
    HG.input.lookDx = 0; HG.input.lookDy = 0;
  };
  const hidePickupsNear = (r) => {
    for (const p of HG.game.pickups) {
      if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < r) p.mesh.visible = false;
    }
    if (HG.game.keycard && Math.hypot(HG.game.keycard.x - P.pos.x, HG.game.keycard.z - P.pos.z) < r) {
      HG.game.keycard.mesh.visible = false;
    }
  };
  const hideCloser = (keepN, radius) => {
    const alive = HG.enemies.list.filter((x) => x.alive);
    const keep = new Set(alive.slice(0, keepN));
    for (const e of alive) {
      if (keep.has(e)) continue;
      if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < radius) e.mesh.visible = false;
    }
  };
  const park = (i, dx, dz) => {
    const e = HG.enemies.list.filter((x) => x.alive)[i];
    if (!e) return null;
    const c = Math.cos(P.yaw), s2 = Math.sin(P.yaw);
    // forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw)
    e.pos.set(P.pos.x + dx * c - dz * s2, 0, P.pos.z - dx * s2 - dz * c);
    e.pos.y = HG.level.cells[HG.level.idx(Math.round(e.pos.x/2), Math.round(e.pos.z/2))].floor;
    e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
    e.state = 'IDLE';
    return e;
  };
`;

const SHOTS = [
  {
    name: 'title',
    url: '/play/',
    settle: 1000,
    before: null,
  },
  {
    // the cold open: typed panels over a flythrough of the level you will play
    name: 'intro',
    url: '/play/',
    settle: 900,
    before: null,
    act: async (page) => {
      await page.click('#startBtn');
      await new Promise((r) => setTimeout(r, 4300));
    },
  },
  {
    name: 'class',
    url: '/play/',
    settle: 900,
    act: async (page) => {
      await page.click('#startBtn');
      await page.waitForFunction('window.HG.game.state === "intro"', { timeout: 15000 });
      await page.click('#storySkip');
      await page.waitForFunction('window.HG.game.state === "class"', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  {
    name: 'map',
    url: '/play/?auto=1&seed=hellgate&wave=1',
    settle: 1300,
    before: () => { window.HG.showZoneMap(); },
    settleAfter: 500,
  },
  {
    // the grove zone: trees, grass and animals
    name: 'grove',
    url: '/play/?auto=1&zone=grove&wave=2',
    settle: 1500,
    before: `(() => { ${HELPERS}
      const r = pickRoom(6, 6);
      put(r.cx * 2, (r.z + r.h - 1.2) * 2, 0, -4);
      park(0, -2.2, 6);
      park(1, 2.4, 7.5);
      hidePickupsNear(6);
      HG.player.health = 96; HG.player.armor = 25;
      HG.weapons.select(1, true);
      HG.game.score = 1450;
      HG.hud.toast('');
    })()`,
    settleAfter: 600,
  },
  {
    // the warden, last wave of the last zone
    name: 'boss',
    url: '/play/?auto=1&zone=throne&wave=4',
    settle: 1500,
    before: `(() => { ${HELPERS}
      const HGx = window.HG;
      HGx.enemies.clear();
      HGx.enemies.spawnWave(4, HGx.player.pos, { boss: true, waves: 4 });
      const b = HGx.enemies.list.find((e) => e.T && e.T.boss);
      if (!b) return null;
      const r = pickRoom(6, 6);
      put(r.cx * 2, (r.z + r.h - 1.2) * 2, 0, 4);
      b.pos.set(HGx.player.pos.x, 0, HGx.player.pos.z - 7);
      b.pos.y = HGx.level.cells[HGx.level.idx(Math.round(b.pos.x/2), Math.round(b.pos.z/2))].floor;
      b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      HGx.player.health = 88; HGx.player.armor = 40;
      HGx.weapons.select(2, true);
      HGx.game.score = 4200;
      HGx.hud.toast('');
    })()`,
    settleAfter: 700,
  },
  {
    // wide room, wave closing in: the README hero
    name: 'arena',
    url: '/play/?auto=1&seed=hellgate&wave=3',
    settle: 1500,
    before: `(() => { ${HELPERS}
      const r = pickRoom(6, 6);
      put(r.cx * 2, (r.z + r.h - 1.2) * 2, 0, -3);
      park(0, -2.4, 5.5);
      park(1, 2.6, 7);
      park(2, 0.4, 9.5);
      park(3, -4.5, 8);
      hidePickupsNear(6);
      HG.player.health = 78; HG.player.armor = 40;
      HG.player.ammo.bullets = 41;
      HG.game.kills = 7;
      HG.weapons.select(0, true);
      HG.hud.toast('');
    })()`,
    settleAfter: 500,
  },
  {
    // shotgun up close: blood, tracers, muzzle flash
    name: 'combat',
    url: '/play/?auto=1&seed=hellgate&wave=3',
    settle: 1500,
    before: `(() => { ${HELPERS}
      const r = pickRoom(6, 5);
      put(r.cx * 2, (r.z + r.h - 1.2) * 2, 0, -2);
      park(0, -1.2, 4.2);
      park(1, 1.8, 5.6);
      park(2, 0.2, 7.4);
      hidePickupsNear(5);
      aimAt(0, 1.1);
      HG.player.health = 54; HG.player.armor = 18;
      HG.player.ammo.shells = 11;
      HG.weapons.select(1, true);
      HG.weapons.cd = 0;
      HG.game.kills = 3;
      HG.hud.toast('');
    })()`,
    act: async (page) => {
      await page.evaluate(() => { HG.input.lookDx = 0; HG.input.lookDy = 0; });
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 45));
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 120));
    },
  },
  {
    // cleared wave: doors open, exit pad lit
    name: 'exit',
    url: '/play/?auto=1&seed=hellgate&wave=2',
    settle: 1400,
    before: `(() => { ${HELPERS}
      const L = HG.level;
      const ctx = { level: L, player: P, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: () => HG.game.kills++ };
      for (const e of HG.enemies.list) if (e.alive) e.hurt(9999, ctx, { x: 0, y: 0, z: 1 });
      HG.game.kills = 11;
      HG.game.hasKey = true;
      const door = L.doors[0];
      put(door.x * 2, door.z * 2, 0, -6);
      const dx = L.exit.x - P.pos.x, dz = L.exit.z - P.pos.z;
      P.yaw = Math.atan2(-dx, -dz);
      P.pitch = Math.atan2(0.1 - P.eyeY, Math.hypot(dx, dz));
      P.syncCamera();
      HG.input.lookDx = 0; HG.input.lookDy = 0;
      hidePickupsNear(3);
      HG.player.health = 41; HG.player.armor = 25;
      HG.hud.toast('');
    })()`,
    settleAfter: 1700,
  },
  {
    // rocket into a pack of imps, caught mid-explosion
    name: 'rocket',
    url: '/play/?auto=1&seed=hellgate&wave=4',
    settle: 1500,
    before: `(() => { ${HELPERS}
      const r = pickRoom(7, 5);
      put(r.cx * 2, (r.z + r.h - 1.2) * 2, 0, 1);
      park(0, -1.4, 5);
      park(1, 1.2, 6.2);
      park(2, 0.2, 7.4);
      hidePickupsNear(5);
      hideCloser(3, 9);
      aimAt(0, 1.0);
      HG.player.health = 66; HG.player.armor = 55;
      HG.player.ammo.rockets = 3;
      HG.weapons.select(2, true);
      HG.weapons.cd = 0;
      HG.game.kills = 5;
      HG.hud.toast('');
    })()`,
    act: async (page) => {
      await page.evaluate(() => { HG.input.lookDx = 0; HG.input.lookDy = 0; });
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 50));
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 260)); // flight + explosion
    },
  },
];

const wanted = process.argv.slice(2);
const list = wanted.length ? SHOTS.filter((s) => wanted.includes(s.name)) : SHOTS;

fs.mkdirSync(OUT, { recursive: true });
const server = await serve();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('  [page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });

for (const shot of list) {
  process.stdout.write(`capturing ${shot.name}… `);
  await page.goto(`http://127.0.0.1:${PORT}${shot.url}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, shot.settle));

  if (shot.before) {
    const res = await page.evaluate(shot.before);
    if (res === null) console.log('(no enemy found)');
  }
  await new Promise((r) => setTimeout(r, 260));

  if (shot.act) await shot.act(page);
  if (shot.settleAfter) await new Promise((r) => setTimeout(r, shot.settleAfter));

  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`${kb} KB`);
}

await browser.close();
server.close();
console.log('done →', path.relative(ROOT, OUT));
