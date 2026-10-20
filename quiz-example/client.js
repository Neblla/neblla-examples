// Preguntón — un concurso como Kahoot, hecho con Neblla.
//
// Cuatro papeles, uno por dispositivo:
//   · quien dirige (la profe): crea sus cuestionarios (neblla.db) y, en la
//     sala, es el master: tiene los mandos y las respuestas buenas;
//   · la pantalla (la tele): el board de la sala, enseña la pregunta y el ranking;
//   · cada jugador: entra con el enlace o el código, sin cuenta, y contesta;
//   · server/room.js: lleva la partida (la pregunta, el reloj, los puntos).
//
// Las respuestas van en sobres (neblla.tools.envelope): nadie las ve antes
// de que se cierre la pregunta, tampoco el móvil que hace de servidor. La
// buena solo la tiene el móvil de la profe, que la manda al cerrarse.

const DEMO = {
  id: 'demo',
  title: 'Capitales y curiosidades',
  questions: [
    { text: '¿Cuál es la capital de Australia?', options: ['Sídney', 'Canberra', 'Melbourne', 'Perth'], right: 1, seconds: 20 },
    { text: '¿Cuántas patas tiene una araña?', options: ['6', '8', '10'], right: 1, seconds: 15 },
    { text: '¿Qué planeta es el más grande del sistema solar?', options: ['Saturno', 'Neptuno', 'Júpiter', 'La Tierra'], right: 2, seconds: 20 },
    { text: 'El agua hierve a 100 °C a nivel del mar.', options: ['Verdadero', 'Falso'], right: 0, seconds: 10 },
    { text: '¿En qué continente está Marruecos?', options: ['Asia', 'Europa', 'África', 'América'], right: 2, seconds: 15 },
  ],
};
const SHAPES = ['▲', '◆', '●', '■'];
const SECONDS = [10, 15, 20, 30, 45, 60];

window.onNeblla = (neblla) => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmtS = (ms) => (ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
  const fmtN = (n) => Number(n || 0).toLocaleString('es-ES');
  const ordinal = (i) => (i + 1) + '.º';
  let toastTimer = null;
  const toast = (text) => {
    const t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  };

  let isLobby = true;
  let editing = null;          // el cuestionario abierto en el editor
  let view = 'home';           // home | editor (solo fuera de una sala)
  let sentRight = -1;          // la última pregunta cuya buena ya mandó la profe
  let tick = null;

  const data = () => neblla.db.data || {};
  const quizzes = () => Array.isArray(data().quizzes) ? data().quizzes : [];
  const live = () => data().live || null;
  const me = () => neblla.room.me || {};
  const isPlayer = (u) => !!u && !u.isBoard && !u.isMaster && !!(u.publicInfo && u.publicInfo.name);
  const players = () => neblla.room.users.filter(isPlayer);
  const quizOfLive = () => { const l = live(); if (!l) return null; return l.quizId === 'demo' ? DEMO : quizzes().find(q => q.id === l.quizId) || null; };

  // ── Qué se ve en este dispositivo ─────────────────────────────────
  function show() {
    $('connecting').hidden = true;
    const m = me();
    let v;
    if (isLobby) v = view === 'editor' ? 'vEditor' : 'vHome';
    else if (m.isMaster) v = 'vMaster';
    else if (m.isBoard) v = 'vBoard';
    else if (m.publicInfo && m.publicInfo.name) v = 'vPlayer';
    else v = 'vJoin';
    for (const id of ['vHome', 'vEditor', 'vJoin', 'vMaster', 'vBoard', 'vPlayer']) $(id).hidden = id !== v;
    document.body.dataset.view = v;
    renderAuth();
    if (v === 'vHome') renderHome();
    if (v === 'vJoin') renderJoin();
    if (v === 'vMaster') renderMaster();
    if (v === 'vBoard') renderBoard();
    if (v === 'vPlayer') renderPlayer();
    clearInterval(tick);
    const s = neblla.state.get();
    if (s && s.phase === 'question' && (v === 'vBoard' || v === 'vMaster')) tick = setInterval(renderClock, 200);
  }

  function renderAuth() {
    const inRoom = !isLobby;
    const logged = !!neblla.auth.me.loggedIn;
    $('loginBtn').hidden = logged || inRoom;
    $('logoutBtn').hidden = !logged || inRoom;
    const name = neblla.auth.me.publicInfo && neblla.auth.me.publicInfo.name;
    $('whoChip').hidden = !logged || inRoom;
    $('whoChip').textContent = name || 'Tu cuenta';
  }

  // ── Portada y lista de cuestionarios ──────────────────────────────
  function renderHome() {
    const logged = !!neblla.auth.me.loggedIn;
    $('homeGuest').hidden = logged;
    $('homeTeacher').hidden = !logged;
    if (!logged) return;
    const list = $('quizList');
    list.innerHTML = '';
    const qs = quizzes();
    $('quizEmpty').hidden = qs.length > 0;
    for (const q of qs) {
      const card = el('div', 'card quiz');
      const info = el('div', 'quiz-info');
      info.append(el('h2', null, q.title), el('p', 'muted small', q.questions.length + (q.questions.length === 1 ? ' pregunta' : ' preguntas')));
      const actions = el('div', 'row');
      const play = el('button', 'btn', 'Jugar'); play.type = 'button'; play.onclick = () => play_(q);
      const edit = el('button', 'btn btn-ghost', 'Editar'); edit.type = 'button'; edit.onclick = () => openEditor(q);
      const del = el('button', 'btn btn-ghost btn-danger', 'Borrar'); del.type = 'button';
      del.onclick = () => { if (confirm('¿Borrar «' + q.title + '»?')) saveQuizzes(quizzes().filter(x => x.id !== q.id)); };
      actions.append(play, edit, del);
      card.append(info, actions);
      list.appendChild(card);
    }
  }

  function saveQuizzes(list) {
    neblla.db.save({ quizzes: list }, { now: true }).catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));
    renderHome();
  }

  $('loginBtn').onclick = $('loginBig').onclick = () => neblla.auth.login().catch(() => toast('No se pudo entrar. Prueba otra vez.'));
  $('logoutBtn').onclick = () => neblla.auth.logout();
  neblla.auth.on('login', () => show());
  neblla.auth.on('logout', () => { view = 'home'; show(); });
  neblla.auth.on('error', (e) => { if (e.code === 'popup_blocked') toast('El navegador bloqueó la ventana para entrar: permite las ventanas emergentes.'); });
  neblla.db.on('merged', () => { if (isLobby && view === 'home') renderHome(); });

  $('newQuizBtn').onclick = $('firstQuizBtn').onclick = () => openEditor(null);
  $('copyDemoBtn').onclick = () => saveQuizzes([...quizzes(), { ...JSON.parse(JSON.stringify(DEMO)), id: newId() }]);
  $('demoBtn').onclick = () => play_(DEMO);
  const joinCode = (input) => (e) => {
    e.preventDefault();
    const code = $(input).value.trim().toUpperCase();
    if (code) neblla.rooms.join(code);
  };
  $('codeForm').onsubmit = joinCode('codeInput');
  $('joinSmall').onsubmit = joinCode('codeInput2');
  neblla.rooms.on('joinError', (e) => {
    toast(e.code === 'room_full' ? 'La sala está llena.' : 'No hay ninguna sala con ese código. Revísalo.');
    if (live() && e.room === live().room) neblla.db.save({ live: null });
  });

  const newId = () => Math.random().toString(36).slice(2, 10);

  // ── El editor ─────────────────────────────────────────────────────
  function openEditor(q) {
    editing = q ? JSON.parse(JSON.stringify(q)) : { id: null, title: '', questions: [{ text: '', options: ['', '', '', ''], right: 0, seconds: 20 }] };
    $('editorTitle').textContent = q ? 'Editar cuestionario' : 'Nuevo cuestionario';
    $('quizTitle').value = editing.title;
    $('editorError').hidden = true;
    renderQuestions();
    view = 'editor';
    show();
    window.scrollTo(0, 0);
  }

  function readEditor() {
    editing.title = $('quizTitle').value;
    [...$('questions').children].forEach((box, i) => {
      const q = editing.questions[i];
      q.text = box.querySelector('textarea').value;
      q.options = [...box.querySelectorAll('.opt input[type=text]')].map(x => x.value);
      const r = box.querySelector('.opt input[type=radio]:checked');
      q.right = r ? Number(r.value) : 0;
      q.seconds = Number(box.querySelector('select').value);
    });
  }

  function renderQuestions() {
    const box = $('questions');
    box.innerHTML = '';
    editing.questions.forEach((q, i) => {
      const card = el('div', 'card question');
      const head = el('div', 'q-head');
      head.append(el('b', null, 'Pregunta ' + (i + 1)));
      const sec = el('select', 'input input-small');
      for (const s of SECONDS) { const o = el('option', null, s + ' s'); o.value = s; if (s === q.seconds) o.selected = true; sec.appendChild(o); }
      sec.title = 'Tiempo para contestar';
      const del = el('button', 'link', 'Quitar'); del.type = 'button';
      del.onclick = () => { readEditor(); editing.questions.splice(i, 1); renderQuestions(); };
      del.hidden = editing.questions.length === 1;
      head.append(sec, del);
      const text = el('textarea', 'input'); text.rows = 2; text.maxLength = 160; text.placeholder = '¿Cuál es la capital de Australia?'; text.value = q.text;
      const opts = el('div', 'opts');
      for (let k = 0; k < 4; k++) {
        const row = el('label', 'opt c' + k);
        const radio = el('input'); radio.type = 'radio'; radio.name = 'right' + i; radio.value = k; radio.checked = q.right === k; radio.title = 'La buena';
        const shape = el('span', 'shape', SHAPES[k]);
        const input = el('input', 'input'); input.type = 'text'; input.maxLength = 60; input.value = q.options[k] || '';
        input.placeholder = k < 2 ? 'Respuesta ' + (k + 1) : 'Respuesta ' + (k + 1) + ' (opcional)';
        row.append(radio, shape, input);
        opts.appendChild(row);
      }
      card.append(head, text, opts, el('p', 'muted small', 'Marca la respuesta buena. Entre 2 y 4 respuestas.'));
      box.appendChild(card);
    });
  }

  $('addQuestion').onclick = () => {
    readEditor();
    if (editing.questions.length >= 30) return toast('Como mucho, 30 preguntas.');
    editing.questions.push({ text: '', options: ['', '', '', ''], right: 0, seconds: 20 });
    renderQuestions();
    $('questions').lastChild.querySelector('textarea').focus();
  };
  $('cancelEdit').onclick = () => { view = 'home'; show(); };

  /** El cuestionario tal cual se guarda: sin respuestas vacías, la buena reindexada. */
  function clean(q) {
    const title = q.title.trim();
    if (!title) return { error: 'Ponle un título.' };
    const questions = [];
    for (const [i, x] of q.questions.entries()) {
      const text = x.text.trim();
      const kept = x.options.map((o, k) => ({ o: o.trim(), k })).filter(a => a.o);
      if (!text) return { error: 'A la pregunta ' + (i + 1) + ' le falta el texto.' };
      if (kept.length < 2) return { error: 'La pregunta ' + (i + 1) + ' necesita al menos dos respuestas.' };
      const right = kept.findIndex(a => a.k === x.right);
      if (right < 0) return { error: 'En la pregunta ' + (i + 1) + ', la respuesta marcada como buena está vacía.' };
      questions.push({ text, options: kept.map(a => a.o), right, seconds: x.seconds });
    }
    return { quiz: { id: q.id || newId(), title, questions, updatedAt: Date.now() } };
  }

  $('editorForm').onsubmit = (e) => {
    e.preventDefault();
    readEditor();
    const { quiz, error } = clean(editing);
    if (error) { $('editorError').textContent = error; $('editorError').hidden = false; return; }
    const list = quizzes().filter(x => x.id !== quiz.id);
    const at = quizzes().findIndex(x => x.id === quiz.id);
    if (at >= 0) list.splice(at, 0, quiz); else list.push(quiz);
    view = 'home';
    saveQuizzes(list);
    show();
    toast('Guardado');
  };

  // ── Jugar: reservar la sala y quedarse los mandos ─────────────────
  async function play_(quiz) {
    try {
      const pass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const code = await neblla.rooms.book({ config: { title: quiz.title }, masterPassword: pass });
      // Lo que hace falta para volver a la sala si este móvil se recarga.
      await neblla.db.save({ live: { room: code, pass, quizId: quiz.id } }, { now: true }).catch(() => {});
      await neblla.rooms.join(code);
    } catch (e) {
      toast('No se pudo abrir la sala: ' + (e.code || e.message));
    }
  }

  /** En la sala que reservó: con la contraseña, el master es suyo. */
  async function claimIfMine() {
    const l = live();
    if (isLobby || !l || l.room !== neblla.room.name || me().isMaster) return;
    try { await neblla.room.claimMaster(l.pass); } catch (e) { console.warn('claimMaster', e); }
  }

  // ── En la sala ────────────────────────────────────────────────────
  neblla.room.on('joined', (e) => {
    isLobby = e.isLobby;
    if (isLobby) sentRight = -1;
    show();
    claimIfMine();
  });
  for (const ev of ['userJoined', 'userLeft', 'publicInfo', 'presenter', 'master', 'board', 'started']) neblla.room.on(ev, show);
  neblla.state.on(() => show());
  // La buena, solo cuando ya se han abierto todos los sobres: así nadie la ve antes.
  neblla.state.on((s) => {
    if (!me().isMaster || !s || s.phase !== 'closed' || sentRight === s.n) return;
    const quiz = quizOfLive();
    const q = quiz && quiz.questions[s.n];
    if (!q) return;
    sentRight = s.n;
    neblla.message.to('server', { type: 'right', n: s.n, right: q.right });
  }, { final: true });

  $('nameForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('nameInput').value.trim().slice(0, 24);
    if (!name) return;
    neblla.db.setPublicInfo({ ...(neblla.auth.me.publicInfo || {}), name });
  };
  $('leaveBtn').onclick = () => neblla.room.leave();

  function renderJoin() {
    $('joinCode').textContent = neblla.room.name;
    const prev = neblla.auth.me.publicInfo && neblla.auth.me.publicInfo.name;
    if (prev && !$('nameInput').value) $('nameInput').value = prev;
  }

  // ── Los mandos de quien dirige ────────────────────────────────────
  const link = () => neblla.rooms.link(neblla.room.name);
  $('shareBtn').onclick = async () => {
    const url = link();
    const text = 'Entra al concurso con el código ' + neblla.room.name;
    if (navigator.share) { try { await navigator.share({ title: 'Preguntón', text, url }); } catch {} return; }
    copy(url);
  };
  $('copyBtn').onclick = () => copy(link());
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Enlace copiado'), () => toast(text));
  }

  function renderDevices(list) {
    list.innerHTML = '';
    const others = neblla.room.users.filter(u => !u.isMe);
    if (!others.length) list.appendChild(el('li', 'muted small', 'Aún no hay nadie más.'));
    for (const u of others) {
      const li = el('li', 'device' + (u.isBoard ? ' on' : ''));
      const name = u.publicInfo && u.publicInfo.name;
      li.append(el('span', 'device-icon', u.isBoard ? '📺' : name ? '📱' : '🖥️'), el('span', 'device-name', u.isBoard ? 'Pantalla' + (name ? ' (' + name + ')' : '') : name || 'Dispositivo sin nombre'));
      const b = el('button', 'btn btn-small' + (u.isBoard ? ' btn-ghost' : ''), u.isBoard ? 'Quitar' : 'Usar como pantalla');
      b.type = 'button';
      b.onclick = () => neblla.room.setBoard(u.isBoard ? null : u.id).catch(e => toast('No se pudo: ' + (e.code || e.message)));
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  function renderNames(box, list) {
    box.innerHTML = '';
    for (const u of list) box.appendChild(el('span', 'name-chip', u.publicInfo.name));
  }

  function renderMaster() {
    const s = neblla.state.get();
    const running = neblla.room.phase === 'running' && s;
    $('mLobby').hidden = !!running;
    $('mGame').hidden = !running;
    if (!running) {
      $('mCode').textContent = neblla.room.name;
      $('mLink').textContent = link();
      $('mQr').src = neblla.rooms.qr(neblla.room.name, { size: 300 });
      renderDevices($('mDevices'));
      const ps = players();
      $('mCount').textContent = ps.length;
      renderNames($('mPlayers'), ps);
      if (!ps.length) $('mPlayers').appendChild(el('span', 'muted small', 'Cuando alguien entre con el enlace o el código, sale aquí.'));
      $('startBtn').disabled = !ps.length;
      return;
    }
    renderDevices($('mDevices2'));
    const quiz = quizOfLive();
    const total = quiz ? quiz.questions.length : s.total;
    const q = quiz && quiz.questions[s.n];
    const action = $('mAction');
    action.hidden = false;
    action.disabled = false;
    $('mOptions').innerHTML = '';
    $('mInfo').textContent = '';
    $('mStep').textContent = s.n >= 0 ? 'Pregunta ' + (s.n + 1) + ' de ' + total : (quiz ? quiz.title : '');
    $('mQuestion').textContent = s.phase === 'ready' ? 'Preparados…' : s.phase === 'end' ? '¡Fin del concurso!' : (q ? q.text : (s.q && s.q.text) || '');
    if (q && ['question', 'closing', 'closed', 'reveal', 'ranking'].includes(s.phase)) {
      q.options.forEach((o, i) => {
        const li = el('li', 'c' + i + (i === q.right ? ' right' : ''));
        li.append(el('span', 'shape', SHAPES[i]), el('span', null, o));
        if (s.counts) li.append(el('b', 'count', s.counts[i]));
        $('mOptions').appendChild(li);
      });
    }
    if (s.phase === 'ready') { action.textContent = 'Primera pregunta'; action.onclick = () => ask(0); if (quiz) ask(0); }
    else if (s.phase === 'question') { action.textContent = 'Cerrar ya'; action.onclick = () => neblla.message.to('server', { type: 'close' }); renderClock(); }
    else if (s.phase === 'closing' || s.phase === 'closed') { action.textContent = 'Corrigiendo…'; action.disabled = true; }
    else if (s.phase === 'reveal') { action.textContent = 'Ver el ranking'; action.onclick = () => neblla.message.to('server', { type: 'ranking' }); }
    else if (s.phase === 'ranking') {
      const last = s.n + 1 >= total;
      action.textContent = last ? 'Ver el podio' : 'Siguiente pregunta';
      action.onclick = () => last ? neblla.message.to('server', { type: 'end' }) : ask(s.n + 1);
    } else if (s.phase === 'end') { action.textContent = 'Terminar'; action.onclick = finish; }
    if (!quiz) { $('mInfo').textContent = 'Este móvil no tiene el cuestionario de esta sala.'; action.hidden = true; }
  }

  let asked = -1;
  function ask(n) {
    const quiz = quizOfLive();
    const q = quiz && quiz.questions[n];
    if (!q || asked === n) return;
    asked = n;
    // La buena no viaja: solo el texto, las respuestas y el tiempo.
    neblla.message.to('server', { type: 'ask', n, total: quiz.questions.length, title: quiz.title, text: q.text, options: q.options, seconds: q.seconds });
  }

  async function finish() {
    await neblla.db.save({ live: null }).catch(() => {});
    asked = -1;
    neblla.room.leave();
  }

  $('startBtn').onclick = () => { $('startBtn').disabled = true; neblla.message.to('server', { type: 'start' }); };

  function renderClock() {
    const s = neblla.state.get();
    if (!s || s.phase !== 'question') return;
    const left = Math.max(0, Math.ceil((s.endsAt - neblla.room.now()) / 1000));
    $('bClock').textContent = left;
    const n = players().length;
    const txt = s.answered.length + ' de ' + n + (n === 1 ? ' ha contestado' : ' han contestado');
    $('bAnswered').textContent = txt;
    if (!$('vMaster').hidden) $('mInfo').textContent = left + ' s · ' + txt;
  }

  // ── La pantalla ───────────────────────────────────────────────────
  const ranked = (s) => Object.entries(s.players || {}).map(([id, p]) => ({ id, ...p, last: (s.last || {})[id] })).sort((a, b) => b.points - a.points);

  function renderBoard() {
    const s = neblla.state.get();
    const running = neblla.room.phase === 'running' && s && s.phase !== 'ready';
    $('bLobby').hidden = !!running;
    $('bGame').hidden = !running;
    if (!running) {
      $('bCode').textContent = neblla.room.name;
      $('bLink').textContent = link().replace(/^https?:\/\//, '');
      $('bQr').src = neblla.rooms.qr(neblla.room.name, { size: 520 });
      $('bTitle').textContent = (neblla.room.config && neblla.room.config.title) || '';
      const ps = players();
      renderNames($('bPlayers'), ps);
      $('bWaiting').textContent = ps.length ? ps.length + (ps.length === 1 ? ' jugador' : ' jugadores') + ' · empezamos enseguida' : 'Esperando jugadores…';
      return;
    }
    $('bStep').textContent = s.n >= 0 ? 'Pregunta ' + (s.n + 1) + ' de ' + s.total : '';
    const opts = $('bOptions'), rank = $('bRanking'), podium = $('bPodium');
    opts.hidden = !['question', 'closing', 'closed', 'reveal'].includes(s.phase);
    rank.hidden = s.phase !== 'ranking';
    podium.hidden = s.phase !== 'end';
    $('bClock').hidden = s.phase !== 'question';
    $('bAnswered').hidden = s.phase !== 'question';
    $('bQuestion').textContent = s.phase === 'ranking' ? 'Ranking' : s.phase === 'end' ? '¡Enhorabuena!' : s.q.text;
    if (!opts.hidden) {
      opts.innerHTML = '';
      const max = Math.max(1, ...(s.counts || [0]));
      s.q.options.forEach((o, i) => {
        const li = el('li', 'tile c' + i + (s.phase === 'reveal' ? (i === s.right ? ' right' : ' wrong') : ''));
        li.append(el('span', 'shape', SHAPES[i]), el('span', 'tile-text', o));
        if (s.phase === 'reveal') {
          const bar = el('span', 'tile-bar'); bar.style.setProperty('--w', (100 * s.counts[i] / max) + '%');
          li.append(bar, el('b', 'tile-count', s.counts[i] + (i === s.right ? ' ✓' : '')));
        }
        opts.appendChild(li);
      });
      if (s.phase === 'question') renderClock();
    }
    if (!rank.hidden) {
      rank.innerHTML = '';
      ranked(s).slice(0, 8).forEach((p, i) => {
        const li = el('li', 'rank-row');
        const l = p.last;
        li.append(el('span', 'rank-pos', ordinal(i)), el('span', 'rank-name', p.name), el('span', 'rank-last', l && l.ok ? '+' + fmtN(l.gained) + ' · ' + fmtS(l.ms) : l && l.ms != null ? 'falló · ' + fmtS(l.ms) : 'sin contestar'), el('b', 'rank-points', fmtN(p.points)));
        rank.appendChild(li);
      });
    }
    if (!podium.hidden) {
      podium.innerHTML = '';
      const top = ranked(s).slice(0, 3);
      [1, 0, 2].forEach(i => {
        const p = top[i];
        if (!p) return;
        const col = el('div', 'step s' + (i + 1));
        col.append(el('span', 'step-name', p.name), el('span', 'step-points', fmtN(p.points) + ' pts'), el('span', 'step-block', ordinal(i)));
        podium.appendChild(col);
      });
    }
  }

  // ── Un jugador ────────────────────────────────────────────────────
  let answeredN = -1;
  function renderPlayer() {
    const s = neblla.state.get();
    const m = me();
    $('pName').textContent = m.publicInfo.name;
    const p = s && s.players && s.players[m.id];
    $('pScore').textContent = p ? fmtN(p.points) + ' pts' : '';
    $('pScore').hidden = !p;
    const asking = s && s.phase === 'question' && answeredN !== s.n;
    $('pAsk').hidden = !asking;
    $('pWait').hidden = asking;
    if (asking) {
      $('pQuestion').textContent = s.q.text;
      const pad = $('pButtons');
      if (pad.dataset.n !== String(s.n)) {
        pad.dataset.n = s.n;
        pad.innerHTML = '';
        pad.className = 'pad n' + s.q.options.length;
        s.q.options.forEach((o, i) => {
          const b = el('button', 'pad-btn c' + i); b.type = 'button';
          b.append(el('span', 'shape', SHAPES[i]), el('span', null, o));
          b.onclick = () => answer(s.n, i);
          pad.appendChild(b);
        });
      }
      return;
    }
    const [big, sub] = waitTexts(s, m, p);
    $('pWaitText').textContent = big;
    $('pWaitSub').textContent = sub;
    $('pWait').className = 'center ' + (s && s.phase === 'reveal' ? (s.last && s.last[m.id] && s.last[m.id].ok ? 'ok' : 'ko') : '');
  }

  function waitTexts(s, m, p) {
    if (!s || neblla.room.phase !== 'running' || s.phase === 'ready') return ['¡Ya estás dentro!', 'Mira la pantalla: el concurso empieza enseguida.'];
    if (s.phase === 'question' || s.phase === 'closing' || s.phase === 'closed') return answeredN === s.n ? ['Respuesta enviada', 'A ver si aciertas…'] : ['¡Tiempo!', 'Esta te la has perdido.'];
    const l = s.last && s.last[m.id];
    if (s.phase === 'reveal') {
      if (l && l.ok) return ['¡Correcto! +' + fmtN(l.gained), 'En ' + fmtS(l.ms) + '. ¡Muy rápido!'];
      if (l && l.ms != null) return ['¡Casi!', 'La buena era: ' + s.q.options[s.right]];
      return ['No contestaste', 'La buena era: ' + s.q.options[s.right]];
    }
    const pos = ranked(s).findIndex(x => x.id === m.id);
    if (s.phase === 'ranking') return pos >= 0 ? ['Vas ' + ordinal(pos), 'con ' + fmtN(p.points) + ' puntos'] : ['Ranking', 'Mira la pantalla.'];
    if (s.phase === 'end') return pos >= 0 ? ['Has quedado ' + ordinal(pos), fmtN(p.points) + ' puntos. ¡Gracias por jugar!'] : ['¡Fin!', 'Gracias por jugar.'];
    return ['', ''];
  }

  async function answer(n, option) {
    answeredN = n;
    renderPlayer();
    try {
      await neblla.tools.envelope.seal('r' + n, option);   // en un sobre: nadie lo lee hasta que se cierra
      neblla.message.to('server', { type: 'answered', n });
    } catch (e) {
      answeredN = -1;
      toast('No llegó tu respuesta: ' + (e.code || e.message));
      renderPlayer();
    }
  }

  neblla.app.on('error', (e) => { if (e.code === 'quota_exceeded') toast('El concurso no puede seguir hoy: se acabó la cuota de la app.'); });

  // ── Al abrir la página ────────────────────────────────────────────
  // Con ?room=<código> (el enlace o el QR), directo a la sala; si no, a la
  // sala que esta profe dejó a medias, si sigue abierta.
  isLobby = !neblla.room.name || neblla.room.name === 'lobby';
  show();
  if (isLobby) {
    const code = neblla.rooms.linked();
    if (code) neblla.rooms.join(code);
    else if (live()) neblla.rooms.join(live().room);
  } else claimIfMine();
};
