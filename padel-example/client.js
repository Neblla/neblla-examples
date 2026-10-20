// PistaLibre, una app de pádel de ejemplo hecha con Neblla, como Playtomic:
// los clubes de Madrid en una app. El jugador ve los clubes con su
// valoración, reserva pista (y abre una partida de 4 de su nivel), se apunta
// a las partidas abiertas de su nivel, dice el resultado, ve su nivel ELO y
// el ranking, y valora el club. Los clubes se dan de alta con un formulario
// y el dueño de la app los aprueba. Todo con neblla.*, sin servidor propio.
window.onNeblla = (neblla) => {
const $ = (id) => document.getElementById(id);
const BIZ = neblla.business;
const BOOKING = BIZ.booking;
const SET = 'padel';
const BOARD = 'nivel';
const P_PREMIUM = 'e56ab5210ae31216';
const TZ = 'Europe/Madrid';
let service = null, sites = [], products = [];
// Las preguntas del alta, las mismas que business.apply.fields en la configuración.
const applyFields = [
  { key: 'pistas', label: '¿Cuántas pistas tiene el club?', type: 'number', required: true },
  { key: 'cubiertas', label: '¿Son cubiertas?', type: 'boolean' },
  { key: 'web', label: 'Web o Instagram del club', type: 'text' },
];

const dayName = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dayShort = (d) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: TZ });
const hour = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const range = (days, from = new Date()) => ({ from: from.toISOString(), to: new Date(from.getTime() + days * 864e5).toISOString() });
const money = (p) => (p.price / 100).toLocaleString('es-ES', { style: 'currency', currency: (p.currency || 'eur').toUpperCase() });
const count = (n, one, many) => `${n || 0} ${n === 1 ? one : many}`;
const stars = (n) => '★★★★★'.slice(0, Math.round(n || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n || 0));
const siteOf = (id) => sites.find(s => s.id === id) || null;
const loggedIn = () => !!neblla.auth.me?.loggedIn;
const myId = () => neblla.auth.me?.id;
const errText = (err) => ({
  login_required: 'Entra con tu cuenta para seguir.',
  slot_full: 'Se acaba de llenar: ya son cuatro.',
  team_full: 'Ese lado ya tiene dos jugadores: apúntate al otro.',
  already_booked: 'Ya estás en esta partida.',
  slot_past: 'Esta partida ya ha empezado.',
  time_taken: 'Esa hora se acaba de ocupar: elige otra.',
  level_out_of_range: 'Esta partida es de otro nivel.',
  not_your_match: 'Solo quien abrió la partida puede ampliar el nivel.',
  match_not_played: 'La partida aún no se ha jugado.',
  report_closed: 'Ya pasó el plazo para decir el resultado.',
  match_decided: 'El resultado ya está decidido.',
  cheater_blocked: 'No puedes mandar resultados: tu cuenta está marcada.',
  application_pending: 'Ya tienes una solicitud esperando respuesta.',
  product_unavailable: 'Los pagos de prueba aún no están activos en este ejemplo.',
  checkout_failed: 'Los pagos de prueba aún no están activos en este ejemplo.',
  early_access: 'Esta partida aún es solo para Premium.',
}[err?.code || err?.message]) || 'No se pudo (' + (err?.code || err?.message || err) + ').';

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const empty = (text) => el('p', 'empty', text);
const needLogin = (box, text) => { box.replaceChildren(empty(text)); const b = el('button', 'btn small', 'Entrar'); b.onclick = () => neblla.auth.login(); box.append(b); };

// ── Pestañas ────────────────────────────────────────────────────────────
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);
let current = 'clubes';
function show(tab) {
  if (current === 'chat' && tab !== 'chat') leaveChat();
  current = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
  status('');
  const render = { clubes: renderClubs, club: renderClub, partidas: renderOpen, mias: renderMine, ranking: renderRanking, tu: renderYou, alta: renderApply }[tab];
  if (render) Promise.resolve().then(render).catch((e) => status(errText(e), true));
  window.scrollTo(0, 0);
}

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (loggedIn()) {
    who.append(el('b', '', neblla.auth.me.publicInfo?.name || 'Mi cuenta'));
    const out = el('button', 'link', 'Salir'); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light small', 'Entrar'); b.onclick = () => neblla.auth.login(); who.append(b);
  }
}

// ── Clubes ──────────────────────────────────────────────────────────────
function clubCard(s) {
  const c = el('button', 'club');
  if (s.photo) { const img = el('img'); img.src = s.photo; img.alt = s.name; img.loading = 'lazy'; c.append(img); }
  const body = el('div', 'club-b');
  body.append(el('b', '', s.name));
  const rate = el('div', 'rate');
  rate.append(el('span', 'stars', stars(s.rating)), el('span', '', s.ratingCount ? `${(s.rating || 0).toFixed(1).replace('.', ',')} · ${s.ratingCount} ${s.ratingCount === 1 ? 'opinión' : 'opiniones'}` : 'Sin opiniones aún'));
  body.append(rate);
  const facts = [s.address, s.fields?.pistas ? `${s.fields.pistas} pistas` : null, s.fields?.cubiertas ? 'cubiertas' : s.fields?.cubiertas === false ? 'al aire libre' : null].filter(Boolean);
  body.append(el('small', '', facts.join(' · ')));
  c.append(body);
  c.onclick = () => { club = s; show('club'); };
  return c;
}
async function renderClubs() {
  await loadServices();
  const box = $('clubs');
  box.replaceChildren(...(sites.length ? sites.map(clubCard) : [empty('Pronto, los primeros clubes.')]));
}

// Un club: su ficha, sus horas libres para reservar pista y sus opiniones.
let club = null, clubDay = 0, clubPick = null;
async function renderClub() {
  if (!club) return show('clubes');
  const s = club;
  const head = $('clubHead');
  head.replaceChildren();
  if (s.photo) { const img = el('img', 'cover'); img.src = s.photo; img.alt = s.name; head.append(img); }
  head.append(el('h1', '', s.name));
  head.append(el('div', 'rate big', `${stars(s.rating)}  ${s.ratingCount ? (s.rating || 0).toFixed(1).replace('.', ',') + ' · ' + s.ratingCount + ' opiniones' : 'Sin opiniones aún'}`));
  if (s.about) head.append(el('p', '', s.about));
  head.append(el('small', 'facts', [s.address, s.phone].filter(Boolean).join(' · ')));

  const days = $('days');
  days.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const b = el('button', i === clubDay ? 'on' : '');
    b.append(el('small', '', i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: TZ })), el('b', '', String(Number(dayKey(d).slice(8)))));
    b.onclick = () => { clubDay = i; clubPick = null; renderClub(); };
    days.append(b);
  }
  const day = new Date(Date.now() + clubDay * 864e5);
  const from = clubDay === 0 ? new Date() : new Date(dayKey(day) + 'T00:00:00+02:00');
  const to = new Date(dayKey(day) + 'T23:59:00+02:00');
  const [free, rev] = await Promise.all([
    BOOKING.times(SET, { from: from.toISOString(), to: to.toISOString(), site: s.id, step: 30 }).catch(() => []),
    BIZ.reviews(s.id).catch(() => ({ reviews: [] })),
  ]);
  const hours = $('hours');
  hours.replaceChildren();
  if (!free.length) hours.append(empty('No quedan pistas libres este día.'));
  for (const t of free) {
    const b = el('button', clubPick?.start === t.start ? 'on' : '', hour(new Date(t.start)));
    b.onclick = () => { clubPick = t; renderClub(); };
    hours.append(b);
  }
  const pick = $('hourPick');
  pick.replaceChildren();
  if (clubPick) {
    const st = new Date(clubPick.start);
    const card = el('div', 'pickcard main');
    card.append(el('div', 'kicker', 'Tu partida'));
    card.append(el('b', '', `${s.name} · ${dayName(st)} a las ${hour(st)}`));
    card.append(el('span', '', `${service?.minutes || 90} minutos, 4 jugadores. Tú abres la partida y se apuntan jugadores de tu nivel. Si a ${service?.confirmHours || 6} horas no sois cuatro, se cancela sola.`));
    const b = el('button', 'btn', 'Reservar y abrir partida');
    b.onclick = () => openMatch(clubPick);
    card.append(b);
    pick.append(card);
  }
  const list = $('reviews');
  list.replaceChildren();
  if (!rev.reviews?.length) list.append(empty('Aún nadie ha opinado. Juega aquí y sé el primero.'));
  for (const r of rev.reviews || []) {
    const row = el('div', 'item review');
    const what = el('div', 'what');
    what.append(el('b', '', `${stars(r.rating)}  ${r.name || 'Un jugador'}`));
    if (r.text) what.append(el('span', '', r.text));
    row.append(what, el('small', 'when', new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })));
    list.append(row);
  }
}
$('clubBack').onclick = () => show('clubes');

async function openMatch(t) {
  if (!loggedIn()) return neblla.auth.login();
  try {
    const r = await BOOKING.reserveAt(SET, { start: t.start, ...(t.site ? { site: t.site } : {}) });
    clubPick = null;
    const lv = r.slot?.level;
    status(`¡Pista reservada! Tu partida está abierta${lv ? ` a jugadores de nivel ${lv.min} a ${lv.max}` : ''}. Te avisamos cuando se apunten.`);
    show('mias');
  } catch (err) { status(errText(err), true); renderClub(); }
}

// ── Partidas abiertas de mi nivel ───────────────────────────────────────
function teamsLine(s) {
  const a = s.teams?.A ?? 0, b = s.teams?.B ?? 0;
  const dots = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 2 - n));
  return `A ${dots(a)}  B ${dots(b)}`;
}
async function renderOpen() {
  const box = $('open');
  const [slots, me] = await Promise.all([BOOKING.slots(SET, range(14)), loggedIn() ? neblla.scores.mine(BOARD).catch(() => null) : null]);
  $('levelHint').textContent = me ? `Tu nivel es ${me.rating}. Ves las partidas abiertas que encajan con él.` : 'Entra para ver solo las de tu nivel. Quien aún no ha jugado empieza en 1200.';
  const open = slots.filter(s => Date.parse(s.start) > Date.now() && s.state !== 'cancelled' && s.left > 0 && !s.booked);
  const list = document.createDocumentFragment();
  if (!open.length) list.append(empty('Ahora no hay partidas abiertas de tu nivel. Reserva pista en un club y abre la tuya.'));
  let lastDay = '';
  for (const s of open) {
    const st = new Date(s.start), d = dayName(st);
    if (d !== lastDay) { list.append(el('div', 'day', d)); lastDay = d; }
    const row = el('div', 'item match');
    row.append(el('div', 't', hour(st)));
    const what = el('div', 'what');
    what.append(el('b', '', s.siteName || siteOf(s.site)?.name || 'Club'));
    what.append(el('span', '', [s.resourceName, s.level ? `nivel ${s.level.min}–${s.level.max}` : null, `faltan ${s.left}`].filter(Boolean).join(' · ')));
    what.append(el('small', 'teams', teamsLine(s)));
    if (s.earlyUntil && Date.parse(s.earlyUntil) > Date.now()) what.append(el('small', 'early', `⭐ Premium: la ves antes que nadie. Los demás, desde las ${hour(new Date(s.earlyUntil))}.`));
    row.append(what);
    const acts = el('div', 'acts');
    for (const side of ['A', 'B']) {
      const n = s.teams?.[side] ?? 0;
      const b = el('button', 'btn small' + (side === 'B' ? ' ghost' : ''), 'Lado ' + side);
      b.disabled = n >= 2;
      b.onclick = () => join(s, side);
      acts.append(b);
    }
    row.append(acts);
    list.append(row);
  }
  box.replaceChildren(list);
}
async function join(s, team) {
  if (!loggedIn()) return neblla.auth.login();
  try {
    const r = await BOOKING.reserve(SET, s.id, { team });
    status(r.left === 0 ? '¡Partida completa! Ya sois cuatro: nos vemos en la pista.' : `Te has apuntado al lado ${team}. Faltan ${r.left}.`);
  } catch (err) {
    status(err?.code === 'level_out_of_range' ? `Esta partida es de nivel ${err.min}–${err.max} y el tuyo es ${err.rating}.`
      : err?.code === 'early_access' && err.until ? `Esta partida aún es solo para Premium: se abre a todos a las ${hour(new Date(err.until))}.`
      : errText(err), true);
  }
  renderOpen();
}

// ── Mis partidas: las próximas (con su chat) y las jugadas (resultado y club) ──
const MATCH_STATE = { open: 'Esperando resultados', agreed: 'Resultado confirmado', disputed: 'En disputa: lo revisa PistaLibre', resolved: 'Resuelto por PistaLibre', none: 'Sin resultado', annulled: 'Anulada' };
async function renderMine() {
  const next = $('next'), played = $('played');
  if (!loggedIn()) { needLogin(next, 'Entra para ver tus partidas.'); played.replaceChildren(); return; }
  const [bookings, matches, slots] = await Promise.all([BOOKING.mine(SET), BIZ.matches.mine().catch(() => []), BOOKING.slots(SET, range(14)).catch(() => [])]);
  const slotOf = new Map(slots.map(s => [s.id, s]));
  const now = Date.now();
  const up = bookings.filter(b => b.status === 'reserved' && Date.parse(b.end || b.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  next.replaceChildren();
  if (!up.length) next.append(empty('No tienes partidas próximas. Apúntate a una en «Partidas» o reserva pista en un club.'));
  for (const b of up) {
    const st = new Date(b.start), s = slotOf.get(b.slot) || {};
    const row = el('div', 'item mine');
    row.append(el('div', 't', hour(st)));
    const what = el('div', 'what');
    what.append(el('b', '', `${dayShort(st)} · ${s.siteName || siteOf(b.site)?.name || 'Club'}`));
    const state = (s.state || b.state) === 'confirmed' ? 'Confirmada: sois cuatro' : `Buscando jugadores${s.left ? ` · faltan ${s.left}` : ''}`;
    what.append(el('span', '', [s.team ? 'Lado ' + s.team : null, state].filter(Boolean).join(' · ')));
    if (s.teams) what.append(el('small', 'teams', teamsLine(s)));
    row.append(what);
    const acts = el('div', 'acts');
    const room = b.room || s.room;
    if (room) { const c = el('button', 'btn small', 'Chat'); c.onclick = () => openChat(room, b); acts.append(c); }
    if (s.level && s.byClient && s.left > 0) { const w = el('button', 'btn ghost small', 'Ampliar nivel'); w.onclick = () => widen(s); acts.append(w); }
    const x = el('button', 'btn ghost small', 'No puedo'); x.onclick = () => cancel(b.slot); acts.append(x);
    row.append(acts);
    next.append(row);
  }

  played.replaceChildren();
  if (!matches.length) played.append(empty('Aún no has jugado ninguna partida.'));
  for (const m of matches) {
    const st = new Date(m.start);
    const card = el('div', 'item played');
    const what = el('div', 'what');
    const won = m.winner && m.winner !== 'draw' ? m.winner === m.team : null;
    what.append(el('b', '', `${dayShort(st)} · ${siteOf(m.site)?.name || m.siteName || 'Partida'}` + (m.score ? ` · ${m.score}` : '')));
    what.append(el('span', 'state ' + m.state, (won === true ? '🏆 Ganada · ' : won === false ? 'Perdida · ' : m.winner === 'draw' ? 'Empate · ' : '') + (MATCH_STATE[m.state] || m.state)));
    card.append(what);
    const acts = el('div', 'acts');
    if (m.state === 'open' && !m.reported) { const r = el('button', 'btn small', 'Decir resultado'); r.onclick = () => reportForm(card, m); acts.append(r); }
    else if (m.state === 'open') acts.append(el('span', 'tag', 'Ya lo dijiste'));
    if (m.site || m.match) { const v = el('button', 'btn ghost small', 'Valorar el club'); v.onclick = () => rateForm(card, m); acts.append(v); }
    card.append(acts);
    played.append(card);
  }
}

function reportForm(card, m) {
  card.querySelector('.inline')?.remove();
  const f = el('form', 'inline');
  f.append(el('b', '', '¿Quién ganó?'));
  const side = el('div', 'chips');
  let winner = null;
  for (const [v, label] of [[m.team, 'Mi lado'], [m.team === 'A' ? 'B' : 'A', 'El otro lado'], ['draw', 'Empate']]) {
    const b = el('button', '', label); b.type = 'button';
    b.onclick = () => { winner = v; for (const x of side.children) x.classList.toggle('on', x === b); };
    side.append(b);
  }
  const score = el('input'); score.placeholder = 'Resultado, p. ej. 6-3 4-6 7-5'; score.maxLength = 40;
  const send = el('button', 'btn small', 'Mandar');
  f.append(side, score, send);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!winner) return status('Elige quién ganó.', true);
    try {
      const r = await BIZ.matches.report(m.match, { winner, ...(score.value.trim() ? { score: score.value.trim() } : {}) });
      status(r.state === 'agreed' ? '¡Hecho! Todos coincidís: ya cuenta para el ranking.' : r.state === 'disputed' ? 'Otro jugador dijo otra cosa: PistaLibre lo revisará.' : 'Gracias. Cuando lo diga el otro lado, contará para el ranking.');
    } catch (err) { status(errText(err), true); }
    renderMine();
  };
  card.append(f);
}

function rateForm(card, m) {
  card.querySelector('.inline')?.remove();
  const f = el('form', 'inline');
  f.append(el('b', '', '¿Qué tal el club?'));
  let rating = 0;
  const row = el('div', 'starpick');
  for (let i = 1; i <= 5; i++) {
    const b = el('button', '', '★'); b.type = 'button';
    b.onclick = () => { rating = i; [...row.children].forEach((x, k) => x.classList.toggle('on', k < i)); };
    row.append(b);
  }
  const text = el('input'); text.placeholder = 'Pistas, vestuarios, ambiente…'; text.maxLength = 300;
  const send = el('button', 'btn small', 'Valorar');
  f.append(row, text, send);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!rating) return status('Elige de 1 a 5 estrellas.', true);
    try {
      await BIZ.rate({ site: m.site, slot: m.match, rating, ...(text.value.trim() ? { text: text.value.trim() } : {}) });
      status('¡Gracias! Tu opinión ayuda a otros jugadores.');
      await loadServices(true);
    } catch (err) { status(errText(err), true); }
    renderMine();
  };
  card.append(f);
}

async function widen(s) {
  const min = Math.max(0, (s.level?.min || 1200) - 100);
  try {
    const r = await BOOKING.widenLevel(SET, s.id, { min, max: (s.level?.max || 1200) + 100 });
    status(`Ahora pueden apuntarse jugadores de nivel ${r.level.min} a ${r.level.max}.`);
  } catch (err) { status(errText(err), true); }
  renderMine();
}

async function cancel(slot) {
  try {
    const { refunded } = await BOOKING.cancel(SET, slot);
    status(refunded === false ? 'Te has borrado fuera de plazo: avisa al club.' : 'Te has borrado: tu plaza queda libre para otro jugador.');
  } catch (err) { status(errText(err), true); }
  renderMine();
}

// ── Ranking ELO ─────────────────────────────────────────────────────────
async function renderRanking() {
  const meBox = $('me');
  meBox.replaceChildren();
  const [top, me] = await Promise.all([neblla.scores.top(BOARD, { limit: 50 }), loggedIn() ? neblla.scores.mine(BOARD).catch(() => null) : null]);
  if (me) {
    meBox.append(el('div', 'kicker', 'Tu nivel'));
    const big = el('div', 'elo');
    big.append(el('b', '', String(me.rating)), el('span', '', me.place ? `#${me.place} del ranking` : 'aún sin puesto'));
    meBox.append(big);
    meBox.append(el('small', '', [count(me.played, 'partida', 'partidas'), count(me.won, 'ganada', 'ganadas'), count(me.lost, 'perdida', 'perdidas')].join(' · ') + (me.drawn ? ' · ' + count(me.drawn, 'empate', 'empates') : '')));
    if (me.history?.length) {
      const spark = el('div', 'spark');
      const pts = [...me.history].reverse();
      const lo = Math.min(...pts.map(h => h.rating)) - 10, hi = Math.max(...pts.map(h => h.rating)) + 10;
      for (const h of pts) {
        const bar = el('i', h.delta >= 0 ? 'up' : 'down');
        bar.style.height = Math.max(8, Math.round(((h.rating - lo) / (hi - lo)) * 100)) + '%';
        bar.title = `${h.delta >= 0 ? '+' : ''}${h.delta} → ${h.rating}`;
        spark.append(bar);
      }
      meBox.append(spark);
    }
  } else {
    meBox.append(el('div', 'kicker', 'Tu nivel'));
    meBox.append(el('p', '', loggedIn() ? 'Juega tu primera partida: empiezas en 1200 y cada resultado te mueve.' : 'Entra y juega: cada victoria te sube y cada derrota te baja, según el nivel del rival.'));
  }
  const box = $('top');
  box.replaceChildren();
  if (!top.length) box.append(empty('El ranking empieza con la primera partida.'));
  for (const r of top) {
    const row = el('div', 'item rank' + (r.me ? ' mine' : ''));
    row.append(el('div', 't', '#' + r.place));
    const what = el('div', 'what');
    what.append(el('b', '', r.info?.name || 'Jugador'), el('span', '', `${count(r.played, 'partida', 'partidas')} · ${count(r.won, 'ganada', 'ganadas')}`));
    row.append(what, el('div', 'pts', String(r.value)));
    box.append(row);
  }
}

// ── Tú: Premium y los avisos del club ───────────────────────────────────
async function renderYou() {
  const box = $('msgs');
  box.replaceChildren();
  if (!loggedIn()) { needLogin(box, 'Entra para ver tus avisos.'); return; }
  const list = [...(neblla.inbox.messages || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!list.length) box.append(empty('Aún no tienes avisos.'));
  for (const m of list) {
    const reminder = m.data?.type === 'booking.reminder';
    const b = el('div', 'bubble' + (reminder ? ' remind' : ''));
    if (reminder) b.append(el('div', 'kicker', '⏰ Mañana juegas'));
    b.append(el('div', '', m.message));
    b.append(el('small', '', (m.data?.name || 'PistaLibre') + ' · ' + new Date(m.createdAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    box.append(b);
  }
}
$('buyPremium').onclick = async () => {
  if (!loggedIn()) return neblla.auth.login();
  if (!products.some(p => p.productId === P_PREMIUM)) return status('Los pagos de prueba aún no están activos en este ejemplo.', true);
  try { await neblla.shop.buy(P_PREMIUM); } catch (err) { status(errText(err), true); }
};
neblla.shop.on('purchase', (e) => { if (e?.productId === P_PREMIUM) status('¡Ya eres Premium! Gracias por apoyar PistaLibre.'); });
neblla.inbox.on('messages', () => { if (current === 'tu') renderYou(); });

// ── Alta de un club: el formulario, y el estado de mis solicitudes ───────
const APP_STATE = { pending: 'Esperando respuesta', approved: 'Aprobado: ya sale en PistaLibre', rejected: 'No aprobado' };
async function renderApply() {
  const fields = $('applyFields');
  fields.replaceChildren();
  for (const f of applyFields) {
    const l = el('label', f.type === 'boolean' ? 'check' : '');
    const input = el('input');
    input.name = 'f_' + f.key;
    input.type = f.type === 'number' ? 'number' : f.type === 'boolean' ? 'checkbox' : 'text';
    if (f.required && f.type !== 'boolean') input.required = true;
    if (f.type === 'boolean') l.append(input, document.createTextNode(' ' + f.label)); else l.append(document.createTextNode(f.label), input);
    fields.append(l);
  }
  const mine = $('myApps');
  mine.replaceChildren();
  if (!loggedIn()) return;
  for (const a of await BIZ.applications().catch(() => [])) {
    const row = el('div', 'item');
    const what = el('div', 'what');
    what.append(el('b', '', a.name), el('span', '', (APP_STATE[a.status] || a.status) + (a.reason ? ': ' + a.reason : '')));
    row.append(what);
    mine.append(row);
  }
}
$('apply').onsubmit = async (e) => {
  e.preventDefault();
  if (!loggedIn()) return neblla.auth.login();
  const f = new FormData(e.target);
  const form = { name: f.get('name'), address: f.get('address'), timeZone: TZ, fields: {} };
  for (const k of ['phone', 'about']) if (String(f.get(k) || '').trim()) form[k] = String(f.get(k)).trim();
  for (const q of applyFields) {
    const v = f.get('f_' + q.key);
    if (q.type === 'boolean') form.fields[q.key] = v === 'on';
    else if (v !== null && v !== '') form.fields[q.key] = q.type === 'number' ? Number(v) : String(v);
  }
  try {
    await BIZ.apply(form);
    e.target.reset();
    status('¡Solicitud enviada! La revisamos y te avisamos aquí.');
  } catch (err) { status(errText(err), true); }
  renderApply();
};
BIZ.on('update', ({ application }) => {
  if (!application) return;
  status(application.status === 'approved' ? `¡${application.name} ya está en PistaLibre! Entra en developers.neblla.com para gestionar tus pistas.` : `Tu solicitud de ${application.name} no se ha aprobado${application.reason ? ': ' + application.reason : '.'}`, application.status !== 'approved');
  if (current === 'alta') renderApply();
});

// ── Chat de cada partida: los cuatro jugadores y el club ─────────────────
let chatRoom = null;
const textOf = (x) => (typeof x === 'string' ? x : x?.text ?? '');
const chatLine = (who, text, mine) => { const b = el('div', 'bubble' + (mine ? ' me' : '')); b.append(el('div', '', text), el('small', '', who || 'Alguien')); return b; };
async function openChat(room, b) {
  chatRoom = room;
  current = 'chat';
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-chat';
  $('chatTitle').textContent = `Partida · ${dayShort(new Date(b.start))} ${hour(new Date(b.start))}`;
  const box = $('chatMsgs');
  box.replaceChildren(empty('Entrando…'));
  try {
    await neblla.rooms.join(room);
    const hist = await neblla.room.history({ limit: 100 }).catch(() => []);
    const items = (Array.isArray(hist) ? hist : hist?.messages || []).slice().reverse();
    box.replaceChildren();
    if (!items.length) box.append(empty('Nadie ha escrito todavía.'));
    for (const m of items) if (!m.deleted) box.append(chatLine(m.from === 'business' ? (m.body?.name || 'El club') : (m.user?.publicInfo?.name || m.name), textOf(m.body ?? m.data), m.from === myId()));
    box.scrollTop = box.scrollHeight;
  } catch (err) { box.replaceChildren(empty(errText(err))); }
}
function leaveChat() { if (chatRoom) { neblla.room.leave?.(); chatRoom = null; } }
neblla.message.on((m) => {
  if (!chatRoom || current !== 'chat') return;
  const box = $('chatMsgs');
  box.querySelector('.empty')?.remove();
  box.append(chatLine(m.from === 'business' ? (m.data?.name || 'El club') : m.user?.publicInfo?.name, textOf(m.data), !!m.fromMe));
  box.scrollTop = box.scrollHeight;
});
$('chatSend').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatMsg').value.trim();
  if (!text || !chatRoom) return;
  neblla.message.send({ text });
  $('chatMsg').value = '';
};
$('chatBack').onclick = () => show('mias');

// Lo que cambia mientras miras: alguien se apunta, se confirma, se cancela,
// o se decide el resultado de una partida tuya.
BOOKING.on('update', ({ booking }) => {
  if (booking?.status === 'cancelled') status({
    below_min: 'Una partida tuya no llegó a cuatro jugadores y se ha cancelado.',
    session_cancelled: 'El club ha cancelado una partida tuya.',
    closed: 'El club cierra ese día: tu partida se ha cancelado.',
  }[booking.reason] || 'Una partida tuya se ha cancelado.', true);
  if (current === 'mias') renderMine(); else if (current === 'partidas') renderOpen();
});
BIZ.matches.on('update', (m) => {
  if (m.state === 'agreed' || m.state === 'resolved') status(m.resolution?.reason === 'cheater' ? 'Una disputa tuya se ha resuelto a tu favor.' : 'El resultado de una partida tuya ya cuenta para el ranking.');
  if (current === 'mias') renderMine(); else if (current === 'ranking') renderRanking();
});

// ── Arranque ────────────────────────────────────────────────────────────
let loaded = 0;
async function loadServices(force) {
  if (!force && loaded && Date.now() - loaded < 60e3) return;
  const r = await BOOKING.services();
  service = (r.services || []).find(s => s.id === SET) || null;
  sites = (r.sites || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
  loaded = Date.now();
}
async function boot() {
  try { await loadServices(); } catch (_) {}
  try {
    products = await neblla.shop.products();
    const p = products.find(x => x.productId === P_PREMIUM);
    if (p) $('pPrice').textContent = money(p) + ' al mes';
  } catch (_) {}
  renderWho();
  show('clubes');
}
neblla.auth.on('login', () => { renderWho(); show(current === 'chat' ? 'mias' : current); });
neblla.auth.on('logout', () => { renderWho(); show('clubes'); });
boot();
};
