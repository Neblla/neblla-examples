// Bloques: un tablero de 8×8 y tres piezas cada vez. Una fila o una columna
// llena se borra y suma; la partida se acaba cuando ninguna pieza cabe.
//
// Dos modos:
//   - Reto de hoy: las mismas piezas para todos (la semilla diaria del
//     ranking «reto», runsPerDay: 1). Hace falta cuenta antes de empezar y el
//     intento se gasta al empezar.
//   - Partida libre: piezas al azar. Sin cuenta se juega igual (sin ranking);
//     con cuenta, la partida empieza en Neblla (ranking «libre») y la mejor
//     entra en el ranking.
// Neblla comprueba cada puntuación antes de que entre (límites del ranking).
// El progreso (récord, racha del reto y partidas) va en neblla.db.

window.onNeblla = (neblla) => {
  const N = 8;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
  const today = () => new Date().toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // ── Las piezas ───────────────────────────────────────────────────────────
  const BASE = [
    { cells: [[0, 0]], w: 3 },
    { cells: [[0, 0], [0, 1]], w: 4 },
    { cells: [[0, 0], [0, 1], [0, 2]], w: 4 },
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], w: 3 },
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], w: 2 },
    { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], w: 4 },
    { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], w: 1.5 },
    { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], w: 2 },
    { cells: [[0, 0], [1, 0], [1, 1]], w: 4 },
    { cells: [[0, 0], [1, 0], [2, 0], [2, 1]], w: 2.5, mirror: true },
    { cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], w: 2 },
    { cells: [[0, 0], [0, 1], [0, 2], [1, 1]], w: 2.5 },
    { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], w: 2, mirror: true },
  ];
  const norm = (cells) => {
    const r0 = Math.min(...cells.map((c) => c[0])), c0 = Math.min(...cells.map((c) => c[1]));
    return cells.map(([r, c]) => [r - r0, c - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  const rot = (cells) => norm(cells.map(([r, c]) => [c, -r]));
  const PIECES = [];
  for (const b of BASE) {
    const seen = new Set();
    const forms = [norm(b.cells)];
    if (b.mirror) forms.push(norm(b.cells.map(([r, c]) => [r, -c])));
    for (let f of forms) for (let i = 0; i < 4; i++) {
      const k = JSON.stringify(f);
      if (!seen.has(k)) { seen.add(k); PIECES.push({ cells: f, w: b.w }); }
      f = rot(f);
    }
    // Cada forma pesa lo mismo, gire como gire.
    const n = PIECES.length - seen.size;
    for (let i = n; i < PIECES.length; i++) PIECES[i].w = b.w / seen.size;
  }
  const TOTAL_W = PIECES.reduce((s, p) => s + p.w, 0);

  // Un generador con semilla (mulberry32): con la del reto, las mismas piezas para todos.
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function nextPiece(rng) {
    let x = rng() * TOTAL_W;
    for (const p of PIECES) { x -= p.w; if (x <= 0) return { cells: p.cells, color: 1 + Math.floor(rng() * 7) }; }
    return { cells: PIECES[0].cells, color: 1 };
  }

  // ── La partida ───────────────────────────────────────────────────────────
  let G = null;          // { mode, board, tray, rng, score, lines, run, startedAt, over }
  let boardEls = [];

  function fits(board, piece, r, c) {
    return piece.cells.every(([dr, dc]) => {
      const y = r + dr, x = c + dc;
      return y >= 0 && y < N && x >= 0 && x < N && !board[y][x];
    });
  }
  function fitsAnywhere(board, piece) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(board, piece, r, c)) return true;
    return false;
  }
  function refill() {
    G.tray = [nextPiece(G.rng), nextPiece(G.rng), nextPiece(G.rng)];
  }
  function points(lines) { return 80 * lines + 40 * lines * (lines - 1); }

  function place(i, r, c) {
    const piece = G.tray[i];
    if (!piece || !fits(G.board, piece, r, c)) return false;
    for (const [dr, dc] of piece.cells) G.board[r + dr][c + dc] = piece.color;
    G.tray[i] = null;
    let gained = piece.cells.length;
    const rows = [], cols = [];
    for (let y = 0; y < N; y++) if (G.board[y].every(Boolean)) rows.push(y);
    for (let x = 0; x < N; x++) if (G.board.every((row) => row[x])) cols.push(x);
    const cleared = [];
    for (const y of rows) for (let x = 0; x < N; x++) cleared.push([y, x]);
    for (const x of cols) for (let y = 0; y < N; y++) cleared.push([y, x]);
    for (const [y, x] of cleared) G.board[y][x] = 0;
    const n = rows.length + cols.length;
    if (n) { gained += points(n); G.lines += n; }
    G.score += gained;
    if (G.tray.every((p) => !p)) refill();
    renderBoard(cleared);
    renderTray();
    $('score').textContent = fmt(G.score);
    if (n) showCombo(n, points(n));
    if (!G.tray.some((p) => p && fitsAnywhere(G.board, p))) setTimeout(() => endGame(), n ? 600 : 250);
    return true;
  }
  function showCombo(n, pts) {
    const el = $('combo');
    el.textContent = (n > 1 ? `¡${n} líneas! ` : '') + '+' + fmt(pts);
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(showCombo.t);
    showCombo.t = setTimeout(() => el.classList.add('hidden'), 900);
  }

  // ── Pintar ───────────────────────────────────────────────────────────────
  function buildBoard() {
    const b = $('board');
    b.innerHTML = '';
    boardEls = [];
    for (let r = 0; r < N; r++) {
      boardEls.push([]);
      for (let c = 0; c < N; c++) {
        const d = document.createElement('div');
        d.className = 'cell';
        b.appendChild(d);
        boardEls[r].push(d);
      }
    }
  }
  function renderBoard(cleared = []) {
    const gone = new Set(cleared.map(([y, x]) => y * N + x));
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = G.board[r][c], el = boardEls[r][c];
      el.className = 'cell' + (v ? ` full c${v}` : '') + (gone.has(r * N + c) ? ' clear c' + (1 + ((r + c) % 7)) : '');
    }
  }
  function pieceHtml(piece) {
    const h = Math.max(...piece.cells.map((c) => c[0])) + 1, w = Math.max(...piece.cells.map((c) => c[1])) + 1;
    const on = new Set(piece.cells.map(([r, c]) => r * 10 + c));
    let s = '';
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) s += `<div class="blk ${on.has(r * 10 + c) ? 'c' + piece.color : 'hole'}"></div>`;
    return { html: s, w, h };
  }
  function renderTray() {
    const t = $('tray');
    t.innerHTML = '';
    G.tray.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.i = i;
      if (p) {
        const { html, w } = pieceHtml(p);
        slot.innerHTML = `<div class="piece" style="grid-template-columns:repeat(${w},auto)">${html}</div>`;
        if (!fitsAnywhere(G.board, p)) slot.classList.add('cant');
        slot.addEventListener('pointerdown', (e) => startDrag(e, i));
      }
      t.appendChild(slot);
    });
  }

  // ── Arrastrar una pieza ──────────────────────────────────────────────────
  let drag = null;
  function metrics() {
    const a = boardEls[0][0].getBoundingClientRect(), b = boardEls[0][1].getBoundingClientRect();
    return { x0: a.left, y0: a.top, step: b.left - a.left, size: a.width };
  }
  function startDrag(e, i) {
    if (!G || G.over || !G.tray[i]) return;
    e.preventDefault();
    const p = G.tray[i];
    const { html, w, h } = pieceHtml(p);
    const ghost = $('ghost');
    ghost.innerHTML = html;
    ghost.style.gridTemplateColumns = `repeat(${w}, auto)`;
    ghost.classList.remove('hidden');
    const m = metrics();
    // Con el dedo, la pieza va por encima para que se vea dónde cae.
    const lift = e.pointerType === 'touch' ? m.step * (h / 2 + 1.6) : 0;
    drag = { i, p, w, h, m, lift, at: null };
    e.currentTarget.style.visibility = 'hidden';
    drag.slot = e.currentTarget;
    moveDrag(e);
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }
  function moveDrag(e) {
    if (!drag) return;
    const { m, w, h, lift } = drag;
    const left = e.clientX - (w * m.step) / 2, top = e.clientY - lift - (h * m.step) / 2;
    $('ghost').style.transform = `translate(${left}px, ${top}px)`;
    const c = Math.round((left - m.x0) / m.step), r = Math.round((top - m.y0) / m.step);
    drag.at = [r, c];
    preview(r, c);
  }
  function preview(r, c) {
    for (const row of boardEls) for (const el of row) el.classList.remove('ok', 'bad');
    if (!drag) return;
    const ok = fits(G.board, drag.p, r, c);
    if (!ok) return;
    for (const [dr, dc] of drag.p.cells) boardEls[r + dr][c + dc].classList.add('ok');
  }
  function endDrag() {
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (!drag) return;
    const d = drag;
    drag = null;
    preview();
    $('ghost').classList.add('hidden');
    d.slot.style.visibility = '';
    if (d.at) place(d.i, d.at[0], d.at[1]);
  }

  // ── Pantallas ────────────────────────────────────────────────────────────
  function show(id) {
    for (const s of ['home', 'game', 'end']) $(s).classList.toggle('hidden', s !== id);
  }
  const me = () => neblla.auth.me || {};
  const data = () => neblla.db.data || {};
  let rankBoard = 'reto';
  let retoToday = null;   // tu puntuación de hoy en el reto, o null

  async function renderHome() {
    show('home');
    const d = data();
    $('stats').innerHTML = [
      ['Récord', fmt(d.record || 0)],
      ['Racha', (d.lastReto === today() || d.lastReto === yesterday()) ? `${d.streak || 0} ${d.streak === 1 ? 'día' : 'días'}` : '0 días'],
      ['Partidas', fmt(d.played || 0)],
    ].map(([k, v]) => `<div class="stat"><b>${esc(v)}</b><span>${k}</span></div>`).join('');
    renderWho();
    const logged = me().loggedIn;
    $('nameBox').classList.toggle('hidden', !logged || !!me().publicInfo?.name);
    $('libreSub').textContent = logged ? 'Piezas al azar. La mejor entra en el ranking.' : 'Piezas al azar. Sin cuenta, sin ranking: entra para competir.';
    retoToday = null;
    if (logged) {
      try { const m = await neblla.scores.mine('reto'); retoToday = m && m.dayBest !== null && m.dayBest !== undefined ? m.dayBest : null; } catch (_) { /* sin red: se verá al jugar */ }
    }
    const btn = $('btnReto');
    if (!logged) { $('retoSub').textContent = 'Entra para jugar el reto: las mismas piezas para todos, un intento al día.'; btn.disabled = false; }
    else if (retoToday !== null) { $('retoSub').textContent = `Ya lo has jugado hoy: ${fmt(retoToday)} puntos. Vuelve mañana.`; btn.disabled = true; }
    else { $('retoSub').textContent = 'Las mismas piezas para todos. Un solo intento: se gasta al empezar.'; btn.disabled = false; }
    $('homeHint').textContent = logged ? '' : 'Puedes jugar sin cuenta. Con cuenta guardas tu progreso en todos tus dispositivos y entras en el ranking.';
    loadRanking();
  }
  function renderWho() {
    const m = me();
    $('who').innerHTML = m.loggedIn
      ? `<span>${esc(m.publicInfo?.name || 'Tu cuenta')}</span><button id="btnOut">Salir</button>`
      : `<button id="btnIn" class="primary">Entrar</button>`;
    if (m.loggedIn) $('btnOut').onclick = () => neblla.auth.logout();
    else $('btnIn').onclick = login;
  }
  async function login() {
    try { await neblla.auth.login({ scopes: ['friends'] }); } catch (_) { /* cerró la ventana */ }
  }
  async function loadRanking() {
    const ol = $('ranking');
    const board = rankBoard;
    try {
      const top = await neblla.scores.top(board, { period: 'day', limit: 10 });
      if (board !== rankBoard) return;
      ol.innerHTML = top.length
        ? top.map((x) => `<li class="${x.me ? 'me' : ''}"><span class="pos">${x.place}</span><span class="nm">${esc(x.info?.name || 'Jugador')}</span><span class="pts">${fmt(x.value)}</span></li>`).join('')
        : `<li class="muted">Nadie ha jugado aún hoy. ¡Sé el primero!</li>`;
    } catch (_) { ol.innerHTML = `<li class="muted">No se pudo cargar el ranking.</li>`; }
  }
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    rankBoard = b.dataset.board;
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    loadRanking();
  }));
  $('nameSave').onclick = async () => {
    const name = $('nameInput').value.trim().slice(0, 24);
    if (!name) return;
    neblla.db.setPublicInfo({ ...(me().publicInfo || {}), name });
    neblla.db.save({ name });
    $('nameBox').classList.add('hidden');
    renderWho();
  };

  async function startGame(mode) {
    let run = null, seed = (Math.random() * 4294967296) >>> 0;
    if (mode === 'reto') {
      if (!me().loggedIn) { await login(); if (!me().loggedIn) return; }
      try { run = await neblla.scores.start('reto'); seed = run.seed; }
      catch (e) {
        if (e && e.code === 'runs_per_day') { alert('Ya has jugado el reto de hoy. Vuelve mañana.'); renderHome(); return; }
        alert('No se pudo empezar el reto. Prueba otra vez.'); return;
      }
    } else if (me().loggedIn) {
      try { run = await neblla.scores.start('libre'); seed = run.seed; } catch (_) { run = null; }
    }
    G = { mode, board: Array.from({ length: N }, () => Array(N).fill(0)), rng: rngOf(seed), score: 0, lines: 0, run, over: false };
    refill();
    $('hudMode').textContent = mode === 'reto' ? `Reto de hoy · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : 'Partida libre';
    $('best').textContent = data().record ? `récord ${fmt(data().record)}` : '';
    $('score').textContent = '0';
    show('game');
    buildBoard();
    renderBoard();
    renderTray();
  }

  async function endGame() {
    if (!G || G.over) return;
    G.over = true;
    const g = G;
    show('end');
    $('endTitle').textContent = g.mode === 'reto' ? 'Reto de hoy terminado' : '¡Fin de la partida!';
    $('endScore').textContent = fmt(g.score);
    const lines = [];
    const add = (html) => lines.push(`<div class="end-line">${html}</div>`);
    // El progreso, en neblla.db (de invitado, en este dispositivo).
    const d = { ...data() };
    const record = g.score > (d.record || 0);
    d.record = Math.max(d.record || 0, g.score);
    d.played = (d.played || 0) + 1;
    if (g.mode === 'reto') {
      d.streak = d.lastReto === yesterday() ? (d.streak || 0) + 1 : d.lastReto === today() ? (d.streak || 1) : 1;
      d.lastReto = today();
    }
    neblla.db.save({ record: d.record, played: d.played, ...(g.mode === 'reto' ? { streak: d.streak, lastReto: d.lastReto } : {}) });
    if (record && g.score > 0) add('🎉 <b>¡Nuevo récord!</b>');
    if (g.mode === 'reto') add(`Racha: <b>${d.streak} ${d.streak === 1 ? 'día' : 'días'}</b> seguidos jugando el reto`);
    $('endLines').innerHTML = lines.join('') + (g.run ? '<div class="end-line muted">Comprobando tu puntuación…</div>' : '');
    if (!g.run) {
      if (!me().loggedIn) add('Entra con tu cuenta para que tus partidas cuenten en el ranking.');
      $('endLines').innerHTML = lines.join('');
      return;
    }
    const board = g.mode === 'reto' ? 'reto' : 'libre';
    try {
      const r = await neblla.scores.submit(g.run, g.score);
      if (!r.ok) add('Esta puntuación no ha entrado en el ranking.');
      else {
        const top = await neblla.scores.top(board, { period: 'day', limit: 100 });
        const mine = top.find((x) => x.me);
        if (mine) add(`Eres el <b>${mine.place}.º</b> de hoy`);
        if ((me().grantedScopes || []).includes('friends')) {
          const fr = await neblla.scores.top(board, { period: 'day', friends: true, limit: 100 }).catch(() => []);
          const f = fr.find((x) => x.me);
          if (f && fr.length > 1) add(`y el <b>${f.place}.º</b> entre tus amigos`);
        }
      }
    } catch (_) { add('No se pudo enviar la puntuación.'); }
    $('endLines').innerHTML = lines.join('');
  }

  $('btnReto').onclick = () => startGame('reto');
  $('btnLibre').onclick = () => startGame('libre');
  $('btnAgain').onclick = () => startGame('libre');
  $('btnHome').onclick = () => renderHome();
  $('btnQuit').onclick = () => {
    if (!G || G.over) return renderHome();
    const msg = G.mode === 'reto' ? '¿Terminar el reto? Tu intento de hoy cuenta con los puntos que llevas.' : '¿Terminar la partida?';
    if (confirm(msg)) endGame();
  };

  neblla.auth.on('login', () => renderHome());
  neblla.auth.on('logout', () => renderHome());
  renderHome();
  neblla.auth.login({ silent: true, scopes: ['friends'] }).catch(() => false);
};
