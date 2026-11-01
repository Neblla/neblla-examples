// Obby de los tejados de Madrid — un obby en 3D hecho con Mundo, el motor de Neblla.
//
// Qué pone Neblla y qué pone el juego:
//   · El recorrido entero es obby.json: las piezas del catálogo de Mundo,
//     las que se mueven, los puntos de control, la lava, los pinchos, la
//     sierra, las monedas, la meta, las medallas y las reglas «cuando X,
//     entonces Y» (el trampolín, la estrella que acelera, las losas que
//     parpadean). world.obby(json) lo convierte en un juego; cambiar el
//     obby es cambiar ese fichero. Los carteles de las reglas («say») son
//     claves de lang/: el cliente las traduce al mostrarlas.
//   · Mundo (neblla.world): la escena, la física, la cámara y los controles
//     de teclado, mando y pantalla táctil, con el mismo código.
//   · El muñeco de cada persona (neblla.avatar): juegas con el que te hiciste
//     en Neblla Creator; un invitado juega con el de por defecto.
//   · neblla.db: tu mejor tiempo y tus medallas, en el dispositivo o en tu cuenta.
// El juego solo pone el marcador y las pantallas de empezar y de meta.
// Los textos salen de lang/<idioma>.json por nebllaLang (lang.js).

const $ = (id) => document.getElementById(id);
const L = () => window.nebllaLang;
const t = (k, v) => L().t(k, v);
// Segundos con Intl en el idioma activo (1 decimal para el marcador, 0 para las medallas).
const secs = (s, digits = 1) => new Intl.NumberFormat(L().lang, {
  style: 'unit', unit: 'second', unitDisplay: 'short', minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(s);
const num = (n) => new Intl.NumberFormat(L().lang).format(n);

window.onNeblla = async (neblla) => {
  const state = { ready: false };
  window.obby = state;
  await L().ready;
  try {
    await setUp(neblla, state);
  } catch (e) {
    state.failed = e.code || e.message;
    $('loading').hidden = true;
    $('failed').hidden = false;
    const show = () => {
      $('failed').textContent = e.code === 'feature_disabled'
        ? t('failed_world')
        : e.code === 'obby_invalid'
          ? t('failed_obby', { errors: e.errors.map((x) => x.path + ': ' + x.message).join(' · ') })
          : t('failed_generic', { code: e.code || e.message });
    };
    show();
    L().on(show);
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

  const medalsCfg = (json.time && json.time.medals) || {};
  const view = { cp: null, end: null, bestShown: false };

  // ── Textos que se pintan por código (se repintan al cambiar de idioma) ──
  const paintStatic = () => {
    document.title = t('title');
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('meta_desc'));
    $('medalsInfo').textContent = t('medals_info', {
      gold: secs(medalsCfg.gold, 0), silver: secs(medalsCfg.silver, 0), bronze: secs(medalsCfg.bronze, 0),
    });
  };
  const paintCp = () => { $('cp').textContent = view.cp == null ? t('cp_start') : num(view.cp); };
  const paintEnd = () => {
    const e = view.end;
    if (!e) return;
    if (e.kind === 'lose') {
      $('endTitle').textContent = t('lose_title');
      $('endText').textContent = t('lose_text');
      return;
    }
    const r = e.result;
    $('endTitle').textContent = r.medal ? t('finish_medal', { medal: t('medal_' + r.medal) }) : t('finish');
    $('endText').textContent = t('end_stats', { time: secs(r.time), coins: num(r.score), deaths: num(r.deaths) })
      + ' · ' + (e.record ? t('end_record') : t('end_best', { best: secs(e.best) }));
  };
  const paintBest = () => {
    if (!view.bestShown) return;
    const d = neblla.db.data || {};
    const m = d.medals || {};
    $('best').hidden = false;
    $('best').textContent = t('best_line', { best: secs(d.best), gold: num(m.gold || 0), silver: num(m.silver || 0), bronze: num(m.bronze || 0) });
  };
  paintStatic(); paintCp();
  L().on(() => { paintStatic(); paintCp(); paintEnd(); paintBest(); });

  // ── El marcador ─────────────────────────────────────────────────────
  let shoutTimer = null;
  const shout = (text, seconds = 2) => {
    $('shout').textContent = text;
    $('shout').hidden = false;
    clearTimeout(shoutTimer);
    shoutTimer = setTimeout(() => { $('shout').hidden = true; }, seconds * 1000);
  };
  // Los carteles de obby.json son claves de lang/; si una regla trae texto suelto, t() lo devuelve tal cual.
  game.on('say', ({ text, seconds }) => shout(t(text), seconds));
  game.on('collect', ({ score }) => { $('coins').textContent = num(score); });
  game.on('checkpoint', ({ index }) => { view.cp = index + 1; paintCp(); });
  game.on('respawn', () => shout(t('respawn'), 1));
  world.onFrame(() => { if (game.running) $('clock').textContent = secs(game.time); });

  game.on('finish', (r) => {
    const saved = neblla.db.data || {};
    const record = saved.best == null || r.time < saved.best;
    const medals = Object.assign({ gold: 0, silver: 0, bronze: 0 }, saved.medals);
    if (r.medal) medals[r.medal]++;
    neblla.db.save({ best: record ? r.time : saved.best, runs: (saved.runs || 0) + 1, medals }).catch(() => {});
    view.end = { kind: 'finish', result: r, record, best: saved.best };
    paintEnd();
    $('end').hidden = false;
    state.ended = r;
  });
  game.on('lose', () => {
    view.end = { kind: 'lose' };
    paintEnd();
    $('end').hidden = false;
  });

  const showBest = () => {
    const d = neblla.db.data || {};
    if (!d.runs) return;
    view.bestShown = true;
    paintBest();
  };
  const play = () => {
    $('start').hidden = true; $('end').hidden = true;
    view.end = null; view.cp = null;
    $('coins').textContent = num(0); paintCp();
    $('clock').textContent = secs(0);
    game.start();
  };
  $('playBtn').addEventListener('click', play);
  $('againBtn').addEventListener('click', () => { showBest(); play(); });

  $('clock').textContent = secs(0);
  showBest();
  $('loading').hidden = true;
  $('playBtn').hidden = false;
  state.ready = true;
}
