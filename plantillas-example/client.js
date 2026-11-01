// Plantillas Luna, una tienda de ejemplo hecha con Neblla. Una diseñadora vende
// plantillas: de Canva (lo que se compra es un enlace privado, C330), una hoja
// de Excel (un fichero privado que se descarga, C230) y la suscripción
// «Todo el catálogo», que lo da todo mientras está viva. Se compra sin
// registrarse, solo con el email. Todo con neblla.*, sin servidor propio.
// Los textos de pantalla viven en lang/*.json (los pinta /connect/lang.js); los
// productos llevan nombre y descripción por idioma en Neblla; los SVG de las
// vistas previas llevan su texto en data-k y se rellenan aquí (C897).
window.onNeblla = async (neblla) => {
const L = window.nebllaLang;
await L.ready;
const t = (k, v) => L.t(k, v);
const $ = (id) => document.getElementById(id);
let products = [];
let tab = 'tienda';

const locale = () => ({ pt: 'pt-BR', zh: 'zh-CN' }[L.lang] || L.lang);
const fmtMoney = (cents, cur) => new Intl.NumberFormat(locale(), { style: 'currency', currency: (cur || 'eur').toUpperCase() }).format(cents / 100);
const money = (p) => fmtMoney(p.price, p.currency);
// Texto por idioma: el activo, si no el español (el de reserva), si no el primero.
const pick = (v) => v && typeof v === 'object' ? (v[L.lang] || v.es || Object.values(v)[0] || '') : (v || '');
const nameOf = (p) => pick(p.name);
const textOf = pick;
const imgKey = (p) => (/img\/([a-z-]+)\.svg/.exec(p.image || '') || [])[1] || '';
const loggedIn = () => !!neblla.auth.me?.loggedIn;
const errText = (err) => {
  const code = err?.code || err?.message;
  const known = { product_waiting: 'errSoon', stripe_test_account_required: 'errSoon', payouts_not_ready: 'errSoon', already_owned: 'errOwned', login_required: 'errLogin' }[code];
  return known ? t(known) : t('errGeneric', { code: code || err });
};

// ── Vistas previas: SVG con el texto en el idioma activo ───────────────
const svgCache = new Map();
async function svgUrl(src) {
  const key = src + '|' + L.lang;
  if (svgCache.has(key)) return svgCache.get(key);
  let url = src;
  try {
    const doc = new DOMParser().parseFromString(await (await fetch(src)).text(), 'image/svg+xml');
    for (const e of doc.querySelectorAll('[data-k]')) {
      const [k, up] = e.getAttribute('data-k').split(':');
      const price = e.getAttribute('data-price');
      const v = t(k, price ? { price: fmtMoney(Number(price), 'eur') } : undefined);
      e.textContent = up ? v.toLocaleUpperCase(L.lang) : v;
    }
    for (const e of doc.querySelectorAll('[data-n]')) e.textContent = new Intl.NumberFormat(locale()).format(Number(e.getAttribute('data-n')));
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  } catch (e) { /* sin SVG traducido: la imagen original */ }
  svgCache.set(key, url);
  return url;
}
function setSvg(img, src) { svgUrl(src).then((u) => { img.src = u; }); }

function status(text, bad) {
  const s = $('status');
  s.textContent = text; s.className = 'status' + (bad ? ' bad' : ''); s.hidden = !text;
  if (text) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

// ── Pestañas ────────────────────────────────────────────────────────────
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => show(b.dataset.tab);
function draw(name) {
  tab = name;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + name;
  return ({ tienda: renderShop, mias: renderMine })[name]().catch((e) => status(errText(e), true));
}
function show(name) { status(''); draw(name); window.scrollTo(0, 0); }

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (loggedIn()) {
    who.append(el('b', '', neblla.auth.me.publicInfo?.name || t('account')));
    const out = el('button', 'link', t('logout')); out.onclick = () => neblla.auth.logout(); who.append(out);
  } else {
    const b = el('button', 'btn light', t('login')); b.onclick = () => neblla.auth.login(); who.append(b);
  }
}

// ── Tienda ──────────────────────────────────────────────────────────────
const owned = (p) => !!neblla.shop.purchases?.[p.productId];
const clubOn = () => products.some(p => p.type === 'subscription' && neblla.shop.purchases?.[p.productId]?.active);

async function buy(p) {
  if (p.waiting) return status(t('payWaiting'), true);
  try { await neblla.shop.buy(p.productId); status(t('payOpened')); }
  catch (e) { status(errText(e), true); }
}

function card(p) {
  const c = el('article', 'card');
  const img = el('img'); img.alt = t('preview', { name: nameOf(p) }); img.loading = 'lazy';
  setSvg(img, p.image);
  img.onclick = () => zoom(p);
  c.append(img);
  const body = el('div', 'card-b');
  body.append(el('h3', '', nameOf(p)));
  if (p.description) body.append(el('p', '', textOf(p.description)));
  const row = el('div', 'row');
  row.append(el('span', 'price', money(p)));
  if (owned(p) || clubOn()) {
    const go = el('button', 'btn ghost small', owned(p) ? t('owned') : t('inCatalog'));
    go.onclick = () => show('mias'); row.append(go);
  } else if (p.waiting) row.append(el('span', 'tag', t('comingSoon')));
  else { const b = el('button', 'btn small', t('buy')); b.onclick = () => buy(p); row.append(b); }
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
  const img = el('img'); img.alt = nameOf(sub); setSvg(img, sub.image);
  const box = el('div', 'club-b');
  box.append(el('div', 'kicker', t('kicker')), el('h2', '', nameOf(sub)));
  box.append(el('p', '', textOf(sub.description)));
  const row = el('div', 'row');
  row.append(el('span', 'price', t('perMonth', { price: money(sub) })));
  if (clubOn()) {
    row.append(el('span', 'tag', t('subscribed')));
    const m = el('button', 'btn ghost small light', t('manage')); m.onclick = () => neblla.shop.manage(sub.productId); row.append(m);
  } else if (sub.waiting) row.append(el('span', 'tag', t('comingSoon')));
  else { const b = el('button', 'btn', t('subscribe')); b.onclick = () => buy(sub); row.append(b); }
  box.append(row);
  club.append(img, box);
}

function zoom(p) {
  setSvg($('lbImg'), p.image); $('lbImg').alt = nameOf(p);
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
    box.append(el('p', 'empty', t('emptyMine')));
    const b = el('button', 'btn', t('toShop')); b.onclick = () => show('tienda'); box.append(b);
    return;
  }
  const sub = products.find(p => p.type === 'subscription');
  if (sub && clubOn()) box.append(el('p', 'hint', t('clubHint')));
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
  if (p?.image) { const i = el('img'); i.alt = ''; setSvg(i, p.image); r.append(i); }
  const box = el('div', 'mine-t');
  // El título de un fichero es un solo texto (el del Excel, en español): se enseña el nombre del producto.
  box.append(el('b', '', p ? nameOf(p) : t('yourTpl')));
  box.append(el('small', '', piece.via === 'subscription' ? t('viaSub') : t('bought')));
  r.append(box);
  if (piece.kind === 'file') {
    const b = el('button', 'btn small', t('download'));
    b.onclick = () => neblla.media.download(piece.id).catch((e) => status(errText(e), true));
    r.append(b);
  } else if (piece.type === 'link') {
    const a = el('a', 'btn small', textOf(piece.label) || t('open')); a.href = piece.url; a.target = '_blank'; a.rel = 'noopener';
    r.append(a);
  } else r.append(el('code', '', piece.text));
  return r;
}

function restoreBox() {
  const f = el('form', 'restore');
  f.append(el('p', '', t('restoreText')));
  const i = el('input'); i.type = 'email'; i.required = true; i.placeholder = t('emailPh');
  const b = el('button', 'btn', t('restoreBtn'));
  const l = el('button', 'btn ghost', t('login')); l.type = 'button'; l.onclick = () => neblla.auth.login();
  f.append(i, b, l);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await neblla.shop.restore(i.value); status(t('linkSent', { email: i.value })); }
    catch (err) { status(errText(err), true); }
  };
  return f;
}

neblla.shop.on('purchase', () => { status(t('thanks')); show('mias'); });
for (const ev of ['login', 'logout']) neblla.auth.on(ev, () => { renderWho(); renderShop().catch(() => {}); });
// Cambio de idioma en vivo: título, cabecera y la pestaña abierta se repintan.
const retitle = () => { document.title = t('title'); };
L.on(() => { retitle(); renderWho(); draw(tab); });
retitle();
renderWho();
show('tienda');
};
