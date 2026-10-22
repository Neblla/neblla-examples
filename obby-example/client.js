// Obby de los tejados de Madrid — un obby en 3D hecho con Mundo, el motor de Neblla.
//
// Qué pone Neblla y qué pone el juego:
//   · El recorrido entero es obby.json: las piezas del catálogo de Mundo,
//     las que se mueven, los puntos de control, la lava, los pinchos, la
//     sierra, las monedas, la meta, las medallas y las reglas «cuando X,
//     entonces Y» (el trampolín, la estrella que acelera, las losas que
//     parpadean). world.obby(json) lo convierte en un juego; cambiar el
//     obby es cambiar ese fichero.
//   · Mundo (neblla.world): la escena, la física, la cámara y los controles
//     de teclado, mando y pantalla táctil, con el mismo código.
//   · El muñeco de cada persona (neblla.avatar): juegas con el que te hiciste
//     en Neblla Creator; un invitado juega con el de por defecto.
//   · neblla.db: tu mejor tiempo y tus medallas, en el dispositivo o en tu cuenta.
// El juego solo pone el marcador y las pantallas de empezar y de meta.

const MEDALS = { gold: '🥇 oro', silver: '🥈 plata', bronze: '🥉 bronce' };

const $ = (id) => document.getElementById(id);
const fmt = (s) => s.toFixed(1).replace('.', ',') + ' s';

window.onNeblla = async (neblla) => {
  const state = { ready: false };
  window.obby = state;
  try {
    await setUp(neblla, state);
  } catch (e) {
    state.failed = e.code || e.message;
    $('loading').hidden = true;
    $('failed').hidden = false;
    $('failed').textContent = e.code === 'feature_disabled'
      ? 'Este juego necesita el módulo Mundo encendido.'
      : e.code === 'obby_invalid'
        ? 'El obby tiene errores: ' + e.errors.map((x) => x.path + ': ' + x.message).join(' · ')
        : 'No se pudieron preparar los tejados (' + (e.code || e.message) + '). Recarga la página.';
  }
};

async function setUp(neblla, state) {
  const json = await (await fetch('obby.json')).json();
  const world = await neblla.world.create({ container: '#game', sky: json.sky, camera: json.camera });
  state.world = world;

  // Tu muñeco, o el de por defecto.
  let look = null;
  try { look = await neblla.avatar.get(); } catch { /* sin conexión: el de por defecto */ }
  const doll = await world.avatar(look || {});
  if (!look || look.default) $('dollHint').hidden = false;

  const game = await world.obby(json, { doll });
  state.game = game;

  // ── El marcador ─────────────────────────────────────────────────────
  let shoutTimer = null;
  const shout = (text, seconds = 2) => {
    $('shout').textContent = text;
    $('shout').hidden = false;
    clearTimeout(shoutTimer);
    shoutTimer = setTimeout(() => { $('shout').hidden = true; }, seconds * 1000);
  };
  game.on('say', ({ text, seconds }) => shout(text, seconds));
  game.on('collect', ({ score }) => { $('coins').textContent = score; });
  game.on('checkpoint', ({ index }) => { $('cp').textContent = String(index + 1); });
  game.on('respawn', () => shout('¡Al último control!', 1));
  world.onFrame(() => { if (game.running) $('clock').textContent = fmt(game.time); });

  game.on('finish', (r) => {
    const saved = neblla.db.data || {};
    const record = saved.best == null || r.time < saved.best;
    const medals = Object.assign({ gold: 0, silver: 0, bronze: 0 }, saved.medals);
    if (r.medal) medals[r.medal]++;
    neblla.db.save({ best: record ? r.time : saved.best, runs: (saved.runs || 0) + 1, medals }).catch(() => {});
    $('endTitle').textContent = r.medal ? '¡Meta! Medalla de ' + MEDALS[r.medal] : '¡Meta!';
    $('endText').textContent = 'Tiempo: ' + fmt(r.time) + ' · monedas: ' + r.score + ' · caídas: ' + r.deaths
      + (record ? ' · ¡tu mejor tiempo!' : ' · tu mejor tiempo: ' + fmt(saved.best));
    $('end').hidden = false;
    state.ended = r;
  });
  game.on('lose', () => {
    $('endTitle').textContent = 'Se acabó el tiempo';
    $('endText').textContent = 'Cinco minutos y la bandera sigue allí. ¿Otra vez?';
    $('end').hidden = false;
  });

  const showBest = () => {
    const d = neblla.db.data || {};
    if (!d.runs) return;
    const m = d.medals || {};
    $('best').hidden = false;
    $('best').textContent = 'Tu mejor tiempo: ' + fmt(d.best) + ' · medallas: ' + (m.gold || 0) + ' de oro, ' + (m.silver || 0) + ' de plata, ' + (m.bronze || 0) + ' de bronce';
  };
  const play = () => {
    $('start').hidden = true; $('end').hidden = true;
    $('coins').textContent = '0'; $('cp').textContent = 'Salida';
    game.start();
  };
  $('playBtn').addEventListener('click', play);
  $('againBtn').addEventListener('click', () => { showBest(); play(); });

  showBest();
  $('loading').hidden = true;
  $('playBtn').hidden = false;
  state.ready = true;
}
