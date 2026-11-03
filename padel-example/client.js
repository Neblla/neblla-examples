// PistaLibre, una app de pádel de ejemplo hecha con Neblla, como Playtomic:
// los clubes de Madrid en una app. El jugador ve los clubes con su
// valoración, reserva pista (y abre una partida de 4 de su nivel), se apunta
// a las partidas abiertas de su nivel, y cada uno paga su plaza al reservar,
// al club de esa pista (con Stripe; en el ejemplo, pagos de prueba con la
// tarjeta 4242 4242 4242 4242). Dice el resultado, ve su nivel ELO y
// el ranking, y valora el club. Los clubes se dan de alta con un formulario
// y el dueño de la app los aprueba. Todo con neblla.*, sin servidor propio.
//
// Idiomas: los textos están en lang/<código>.json y los pinta /connect/lang.js
// (data-i18n* en el HTML, nebllaLang.t en el código, repintado con nebllaLang.on).
// Fechas, horas, números y precios salen de Intl en el idioma activo. Los nombres
// de clubes y pistas salen tal cual de los datos de Neblla.
window.onNeblla = async (neblla) => {
await nebllaLang.ready;
const $ = (id) => document.getElementById(id);
const T = (k, v) => nebllaLang.t(k, v);
const BIZ = neblla.business;
const BOOKING = BIZ.booking;
const SET = 'padel';
const BOARD = 'nivel';
const P_PREMIUM = 'e56ab5210ae31216';
const TZ = 'Europe/Madrid';
let service = null, sites = [], products = [];
// Las preguntas del alta, las mismas que business.apply.fields en la configuración.
// Sus textos van en lang/<código>.json (apply_f_<clave>).
const applyFields = [
  { key: 'pistas', type: 'number', required: true },
  { key: 'cubiertas', type: 'boolean' },
  { key: 'web', type: 'text' },
];

// ── Fechas, horas, números y precios en el idioma activo ────────────────
const LOC = () => ({ pt: 'pt-BR', es: 'es-ES', en: 'en-GB' }[nebllaLang.lang] || nebllaLang.lang);
const fmt = (opts, d) => new Intl.DateTimeFormat(LOC(), { timeZone: TZ, hourCycle: 'h23', ...opts }).format(d);
const dayName = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }, d);
const dayShort = (d) => fmt({ weekday: 'short', day: 'numeric' }, d);
const hour = (d) => fmt({ hour: '2-digit', minute: '2-digit' }, d);
const dateShort = (d) => fmt({ day: 'numeric', month: 'short' }, d);
const dateTimeShort = (d) => fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, d);
const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const range = (days, from = new Date()) => ({ from: from.toISOString(), to: new Date(from.getTime() + days * 864e5).toISOString() });
const money = (p) => new Intl.NumberFormat(LOC(), { style: 'currency', currency: (p.currency || 'eur').toUpperCase() }).format(p.price / 100);
const num = (n) => new Intl.NumberFormat(LOC()).format(n ?? 0);
const num1 = (n) => new Intl.NumberFormat(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n || 0);
const hoursText = (n) => T('hours_n', { n });
const stars = (n) => '★★★★★'.slice(0, Math.round(n || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n || 0));
const ratingText = (s) => (s.ratingCount ? T('rating_count', { r: num1(s.rating), n: s.ratingCount }) : T('no_reviews_yet'));
const siteOf = (id) => sites.find(s => s.id === id) || null;
// Lo que cuesta cada plaza (el producto del servicio) y si el club ya cobra por la app.
const placePrice = () => (service?.price ? money({ price: service.price.amount, currency: service.price.currency }) : null);
const clubWaiting = (id) => !!service?.sellerWaiting?.includes('site:' + id);
const payHint = () => (placePrice() ? T('pay_hint_price', { price: placePrice() }) : T('pay_hint'));
const loggedIn = () => !!neblla.auth.me?.loggedIn;
const myId = () => neblla.auth.me?.id;
const ERR = {
  login_required: 'err_login_required', slot_full: 'err_slot_full', team_full: 'err_team_full', already_booked: 'err_already_booked',
  slot_past: 'err_slot_past', time_taken: 'err_time_taken', level_out_of_range: 'err_level_out_of_range', not_your_match: 'err_not_your_match',
  match_not_played: 'err_match_not_played', report_closed: 'err_report_closed', match_decided: 'err_match_decided', cheater_blocked: 'err_cheater_blocked',
  application_pending: 'err_application_pending', product_unavailable: 'err_payments_off', checkout_failed: 'err_payments_off',
  booking_product_missing: 'err_payments_off', early_access: 'err_early_access', seller_waiting: 'err_seller_waiting',
  seller_not_found: 'err_seller_waiting', popup_blocked: 'err_popup_blocked',
};
const errText = (err) => {
  const code = err?.code || err?.message;
  if (ERR[code]) return T(ERR[code]);
  // The SDK's refusals (product_waiting, product_not_published…) carry a sentence in the page's language.
  const sdk = err && typeof err.message === 'string' ? err.message : '';
  if (sdk && sdk !== code && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(sdk)) return sdk;
  return T('err_other', { code: code || err });
};

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const empty = (text) => el('p', 'empty', text);
const needLogin = (box, text) => { box.replaceChildren(empty(text)); const b = el('button', 'btn small', T('login')); b.onclick = () => neblla.auth.login(); box.append(b); };

// Lo que lleva variables o atributos que lang.js no pinta solo.
function paintStatic() {
  document.title = T('title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', T('meta_desc'));
  const p = products.find(x => x.productId === P_PREMIUM);
  if (p) $('pPrice').textContent = T('price_month', { price: money(p) });
}

// ── Pestañas ────────────────────────────────────────────────────────────
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);
let current = 'clubes';
const RENDER = () => ({ clubes: renderClubs, club: renderClub, partidas: renderOpen, mias: renderMine, ranking: renderRanking, tu: renderYou, alta: renderApply });
function show(tab) {
  if (current === 'chat' && tab !== 'chat') leaveChat();
  current = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
  status('');
  const render = RENDER()[tab];
  if (render) Promise.resolve().then(render).catch((e) => status(errText(e), true));
  window.scrollTo(0, 0);
}

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (loggedIn()) {
    who.append(el('b', '', neblla.auth.me.publicInfo?.name || T('my_account')));
    const out = el('button', 'link', T('logout')); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light small', T('login')); b.onclick = () => neblla.auth.login(); who.append(b);
  }
}

// ── Clubes ──────────────────────────────────────────────────────────────
function clubCard(s) {
  const c = el('button', 'club');
  if (s.photo) { const img = el('img'); img.src = s.photo; img.alt = s.name; img.loading = 'lazy'; c.append(img); }
  const body = el('div', 'club-b');
  body.append(el('b', '', s.name));
  const rate = el('div', 'rate');
  rate.append(el('span', 'stars', stars(s.rating)), el('span', '', ratingText(s)));
  body.append(rate);
  const facts = [s.address, s.fields?.pistas ? T('courts_n', { n: s.fields.pistas }) : null, s.fields?.cubiertas ? T('covered') : s.fields?.cubiertas === false ? T('outdoor') : null].filter(Boolean);
  body.append(el('small', '', facts.join(' · ')));
  c.append(body);
  c.onclick = () => { club = s; show('club'); };
  return c;
}
async function renderClubs() {
  await loadServices();
  const box = $('clubs');
  box.replaceChildren(...(sites.length ? sites.map(clubCard) : [empty(T('clubs_none'))]));
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
  head.append(el('div', 'rate big', `${stars(s.rating)}  ${ratingText(s)}`));
  if (s.about) head.append(el('p', '', s.about));
  head.append(el('small', 'facts', [s.address, s.phone].filter(Boolean).join(' · ')));

  const days = $('days');
  days.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const b = el('button', i === clubDay ? 'on' : '');
    b.append(el('small', '', i === 0 ? T('today') : i === 1 ? T('tomorrow') : fmt({ weekday: 'short' }, d)), el('b', '', num(Number(dayKey(d).slice(8)))));
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
  if (!free.length) hours.append(empty(T('no_free_courts')));
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
    card.append(el('div', 'kicker', T('your_match')));
    card.append(el('b', '', T('pick_title', { club: s.name, day: dayName(st), time: hour(st) })));
    card.append(el('span', '', T('pick_desc', { min: service?.minutes || 90, hours: hoursText(service?.confirmHours || 6) })));
    if (clubWaiting(s.id)) {
      card.append(el('small', 'pay', T('club_waiting')));
    } else {
      card.append(el('small', 'pay', placePrice() ? T('pay_each_price', { price: placePrice(), club: s.name, hours: hoursText(service?.cancelHours || 24) }) : T('pay_each', { club: s.name, hours: hoursText(service?.cancelHours || 24) })));
      const b = el('button', 'btn', placePrice() ? T('btn_pay_open', { price: placePrice() }) : T('btn_reserve_open'));
      b.onclick = () => openMatch(clubPick);
      card.append(b);
    }
    pick.append(card);
  }
  const list = $('reviews');
  list.replaceChildren();
  if (!rev.reviews?.length) list.append(empty(T('reviews_empty')));
  for (const r of rev.reviews || []) {
    const row = el('div', 'item review');
    const what = el('div', 'what');
    what.append(el('b', '', `${stars(r.rating)}  ${r.name || T('a_player')}`));
    if (r.text) what.append(el('span', '', r.text));
    row.append(what, el('small', 'when', dateShort(new Date(r.at))));
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
    show('mias');
    status(r.held ? T('held_court', { hint: payHint() })
      : lv ? T('court_reserved_level', { min: lv.min, max: lv.max }) : T('court_reserved'));
  } catch (err) { status(errText(err), true); renderClub(); }
}

// ── Partidas abiertas de mi nivel ───────────────────────────────────────
function teamsLine(s) {
  const a = s.teams?.A ?? 0, b = s.teams?.B ?? 0;
  const dots = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 2 - n));
  return `A ${dots(a)}  B ${dots(b)}`;
}
const teamsEl = (s) => { const e = el('small', 'teams', teamsLine(s)); e.dir = 'ltr'; return e; };
async function renderOpen() {
  const box = $('open');
  const [slots, me] = await Promise.all([BOOKING.slots(SET, range(14)), loggedIn() ? neblla.scores.mine(BOARD).catch(() => null) : null]);
  $('levelHint').textContent = me ? T('level_hint_me', { rating: num(me.rating) }) : T('level_hint_guest', { start: num(1200) });
  const open = slots.filter(s => Date.parse(s.start) > Date.now() && s.state !== 'cancelled' && s.left > 0 && !s.booked);
  const list = document.createDocumentFragment();
  if (!open.length) list.append(empty(T('open_empty')));
  let lastDay = '';
  for (const s of open) {
    const st = new Date(s.start), d = dayName(st);
    if (d !== lastDay) { list.append(el('div', 'day', d)); lastDay = d; }
    const row = el('div', 'item match');
    row.append(el('div', 't', hour(st)));
    const what = el('div', 'what');
    what.append(el('b', '', s.siteName || siteOf(s.site)?.name || T('club_default')));
    what.append(el('span', '', [s.resourceName, s.level ? T('level_range', { min: num(s.level.min), max: num(s.level.max) }) : null, T('left_n', { n: s.left })].filter(Boolean).join(' · ')));
    what.append(teamsEl(s));
    if (placePrice()) what.append(el('small', 'pay', T('your_place_price', { price: placePrice() })));
    if (s.earlyUntil && Date.parse(s.earlyUntil) > Date.now()) what.append(el('small', 'early', T('early_note', { time: hour(new Date(s.earlyUntil)) })));
    row.append(what);
    const acts = el('div', 'acts');
    for (const side of ['A', 'B']) {
      const n = s.teams?.[side] ?? 0;
      const b = el('button', 'btn small' + (side === 'B' ? ' ghost' : ''), T('side_btn', { side }));
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
    status(r.held ? T('held_side', { team, hint: payHint() })
      : r.left === 0 ? T('match_full') : T('joined', { team, n: r.left }));
  } catch (err) {
    status(err?.code === 'level_out_of_range' ? T('err_level_out_of_range_detail', { min: num(err.min), max: num(err.max), rating: num(err.rating) })
      : err?.code === 'early_access' && err.until ? T('err_early_until', { time: hour(new Date(err.until)) })
      : errText(err), true);
  }
  renderOpen();
}

// ── Mis partidas: las próximas (con su chat) y las jugadas (resultado y club) ──
const resultText = (won, m) => {
  const state = MATCH_STATE[m.state] ? T(MATCH_STATE[m.state]) : m.state;
  return won === true ? T('result_won', { state }) : won === false ? T('result_lost', { state }) : m.winner === 'draw' ? T('result_draw', { state }) : state;
};
const MATCH_STATE = { open: 'ms_open', agreed: 'ms_agreed', disputed: 'ms_disputed', resolved: 'ms_resolved', none: 'ms_none', annulled: 'ms_annulled' };
async function renderMine() {
  const next = $('next'), played = $('played');
  if (!loggedIn()) { needLogin(next, T('mine_login')); played.replaceChildren(); return; }
  const [bookings, matches, slots] = await Promise.all([BOOKING.mine(SET), BIZ.matches.mine().catch(() => []), BOOKING.slots(SET, range(14)).catch(() => [])]);
  const slotOf = new Map(slots.map(s => [s.id, s]));
  const now = Date.now();
  const up = bookings.filter(b => (b.status === 'reserved' || (b.status === 'held' && Date.parse(b.holdUntil) > now)) && Date.parse(b.end || b.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  next.replaceChildren();
  if (!up.length) next.append(empty(T('mine_empty')));
  for (const b of up) {
    const st = new Date(b.start), s = slotOf.get(b.slot) || {};
    const row = el('div', 'item mine');
    row.append(el('div', 't', hour(st)));
    const what = el('div', 'what');
    what.append(el('b', '', `${dayShort(st)} · ${s.siteName || siteOf(b.site)?.name || T('club_default')}`));
    const state = b.status === 'held' ? T('state_held', { time: hour(new Date(b.holdUntil)) }) : (s.state || b.state) === 'confirmed' ? T('state_confirmed') : `${T('state_looking')}${s.left ? ' · ' + T('left_n', { n: s.left }) : ''}`;
    what.append(el('span', '', [s.team ? T('side_label', { side: s.team }) : null, state].filter(Boolean).join(' · ')));
    if (s.teams) what.append(teamsEl(s));
    row.append(what);
    const acts = el('div', 'acts');
    if (b.status === 'held') { const p = el('button', 'btn small', placePrice() ? T('pay_btn_price', { price: placePrice() }) : T('pay_btn')); p.onclick = () => payAgain(b); acts.append(p); }
    const room = b.room || s.room;
    if (room) { const c = el('button', 'btn small', T('chat_btn')); c.onclick = () => openChat(room, b); acts.append(c); }
    if (s.level && s.byClient && s.left > 0) { const w = el('button', 'btn ghost small', T('widen_btn')); w.onclick = () => widen(s); acts.append(w); }
    const x = el('button', 'btn ghost small', T('cant_btn')); x.onclick = () => cancel(b.slot); acts.append(x);
    row.append(acts);
    next.append(row);
  }

  played.replaceChildren();
  if (!matches.length) played.append(empty(T('played_empty')));
  for (const m of matches) {
    const st = new Date(m.start);
    const card = el('div', 'item played');
    const what = el('div', 'what');
    const won = m.winner && m.winner !== 'draw' ? m.winner === m.team : null;
    what.append(el('b', '', `${dayShort(st)} · ${siteOf(m.site)?.name || m.siteName || T('match_default')}` + (m.score ? ` · ${m.score}` : '')));
    what.append(el('span', 'state ' + m.state, resultText(won, m)));
    card.append(what);
    const acts = el('div', 'acts');
    if (m.state === 'open' && !m.reported) { const r = el('button', 'btn small', T('report_btn')); r.onclick = () => reportForm(card, m); acts.append(r); }
    else if (m.state === 'open') acts.append(el('span', 'tag', T('already_reported')));
    if (m.site || m.match) { const v = el('button', 'btn ghost small', T('rate_btn')); v.onclick = () => rateForm(card, m); acts.append(v); }
    card.append(acts);
    played.append(card);
  }
}

function reportForm(card, m) {
  card.querySelector('.inline')?.remove();
  const f = el('form', 'inline');
  f.append(el('b', '', T('who_won')));
  const side = el('div', 'chips');
  let winner = null;
  for (const [v, label] of [[m.team, T('my_side')], [m.team === 'A' ? 'B' : 'A', T('other_side')], ['draw', T('draw')]]) {
    const b = el('button', '', label); b.type = 'button';
    b.onclick = () => { winner = v; for (const x of side.children) x.classList.toggle('on', x === b); };
    side.append(b);
  }
  const score = el('input'); score.placeholder = T('score_ph'); score.maxLength = 40; score.dir = 'ltr';
  const send = el('button', 'btn small', T('send_report'));
  f.append(side, score, send);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!winner) return status(T('pick_winner'), true);
    try {
      const r = await BIZ.matches.report(m.match, { winner, ...(score.value.trim() ? { score: score.value.trim() } : {}) });
      status(r.state === 'agreed' ? T('report_agreed') : r.state === 'disputed' ? T('report_disputed') : T('report_thanks'));
    } catch (err) { status(errText(err), true); }
    renderMine();
  };
  card.append(f);
}

function rateForm(card, m) {
  card.querySelector('.inline')?.remove();
  const f = el('form', 'inline');
  f.append(el('b', '', T('how_club')));
  let rating = 0;
  const row = el('div', 'starpick');
  for (let i = 1; i <= 5; i++) {
    const b = el('button', '', '★'); b.type = 'button';
    b.onclick = () => { rating = i; [...row.children].forEach((x, k) => x.classList.toggle('on', k < i)); };
    row.append(b);
  }
  const text = el('input'); text.placeholder = T('rate_ph'); text.maxLength = 300;
  const send = el('button', 'btn small', T('rate_send'));
  f.append(row, text, send);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!rating) return status(T('pick_stars'), true);
    try {
      await BIZ.rate({ site: m.site, slot: m.match, rating, ...(text.value.trim() ? { text: text.value.trim() } : {}) });
      status(T('rate_thanks'));
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
    status(T('widened', { min: num(r.level.min), max: num(r.level.max) }));
  } catch (err) { status(errText(err), true); }
  renderMine();
}

// Pagar una plaza guardada: reservar otra vez es la misma reserva, y abre el pago.
async function payAgain(b) {
  try { await BOOKING.reserve(SET, b.slot, b.team ? { team: b.team } : {}); status(payHint()); }
  catch (err) { status(errText(err), true); }
  renderMine();
}

async function cancel(slot) {
  try {
    const { refunded } = await BOOKING.cancel(SET, slot);
    status(refunded === false ? T('cancel_late') : T('cancel_ok'));
  } catch (err) { status(errText(err), true); }
  renderMine();
}

// ── Ranking ELO ─────────────────────────────────────────────────────────
async function renderRanking() {
  const meBox = $('me');
  meBox.replaceChildren();
  const [top, me] = await Promise.all([neblla.scores.top(BOARD, { limit: 50 }), loggedIn() ? neblla.scores.mine(BOARD).catch(() => null) : null]);
  if (me) {
    meBox.append(el('div', 'kicker', T('your_level')));
    const big = el('div', 'elo');
    big.append(el('b', '', num(me.rating)), el('span', '', me.place ? T('rank_place', { place: num(me.place) }) : T('no_place')));
    meBox.append(big);
    meBox.append(el('small', '', [T('played_n', { n: me.played || 0 }), T('won_n', { n: me.won || 0 }), T('lost_n', { n: me.lost || 0 })].join(' · ') + (me.drawn ? ' · ' + T('drawn_n', { n: me.drawn }) : '')));
    if (me.history?.length) {
      const spark = el('div', 'spark');
      spark.dir = 'ltr';
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
    meBox.append(el('div', 'kicker', T('your_level')));
    meBox.append(el('p', '', loggedIn() ? T('first_game', { start: num(1200) }) : T('rank_login')));
  }
  const box = $('top');
  box.replaceChildren();
  if (!top.length) box.append(empty(T('rank_empty')));
  for (const r of top) {
    const row = el('div', 'item rank' + (r.me ? ' mine' : ''));
    const place = el('div', 't', '#' + num(r.place)); place.dir = 'ltr';
    row.append(place);
    const what = el('div', 'what');
    what.append(el('b', '', r.info?.name || T('player')), el('span', '', `${T('played_n', { n: r.played || 0 })} · ${T('won_n', { n: r.won || 0 })}`));
    row.append(what, el('div', 'pts', num(r.value)));
    box.append(row);
  }
}

// ── Tú: Premium y los avisos del club ───────────────────────────────────
async function renderYou() {
  const box = $('msgs');
  box.replaceChildren();
  if (!loggedIn()) { needLogin(box, T('notices_login')); return; }
  const list = [...(neblla.inbox.messages || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!list.length) box.append(empty(T('notices_empty')));
  for (const m of list) {
    const reminder = m.data?.type === 'booking.reminder';
    const b = el('div', 'bubble' + (reminder ? ' remind' : ''));
    if (reminder) b.append(el('div', 'kicker', T('reminder_kicker')));
    b.append(el('div', '', m.message));
    b.append(el('small', '', (m.data?.name || 'PistaLibre') + ' · ' + dateTimeShort(new Date(m.createdAt))));
    box.append(b);
  }
}
$('buyPremium').onclick = async () => {
  if (!loggedIn()) return neblla.auth.login();
  if (!products.some(p => p.productId === P_PREMIUM)) return status(T('err_payments_off'), true);
  try { await neblla.shop.buy(P_PREMIUM); } catch (err) { status(errText(err), true); }
};
neblla.shop.on('purchase', (e) => { if (e?.productId === P_PREMIUM) status(T('now_premium')); });
neblla.inbox.on('messages', () => { if (current === 'tu') renderYou(); });

// ── Alta de un club: el formulario, y el estado de mis solicitudes ───────
const APP_STATE = { pending: 'app_pending', approved: 'app_approved', rejected: 'app_rejected' };
async function renderApply() {
  const fields = $('applyFields');
  fields.replaceChildren();
  for (const f of applyFields) {
    const l = el('label', f.type === 'boolean' ? 'check' : '');
    const input = el('input');
    input.name = 'f_' + f.key;
    input.type = f.type === 'number' ? 'number' : f.type === 'boolean' ? 'checkbox' : 'text';
    if (f.required && f.type !== 'boolean') input.required = true;
    const label = T('apply_f_' + f.key);
    if (f.type === 'boolean') l.append(input, document.createTextNode(' ' + label)); else l.append(document.createTextNode(label), input);
    fields.append(l);
  }
  const mine = $('myApps');
  mine.replaceChildren();
  if (!loggedIn()) return;
  for (const a of await BIZ.applications().catch(() => [])) {
    const row = el('div', 'item');
    const what = el('div', 'what');
    what.append(el('b', '', a.name), el('span', '', (APP_STATE[a.status] ? T(APP_STATE[a.status]) : a.status) + (a.reason ? ': ' + a.reason : '')));
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
    status(T('apply_sent'));
  } catch (err) { status(errText(err), true); }
  renderApply();
};
BIZ.on('update', ({ application }) => {
  if (!application) return;
  status(application.status === 'approved' ? T('apply_approved', { name: application.name })
    : application.reason ? T('apply_rejected_reason', { name: application.name, reason: application.reason }) : T('apply_rejected', { name: application.name }), application.status !== 'approved');
  if (current === 'alta') renderApply();
});

// ── Chat de cada partida: los cuatro jugadores y el club ─────────────────
let chatRoom = null, chatBooking = null;
const textOf = (x) => (typeof x === 'string' ? x : x?.text ?? '');
const chatLine = (who, text, mine) => { const b = el('div', 'bubble' + (mine ? ' me' : '')); b.append(el('div', '', text), el('small', '', who || T('someone'))); return b; };
const chatTitle = (b) => T('chat_title', { day: dayShort(new Date(b.start)), time: hour(new Date(b.start)) });
async function openChat(room, b) {
  chatRoom = room; chatBooking = b;
  current = 'chat';
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-chat';
  $('chatTitle').textContent = chatTitle(b);
  const box = $('chatMsgs');
  box.replaceChildren(empty(T('entering')));
  try {
    await neblla.rooms.join(room);
    const hist = await neblla.room.history({ limit: 100 }).catch(() => []);
    const items = (Array.isArray(hist) ? hist : hist?.messages || []).slice().reverse();
    box.replaceChildren();
    if (!items.length) box.append(empty(T('chat_empty')));
    for (const m of items) if (!m.deleted) box.append(chatLine(m.from === 'business' ? (m.body?.name || T('the_club')) : (m.user?.publicInfo?.name || m.name), textOf(m.body ?? m.data), m.from === myId()));
    box.scrollTop = box.scrollHeight;
  } catch (err) { box.replaceChildren(empty(errText(err))); }
}
function leaveChat() { if (chatRoom) { neblla.room.leave?.(); chatRoom = null; chatBooking = null; } }
neblla.message.on((m) => {
  if (!chatRoom || current !== 'chat') return;
  const box = $('chatMsgs');
  box.querySelector('.empty')?.remove();
  box.append(chatLine(m.from === 'business' ? (m.data?.name || T('the_club')) : m.user?.publicInfo?.name, textOf(m.data), !!m.fromMe));
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
const CANCEL_REASON = { below_min: 'bc_below_min', session_cancelled: 'bc_session_cancelled', closed: 'bc_closed', full: 'bc_full', refunded: 'bc_refunded' };
BOOKING.on('update', ({ booking }) => {
  if (booking?.status === 'reserved') status(T('paid_msg'));
  else if (booking?.status === 'cancelled') status(T(CANCEL_REASON[booking.reason] || 'bc_other'), true);
  if (current === 'mias') renderMine(); else if (current === 'partidas') renderOpen();
});
BIZ.matches.on('update', (m) => {
  if (m.state === 'agreed' || m.state === 'resolved') status(m.resolution?.reason === 'cheater' ? T('dispute_won') : T('match_counts'));
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
  try { products = await neblla.shop.products(); } catch (_) {}
  paintStatic();
  renderWho();
  show('clubes');
}
// Al cambiar de idioma se repinta lo que el HTML no pinta solo.
nebllaLang.on(() => {
  paintStatic();
  renderWho();
  if (current === 'chat') { if (chatBooking) $('chatTitle').textContent = chatTitle(chatBooking); return; }
  const render = RENDER()[current];
  if (render) Promise.resolve().then(render).catch(() => {});
});
neblla.auth.on('login', () => { renderWho(); show(current === 'chat' ? 'mias' : current); });
neblla.auth.on('logout', () => { renderWho(); show('clubes'); });
boot();
};
