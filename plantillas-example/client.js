// Plantillas Luna, una tienda de ejemplo hecha con Neblla. Una diseñadora vende
// plantillas: de Canva (lo que se compra es un enlace privado, C330), una hoja
// de Excel (un fichero privado que se descarga, C230) y la suscripción
// «Todo el catálogo», que lo da todo mientras está viva. Se compra sin
// registrarse, solo con el email. Todo con neblla.*, sin servidor propio.
window.onNeblla = (neblla) => {
const $ = (id) => document.getElementById(id);
let products = [];

const money = (p) => (p.price / 100).toLocaleString('es-ES', { style: 'currency', currency: (p.currency || 'eur').toUpperCase() });
const nameOf = (p) => typeof p.name === 'object' ? (p.name.es || Object.values(p.name)[0]) : p.name;
const textOf = (v) => v && typeof v === 'object' ? (v.es || Object.values(v)[0] || '') : (v || '');
const imgKey = (p) => (/img\/([a-z-]+)\.svg/.exec(p.image || '') || [])[1] || '';
const loggedIn = () => !!neblla.auth.me?.loggedIn;
const errText = (err) => ({
  product_waiting: 'Los pagos de prueba aún no están activos en este ejemplo.',
  stripe_test_account_required: 'Los pagos de prueba aún no están activos en este ejemplo.',
  payouts_not_ready: 'Los pagos de prueba aún no están activos en este ejemplo.',
  already_owned: 'Ya la tienes: está en «Mis compras».',
  login_required: 'Entra con tu cuenta, o con el email con el que compraste, para ver tus compras.',
}[err?.code || err?.message]) || 'No se pudo (' + (err?.code || err?.message || err) + ').';

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

// ── Pestañas ────────────────────────────────────────────────────────────
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);
function show(tab) {
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + tab;
  status('');
  ({ tienda: renderShop, mias: renderMine })[tab]().catch((e) => status(errText(e), true));
  window.scrollTo(0, 0);
}

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (loggedIn()) {
    who.append(el('b', '', neblla.auth.me.publicInfo?.name || 'Mi cuenta'));
    const out = el('button', 'link', 'Salir'); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light', 'Entrar'); b.onclick = () => neblla.auth.login(); who.append(b);
  }
}

// ── Tienda ──────────────────────────────────────────────────────────────
const owned = (p) => !!neblla.shop.purchases?.[p.productId];
const clubOn = () => products.some(p => p.type === 'subscription' && neblla.shop.purchases?.[p.productId]?.active);

async function buy(p) {
  if (p.waiting) return status('Los pagos de prueba aún no están activos en este ejemplo: pronto podrás pagar con la tarjeta 4242. No se ha cobrado nada.', true);
  try { await neblla.shop.buy(p.productId); status('Se ha abierto el pago. Paga con la tarjeta 4242 4242 4242 4242: no se cobra nada.'); }
  catch (e) { status(errText(e), true); }
}

function card(p) {
  const c = el('article', 'card');
  const img = el('img'); img.src = p.image; img.alt = 'Vista previa de ' + nameOf(p); img.loading = 'lazy';
  img.onclick = () => zoom(p);
  c.append(img);
  const body = el('div', 'card-b');
  body.append(el('h3', '', nameOf(p)));
  if (p.description) body.append(el('p', '', textOf(p.description)));
  const row = el('div', 'row');
  row.append(el('span', 'price', money(p)));
  if (owned(p) || clubOn()) {
    const go = el('button', 'btn ghost small', owned(p) ? 'Ya es tuya ✓' : 'En tu catálogo ✓');
    go.onclick = () => show('mias'); row.append(go);
  } else if (p.waiting) row.append(el('span', 'tag', 'Próximamente'));
  else { const b = el('button', 'btn small', 'Comprar'); b.onclick = () => buy(p); row.append(b); }
  body.append(row);
  c.append(body);
  return c;
}

async function renderShop() {
  products = await neblla.shop.products();
  $('paySoon').hidden = !products.some(p => p.waiting);
  const once = products.filter(p => p.type === 'one_time');
  const group = (pre) => once.filter(p => imgKey(p).startsWith(pre));
  $('cvs').replaceChildren(...group('cv-').map(card));
  $('social').replaceChildren(...group('ig-').map(card));
  $('business').replaceChildren(...once.filter(p => !/^(cv|ig)-/.test(imgKey(p))).map(card));
  const club = $('club');
  club.replaceChildren();
  const sub = products.find(p => p.type === 'subscription');
  if (!sub) return;
  const img = el('img'); img.src = sub.image; img.alt = 'Todo el catálogo';
  const t = el('div', 'club-b');
  t.append(el('div', 'kicker', 'Suscripción'), el('h2', '', nameOf(sub)));
  t.append(el('p', '', textOf(sub.description) || 'Todas las plantillas de la tienda, y las nuevas de cada mes, mientras sigas suscrita.'));
  const row = el('div', 'row');
  row.append(el('span', 'price', money(sub) + ' al mes'));
  if (clubOn()) {
    row.append(el('span', 'tag', 'Ya estás suscrita ✓'));
    const m = el('button', 'btn ghost small light', 'Gestionar'); m.onclick = () => neblla.shop.manage(sub.productId); row.append(m);
  } else if (sub.waiting) row.append(el('span', 'tag', 'Próximamente'));
  else { const b = el('button', 'btn', 'Suscribirme'); b.onclick = () => buy(sub); row.append(b); }
  t.append(row);
  club.append(img, t);
}

function zoom(p) {
  $('lbImg').src = p.image; $('lbImg').alt = nameOf(p);
  $('lbTitle').textContent = nameOf(p); $('lbText').textContent = money(p);
  $('lightbox').hidden = false;
}
$('lightbox').onclick = () => { $('lightbox').hidden = true; };

// ── Mis compras ─────────────────────────────────────────────────────────
// neblla.media.mine() dice qué es suyo: los ficheros privados (el Excel) y
// el contenido privado de cada producto (el enlace a la plantilla).
async function renderMine() {
  const box = $('mine');
  box.replaceChildren();
  if (!products.length) products = await neblla.shop.products();
  let mine;
  try { mine = await neblla.media.mine(); }
  catch (e) {
    if ((e.code || e.message) !== 'login_required') throw e;
    return box.append(restoreBox());
  }
  const byProduct = new Map();
  const add = (pid, piece) => { if (!byProduct.has(pid)) byProduct.set(pid, []); byProduct.get(pid).push(piece); };
  for (const c of mine.content || []) add(c.productId, { kind: 'content', ...c });
  for (const i of mine.items || []) add(i.productId, { kind: 'file', ...i });
  for (const c of mine.collections || []) for (const i of (await neblla.media.collection(c.key)).items || []) add(c.productId, { kind: 'file', ...i });
  if (!byProduct.size) {
    box.append(el('p', 'empty', 'Aún no tienes ninguna plantilla. Lo que compres aparecerá aquí, para abrirlo o descargarlo cuando quieras.'));
    const b = el('button', 'btn', 'Ver la tienda'); b.onclick = () => show('tienda'); box.append(b);
    return;
  }
  const sub = products.find(p => p.type === 'subscription');
  if (sub && clubOn()) box.append(el('p', 'hint', 'Con «Todo el catálogo» tienes todas las plantillas mientras sigas suscrita.'));
  for (const [pid, pieces] of byProduct) {
    const seen = new Set();
    for (const piece of pieces) {
      const key = piece.kind === 'file' ? 'f' + piece.id : 'c' + (piece.url || piece.text);
      if (seen.has(key)) continue;
      seen.add(key);
      box.append(line(products.find(p => p.productId === pid), piece));
    }
  }
}

function line(p, piece) {
  const r = el('div', 'mine-row');
  if (p?.image) { const i = el('img'); i.src = p.image; i.alt = ''; r.append(i); }
  const t = el('div', 'mine-t');
  t.append(el('b', '', piece.title || (p ? nameOf(p) : 'Tu plantilla')));
  t.append(el('small', '', piece.via === 'subscription' ? 'Con tu suscripción' : 'Comprada'));
  r.append(t);
  if (piece.kind === 'file') {
    const b = el('button', 'btn small', 'Descargar');
    b.onclick = () => neblla.media.download(piece.id).catch((e) => status(errText(e), true));
    r.append(b);
  } else if (piece.type === 'link') {
    const a = el('a', 'btn small', textOf(piece.label) || 'Abrir'); a.href = piece.url; a.target = '_blank'; a.rel = 'noopener';
    r.append(a);
  } else r.append(el('code', '', piece.text));
  return r;
}

function restoreBox() {
  const f = el('form', 'restore');
  f.append(el('p', '', '¿Compraste sin registrarte? Escribe tu email y te mandamos un enlace para tener aquí tus compras. O entra con tu cuenta.'));
  const i = el('input'); i.type = 'email'; i.required = true; i.placeholder = 'tu@email.com';
  const b = el('button', 'btn', 'Recuperar mis compras');
  const l = el('button', 'btn ghost', 'Entrar'); l.type = 'button'; l.onclick = () => neblla.auth.login();
  f.append(i, b, l);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await neblla.shop.restore(i.value); status('Te hemos mandado un enlace a ' + i.value + '. Ábrelo en este dispositivo.'); }
    catch (err) { status(errText(err), true); }
  };
  return f;
}

neblla.shop.on('purchase', () => { status('¡Gracias! Ya lo tienes en «Mis compras».'); show('mias'); });
for (const ev of ['login', 'logout']) neblla.auth.on(ev, () => { renderWho(); renderShop().catch(() => {}); });
renderWho();
show('tienda');
};
