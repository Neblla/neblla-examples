// client.js — «Criaturas», a collectible card game.
//
// What Neblla does for it, so this file never has to be trusted:
//   - the collection is a table only Neblla writes (`coleccion`, write: 'neblla'):
//     the phone reads it, but cannot add a card to it;
//   - a pack is a fair draw declared in the app's settings (`draws.sobre`):
//     Neblla shuffles, charges and writes the 5 cards before showing them;
//   - packs and coins are credits bought in the shop (Stripe), with 3 packs
//     as a welcome gift and a free pack every 12 hours;
//   - friends see each other's collection (visible: friends) and trade cards
//     (trade: coleccion), all or nothing;
//   - a duel is a room for two with an 8-card deck each, brought from the
//     collection into a pile nobody else sees (tools.deck fromRows).

// Language: the texts are in lang/<code>.json. The HTML uses data-i18n*; this
// file asks for them with T() and repaints on nebllaLang.on. The collection
// saves each creature's stable id (`criatura`), never its name: the name
// comes from the active language (c_<id>).
window.onNeblla = async (neblla) => {
  if (!window.nebllaLang) await new Promise(r => window.addEventListener('load', r));
  await nebllaLang.ready;
  const { CRIATURAS, POR_ID, ELEMENTOS, RAREZAS, dibujo } = window.Criaturas;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const MAZO = 8;
  const T = (key, vars) => nebllaLang.t(key, vars);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, o) => new Intl.NumberFormat(nebllaLang.lang, o).format(n);
  const iso = (s) => '⁨' + s + '⁩';   // a name inside a rtl sentence keeps its own direction
  const nombre = (id) => T('c_' + id);
  const rareza = (r) => T('rarity_' + r);
  const elemento = (e) => T('element_' + e);

  let coleccion = [];          // my rows: { id, criatura, rareza, elemento, fuerza }
  let filtro = '';
  let mazo = [];               // row ids of my duel deck (saved with db.save)
  let enDuelo = false;

  // ── Small helpers ──────────────────────────────────────────────────────
  const avisar = (texto) => { $('aviso').textContent = texto; $('aviso').hidden = !texto; if (texto) setTimeout(() => { if ($('aviso').textContent === texto) $('aviso').hidden = true; }, 6000); };
  const dentro = () => !!neblla.auth.me?.loggedIn;
  function carta(fila, { mini = false, cuantas = 0, falta = false, nueva = false } = {}) {
    const c = POR_ID[fila.criatura] || fila;
    const e = el('div', ['carta', c.rareza, c.elemento, mini && 'mini', falta && 'falta', nueva && 'nueva'].filter(Boolean).join(' '));
    const cid = fila.criatura || c.id;
    e.innerHTML = `<div class="arte">${dibujo(c, { silueta: falta, etiqueta: esc(falta ? T('silhouette') : nombre(cid)) })}</div>
      ${falta ? '' : `<span class="fuerza">${c.fuerza}</span>`}
      ${cuantas > 1 ? `<span class="cuantas">×${cuantas}</span>` : ''}
      <div class="nombre">${falta ? T('unknown_card') : esc(nombre(cid))}</div>
      <div class="datos"><span>${ELEMENTOS[c.elemento].icono}</span><span>${falta ? '' : esc(rareza(c.rareza))}</span></div>`;
    return e;
  }
  function ampliar(fila) {
    const d = $('detalle');
    d.innerHTML = '';
    const c = POR_ID[fila.criatura];
    const k = carta(fila);
    k.insertAdjacentHTML('beforeend', `<p class="nota">${esc(T('strength_note', { element: elemento(c.elemento), n: c.fuerza }))}</p>`);
    d.append(k);
    d.hidden = false;
    d.onclick = () => { d.hidden = true; };
  }

  // ── Tabs ───────────────────────────────────────────────────────────────
  function ir(vista) {
    document.querySelectorAll('.vista').forEach(v => { v.hidden = v.id !== vista; });
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
    if (vista === 'vColeccion') pintarColeccion();
    if (vista === 'vAmigos') pintarAmigos();
    if (vista === 'vTienda') pintarTienda();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => ir(b.dataset.v));

  // ── Sign in ────────────────────────────────────────────────────────────
  $('entrar').onclick = () => neblla.auth.login({ scopes: ['friends'] }).catch(e => avisar(e.code === 'popup_blocked' ? T('err_popup') : T('err_login')));
  neblla.auth.on('login', () => arrancar());
  neblla.auth.on('logout', () => arrancar());

  async function arrancar() {
    $('entrar').hidden = dentro();
    $('saldo').hidden = !dentro();
    if (!dentro()) {
      coleccion = [];
      avisar(T('guest_hint'));
      pintarSobre();
      return;
    }
    mazo = Array.isArray(neblla.db.data?.mazo) ? neblla.db.data.mazo : [];
    await Promise.all([cargarColeccion(), cargarSaldo(), pintarSobre()]);
  }

  async function cargarColeccion() {
    coleccion = await neblla.db.load({ table: 'coleccion', limit: 500 });
    mazo = mazo.filter(id => coleccion.some(f => f.id === id));
  }
  async function cargarSaldo() {
    const [s, m] = await Promise.all([
      neblla.business.credits.balance('sobres').catch(() => ({ balance: 0 })),
      neblla.business.credits.balance('monedas').catch(() => ({ balance: 0 })),
    ]);
    $('nSobres').textContent = s.balance;
    $('nMonedas').textContent = m.balance;
    return { sobres: s.balance, monedas: m.balance };
  }

  // ── Packs ──────────────────────────────────────────────────────────────
  let info = null;
  async function pintarSobre() {
    info = await neblla.db.drawInfo('sobre').catch(() => null);
    if (info) {
      $('probas').innerHTML = '';
      const porRareza = {};
      for (const c of info.cards) porRareza[c.data.rareza] = (porRareza[c.data.rareza] || 0) + c.chance;
      for (const r of Object.keys(RAREZAS)) if (porRareza[r]) $('probas').append(el('div', 'proba', `<span>${esc(rareza(r))}</span><b>${esc(T('odds_row', { pct: fmt(porRareza[r] * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }))}</b>`));
      const leg = info.cards.filter(c => c.data.rareza === 'legendaria').map(c => nombre(c.data.criatura)).join(', ');
      $('probas').append(el('p', 'nota', esc(T('legend_note', { names: leg, total: fmt(info.cards.reduce((n, c) => n + c.copies, 0)) }))));
    }
    const libre = info?.free;
    const saldo = dentro() ? await cargarSaldo() : { sobres: 0, monedas: 0 };
    $('abrirGratis').hidden = !(dentro() && libre?.available >= 1);
    $('abrirSobre').disabled = !dentro() || saldo.sobres < 1;
    $('abrirMonedas').disabled = !dentro() || saldo.monedas < 100;
    $('proximoGratis').textContent = !dentro() ? '' : libre?.available >= 1 ? T('free_have')
      : libre?.nextAt ? T('free_next', { when: new Date(libre.nextAt).toLocaleString(nebllaLang.lang, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) }) : '';
  }

  async function abrir(pay) {
    if (!dentro()) return neblla.auth.login({ scopes: ['friends'] });
    $('sobre').classList.add('abriendo');
    try {
      const r = await neblla.db.draw('sobre', pay ? { pay } : undefined);
      $('reparto').innerHTML = '';
      r.cards.forEach((f, i) => {
        const k = carta(f, { nueva: true });
        k.style.animationDelay = (i * 0.18) + 's';
        k.onclick = () => ampliar(f);
        $('reparto').append(k);
      });
      const top = r.cards.reduce((a, b) => RAREZAS[b.rareza].orden > RAREZAS[a.rareza].orden ? b : a);
      if (RAREZAS[top.rareza].orden >= 2) avisar(T('rare_pull', { name: nombre(top.criatura), rarity: rareza(top.rareza) }));
      await cargarColeccion();
    } catch (e) {
      avisar({ not_enough_credits: T('err_no_packs'), no_free_open: T('err_no_free'), too_many_rows: T('err_full') }[e.code] || T('err_open'));
    } finally {
      setTimeout(() => $('sobre').classList.remove('abriendo'), 500);
      pintarSobre();
    }
  }
  $('sobre').onclick = () => abrir();
  $('abrirGratis').onclick = () => abrir('free');
  $('abrirSobre').onclick = () => abrir('sobres');
  $('abrirMonedas').onclick = () => abrir('monedas');

  // ── Collection and deck ────────────────────────────────────────────────
  const cuantasDe = () => { const n = {}; for (const f of coleccion) n[f.criatura] = (n[f.criatura] || 0) + 1; return n; };
  function pintarColeccion() {
    const n = cuantasDe();
    $('progreso').textContent = T('of', { n: Object.keys(n).length, total: CRIATURAS.length });
    $('rejilla').innerHTML = '';
    for (const c of CRIATURAS) {
      if (filtro && c.elemento !== filtro) continue;
      const tengo = n[c.id] || 0;
      const k = carta({ criatura: c.id }, { cuantas: tengo, falta: !tengo });
      if (tengo) {
        const filas = coleccion.filter(f => f.criatura === c.id);
        if (filas.some(f => mazo.includes(f.id))) k.classList.add('en-mazo');
        k.onclick = () => alternarMazo(filas);
        k.oncontextmenu = (ev) => { ev.preventDefault(); ampliar(filas[0]); };
      }
      $('rejilla').append(k);
    }
    pintarMazo();
  }
  function pintarMazo() {
    $('mazo').innerHTML = '';
    for (const id of mazo) {
      const f = coleccion.find(x => x.id === id);
      if (!f) continue;
      const k = carta(f, { mini: true });
      k.onclick = () => { mazo = mazo.filter(x => x !== id); guardarMazo(); };
      $('mazo').append(k);
    }
    $('mazoCuenta').textContent = T('of', { n: mazo.length, total: MAZO });
  }
  function alternarMazo(filas) {
    const dentroMazo = filas.filter(f => mazo.includes(f.id));
    const fuera = filas.find(f => !mazo.includes(f.id));
    if (fuera && mazo.length < MAZO) mazo.push(fuera.id);
    else if (dentroMazo.length) mazo = mazo.filter(x => x !== dentroMazo[dentroMazo.length - 1].id);
    else return avisar(T('deck_full'));
    guardarMazo();
  }
  function guardarMazo() {
    neblla.db.save({ mazo });
    pintarColeccion();
  }
  $('mazoAuto').onclick = () => {
    mazo = [...coleccion].sort((a, b) => b.fuerza - a.fuerza).slice(0, MAZO).map(f => f.id);
    guardarMazo();
  };
  $('filtros').onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    filtro = b.dataset.f;
    $('filtros').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    pintarColeccion();
  };

  // ── Duel ───────────────────────────────────────────────────────────────
  $('buscar').onclick = async () => {
    if (!dentro()) return neblla.auth.login({ scopes: ['friends'] });
    if (mazo.length !== MAZO) { ir('vColeccion'); return avisar(T('need_deck')); }
    $('dueloEstado').textContent = T('searching');
    $('buscar').disabled = true;
    try { await neblla.rooms.play({ config: { modo: 'duelo' } }); }
    catch (e) { $('dueloEstado').textContent = e.code === 'login_required' ? T('search_login') : T('search_fail'); $('buscar').disabled = false; }
  };
  neblla.room.on('joined', ({ isLobby }) => {
    enDuelo = !isLobby;
    $('dueloFuera').hidden = enDuelo;
    $('dueloDentro').hidden = !enDuelo;
    $('buscar').disabled = false;
    if (enDuelo) { ir('vDuelo'); $('dueloEstado').textContent = ''; pintarDuelo(neblla.state.get()); }
  });
  neblla.room.on('userJoined', () => { if (enDuelo && !neblla.state.get()) $('turno').textContent = T('waiting_rival'); });

  let traido = false;
  async function traerMazo() {
    if (traido) return;
    traido = true;
    try {
      await neblla.tools.deck.bring('duelo', mazo);
      neblla.message.to('server', { type: 'traido' });
    } catch (e) {
      traido = e.code === 'already_brought';
      if (traido) neblla.message.to('server', { type: 'traido' });
      else avisar(T('deck_invalid', { code: e.code }));
    }
  }

  neblla.state.on(pintarDuelo);
  neblla.tools.on('event', (e) => { if (e.name === 'duelo' && (e.op === 'dealt' || e.op === 'play')) pintarMano(); });
  neblla.message.on(({ from, data }) => { if (from === 'server' && data?.type === 'rechazado') avisar(T('referee_rejected')); });

  const nombreDe = (id) => neblla.room.users.find(u => u.id === id)?.publicInfo?.name || T('opponent');
  let ultimo = null;
  async function pintarDuelo(s) {
    if (!enDuelo || !s || !s.jugadores) return;
    ultimo = s;
    const yo = neblla.room.me?.id, rival = s.jugadores.find(j => j !== yo);
    $('yoNombre').textContent = T('you'); $('rivalNombre').textContent = nombreDe(rival);
    $('yoPuntos').textContent = s.puntos[yo] || 0; $('rivalPuntos').textContent = s.puntos[rival] || 0;
    $('ronda').textContent = s.fase === 'fin' ? T('end_label') : T('round', { n: s.ronda });
    if (s.fase === 'mazos' && s.creada && !s.listos.includes(yo)) traerMazo();
    const mesa = $('mesa');
    mesa.innerHTML = '';
    const ultima = s.historial[s.historial.length - 1];
    const enMesa = s.mesa.ataque ? [s.mesa.ataque, s.mesa.defensa] : (ultima ? [ultima.ataque, ultima.defensa] : [null, null]);
    enMesa.forEach((c, i) => {
      if (i === 1) mesa.append(el('span', 'vs', esc(T('vs'))));
      mesa.append(c ? carta(c) : el('div', 'hueco', esc(i === 0 ? T('slot_attack') : T('slot_answer'))));
    });
    $('historial').innerHTML = '';
    for (const h of s.historial) {
      const v = { a: nombre(h.ataque.criatura), av: h.ataque.valor, d: nombre(h.defensa.criatura), dv: h.defensa.valor, who: h.gana && h.gana !== yo ? iso(nombreDe(h.gana)) : '' };
      $('historial').append(el('li', '', esc(T(!h.gana ? 'hist_tie' : h.gana === yo ? 'hist_you' : 'hist_them', v))));
    }
    $('turno').textContent = s.fase === 'mazos' ? T('shuffling')
      : s.fase === 'fin' ? (s.ganador === 'empate' ? T('draw') : s.ganador === yo ? (s.abandono ? T('won_abandon') : T('won')) : T('lost'))
      : s.turno === yo ? (s.mesa.ataque ? T('turn_respond') : T('turn_attack')) : T('turn_other', { name: iso(nombreDe(rival)) });
    $('salir').hidden = s.fase !== 'fin';
    if (s.fase === 'fin' && s.ganador) neblla.anticheat.confirm('ganador', s.ganador);
    await pintarMano();
    const cuentas = await neblla.tools.deck.counts('duelo').catch(() => null);
    if (cuentas && cuentas[rival]) $('rivalInfo').textContent = T('rival_info', { name: iso(nombreDe(rival)), hand: cuentas[rival].hand, pile: cuentas[rival].pile });
  }
  async function pintarMano() {
    if (!enDuelo || !ultimo || ultimo.fase === 'mazos') return;
    const r = await neblla.tools.deck.hand('duelo').catch(() => null);
    if (!r) return;
    const miTurno = ultimo.fase === 'juego' && ultimo.turno === neblla.room.me?.id;
    $('mano').innerHTML = '';
    for (const c of r.hand) {
      const k = carta(c);
      if (!miTurno) k.classList.add('apagada');
      else k.onclick = async () => {
        $('mano').querySelectorAll('.carta').forEach(x => x.classList.add('apagada'));
        try { await neblla.tools.deck.play('duelo', c.id); } catch (e) { avisar(T('play_fail', { code: e.code })); }
      };
      $('mano').append(k);
    }
  }
  $('salir').onclick = () => { traido = false; ultimo = null; neblla.room.leave(); };

  // ── Friends and trades ─────────────────────────────────────────────────
  let amigo = null, suya = null, mia = null;
  async function pintarAmigos() {
    if (!dentro()) { $('amigos').innerHTML = `<li>${esc(T('friends_login'))}</li>`; return; }
    await neblla.social.list().catch(() => {});
    $('amigos').innerHTML = '';
    if (!neblla.social.friends.length) $('amigos').innerHTML = `<li>${esc(T('friends_none'))}</li>`;
    for (const f of neblla.social.friends) {
      const li = el('li', '', `<span>${f.online ? '🟢' : '⚪'} ${esc(f.name)}</span>`);
      const b = el('button', 'btn peq', esc(T('view_collection')));
      b.onclick = () => verAmigo(f);
      li.append(b);
      $('amigos').append(li);
    }
    pintarOfertas();
  }
  async function verAmigo(f) {
    amigo = f; suya = null; mia = null;
    $('deAmigo').hidden = false;
    $('deAmigoTitulo').textContent = T('friend_collection', { name: iso(f.name) });
    $('deAmigoRejilla').innerHTML = `<p class="nota">${esc(T('loading'))}</p>`;
    let filas = [];
    try { filas = await neblla.db.loadOf(f, { table: 'coleccion', limit: 500 }); }
    catch (e) { $('deAmigoRejilla').innerHTML = `<p class="nota">${esc(e.code === 'not_friends' ? T('err_friend_perm') : T('err_view'))}</p>`; return; }
    const elegir = (cont, lista, fijar) => {
      cont.innerHTML = '';
      for (const fila of lista) {
        const k = carta(fila, { mini: true });
        k.onclick = () => { cont.querySelectorAll('.carta').forEach(x => x.classList.remove('elegida')); k.classList.add('elegida'); fijar(fila); $('proponer').disabled = !(suya && mia); };
        cont.append(k);
      }
    };
    const unaDeCada = (lista) => Object.values(Object.fromEntries(lista.map(x => [x.criatura, x])));
    elegir($('deAmigoRejilla'), unaDeCada(filas).sort((a, b) => b.fuerza - a.fuerza), (x) => { suya = x; });
    elegir($('miaRejilla'), unaDeCada(coleccion.filter(x => !mazo.includes(x.id))).sort((a, b) => a.fuerza - b.fuerza), (x) => { mia = x; });
  }
  $('proponer').onclick = async () => {
    try {
      await neblla.db.offer({ to: amigo, give: [{ table: 'coleccion', id: mia.id }], get: [{ table: 'coleccion', id: suya.id }] });
      avisar(T('offer_sent', { name: iso(amigo.name), mine: nombre(mia.criatura), theirs: nombre(suya.criatura) }));
      $('deAmigo').hidden = true;
      pintarOfertas();
    } catch (e) { avisar({ not_friends: T('err_not_friends'), not_owned: T('err_not_owned') }[e.code] || T('err_propose', { code: e.code })); }
  };
  async function pintarOfertas() {
    const lista = await neblla.db.offers().catch(() => []);
    $('ofertas').innerHTML = '';
    for (const o of lista) {
      const box = el('div', 'oferta');
      const quien = T('friend_generic');
      if (o.mine === 'received') {
        box.append(el('p', '', T('offer_from', { who: esc(quien) })));
        const fila = el('div', 'fila');
        for (const it of o.give) if (it.row) fila.append(carta(it.row, { mini: true }));
        const pide = o.get.map(it => coleccion.find(x => x.id === it.id)).filter(Boolean);
        if (pide.length) { fila.append(el('span', '', esc(T('offer_for')))); pide.forEach(x => fila.append(carta(x, { mini: true }))); }
        box.append(fila);
        const si = el('button', 'btn peq', esc(T('accept'))), no = el('button', 'btn peq sec', esc(T('decline')));
        si.onclick = async () => { try { await neblla.db.acceptOffer(o.id); avisar(T('trade_done')); await cargarColeccion(); } catch (e) { avisar(e.code === 'offer_changed' ? T('err_offer_changed') : T('err_trade')); } pintarOfertas(); };
        no.onclick = async () => { await neblla.db.declineOffer(o.id).catch(() => {}); pintarOfertas(); };
        box.append(si, ' ', no);
      } else {
        box.append(el('p', 'nota', esc(T('waiting_friend'))));
        const cancelar = el('button', 'btn peq sec', esc(T('withdraw')));
        cancelar.onclick = async () => { await neblla.db.cancelOffer(o.id).catch(() => {}); pintarOfertas(); };
        box.append(cancelar);
      }
      $('ofertas').append(box);
    }
  }
  neblla.db.on('offer', async ({ action }) => {
    if (action === 'new') avisar(T('offer_new'));
    if (action === 'done') { await cargarColeccion(); avisar(T('offer_done')); }
    if (!$('vAmigos').hidden) pintarOfertas();
  });

  // ── Shop ───────────────────────────────────────────────────────────────
  const texto = (v) => typeof v === 'string' ? v : (v?.[nebllaLang.lang] || v?.en || v?.es || Object.values(v || {})[0] || '');
  const precio = (p) => new Intl.NumberFormat(nebllaLang.lang, { style: 'currency', currency: (p.currency || 'eur').toUpperCase() }).format((p.price || 0) / 100);
  async function pintarTienda() {
    const productos = await neblla.shop.products().catch(() => []);
    const t = neblla.shop.testMode;   // known after products()
    $('pruebas').hidden = !t;
    if (t) $('pruebas').textContent = T('shop_test', { card: t.card });
    $('productos').innerHTML = '';
    if (!productos.length) $('productos').innerHTML = `<p class="nota">${esc(T('shop_soon'))}</p>`;
    for (const p of productos) {
      const box = el('div', 'producto', `<b>${esc(texto(p.name))}</b><span class="nota">${esc(texto(p.description))}</span><span class="precio">${esc(p.waiting ? T('coming_soon') : precio(p))}</span>`);
      const b = el('button', 'btn', esc(T('buy')));
      b.disabled = !!p.waiting;
      b.onclick = async () => {
        try { await neblla.shop.buy(p.productId); }
        catch (e) { avisar(e.code === 'popup_blocked' ? T('err_pay_popup') : e.code === 'login_required' ? T('err_pay_login') : T('err_pay')); }
      };
      box.append(b);
      $('productos').append(box);
    }
  }
  neblla.shop.on('purchase', async () => { avisar(T('purchased')); await pintarSobre(); });

  // ── Language: the chrome and the views painted by code follow nebllaLang ──
  function textosFijos() {
    document.title = `${T('app_name')} · ${T('subtitle')}`;
    const m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', T('meta_desc'));
    $('sobre').setAttribute('aria-label', T('pack_aria'));
  }
  textosFijos();
  nebllaLang.on(() => {
    textosFijos();
    pintarSobre();
    if (!$('vColeccion').hidden) pintarColeccion();
    if (!$('vAmigos').hidden) pintarAmigos();
    if (!$('vTienda').hidden) pintarTienda();
    if (enDuelo && ultimo) pintarDuelo(ultimo);
  });

  arrancar();
};
