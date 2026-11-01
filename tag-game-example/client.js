// Pilla-pilla en el Retiro — un juego en 3D hecho con Mundo, el motor de Neblla.
//
// Qué pone Neblla y qué pone el juego:
//   · Mundo (neblla.world): la escena, la luz, la física, la cámara y los
//     controles de teclado, mando y pantalla táctil, con el mismo código.
//   · El catálogo de Mundo: los árboles, los setos, las flores y las vallas
//     del parque. Nada de modelar: se buscan y se colocan.
//   · El muñeco de cada persona (neblla.avatar): juegas con el que te hiciste
//     en Neblla Creator; un invitado juega con el de por defecto.
//   · neblla.db: tu mejor marca, guardada en el dispositivo o en tu cuenta.
// El juego solo pone las reglas: quién la lleva, cómo se pasa y cuándo acaba.
// Los cuatro rivales son del propio juego (el pilla-pilla con amigos llegará
// con el multijugador de Mundo).

const ROUND = 60;          // segundos de partida
const TAG_RANGE = 1.1;     // metros entre dos para que cuente el toque
const FREEZE = 1.5;        // segundos que espera quien acaba de quedársela
const NO_BACK = 3;         // segundos en que no se la puede devolver a quien se la pasó
const EDGE = 26;           // la valla del parque, a cada lado del centro
const POND = { x: 0, z: -8, w: 14, d: 8 };   // el estanque

const RIVALS = [
  { id: 'lucia', name: 'Lucía', look: { skin: '#eac0a0', hair: { style: 'long', color: '#5a3a22' }, colors: { top: '#e04f5f', bottom: '#2f3446', shoes: '#f2f2f2' } } },
  { id: 'mateo', name: 'Mateo', look: { skin: '#b97b56', hair: { style: 'short', color: '#1d1a17' }, colors: { top: '#f2c14e', bottom: '#3d5a80', shoes: '#2b2b2b' } } },
  { id: 'sofia', name: 'Sofía', look: { skin: '#f6d7c3', hair: { style: 'bun', color: '#a0522d' }, colors: { top: '#7b5ea7', bottom: '#f2f2f2', shoes: '#e04f5f' } } },
  { id: 'diego', name: 'Diego', look: { skin: '#8d5a3b', hair: { style: 'short', color: '#2a1d14' }, colors: { top: '#3fae6b', bottom: '#2f3446', shoes: '#f2c14e' } } },
];

// Azar con semilla: la misma semilla, el mismo parque (?seed=7 para probar).
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const random = rng(Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now());

const $ = (id) => document.getElementById(id);
// Todo el texto sale de lang/<idioma>.json por nebllaLang.t(); los números, con Intl.
const tr = (key, vars) => window.nebllaLang.t(key, vars);
const fmt = (s) => tr('secs', { v: new Intl.NumberFormat(window.nebllaLang.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(s) });
const nm = (p) => (p.you ? tr('you') : p.name);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const inPond = (x, z, m = 0) => Math.abs(x - POND.x) < POND.w / 2 + m && Math.abs(z - POND.z) < POND.d / 2 + m;
const onPath = (x, z) => Math.abs(x) < 3 || Math.abs(z - 10) < 3;

window.onNeblla = async (neblla) => {
  await window.nebllaLang.ready;
  const game = { ready: false, playing: false, players: [], it: null, time: 0, ends: 0, results: null };
  window.pilla = game;
  try {
    await setUp(neblla, game);
  } catch (e) {
    game.failed = e.code || e.message;
    $('loading').hidden = true;
    $('failed').hidden = false;
    const showFailed = () => { $('failed').textContent = e.code === 'feature_disabled' ? tr('needWorld') : tr('failed', { code: e.code || e.message }); };
    showFailed();
    window.nebllaLang.on(showFailed);
  }
};

async function setUp(neblla, game) {
  const world = await neblla.world.create({ container: '#game', sky: 'day', camera: 'third' });
  game.world = world;

  // ── El parque ───────────────────────────────────────────────────────
  world.add({ shape: 'box', size: [64, 1, 64], position: [0, -0.5, 0], color: '#7fa65a' });
  // Los paseos de arena (solo se ven) y el agua del estanque.
  world.add({ shape: 'box', size: [6, 0.02, 2 * EDGE], position: [0, 0.01, 0], color: '#d8c39a', body: 'none' });
  world.add({ shape: 'box', size: [2 * EDGE, 0.02, 6], position: [0, 0.01, 10], color: '#d8c39a', body: 'none' });
  world.add({ shape: 'box', size: [POND.w, 0.05, POND.d], position: [POND.x, 0.02, POND.z], color: '#4f9fd8', material: 'glossy', body: 'none' });

  const [tree, pine, hedge, flowers, fence, fenceLow, rocks] = await Promise.all(
    ['tree', 'tree-pine', 'hedge', 'flowers', 'fence-straight', 'fence-low-straight', 'rocks'].map((id) => world.load('catalog:' + id)));

  // La valla del parque, con un muro que no se ve para que nadie la salte.
  const ring = (y, step, rot) => {
    const out = [];
    for (let v = -EDGE + step / 2; v < EDGE; v += step) {
      out.push({ position: [v, y, -EDGE], rotation: [0, 0, 0] }, { position: [v, y, EDGE], rotation: [0, 0, 0] });
      out.push({ position: [-EDGE, y, v], rotation: [0, rot, 0] }, { position: [EDGE, y, v], rotation: [0, rot, 0] });
    }
    return out;
  };
  world.scatter(fence, ring(0, 2, Math.PI / 2));
  for (const [x, z, w, d] of [[0, -EDGE - 0.4, 2 * EDGE, 0.4], [0, EDGE + 0.4, 2 * EDGE, 0.4], [-EDGE - 0.4, 0, 0.4, 2 * EDGE], [EDGE + 0.4, 0, 0.4, 2 * EDGE]]) {
    world.add({ shape: 'box', size: [w, 4, d], position: [x, 2, z], visible: false });
  }
  // La barandilla baja del estanque: el agua no se pisa.
  const pond = [];
  for (let x = POND.x - POND.w / 2 + 1; x < POND.x + POND.w / 2; x += 2) pond.push({ position: [x, 0, POND.z - POND.d / 2] }, { position: [x, 0, POND.z + POND.d / 2] });
  for (let z = POND.z - POND.d / 2 + 1; z < POND.z + POND.d / 2; z += 2) pond.push({ position: [POND.x - POND.w / 2, 0, z], rotation: [0, Math.PI / 2, 0] }, { position: [POND.x + POND.w / 2, 0, z], rotation: [0, Math.PI / 2, 0] });
  world.scatter(fenceLow, pond);

  // Árboles, setos, rocas y flores, lejos del agua, de los paseos y de la salida.
  const spots = (n, margin) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 40; tries++) {
      const x = (random() * 2 - 1) * (EDGE - 2), z = (random() * 2 - 1) * (EDGE - 2);
      if (inPond(x, z, margin) || onPath(x, z) || Math.hypot(x, z - 4) < 7) continue;
      if (out.some((p) => Math.hypot(p.position[0] - x, p.position[2] - z) < margin * 2)) continue;
      out.push({ position: [x, 0, z], rotation: [0, random() * Math.PI * 2, 0], scale: 0.85 + random() * 0.4 });
    }
    return out;
  };
  world.scatter(tree, spots(16, 2.5));
  world.scatter(pine, spots(10, 2.5));
  world.scatter(hedge, spots(10, 2));
  world.scatter(rocks, spots(5, 2));
  world.scatter(flowers, spots(18, 1.2), { collider: 'none' });

  // Una marca encima de quien la lleva.
  const marker = world.add({ shape: 'sphere', radius: 0.22, color: '#ff4d4d', material: 'emissive', glow: 1.5, body: 'none', position: [0, -5, 0] });

  // ── Los jugadores ───────────────────────────────────────────────────
  // Tu muñeco, el de tu cuenta Neblla (o el de por defecto si no tienes).
  let look = null;
  try { look = await neblla.avatar.get(); } catch { /* sin conexión: el de por defecto */ }
  const myDoll = await world.avatar(look || {});
  if (!look || look.default) $('dollHint').hidden = false;
  const you = { id: 'you', name: 'you', you: true, doll: myDoll, thing: world.add({ doll: myDoll, position: [0, 1, 4] }) };
  world.control(you.thing);
  game.players.push(you);
  for (const r of RIVALS) {
    const doll = await world.avatar(r.look);
    game.players.push({ ...r, doll, thing: world.add({ doll, position: [0, 1, 4], runSpeed: 7.4 }), brain: { goal: null, until: 0, stuck: 0, detour: null } });
  }
  for (const p of game.players) p.color = (p.look || look || {}).colors?.top || '#3f7fd8';

  // ── Las reglas ──────────────────────────────────────────────────────
  const shout = (text) => {
    const el = $('shout');
    el.textContent = text; el.hidden = false;
    clearTimeout(shout.t); shout.t = setTimeout(() => { el.hidden = true; }, 1600);
  };
  const renderIt = () => { if (game.it) $('itName').textContent = nm(game.it); };
  const giveIt = (to, from) => {
    game.it = to;
    to.since = world.time;               // se queda quieto contando un momento
    to.noBack = from ? { id: from.id, until: world.time + NO_BACK } : null;
    renderIt();
    $('itBox').style.setProperty('--who', to.color);
    if (to.you) shout(from ? tr('tagged', { name: nm(from) }) : tr('youIt'));
    else if (from && from.you) shout(tr('passed', { name: nm(to) }));
    else shout(tr('nameIt', { name: nm(to) }));
  };

  const place = () => {
    const n = game.players.length;
    game.players.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2;
      p.thing.position = [Math.cos(a) * 6, 1, 6 + Math.sin(a) * 6];
      p.thing.velocity = [0, 0, 0];
      p.held = 0;
      if (p.brain) p.brain = { goal: null, until: 0, stuck: 0, detour: null };
      if (!p.you) p.thing.input = { x: 0, z: 0 };
      p.doll.stop();
    });
  };

  game.start = () => {
    place();
    game.playing = true;
    game.ends = world.time + ROUND;
    game.results = null;
    game.end = null;
    // Empieza un rival: primero, a correr.
    giveIt(game.players[1 + Math.floor(random() * RIVALS.length)], null);
    $('start').hidden = true; $('end').hidden = true; $('itBox').hidden = false;
  };

  const finish = () => {
    game.playing = false;
    $('clock').textContent = '0:00';
    document.body.classList.remove('mine-it');
    const loser = game.it;
    const table = [...game.players].sort((a, b) => (a === loser) - (b === loser) || a.held - b.held);
    game.results = table.map((p) => ({ id: p.id, name: p.name, held: p.held, lost: p === loser }));
    for (const p of game.players) if (!p.you) p.thing.input = { x: 0, z: 0 };
    table[0].doll.play('dance', { loop: true });
    loser.doll.play('sit-down');
    const me = game.players[0];
    const won = table[0] === me;
    game.end = { won, lost: me === loser, me, winner: table[0] };
    renderEnd();
    $('end').hidden = false;
    // Tu mejor marca: la menor que llevaste sin perder.
    const saved = neblla.db.data || {};
    const best = me === loser ? saved.best : Math.min(saved.best ?? Infinity, Math.round(me.held * 10) / 10);
    neblla.db.save({ best: Number.isFinite(best) ? best : null, games: (saved.games || 0) + 1, wins: (saved.wins || 0) + (won ? 1 : 0) }).catch(() => {});
    showBest();
  };

  // El texto del final se pinta aparte para repintarlo si cambia el idioma.
  const renderEnd = () => {
    const e = game.end;
    if (!e) return;
    $('endTitle').textContent = e.won ? tr('won') : e.lost ? tr('lostWhistle') : tr('whistle');
    $('endText').textContent = e.lost ? tr('endLost')
      : e.won ? tr('endWon', { time: fmt(e.me.held) })
      : tr('endOther', { time: fmt(e.me.held), name: nm(e.winner), winTime: fmt(e.winner.held) });
    const ol = $('table'); ol.textContent = '';
    for (const r of game.results) {
      const li = document.createElement('li');
      li.textContent = (r.id === 'you' ? tr('you') : r.name) + ' — ' + (r.lost ? tr('lastIt') : fmt(r.held));
      if (r.id === 'you') li.className = 'me';
      ol.append(li);
    }
  };

  // Cómo piensa un rival: si la lleva, persigue al más cercano (un poco más a ti);
  // si no, huye de quien la lleva cuando lo tiene cerca, y si no, pasea.
  const think = (p, dt) => {
    const pos = p.thing.position, b = p.brain;
    let dir = null, run = false;
    if (p === game.it) {
      if (world.time - p.since < FREEZE) { p.thing.input = { x: 0, z: 0 }; return; }
      let best = null, bestD = Infinity;
      for (const q of game.players) {
        if (q === p || (p.noBack && q.id === p.noBack.id && world.time < p.noBack.until)) continue;
        const d = flat(pos, q.thing.position) * (q.you ? 0.8 : 1);
        if (d < bestD) { bestD = d; best = q; }
      }
      if (best) { const t = best.thing.position; dir = [t[0] - pos[0], t[2] - pos[2]]; run = true; }
    } else {
      const it = game.it.thing.position, d = flat(pos, it);
      if (d < 8) {
        dir = [pos[0] - it[0], pos[2] - it[2]];
        // Contra la valla, mejor de lado que contra ella.
        if (Math.abs(pos[0]) > EDGE - 4) dir[0] -= Math.sign(pos[0]) * 6;
        if (Math.abs(pos[2]) > EDGE - 4) dir[1] -= Math.sign(pos[2]) * 6;
        run = d < 5;
      } else {
        if (!b.goal || world.time > b.until || flat(pos, [b.goal[0], 0, b.goal[1]]) < 1.5) {
          b.goal = [(random() * 2 - 1) * (EDGE - 4), (random() * 2 - 1) * (EDGE - 4)];
          if (inPond(b.goal[0], b.goal[1], 2)) b.goal[1] += POND.d + 4;
          b.until = world.time + 4 + random() * 4;
        }
        dir = [b.goal[0] - pos[0], b.goal[1] - pos[2]];
      }
    }
    // Atascado contra un árbol o la barandilla: un rodeo de lado un momento.
    const v = p.thing.velocity, speed = Math.hypot(v[0], v[2]);
    b.stuck = speed < 0.8 ? b.stuck + dt : 0;
    if (b.stuck > 0.5 && dir) { b.detour = { x: -dir[1], z: dir[0], until: world.time + 0.8 }; b.stuck = 0; }
    if (b.detour && world.time < b.detour.until) dir = [b.detour.x, b.detour.z];
    const len = dir ? Math.hypot(dir[0], dir[1]) : 0;
    p.thing.input = len > 0.01 ? { x: dir[0] / len, z: dir[1] / len, run } : { x: 0, z: 0 };
  };

  world.on('step', (dt) => {
    if (!game.playing) return;
    const it = game.it;
    it.held += dt;
    for (const p of game.players) if (p.brain) think(p, dt);
    // El toque: quien la lleva, ya despierto, a menos de un brazo de otro.
    if (world.time - it.since >= (it.you ? 0.3 : FREEZE)) {
      for (const q of game.players) {
        if (q === it || (it.noBack && q.id === it.noBack.id && world.time < it.noBack.until)) continue;
        if (flat(it.thing.position, q.thing.position) < TAG_RANGE && Math.abs(it.thing.position[1] - q.thing.position[1]) < 1.5) { giveIt(q, it); break; }
      }
    }
    if (world.time >= game.ends) finish();
  });
  world.on('fall', (thing) => { thing.position = [0, 2, 4]; });

  world.onFrame(() => {
    if (game.it) {
      const p = game.it.thing.position;
      marker.position = [p[0], p[1] + game.it.doll.height / 2 + 0.55 + Math.sin(world.time * 6) * 0.08, p[2]];
    }
    if (game.playing) {
      const left = Math.max(0, game.ends - world.time);
      const secs = Math.ceil(left);
      $('clock').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      $('mine').textContent = fmt(game.players[0].held);
      document.body.classList.toggle('mine-it', !!game.it.you);
    }
  });

  const showBest = () => {
    const d = neblla.db.data || {};
    if (!d.games) return;
    $('best').hidden = false;
    const v = { games: d.games, wins: d.wins || 0 };
    $('best').textContent = d.best != null ? tr('statsBest', { ...v, time: fmt(d.best) }) : tr('stats', v);
  };
  showBest();
  const meta = document.querySelector('meta[name=description]');
  window.nebllaLang.on(() => { renderIt(); renderEnd(); showBest(); if (meta) meta.content = tr('desc'); if (game.playing) $('mine').textContent = fmt(game.players[0].held); });
  if (meta) meta.content = tr('desc');

  $('playBtn').addEventListener('click', () => game.start());
  $('againBtn').addEventListener('click', () => game.start());
  place();
  $('loading').hidden = true;
  $('playBtn').hidden = false;
  game.ready = true;
}
