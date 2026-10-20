// server/room.js — la partida de Preguntón. Corre en el servidor de la sala
// (Fog: unos dispositivos de la sala, nunca la pantalla). Aquí se decide
// todo: qué pregunta toca, cuándo se cierra, quién acierta y cuántos puntos
// gana. Los clientes solo piden y pintan el estado.
//
// Puntos: acertar da 500, más hasta 500 según lo rápido (500 + 500 × el
// tiempo que quedaba / el tiempo de la pregunta). El tiempo de cada uno es
// la hora a la que Neblla recibió su sobre, no la que diga su móvil.

let s = neblla.state.get() || { phase: 'ready', n: -1, total: 0, title: '', q: null, startedAt: 0, endsAt: 0, answered: [], answers: null, counts: null, right: null, last: {}, players: {} };
let timer = null;

const put = (next) => { s = { ...s, ...next }; neblla.state.set(s); };
const isMaster = (id) => !!neblla.room.master && neblla.room.master.id === id;
const userOf = (id) => neblla.room.users.find(u => u.id === id);
const nameOf = (id) => { const u = userOf(id); return u && u.publicInfo && u.publicInfo.name; };
const playerIds = () => neblla.room.users.filter(u => !u.isBoard && !u.isMaster && u.publicInfo && u.publicInfo.name).map(u => u.id);
const text = (v, max) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

async function ask(d) {
  if (s.phase === 'question' || s.phase === 'closing' || s.phase === 'closed') return;
  const n = Number(d.n), seconds = Number(d.seconds);
  const q = text(d.text, 160);
  const options = Array.isArray(d.options) ? d.options.map(o => text(o, 60)).filter(Boolean).slice(0, 4) : [];
  if (!Number.isInteger(n) || n !== s.n + 1 || !q || options.length < 2 || !(seconds >= 5 && seconds <= 120)) return;
  // Un sobre por jugador: cada uno cierra el suyo en su móvil.
  await neblla.tools.envelope.create('r' + n, { mode: 'p2p', perUser: true, owner: 'seal', fog: 'open' });
  const now = neblla.room.now();
  put({ phase: 'question', n, total: Number(d.total) || n + 1, title: text(d.title, 80) || s.title, q: { text: q, options, seconds }, startedAt: now, endsAt: now + seconds * 1000, answered: [], answers: null, counts: null, right: null, last: {} });
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (s.phase === 'question') timer = setTimeout(close, Math.max(0, s.endsAt - neblla.room.now()));
}

async function close() {
  if (s.phase !== 'question') return;
  clearTimeout(timer);
  put({ phase: 'closing' });
  let answers = {};
  try { answers = await neblla.tools.envelope.open('r' + s.n) || {}; } catch (e) { answers = {}; }   // un sobre sin llave no cuenta
  put({ phase: 'closed', answers });
}

/** La profe manda la buena cuando ya están abiertos los sobres. */
function grade(right) {
  if (s.phase !== 'closed' || !Number.isInteger(right) || right < 0 || right >= s.q.options.length) return;
  const total = s.q.seconds * 1000;
  const counts = s.q.options.map(() => 0);
  const players = { ...s.players };
  const last = {};
  for (const id of playerIds()) if (!players[id]) players[id] = { name: nameOf(id), points: 0, right: 0 };
  for (const [id, a] of Object.entries(s.answers || {})) {
    const v = a && a.value;
    if (!Number.isInteger(v) || v < 0 || v >= counts.length) continue;
    counts[v]++;
    const ms = Math.max(0, Math.min(total, a.time - s.startedAt));
    const ok = v === right;
    const gained = ok ? Math.round(500 + 500 * (1 - ms / total)) : 0;
    const p = players[id] || { name: nameOf(id) || 'Alguien', points: 0, right: 0 };
    players[id] = { name: nameOf(id) || p.name, points: p.points + gained, right: p.right + (ok ? 1 : 0) };
    last[id] = { ok, ms, gained, option: v };
  }
  put({ phase: 'reveal', right, counts, last, players, answers: null });
}

neblla.message.on((m) => {
  if (m.to !== 'server' || !m.data) return;
  const d = m.data;
  if (d.type === 'answered') {
    if (s.phase !== 'question' || d.n !== s.n || s.answered.includes(m.from) || !playerIds().includes(m.from)) return;
    put({ answered: [...s.answered, m.from] });
    if (playerIds().every(id => s.answered.includes(id))) close();
    return;
  }
  if (!isMaster(m.from)) return;   // el resto, solo quien dirige
  if (d.type === 'ask') ask(d);
  else if (d.type === 'close') close();
  else if (d.type === 'right' && d.n === s.n) grade(d.right);
  else if (d.type === 'ranking' && s.phase === 'reveal') put({ phase: 'ranking' });
  else if (d.type === 'end' && (s.phase === 'ranking' || s.phase === 'reveal')) put({ phase: 'end' });
});

// Si los servidores de la sala cambian a mitad de una pregunta, el siguiente
// sigue con el reloj que había.
schedule();
neblla.state.set(s);
