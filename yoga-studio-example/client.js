// Yoga Luz, un estudio de ejemplo hecho con Neblla. Quien entra es alumno:
// ve quiénes somos y las fotos del estudio, se apunta a un horario fijo en
// «Horarios» (la semana tipo; se paga como suscripción), reserva clases
// sueltas con el bono en «Calendario» (las fechas de verdad, con los
// festivos), ve sus clases (cada una con su chat), pide una clase privada con
// el profe que quiera y habla con el estudio. Todo con neblla.*,
// sin servidor propio.
window.onNeblla = (neblla) => {
const $ = (id) => document.getElementById(id);
const BOOKING = neblla.business.booking;
const GROUP = 'yoga';                       // las clases en grupo: bono o plaza fija
const PRIVATE = 'privada';                  // la clase privada, se paga al reservar
const BONO = 'bono';
const P_BONO = '91172289c55d00ca';
const TZ = 'Europe/Madrid';
let services = {}, staff = [], products = [], standingOffer = [];

const dayName = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const hour = (d) => isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const range = (days, from = new Date()) => ({ from: from.toISOString(), to: new Date(from.getTime() + days * 864e5).toISOString() });
const money = (p) => (p.price / 100).toLocaleString('es-ES', { style: 'currency', currency: (p.currency || 'eur').toUpperCase() });
const DAYS = { MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves', FR: 'viernes', SA: 'sábados', SU: 'domingos' };
const joinY = (list) => list.length > 1 ? list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1] : (list[0] || '');
const errText = (err) => ({
  slot_full: 'Se acaba de llenar: no quedan plazas.',
  not_enough_credits: 'No te quedan clases en el bono. Compra un bono aquí abajo.',
  already_booked: 'Ya tienes plaza en esta clase.',
  slot_past: 'Esta clase ya ha empezado.',
  time_taken: 'Esa hora se acaba de ocupar.',
  product_unavailable: 'Los pagos de prueba aún no están activos en este ejemplo.',
  not_published: 'Los pagos de prueba aún no están activos en este ejemplo.',
  checkout_failed: 'Los pagos de prueba aún no están activos en este ejemplo.',
}[err?.code || err?.message]) || 'No se pudo (' + (err?.code || err?.message || err) + ').';
// Los productos se pueden comprar cuando el estudio tiene los pagos activos; si no, ni se abre la ventana de pago.
const PAY_SOON = 'Los pagos de prueba aún no están activos en este ejemplo: pronto podrás pagar con la tarjeta 4242. No se ha cobrado ni apuntado nada.';
const payable = (id) => !id || products.some(p => p.productId === id);

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const loggedIn = () => !!neblla.auth.me?.loggedIn;

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
    const name = neblla.auth.me.publicInfo?.name || 'Mi cuenta';
    who.append(el('b', '', name));
    const out = el('button', 'link', 'Salir'); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light', 'Entrar'); b.onclick = () => neblla.auth.login(); who.append(b);
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
const SHORT = { MO: 'Lun', TU: 'Mar', WE: 'Mié', TH: 'Jue', FR: 'Vie', SA: 'Sáb' };
const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });                 // 2026-10-29
const kind = (t) => String(t || 'Yoga').split(' ')[0];   // «Hatha de mediodía» → «Hatha», que quepa en la casilla
const byDayOf = (o) => (/BYDAY=([A-Z,]+)/.exec(o?.rrule || '')?.[1] || '').split(',').filter(Boolean);
const festivos = async () => { try { return (await neblla.api.key('festivos')) || []; } catch (_) { return []; } };   // [{ fecha, nombre }]

// Una cuadrícula: filas = horas, columnas = días; cells(col, time) da lo de cada casilla.
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
    const tc = el('div', 'tt-t', t); tc.style.gridRow = String(r + 2); tc.style.gridColumn = '1';
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
    f.append(el('b', '', closed[i].nombre || 'Festivo'), el('small', '', 'cerrado'));
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
  const offers = standingOffer.map(o => ({ ...o, days: byDayOf(o), time: hour(new Date(o.start)) })).filter(o => o.time && o.days.length);
  const times = [...new Set(offers.map(o => o.time))].sort();
  if (!offers.length) { $('timetable').replaceChildren(el('p', 'empty', 'Ahora mismo no hay horarios fijos a la venta. Puedes reservar clases sueltas en «Calendario».')); $('offer').replaceChildren(); return; }
  const g = grid(COLS.map(d => ({ label: SHORT[d] })), times, (i, t) => {
    const o = offers.find(x => x.time === t && x.days.includes(COLS[i]));
    if (!o) return null;
    const on = mine.has(o.series), sel = selOffer?.series === o.series;
    const b = el('button', 'tt-c cls' + (on ? ' mine' : '') + (sel ? ' sel' : ''));
    b.append(el('b', '', kind(o.title)));
    const who = seriesInfo.get(o.series)?.staffName;
    if (on) b.append(el('small', '', 'tuyo ✓')); else if (who) b.append(el('small', '', who));
    b.onclick = () => { selOffer = o; renderTimetable(); };
    return b;
  });
  $('timetable').replaceChildren(g);
  renderOffer(mine);
}

function renderOffer(mine) {
  const box = $('offer');
  box.replaceChildren();
  if (!selOffer) { box.append(el('p', 'empty', 'Toca una clase para ver su horario y apuntarte.')); return; }
  const o = selOffer, info = seriesInfo.get(o.series) || {};
  const card = el('div', 'pickcard main');
  card.append(el('div', 'kicker', 'Tu horario fijo'));
  card.append(el('b', '', `${o.title || 'Yoga'}${info.staffName ? ' con ' + info.staffName : ''}`));
  card.append(el('span', '', `Todos los ${joinY(o.days.map(d => DAYS[d]))} a las ${o.time}` + (info.minutes ? ` · ${info.minutes} min` : '') + (o.days.length > 1 ? ' · van juntos' : '')));
  const prod = products.find(x => x.productId === o.productId);
  card.append(el('small', '', (prod ? money(prod) + ' al mes. ' : 'Cuota mensual. ') + 'Tu plaza guardada en todas esas clases, tenga el mes las que tenga. No gasta bono. Si un día es festivo, esa clase no se recupera.'));
  if (mine.has(o.series)) {
    const acts = el('div', 'acts');
    acts.append(el('span', 'tag', 'Ya estás apuntado ✓'));
    const m = el('button', 'btn ghost small', 'Gestionar'); m.onclick = () => neblla.shop.manage(o.productId); acts.append(m);
    card.append(acts);
  } else {
    const b = el('button', 'btn', 'Apuntarme a este horario'); b.onclick = () => buy(o.productId, { series: o.series });
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
    const label = i === 0 ? 'Esta semana' : `${w.getUTCDate()}–${end.getUTCDate()} ${end.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' })}`;
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
  const times = [...new Set(inWeek.map(s => hour(new Date(s.start))).concat(standingOffer.map(o => hour(new Date(o.start)))))].filter(Boolean).sort();
  const heads = dates.map((d, i) => ({ label: SHORT[COLS[i]], sub: String(d.getUTCDate()), today: keys[i] === todayKey }));
  const g = grid(heads, times, (i, t) => {
    const s = inWeek.find(x => dayKey(new Date(x.start)) === keys[i] && hour(new Date(x.start)) === t);
    if (!s) return null;
    const b0 = myRow.get(s.id), viaPlan = !!(s.standing || b0?.standing), mineHere = !!(s.booked || b0);
    const past = Date.parse(s.start) < Date.now();
    const b = el('button', 'tt-c cls' + (mineHere ? (viaPlan ? ' mine' : ' bono') : '') + (past ? ' past' : '') + (!mineHere && s.left <= 0 ? ' full' : '') + (selCal?.id === s.id ? ' sel' : ''));
    b.append(el('b', '', kind(s.title)));
    b.append(el('small', '', mineHere ? (viaPlan ? 'horario ✓' : 'bono ✓') : past ? 'pasada' : s.left <= 0 ? 'completa' : `${s.left} plazas`));
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
    card.append(el('div', 'kicker', 'Festivo'));
    card.append(el('b', '', `${dayName(new Date(selDay.fecha + 'T12:00:00Z'))}: el estudio cierra`));
    card.append(el('span', '', 'Ese día no hay clases. Si tenías plaza de tu horario fijo, esa clase no se recupera: la cuota es la misma. Si reservaste con el bono, la clase vuelve a tu bono.'));
    box.append(card);
    return;
  }
  if (!selCal) { box.append(el('p', 'empty', 'Toca una clase para reservarla con tu bono.')); return; }
  const s = selCal, start = new Date(s.start), b0 = myRow.get(s.id);
  const viaPlan = !!(s.standing || b0?.standing), mineHere = !!(s.booked || b0);
  const card = el('div', 'pickcard' + (mineHere ? '' : ' main'));
  card.append(el('div', 'kicker', mineHere ? (viaPlan ? 'De tu horario fijo' : 'Reservada con tu bono') : 'Clase suelta'));
  card.append(el('b', '', `${s.title || 'Yoga'} · ${dayName(start)} a las ${hour(start)}`));
  card.append(el('span', '', [s.staffName, s.resourceName, s.left <= 0 ? 'completa' : `quedan ${s.left} de ${s.capacity} plazas`].filter(Boolean).join(' · ')));
  const acts = el('div', 'acts');
  if (mineHere) {
    const room = s.room || b0?.room;
    if (room) { const c = el('button', 'btn small', 'Chat de la clase'); c.onclick = () => openChat(room, s); acts.append(c); }
    if (Date.parse(s.start) > Date.now()) { const x = el('button', 'btn ghost small', 'No puedo ir'); x.onclick = () => cancel(GROUP, s.id); acts.append(x); }
    card.append(acts);
    if (!viaPlan) card.append(el('small', '', 'Si cancelas hasta 12 horas antes, la clase vuelve a tu bono.'));
  } else if (Date.parse(s.start) <= Date.now()) {
    card.append(el('span', 'tag old', 'Ya ha pasado'));
  } else {
    const b = el('button', 'btn', s.left <= 0 ? 'Completa' : 'Reservar con 1 clase del bono');
    b.disabled = s.left <= 0;
    b.onclick = () => reserve(GROUP, s.id);
    card.append(b);
    if (standingOffer.some(o => o.series === s.series)) card.append(el('small', '', '¿Vienes cada semana? En «Horarios» te apuntas a este horario y no gastas bono.'));
  }
  box.append(card);
}

async function renderBonoBox() {
  if (!loggedIn()) { $('balance').textContent = '–'; return; }
  const { balance } = await neblla.business.credits.balance(BONO);
  $('balance').textContent = balance;
}

async function reserve(set, slotId) {
  if (!loggedIn()) return neblla.auth.login();
  try {
    await BOOKING.reserve(set, slotId);
    const { balance } = await neblla.business.credits.balance(BONO);
    status(`Reservada: la tienes en «Mis clases». Te quedan ${balance} clases en el bono.`);
  } catch (err) { status(errText(err), true); }
  renderCalendar();
}

async function buy(productId, opts) {
  if (!loggedIn()) return neblla.auth.login();
  if (!payable(productId)) return status(PAY_SOON, true);
  try { await (opts ? neblla.shop.buy(productId, 1, opts) : neblla.shop.buy(productId)); } catch (err) { status(errText(err), true); }
}
$('buyBono').onclick = () => buy(P_BONO);
neblla.shop.on('purchase', (e) => {
  if (e?.productId === P_BONO) status('Bono comprado: 10 clases más.');
  else if (standingOffer.some(o => o.productId === e?.productId)) status('¡Apuntado! Ya tienes tu plaza en todas las clases de ese horario.');
  else status('Pago recibido.');
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
    for (const p of [{ id: null, name: 'Todos' }, ...staff]) {
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
    const b = el('button', n === privWeek ? 'on' : '', n === 0 ? 'Esta semana' : `${w.getUTCDate()}–${end.getUTCDate()} ${end.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' })}`);
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
  const times = [...new Set(free.map(x => hour(new Date(x.start))))].sort();
  const todayKey = dayKey(new Date());
  const heads = dates.map((d, i) => ({ label: SHORT[COLS[i]], sub: String(d.getUTCDate()), today: keys[i] === todayKey }));
  const box = $('privCal');
  if (!times.length) { box.replaceChildren(el('p', 'empty', staffSel ? `${staffSel.name} no tiene horas libres esta semana.` : 'No hay horas libres esta semana.')); renderPrivPick(); return; }
  box.replaceChildren(grid(heads, times, (i, t) => {
    const here = free.filter(x => dayKey(new Date(x.start)) === keys[i] && hour(new Date(x.start)) === t);
    if (!here.length) return null;
    const cell = el('div', 'tt-c split');
    for (const x of here) {
      const sel = privSel && privSel.start === x.start && privSel.who?.id === x.who?.id;
      const b = el('button', 'half ' + tint(x.who) + (sel ? ' sel' : ''), here.length > 1 ? (x.who?.name || 'libre').slice(0, 3) : (x.who?.name || 'libre'));
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
  if (!privSel) { box.append(el('p', 'empty', 'Toca una hora libre para reservarla.')); return; }
  const x = privSel, start = new Date(x.start);
  const card = el('div', 'pickcard main');
  card.append(el('div', 'kicker', 'Clase privada'));
  card.append(el('b', '', `${x.who?.name ? 'Con ' + x.who.name + ' · ' : ''}${dayName(start)} a las ${hour(start)}`));
  card.append(el('span', '', 'Una hora a solas, en la sala pequeña. ' + $('privPrice').textContent + ', se paga al reservar.'));
  const b = el('button', 'btn', 'Reservar y pagar');
  b.onclick = () => reservePrivate(x.start, x.who?.id);
  card.append(b);
  box.append(card);
}

async function reservePrivate(start, staffId) {
  if (!loggedIn()) return neblla.auth.login();
  if (!payable(services[PRIVATE]?.product || services[PRIVATE]?.productId)) return status(PAY_SOON, true);
  try {
    const r = await BOOKING.reserveAt(PRIVATE, { start, ...(staffId ? { staff: staffId } : {}) });
    privSel = null;
    show('mias');
    status(r.held ? `Te guardamos la hora hasta las ${hour(new Date(r.holdUntil))} mientras pagas.` : 'Reservada: aquí la tienes.');
    return;
  } catch (err) { status(errText(err), true); }
  renderPrivate();
}

// Un pago confirmado, una clase cancelada o una plaza fija que no pudo reservar.
BOOKING.on('update', ({ booking, standing }) => {
  if (standing) {
    const n = standing.booked?.length || 0, k = standing.skipped?.length || 0;
    status(`Tu horario: ${n} ${n === 1 ? 'clase reservada' : 'clases reservadas'}` + (k ? `, ${k} sin sitio (llenas).` : '.'), !!k);
  } else if (booking?.status === 'reserved') status('Reserva confirmada.');
  else if (booking?.status === 'cancelled') status({
    full: 'Pagaste cuando ya no quedaba sitio: se te devuelve el pago.',
    slot_gone: 'El estudio ha quitado esa clase: se te devuelve lo tuyo.',
    session_cancelled: booking.refunded ? 'El estudio ha cancelado una clase: vuelve a tu bono.' : 'El estudio ha cancelado una clase de tu horario (festivo): ese día no hay clase.',
    below_min: 'La clase no llegó al mínimo: se te devuelve lo tuyo.',
    not_enough_credits: 'No se pudo reservar una clase: no te quedaban clases en el bono.',
  }[booking.reason] || 'Reserva cancelada.', true);
  else return;
  if (current === 'mias') renderMine(); else if (current === 'calendario') renderCalendar(); else if (current === 'horarios') renderTimetable();
});

// ── Mis clases: mis horarios y lo reservado, cada clase con su chat ─────
async function renderMine() {
  if (!loggedIn()) { $('myPlans').replaceChildren(); $('mine').replaceChildren(el('p', 'empty', 'Entra para ver tus clases.')); return; }
  const [standing, bookings] = await Promise.all([myStanding(), Promise.all([GROUP, PRIVATE].map(myBookings))]);
  const plans = $('myPlans');
  plans.replaceChildren();
  for (const p of standing) {
    const row = el('div', 'item mine');
    const what = el('div', 'what');
    const o = standingOffer.find(x => x.productId === p.productId && x.series === p.series) || standingOffer.find(x => x.productId === p.productId);
    const by = (/BYDAY=([A-Z,]+)/.exec(o?.rrule || '')?.[1] || '').split(',').map(d => DAYS[d]).filter(Boolean);
    what.append(el('b', '', (p.title || o?.title || 'Mi horario') + (by.length ? ' · ' + joinY(by) : '') + (o?.start ? ' a las ' + hour(new Date(o.start)) : '')),
      el('span', '', p.until ? 'Pagado hasta el ' + new Date(p.until).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : 'Activo'));
    const m = el('button', 'btn ghost small', 'Gestionar'); m.onclick = () => neblla.shop.manage(p.productId);
    row.append(what, m);
    plans.append(row);
  }
  const all = bookings.flat().filter(b => b.status === 'reserved' || b.status === 'held').sort((a, b) => a.start.localeCompare(b.start));
  const box = document.createDocumentFragment();
  if (!all.length) box.append(el('p', 'empty', 'Aún no tienes clases. Apúntate a un horario en «Horarios» o reserva una clase suelta en «Calendario».'));
  const now = Date.now();
  let lastDay = '';
  for (const b of all) {
    const start = new Date(b.start), past = start.getTime() < now, day = dayName(start);
    if (day !== lastDay) { box.append(el('div', 'day', day)); lastDay = day; }
    const row = el('div', 'item' + (past ? '' : ' mine'));
    row.append(el('div', 't', hour(start)));
    const what = el('div', 'what');
    what.append(el('b', '', (b.title || services[b.set]?.name || b.set) + (b.staffName ? ' con ' + b.staffName : '')), el('span', '', b.standing ? 'De tu horario' : b.set === PRIVATE ? 'Clase privada' : 'Con bono'));
    row.append(what);
    if (b.status === 'held') row.append(el('span', 'tag wait', 'Pendiente de pago'));
    else if (past) row.append(el('span', 'tag old', 'Hecha'));
    else {
      const acts = el('div', 'acts');
      if (b.room) { const ch = el('button', 'btn small', 'Chat de la clase'); ch.onclick = () => openChat(b.room, b); acts.append(ch); }
      const c = el('button', 'btn ghost small', 'No puedo ir');
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
    if (!look.moves?.length) { text('Aún no tienes movimientos propios. Crea un saludo en Creator → Mundo → Animar y tu muñeco lo hará aquí.'); return; }
    $('dollView').hidden = false;
    const world = await neblla.world.create({ container: '#dollView', sky: 'studio', camera: 'third', touch: false });
    const doll = await neblla.avatar.doll(world);
    world.add({ shape: 'box', size: [8, 1, 8], position: [0, -0.5, 0], color: '#dcdce4' });   // el suelo: el muñeco es un personaje y, sin suelo, cae
    world.add({ doll, position: [0, 1, 0] });
    world.camera.use('third', { target: [0, 0.9, 0], distance: 3.2, pitch: 0.1, height: 0, transition: 0 });
    const moves = doll.ownMoves || [];
    if (!moves.length) { $('dollView').hidden = true; text('Aún no tienes movimientos propios. Crea un saludo en Creator → Mundo → Animar y tu muñeco lo hará aquí.'); return; }
    dollPlay = (id) => doll.play(id);
    dollPlay(moves[0].id);
    text(moves.length > 1 ? 'Elige un movimiento:' : moves[0].name);
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
    status(refunded ? 'Cancelada: tu plaza queda libre para otra persona.' : 'Cancelada fuera de plazo: sin devolución.');
  } catch (err) { status(errText(err), true); }
  if (current === 'mias') renderMine(); else if (current === 'calendario') renderCalendar(); else if (current === 'buzon') renderInbox();
}

// ── Mensajes con el estudio (y el recordatorio de la víspera) ───────────
function renderInbox() {
  const box = $('msgs');
  box.replaceChildren();
  if (!loggedIn()) { box.append(el('p', 'empty', 'Entra para escribir al estudio.')); return Promise.resolve(); }
  const list = [...(neblla.inbox.messages || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!list.length) box.append(el('p', 'empty', 'Aún no hay mensajes.'));
  for (const m of list) {
    const mine = m.from !== 'dev';
    const reminder = m.data?.type === 'booking.reminder';
    const b = el('div', 'bubble' + (mine ? ' me' : '') + (reminder ? ' remind' : ''));
    if (reminder) b.append(el('div', 'kicker', '⏰ Recordatorio'));
    b.append(el('div', '', m.message));
    if (reminder && m.data.set && m.data.slot && Date.parse(m.data.start) > Date.now()) {
      const c = el('button', 'btn ghost small', 'No puedo ir: cancelar');
      c.onclick = () => cancel(m.data.set, m.data.slot);
      b.append(c);
    }
    b.append(el('small', '', (mine ? 'Tú' : (m.data?.name || 'Estudio')) + ' · ' + new Date(m.createdAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
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
  try { await neblla.inbox.send({ message: text }); $('msg').value = ''; status('Enviado. Te contestamos aquí.'); }
  catch (err) { status(errText(err), true); }
  renderInbox();
};
neblla.inbox.on('messages', () => { if (current === 'buzon') renderInbox(); });
neblla.inbox.on('updated', () => { if (current === 'buzon') renderInbox(); });

// ── El estudio: fotos con qué se ve en cada una; se amplían al tocarlas ──
function openPhoto(f) {
  $('lbImg').src = f.url; $('lbImg').alt = f.titulo || '';
  $('lbTitle').textContent = f.titulo || '';
  $('lbText').textContent = f.texto || '';
  $('lightbox').hidden = false;
}
$('lightbox').onclick = () => { $('lightbox').hidden = true; };
async function renderGallery() {
  const list = (await Promise.resolve(neblla.api.key('galeria'))) || [];
  const box = document.createDocumentFragment();
  if (!list.length) box.append(el('p', 'empty', 'Pronto, fotos del estudio.'));
  for (const f of list) {
    const fig = el('figure');
    const img = el('img'); img.src = f.url; img.alt = f.titulo || ''; img.loading = 'lazy';
    fig.append(img);
    if (f.titulo) fig.append(el('figcaption', '', f.titulo));
    fig.onclick = () => openPhoto(f);
    box.append(fig);
  }
  $('gallery').replaceChildren(box);
}

// ── Chat de cada clase: solo quien tiene plaza y su profe ───────────────
let chatRoom = null;
const chatLine = (who, text, mine, at) => {
  const b = el('div', 'bubble' + (mine ? ' me' : ''));
  b.append(el('div', '', text));
  b.append(el('small', '', (who || 'Alguien') + (at ? ' · ' + new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '')));
  return b;
};
const textOf = (x) => (typeof x === 'string' ? x : x?.text ?? '');
async function openChat(room, s) {
  if (!loggedIn()) return neblla.auth.login();
  chatRoom = room;
  current = 'chat';
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-chat';
  $('chatTitle').textContent = (s.title || 'Clase') + ' · ' + dayName(new Date(s.start)) + ' ' + hour(new Date(s.start));
  $('chatMsgs').replaceChildren(el('p', 'empty', 'Entrando…'));
  try {
    await neblla.rooms.join(room);
    const hist = await neblla.room.history({ limit: 100 }).catch(() => []);
    const items = (Array.isArray(hist) ? hist : hist?.messages || []).slice().reverse();
    const box = $('chatMsgs');
    box.replaceChildren();
    if (!items.length) box.append(el('p', 'empty', 'Nadie ha escrito todavía.'));
    for (const m of items) if (!m.deleted) box.append(chatLine(m.from === 'business' ? (m.body?.name || 'Estudio') + ' (profe)' : (m.user?.publicInfo?.name || m.name), textOf(m.body ?? m.data), m.from === neblla.auth.me.id, m.time || m.at));
    box.scrollTop = box.scrollHeight;
  } catch (err) { $('chatMsgs').replaceChildren(el('p', 'empty', errText(err))); }
}
function leaveChat() { if (chatRoom) { neblla.room.leave?.(); chatRoom = null; } }
neblla.message.on((m) => {
  if (!chatRoom || current !== 'chat') return;
  const box = $('chatMsgs');
  box.querySelector('.empty')?.remove();
  box.append(chatLine(m.from === 'business' ? (m.data?.name || 'Estudio') + ' (profe)' : m.user?.publicInfo?.name, textOf(m.data), !!m.fromMe, m.time));
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
  try {
    products = await neblla.shop.products();
    const p = (id) => products.find(x => x.productId === id);
    if (p(P_BONO)) $('pBono').textContent = money(p(P_BONO));
    const priv = p(services[PRIVATE]?.product || services[PRIVATE]?.productId);
    if (priv) $('privPrice').textContent = money(priv);
  } catch (_) {}
  renderWho();
  show('inicio');
}
neblla.auth.on('login', () => { renderWho(); show(current === 'chat' ? 'mias' : current); });
neblla.auth.on('logout', () => { renderWho(); show('inicio'); });
boot();
};
