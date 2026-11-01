// Yoga Luz, un estudio de ejemplo hecho con Neblla. Quien entra es alumno:
// ve quiénes somos y las fotos del estudio, se apunta a un horario fijo en
// «Horarios» (la semana tipo; se paga como suscripción), reserva clases
// sueltas con el bono en «Calendario» (las fechas de verdad, con los
// festivos), ve sus clases (cada una con su chat), pide una clase privada con
// el profe que quiera y habla con el estudio. Todo con neblla.*,
// sin servidor propio.
//
// Idiomas: los textos están en lang/<código>.json y los pinta /connect/lang.js
// (nebllaLang.t). Las fechas, horas y precios salen de Intl en el idioma activo.
// Los nombres que Neblla guarda como un solo texto (clases, salas, profes)
// salen tal cual de los datos.
window.onNeblla = async (neblla) => {
await nebllaLang.ready;
const $ = (id) => document.getElementById(id);
const T = (k, v) => nebllaLang.t(k, v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BOOKING = neblla.business.booking;
const GROUP = 'yoga';                       // las clases en grupo: bono o plaza fija
const PRIVATE = 'privada';                  // la clase privada, se paga al reservar
const BONO = 'bono';
const P_BONO = '91172289c55d00ca';
const TZ = 'Europe/Madrid';
let services = {}, staff = [], products = [], standingOffer = [];

// ── Fechas, horas y precios en el idioma activo ─────────────────────────
const LOC = () => ({ pt: 'pt-BR', es: 'es-ES', en: 'en-GB' }[nebllaLang.lang] || nebllaLang.lang);
const fmt = (opts, d) => new Intl.DateTimeFormat(LOC(), { timeZone: TZ, hourCycle: 'h23', ...opts }).format(d);
const dayName = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }, d);
const hkey = (d) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(d);   // «18:00», para ordenar y casar casillas
const hlabel = (key) => { const [h, m] = key.split(':').map(Number); return new Intl.DateTimeFormat(LOC(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m))); };
const hour = (d) => isNaN(d) ? '' : hlabel(hkey(d));
const range = (days, from = new Date()) => ({ from: from.toISOString(), to: new Date(from.getTime() + days * 864e5).toISOString() });
const money = (p) => new Intl.NumberFormat(LOC(), { style: 'currency', currency: (p.currency || 'eur').toUpperCase() }).format(p.price / 100);
const DAYIDX = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const weekday = (code, style = 'long') => new Intl.DateTimeFormat(LOC(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + DAYIDX[code])));   // 1 de enero de 2024 fue lunes
const dayList = (codes) => new Intl.ListFormat(LOC(), { style: 'long', type: 'conjunction' }).format(codes.map(c => weekday(c)));
const shortWeek = (code) => weekday(code, nebllaLang.lang === 'ar' ? 'long' : 'short');
const weekLabel = (w, end) => new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(w, end);
const errText = (err) => {
  const code = err?.code || err?.message;
  const known = ['slot_full', 'not_enough_credits', 'already_booked', 'slot_past', 'time_taken', 'product_unavailable', 'not_published', 'checkout_failed'];
  return known.includes(code) ? T('err_' + code) : T('err_other', { code: code || err });
};
// Los productos se pueden comprar cuando el estudio tiene los pagos activos; si no, ni se abre la ventana de pago.
const payable = (id) => !id || products.some(p => p.productId === id);

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const loggedIn = () => !!neblla.auth.me?.loggedIn;

// Lo que lleva variables o atributos que lang.js no pinta solo.
let privPrice = '';
function paintStatic() {
  document.title = T('title');
  $('cover').alt = T('cover_alt');
  $('dollMoves').setAttribute('aria-label', T('doll_moves_label'));
  $('privHint').innerHTML = T('priv_hint', { price: '<b>' + esc(privPrice) + '</b>' });
}

// ── Pestañas ────────────────────────────────────────────────────────────
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);
let current = 'inicio';
function show(tab) {
  if (current === 'chat' && tab !== 'chat') leaveChat();
  current = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
  status('');
  const render = { inicio: renderGallery, horarios: renderTimetable, calendario: renderCalendar, mias: () => { renderDoll(); return renderMine(); }, privada: renderPrivate, buzon: renderInbox }[tab];
  if (render) render().catch?.((e) => status(errText(e), true));
  window.scrollTo(0, 0);
}

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (loggedIn()) {
    const name = neblla.auth.me.publicInfo?.name || T('my_account');
    who.append(el('b', '', name));
    const out = el('button', 'link', T('logout')); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light', T('login')); b.onclick = () => neblla.auth.login(); who.append(b);
  }
}

async function myBookings(set) {
  if (!loggedIn()) return [];
  return (await BOOKING.mine(set)).map(b => ({ ...b, set }));
}
const myStanding = () => loggedIn() && typeof BOOKING.standing === 'function' ? BOOKING.standing(GROUP).catch(() => []) : Promise.resolve([]);
// Lo que está a la venta: cada plaza fija (un producto) ofrece uno o varios
// horarios (`choices`); cada horario es una casilla de «Horarios». Uno sin
// fecha de inicio válida no se pinta.
const offersOf = (standing) => (standing || []).flatMap(p => (p.choices || []).map(c => ({
  productId: p.productId, set: p.set, series: c.series, title: c.title, start: c.start, rrule: c.rrule, timeZone: c.timeZone,
}))).filter(o => Number.isFinite(Date.parse(o.start)));

// ── Horarios y Calendario: la misma cuadrícula de días × horas ──────────
//    Horarios: la semana tipo, sin fechas; cada horario va emparejado
//    (martes y jueves...) y te apuntas a él cada mes.
//    Calendario: las semanas de verdad, con fechas; reservas una clase suelta
//    con el bono, ves cuáles son tuyas y qué días el estudio cierra.
const COLS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'];          // el domingo cerramos
const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });                 // 2026-10-29
// El nombre del estilo, que quepa en la casilla: «Hatha de mediodía» → «Hatha», «Morning Vinyasa» → «Vinyasa», «朝のヴィンヤサ» → «ヴィンヤサ».
const STYLES = /Hatha|Vinyasa|ハタ|ヴィンヤサ|하타|빈야사|哈他|流瑜伽|هاثا|فينياسا/i;
const kind = (t) => { const s = String(t || T('class_yoga')); return STYLES.exec(s)?.[0] || s.split(/[\s·]/)[0]; };
const byDayOf = (o) => (/BYDAY=([A-Z,]+)/.exec(o?.rrule || '')?.[1] || '').split(',').filter(Boolean);
const festivos = async () => { try { return (await neblla.api.key('festivos')) || []; } catch (_) { return []; } };   // [{ fecha, nombre }]
// El festivo genérico del dato («Festivo») sale en el idioma activo; un nombre propio, tal cual.
const holidayName = (f) => (!f?.nombre || f.nombre === 'Festivo') ? T('holiday') : f.nombre;

// Una cuadrícula: filas = horas, columnas = días; cells(col, time) da lo de cada casilla.
// En ar (rtl) la cuadrícula se espeja sola: el lunes a la derecha, como en un calendario árabe.
function grid(heads, times, cells, closed = {}) {
  const g = el('div', 'tt');
  g.style.gridTemplateColumns = `40px repeat(${heads.length}, minmax(0, 1fr))`;
  const corner = el('div', 'tt-h'); corner.style.gridColumn = '1'; corner.style.gridRow = '1'; g.append(corner);
  heads.forEach((h, i) => {
    const c = el('div', 'tt-h' + (h.today ? ' today' : '') + (closed[i] ? ' off' : ''));
    c.append(el('b', '', h.label)); if (h.sub) c.append(el('small', '', h.sub));
    c.style.gridColumn = String(i + 2); c.style.gridRow = '1';
    g.append(c);
  });
  times.forEach((t, r) => {
    const tc = el('div', 'tt-t', hlabel(t)); tc.style.gridRow = String(r + 2); tc.style.gridColumn = '1';
    g.append(tc);
    heads.forEach((_, i) => {
      if (closed[i]) return;
      const cell = cells(i, t) || el('div', 'tt-c empty');
      cell.style.gridColumn = String(i + 2); cell.style.gridRow = String(r + 2);
      g.append(cell);
    });
  });
  heads.forEach((_, i) => {
    if (!closed[i]) return;
    const f = el('button', 'tt-c festivo');
    f.append(el('b', '', holidayName(closed[i])), el('small', '', T('closed')));
    f.style.gridColumn = String(i + 2); f.style.gridRow = `2 / ${times.length + 2}`;
    f.onclick = () => { selDay = closed[i]; selCal = null; renderCalendar(); };
    g.append(f);
  });
  return g;
}

// Quién da cada horario y la hora local, de sus próximas clases.
let seriesInfo = new Map();
async function loadSeriesInfo() {
  const slots = await BOOKING.slots(GROUP, range(21));
  for (const s of slots) if (s.series && !seriesInfo.has(s.series)) seriesInfo.set(s.series, { staffName: s.staffName, resourceName: s.resourceName, minutes: (Date.parse(s.end) - Date.parse(s.start)) / 6e4 });
  return slots;
}

// ── Horarios ─────────────────────────────────────────────────────────────
let selOffer = null;
async function renderTimetable() {
  const [standing] = await Promise.all([myStanding(), seriesInfo.size ? null : loadSeriesInfo()]);
  const mine = new Set(standing.map(p => p.series).filter(Boolean));
  const offers = standingOffer.map(o => ({ ...o, days: byDayOf(o), time: hkey(new Date(o.start)) })).filter(o => o.time && o.days.length);
  const times = [...new Set(offers.map(o => o.time))].sort();
  if (!offers.length) { $('timetable').replaceChildren(el('p', 'empty', T('sched_empty'))); $('offer').replaceChildren(); return; }
  const g = grid(COLS.map(d => ({ label: shortWeek(d) })), times, (i, t) => {
    const o = offers.find(x => x.time === t && x.days.includes(COLS[i]));
    if (!o) return null;
    const on = mine.has(o.series), sel = selOffer?.series === o.series;
    const b = el('button', 'tt-c cls' + (on ? ' mine' : '') + (sel ? ' sel' : ''));
    b.append(el('b', '', kind(o.title)));
    const who = seriesInfo.get(o.series)?.staffName;
    if (on) b.append(el('small', '', T('mine_tag'))); else if (who) b.append(el('small', '', who));
    b.onclick = () => { selOffer = o; renderTimetable(); };
    return b;
  });
  $('timetable').replaceChildren(g);
  renderOffer(mine);
}

function renderOffer(mine) {
  const box = $('offer');
  box.replaceChildren();
  if (!selOffer) { box.append(el('p', 'empty', T('offer_pick'))); return; }
  const o = selOffer, info = seriesInfo.get(o.series) || {};
  const time = hour(new Date(o.start));
  const card = el('div', 'pickcard main');
  card.append(el('div', 'kicker', T('offer_kicker')));
  card.append(el('b', '', info.staffName ? T("with_staff", { title: o.title || T("class_yoga"), staff: info.staffName }) : (o.title || T('class_yoga'))));
  card.append(el('span', '', T('offer_when', { days: dayList(o.days), time })
    + (info.minutes ? ' · ' + T('minutes', { n: info.minutes }) : '') + (o.days.length > 1 ? ' · ' + T('together') : '')));
  const prod = products.find(x => x.productId === o.productId);
  card.append(el('small', '', (prod ? T('per_month', { price: money(prod) }) : T('monthly_fee')) + ' ' + T('offer_note')));
  if (mine.has(o.series)) {
    const acts = el('div', 'acts');
    acts.append(el('span', 'tag', T('already_in')));
    const m = el('button', 'btn ghost small', T('manage')); m.onclick = () => neblla.shop.manage(o.productId); acts.append(m);
    card.append(acts);
  } else {
    const b = el('button', 'btn', T('join_schedule')); b.onclick = () => buy(o.productId, { series: o.series });
    card.append(b);
  }
  box.append(card);
}

// ── Calendario ───────────────────────────────────────────────────────────
let week = null, selCal = null, selDay = null;
const monday = (d) => { const x = new Date(dayKey(d) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
async function renderCalendar() {
  const first = monday(new Date());
  const weeks = [0, 1, 2].map(n => new Date(first.getTime() + n * 7 * 864e5));
  const from = new Date(first.getTime() - 864e5), to = new Date(first.getTime() + 22 * 864e5);
  const [slots, mine] = await Promise.all([BOOKING.slots(GROUP, { from: from.toISOString(), to: to.toISOString() }), myBookings(GROUP)]);
  const myRow = new Map(mine.filter(b => b.status === 'reserved').map(b => [b.slot, b]));
  for (const s of slots) if (s.series && !seriesInfo.has(s.series)) seriesInfo.set(s.series, { staffName: s.staffName, minutes: (Date.parse(s.end) - Date.parse(s.start)) / 6e4 });
  // La primera semana que aún tiene clases por delante.
  if (week === null) week = Math.max(0, weeks.findIndex((w, i) => slots.some(s => Date.parse(s.end) > Date.now() && Date.parse(s.start) < w.getTime() + 7 * 864e5 - 12 * 36e5)));

  const chips = $('weeks');
  chips.replaceChildren();
  weeks.forEach((w, i) => {
    const end = new Date(w.getTime() + 6 * 864e5);
    const label = i === 0 ? T('this_week') : weekLabel(w, end);
    const b = el('button', i === week ? 'on' : '', label);
    b.onclick = () => { week = i; selCal = null; selDay = null; renderCalendar(); };
    chips.append(b);
  });

  const w0 = weeks[week];
  const dates = COLS.map((_, i) => new Date(w0.getTime() + i * 864e5));
  const keys = dates.map(d => d.toISOString().slice(0, 10));
  const todayKey = dayKey(new Date());
  const shut = await festivos();
  const closed = {};
  keys.forEach((k, i) => { const f = shut.find(x => x.fecha === k); if (f) closed[i] = { ...f, fecha: k }; });
  const inWeek = slots.filter(s => keys.includes(dayKey(new Date(s.start))));
  const times = [...new Set(inWeek.map(s => hkey(new Date(s.start))).concat(standingOffer.map(o => hkey(new Date(o.start)))))].filter(Boolean).sort();
  const heads = dates.map((d, i) => ({ label: shortWeek(COLS[i]), sub: String(d.getUTCDate()), today: keys[i] === todayKey }));
  const g = grid(heads, times, (i, t) => {
    const s = inWeek.find(x => dayKey(new Date(x.start)) === keys[i] && hkey(new Date(x.start)) === t);
    if (!s) return null;
    const b0 = myRow.get(s.id), viaPlan = !!(s.standing || b0?.standing), mineHere = !!(s.booked || b0);
    const past = Date.parse(s.start) < Date.now();
    const b = el('button', 'tt-c cls' + (mineHere ? (viaPlan ? ' mine' : ' bono') : '') + (past ? ' past' : '') + (!mineHere && s.left <= 0 ? ' full' : '') + (selCal?.id === s.id ? ' sel' : ''));
    b.append(el('b', '', kind(s.title)));
    b.append(el('small', '', mineHere ? (viaPlan ? T('cell_plan') : T('cell_bono')) : past ? T('cell_past') : s.left <= 0 ? T('cell_full') : T('spots', { n: s.left })));
    b.onclick = () => { selCal = s; selDay = null; renderCalendar(); };
    return b;
  }, closed);
  $('calendar').replaceChildren(g);
  renderCalPick(myRow);
  renderBonoBox();
}

function renderCalPick(myRow) {
  const box = $('calPick');
  box.replaceChildren();
  if (selDay) {
    const card = el('div', 'pickcard');
    card.append(el('div', 'kicker', T('holiday')));
    card.append(el('b', '', T('holiday_title', { day: dayName(new Date(selDay.fecha + 'T12:00:00Z')) })));
    card.append(el('span', '', T('holiday_text')));
    box.append(card);
    return;
  }
  if (!selCal) { box.append(el('p', 'empty', T('cal_pick'))); return; }
  const s = selCal, start = new Date(s.start), b0 = myRow.get(s.id);
  const viaPlan = !!(s.standing || b0?.standing), mineHere = !!(s.booked || b0);
  const card = el('div', 'pickcard' + (mineHere ? '' : ' main'));
  card.append(el('div', 'kicker', mineHere ? (viaPlan ? T('kicker_plan') : T('kicker_bono')) : T('kicker_single')));
  card.append(el('b', '', `${s.title || T('class_yoga')} · ${T('day_at', { day: dayName(start), time: hour(start) })}`));
  card.append(el('span', '', [s.staffName, s.resourceName, s.left <= 0 ? T('cell_full') : T('spots_left', { n: s.left, capacity: s.capacity })].filter(Boolean).join(' · ')));
  const acts = el('div', 'acts');
  if (mineHere) {
    const room = s.room || b0?.room;
    if (room) { const c = el('button', 'btn small', T('class_chat')); c.onclick = () => openChat(room, s); acts.append(c); }
    if (Date.parse(s.start) > Date.now()) { const x = el('button', 'btn ghost small', T('cant_go')); x.onclick = () => cancel(GROUP, s.id); acts.append(x); }
    card.append(acts);
    if (!viaPlan) card.append(el('small', '', T('cancel_back')));
  } else if (Date.parse(s.start) <= Date.now()) {
    card.append(el('span', 'tag old', T('already_past')));
  } else {
    const b = el('button', 'btn', s.left <= 0 ? T('cell_full_btn') : T('reserve_bono'));
    b.disabled = s.left <= 0;
    b.onclick = () => reserve(GROUP, s.id);
    card.append(b);
    if (standingOffer.some(o => o.series === s.series)) card.append(el('small', '', T('weekly_tip')));
  }
  box.append(card);
}

async function renderBonoBox() {
  if (!loggedIn()) { $('balance').textContent = '–'; return; }
  const { balance } = await neblla.business.credits.balance(BONO);
  $('balance').textContent = new Intl.NumberFormat(LOC()).format(balance);
}

async function reserve(set, slotId) {
  if (!loggedIn()) return neblla.auth.login();
  try {
    await BOOKING.reserve(set, slotId);
    const { balance } = await neblla.business.credits.balance(BONO);
    status(T('reserved_msg', { n: balance }));
  } catch (err) { status(errText(err), true); }
  renderCalendar();
}

async function buy(productId, opts) {
  if (!loggedIn()) return neblla.auth.login();
  if (!payable(productId)) return status(T('pay_soon'), true);
  try { await (opts ? neblla.shop.buy(productId, 1, opts) : neblla.shop.buy(productId)); } catch (err) { status(errText(err), true); }
}
$('buyBono').onclick = () => buy(P_BONO);
neblla.shop.on('purchase', (e) => {
  if (e?.productId === P_BONO) status(T('bono_bought'));
  else if (standingOffer.some(o => o.productId === e?.productId)) status(T('plan_bought'));
  else status(T('payment_received'));
  if (current === 'horarios') renderTimetable(); else if (current === 'calendario') renderCalendar(); else if (current === 'mias') renderMine();
});

// ── Clase privada: un calendario de huecos libres; con «Todos», cada hueco
//    se parte entre los profes libres a esa hora (como dos citas a la vez en
//    un calendario); se paga al reservar ────────────────────────────────
let privWeek = 0, privSel = null, staffSel = null;      // staffSel null: todos los profes
const tint = (p) => 'p' + (staff.findIndex(x => x.id === p?.id) % 4);   // un color por profe
async function renderPrivate() {
  const pick = $('staffPick');
  pick.replaceChildren();
  if (staff.length > 1) {
    for (const p of [{ id: null, name: T('all_staff') }, ...staff]) {
      const b = el('button', (staffSel?.id ?? null) === p.id ? 'on' : '', p.name);
      b.onclick = () => { staffSel = p.id ? p : null; privSel = null; renderPrivate(); };
      pick.append(b);
    }
  }
  const first = monday(new Date());
  const chips = $('privWeeks');
  chips.replaceChildren();
  [0, 1, 2].forEach((n) => {
    const w = new Date(first.getTime() + n * 7 * 864e5), end = new Date(w.getTime() + 6 * 864e5);
    const b = el('button', n === privWeek ? 'on' : '', n === 0 ? T('this_week') : weekLabel(w, end));
    b.onclick = () => { privWeek = n; privSel = null; renderPrivate(); };
    chips.append(b);
  });

  const w0 = new Date(first.getTime() + privWeek * 7 * 864e5);
  const dates = COLS.map((_, i) => new Date(w0.getTime() + i * 864e5));
  const keys = dates.map(d => d.toISOString().slice(0, 10));
  const from = new Date(Math.max(Date.now(), w0.getTime() - 14 * 36e5)).toISOString();
  const to = new Date(w0.getTime() + 6 * 864e5).toISOString();
  const who = staffSel ? [staffSel] : staff.length ? staff : [null];
  const lists = await Promise.all(who.map(p => BOOKING.times(PRIVATE, { from, to, step: 60, ...(p ? { staff: p.id } : {}) })
    .then(l => l.map(t => ({ ...t, who: p }))).catch(() => [])));
  const free = lists.flat();
  const shut = await festivos();
  const closed = {};
  keys.forEach((k, i) => { const f = shut.find(x => x.fecha === k); if (f) closed[i] = { ...f, fecha: k }; });
  const times = [...new Set(free.map(x => hkey(new Date(x.start))))].sort();
  const todayKey = dayKey(new Date());
  const heads = dates.map((d, i) => ({ label: shortWeek(COLS[i]), sub: String(d.getUTCDate()), today: keys[i] === todayKey }));
  const box = $('privCal');
  if (!times.length) { box.replaceChildren(el('p', 'empty', staffSel ? T('priv_none_staff', { name: staffSel.name }) : T('priv_none'))); renderPrivPick(); return; }
  box.replaceChildren(grid(heads, times, (i, t) => {
    const here = free.filter(x => dayKey(new Date(x.start)) === keys[i] && hkey(new Date(x.start)) === t);
    if (!here.length) return null;
    const cell = el('div', 'tt-c split');
    for (const x of here) {
      const sel = privSel && privSel.start === x.start && privSel.who?.id === x.who?.id;
      const name = x.who?.name || T('free');
      const b = el('button', 'half ' + tint(x.who) + (sel ? ' sel' : ''), here.length > 1 ? [...name].slice(0, 3).join('') : name);
      b.title = (x.who?.name ? x.who.name + ' · ' : '') + hour(new Date(x.start));
      b.onclick = () => { privSel = x; renderPrivate(); };
      cell.append(b);
    }
    return cell;
  }, closed));
  const legend = $('privLegend');
  legend.replaceChildren();
  if (!staffSel && staff.length > 1) for (const p of staff) { legend.append(el('span', 'k ' + tint(p)), document.createTextNode(p.name + ' ')); }
  renderPrivPick();
}

function renderPrivPick() {
  const box = $('privPick');
  box.replaceChildren();
  if (!privSel) { box.append(el('p', 'empty', T('priv_pick'))); return; }
  const x = privSel, start = new Date(x.start);
  const card = el('div', 'pickcard main');
  card.append(el('div', 'kicker', T('tab_privada_long')));
  card.append(el('b', '', (x.who?.name ? T('with_name', { name: x.who.name }) + ' · ' : '') + T('day_at', { day: dayName(start), time: hour(start) })));
  card.append(el('span', '', T('priv_card', { price: privPrice })));
  const b = el('button', 'btn', T('reserve_pay'));
  b.onclick = () => reservePrivate(x.start, x.who?.id);
  card.append(b);
  box.append(card);
}

async function reservePrivate(start, staffId) {
  if (!loggedIn()) return neblla.auth.login();
  if (!payable(services[PRIVATE]?.product || services[PRIVATE]?.productId)) return status(T('pay_soon'), true);
  try {
    const r = await BOOKING.reserveAt(PRIVATE, { start, ...(staffId ? { staff: staffId } : {}) });
    privSel = null;
    show('mias');
    status(r.held ? T('held_msg', { time: hour(new Date(r.holdUntil)) }) : T('reserved_here'));
    return;
  } catch (err) { status(errText(err), true); }
  renderPrivate();
}

// Un pago confirmado, una clase cancelada o una plaza fija que no pudo reservar.
BOOKING.on('update', ({ booking, standing }) => {
  if (standing) {
    const n = standing.booked?.length || 0, k = standing.skipped?.length || 0;
    status(k ? T('standing_some', { n, k }) : T('standing_ok', { n }), !!k);
  } else if (booking?.status === 'reserved') status(T('booking_confirmed'));
  else if (booking?.status === 'cancelled') {
    const why = { full: 'cx_full', slot_gone: 'cx_slot_gone', session_cancelled: booking.refunded ? 'cx_session_refund' : 'cx_session_holiday', below_min: 'cx_below_min', not_enough_credits: 'cx_no_credits' }[booking.reason];
    status(T(why || 'cx_default'), true);
  } else return;
  if (current === 'mias') renderMine(); else if (current === 'calendario') renderCalendar(); else if (current === 'horarios') renderTimetable();
});

// ── Mis clases: mis horarios y lo reservado, cada clase con su chat ─────
async function renderMine() {
  if (!loggedIn()) { $('myPlans').replaceChildren(); $('mine').replaceChildren(el('p', 'empty', T('mine_login'))); return; }
  const [standing, bookings] = await Promise.all([myStanding(), Promise.all([GROUP, PRIVATE].map(myBookings))]);
  const plans = $('myPlans');
  plans.replaceChildren();
  for (const p of standing) {
    const row = el('div', 'item mine');
    const what = el('div', 'what');
    const o = standingOffer.find(x => x.productId === p.productId && x.series === p.series) || standingOffer.find(x => x.productId === p.productId);
    const by = byDayOf(o).filter(d => d in DAYIDX);
    what.append(el('b', '', (p.title || o?.title || T('my_schedule')) + (by.length ? ' · ' + dayList(by) : '') + (o?.start ? ' · ' + hour(new Date(o.start)) : '')),
      el('span', '', p.until ? T('paid_until', { date: fmt({ day: 'numeric', month: 'long' }, new Date(p.until)) }) : T('active')));
    const m = el('button', 'btn ghost small', T('manage')); m.onclick = () => neblla.shop.manage(p.productId);
    row.append(what, m);
    plans.append(row);
  }
  const all = bookings.flat().filter(b => b.status === 'reserved' || b.status === 'held').sort((a, b) => a.start.localeCompare(b.start));
  const box = document.createDocumentFragment();
  if (!all.length) box.append(el('p', 'empty', T('mine_empty')));
  const now = Date.now();
  let lastDay = '';
  for (const b of all) {
    const start = new Date(b.start), past = start.getTime() < now, day = dayName(start);
    if (day !== lastDay) { box.append(el('div', 'day', day)); lastDay = day; }
    const row = el('div', 'item' + (past ? '' : ' mine'));
    row.append(el('div', 't', hour(start)));
    const what = el('div', 'what');
    const label = b.title || (b.set === PRIVATE ? T('tab_privada_long') : b.set === GROUP ? T('class_yoga') : services[b.set]?.name || b.set);
    what.append(el('b', '', b.staffName ? T('with_staff', { title: label, staff: b.staffName }) : label), el('span', '', b.standing ? T('from_schedule') : b.set === PRIVATE ? T('tab_privada_long') : T('with_bono')));
    row.append(what);
    if (b.status === 'held') row.append(el('span', 'tag wait', T('pending_payment')));
    else if (past) row.append(el('span', 'tag old', T('done')));
    else {
      const acts = el('div', 'acts');
      if (b.room) { const ch = el('button', 'btn small', T('class_chat')); ch.onclick = () => openChat(b.room, b); acts.append(ch); }
      const c = el('button', 'btn ghost small', T('cant_go'));
      c.onclick = () => cancel(b.set, b.slot);
      acts.append(c);
      row.append(acts);
    }
    box.append(row);
  }
  $('mine').replaceChildren(box);
}

// ── Tu muñeco: el de la cuenta de Neblla, haciendo sus movimientos de Mundo → Animar ──
let dollOf = null, dollPlay = null;
async function renderDoll() {
  const box = $('doll');
  if (!loggedIn()) { box.hidden = true; dollOf = null; dollPlay = null; return; }
  box.hidden = false;
  if (dollOf === neblla.auth.me.id) return;
  dollOf = neblla.auth.me.id;
  $('dollView').hidden = true; $('dollMoves').hidden = true; dollPlay = null;
  const text = (t) => { $('dollText').textContent = t; };
  try {
    const look = await neblla.avatar.get();
    if (!look.moves?.length) { text(T('doll_none')); return; }
    $('dollView').hidden = false;
    const world = await neblla.world.create({ container: '#dollView', sky: 'studio', camera: 'third', touch: false });
    const doll = await neblla.avatar.doll(world);
    world.add({ shape: 'box', size: [8, 1, 8], position: [0, -0.5, 0], color: '#dcdce4' });   // el suelo: el muñeco es un personaje y, sin suelo, cae
    world.add({ doll, position: [0, 1, 0] });
    world.camera.use('third', { target: [0, 0.9, 0], distance: 2.1, pitch: 0.05, height: 0, transition: 0 });
    const moves = doll.ownMoves || [];
    if (!moves.length) { $('dollView').hidden = true; text(T('doll_none')); return; }
    dollPlay = (id) => doll.play(id);
    dollPlay(moves[0].id);
    text(moves.length > 1 ? T('doll_choose') : moves[0].name);
    const sel = $('dollMoves');
    sel.replaceChildren(...moves.map(m => { const o = el('option', '', m.name); o.value = m.id; return o; }));
    sel.hidden = moves.length < 2;
    sel.onchange = () => dollPlay?.(sel.value);
  } catch (_) {
    $('dollView').hidden = true;
    text('');
    box.hidden = true;
    dollOf = null;
  }
}

async function cancel(set, slot) {
  try {
    const { refunded } = await BOOKING.cancel(set, slot);
    status(refunded ? T('cancelled_ok') : T('cancelled_late'));
  } catch (err) { status(errText(err), true); }
  if (current === 'mias') renderMine(); else if (current === 'calendario') renderCalendar(); else if (current === 'buzon') renderInbox();
}

// ── Mensajes con el estudio (y el recordatorio de la víspera) ───────────
// El texto de cada mensaje (también el del recordatorio) lo escribe el estudio: sale tal cual.
function renderInbox() {
  const box = $('msgs');
  box.replaceChildren();
  if (!loggedIn()) { box.append(el('p', 'empty', T('inbox_login'))); return Promise.resolve(); }
  const list = [...(neblla.inbox.messages || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!list.length) box.append(el('p', 'empty', T('inbox_empty')));
  for (const m of list) {
    const mine = m.from !== 'dev';
    const reminder = m.data?.type === 'booking.reminder';
    const b = el('div', 'bubble' + (mine ? ' me' : '') + (reminder ? ' remind' : ''));
    if (reminder) b.append(el('div', 'kicker', T('reminder')));
    const msg = el('div', '', m.message); msg.dir = 'auto'; b.append(msg);
    if (reminder && m.data.set && m.data.slot && Date.parse(m.data.start) > Date.now()) {
      const c = el('button', 'btn ghost small', T('cant_go_cancel'));
      c.onclick = () => cancel(m.data.set, m.data.slot);
      b.append(c);
    }
    b.append(el('small', '', (mine ? T('you') : (m.data?.name || T('studio'))) + ' · ' + fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, new Date(m.createdAt))));
    box.append(b);
  }
  box.scrollTop = box.scrollHeight;
  return Promise.resolve();
}
$('send').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('msg').value.trim();
  if (!text) return;
  if (!loggedIn()) return neblla.auth.login();
  try { await neblla.inbox.send({ message: text }); $('msg').value = ''; status(T('sent_ok')); }
  catch (err) { status(errText(err), true); }
  renderInbox();
};
neblla.inbox.on('messages', () => { if (current === 'buzon') renderInbox(); });
neblla.inbox.on('updated', () => { if (current === 'buzon') renderInbox(); });

// ── El estudio: fotos con qué se ve en cada una; se amplían al tocarlas ──
// Las fotos y sus textos vienen del dato `galeria` (en español). Cada foto conocida
// (por el id de su URL) lleva su título y su texto en lang/<código>.json
// (gallery_<foto>_title y _text); una foto nueva del dato sale con el texto del dato.
const PHOTO = {
  '1506126613408-eca07ce68773': 'dawn', '1575052814086-f385e2e2ad1b': 'hall', '1544367567-0f2fcb009e0b': 'moon',
  '1599901860904-17e6ed7083a0': 'dog', '1552196563-55cd4e45efb3': 'breath', '1588286840104-8957b019727f': 'group',
};
function photoText(f) {
  const id = PHOTO[/photo-([\w-]+)/.exec(f.url || '')?.[1]];
  const get = (field, fallback) => { if (!id) return fallback || ''; const k = `gallery_${id}_${field}`; const v = T(k); return v === k ? (fallback || '') : v; };
  return { titulo: get('title', f.titulo), texto: get('text', f.texto) };
}
function openPhoto(f) {
  const p = photoText(f);
  $('lbImg').src = f.url; $('lbImg').alt = p.titulo;
  $('lbTitle').textContent = p.titulo;
  $('lbText').textContent = p.texto;
  $('lightbox').hidden = false;
}
$('lightbox').onclick = () => { $('lightbox').hidden = true; };
async function renderGallery() {
  const list = (await Promise.resolve(neblla.api.key('galeria'))) || [];
  const box = document.createDocumentFragment();
  if (!list.length) box.append(el('p', 'empty', T('gallery_empty')));
  for (const f of list) {
    const p = photoText(f);
    const fig = el('figure');
    const img = el('img'); img.src = f.url; img.alt = p.titulo; img.loading = 'lazy';
    fig.append(img);
    if (p.titulo) fig.append(el('figcaption', '', p.titulo));
    fig.onclick = () => openPhoto(f);
    box.append(fig);
  }
  $('gallery').replaceChildren(box);
}

// ── Chat de cada clase: solo quien tiene plaza y su profe ───────────────
let chatRoom = null, chatClass = null;
const chatLine = (who, text, mine, at) => {
  const b = el('div', 'bubble' + (mine ? ' me' : ''));
  const t = el('div', '', text); t.dir = 'auto'; b.append(t);
  b.append(el('small', '', (who || T('someone')) + (at ? ' · ' + fmt({ hour: '2-digit', minute: '2-digit' }, new Date(at)) : '')));
  return b;
};
const teacher = (name) => T('teacher_label', { name: name || T('studio') });
const textOf = (x) => (typeof x === 'string' ? x : x?.text ?? '');
const chatHeading = (s) => (s.title || T('class_word')) + ' · ' + dayName(new Date(s.start)) + ' ' + hour(new Date(s.start));
async function openChat(room, s) {
  if (!loggedIn()) return neblla.auth.login();
  chatRoom = room; chatClass = s;
  current = 'chat';
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-chat';
  $('chatTitle').textContent = chatHeading(s);
  $('chatMsgs').replaceChildren(el('p', 'empty', T('chat_entering')));
  try {
    await neblla.rooms.join(room);
    const hist = await neblla.room.history({ limit: 100 }).catch(() => []);
    const items = (Array.isArray(hist) ? hist : hist?.messages || []).slice().reverse();
    const box = $('chatMsgs');
    box.replaceChildren();
    if (!items.length) box.append(el('p', 'empty', T('chat_empty')));
    for (const m of items) if (!m.deleted) box.append(chatLine(m.from === 'business' ? teacher(m.body?.name) : (m.user?.publicInfo?.name || m.name), textOf(m.body ?? m.data), m.from === neblla.auth.me.id, m.time || m.at));
    box.scrollTop = box.scrollHeight;
  } catch (err) { $('chatMsgs').replaceChildren(el('p', 'empty', errText(err))); }
}
function leaveChat() { if (chatRoom) { neblla.room.leave?.(); chatRoom = null; chatClass = null; } }
neblla.message.on((m) => {
  if (!chatRoom || current !== 'chat') return;
  const box = $('chatMsgs');
  box.querySelector('.empty')?.remove();
  box.append(chatLine(m.from === 'business' ? teacher(m.data?.name) : m.user?.publicInfo?.name, textOf(m.data), !!m.fromMe, m.time));
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

// ── Arranque ────────────────────────────────────────────────────────────
async function boot() {
  try {
    const r = await BOOKING.services();
    services = Object.fromEntries(r.services.map(s => [s.id, s]));
    staff = r.staff || [];
    standingOffer = offersOf(r.standing);
  } catch (_) {}
  const priceOf = {};
  try {
    products = await neblla.shop.products();
    const p = (id) => products.find(x => x.productId === id);
    if (p(P_BONO)) priceOf.bono = p(P_BONO);
    const priv = p(services[PRIVATE]?.product || services[PRIVATE]?.productId);
    if (priv) priceOf.priv = priv;
  } catch (_) {}
  // Los precios se escriben con Intl en el idioma activo: se repintan al cambiar de idioma.
  const prices = () => {
    $('pBono').textContent = money(priceOf.bono || { price: 8000, currency: 'eur' });
    privPrice = money(priceOf.priv || { price: 3500, currency: 'eur' });
  };
  prices();
  renderWho();
  paintStatic();
  show('inicio');
  // Cambio de idioma en vivo: lang.js repinta el HTML; el resto, aquí.
  nebllaLang.on(() => {
    prices(); paintStatic(); renderWho();
    if (current === 'chat') { if (chatClass) $('chatTitle').textContent = chatHeading(chatClass); return; }
    show(current);
  });
}
neblla.auth.on('login', () => { renderWho(); show(current === 'chat' ? 'mias' : current); });
neblla.auth.on('logout', () => { renderWho(); show('inicio'); });
boot();
};
