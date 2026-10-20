// server/room.js — the referee of a duel. Two players, each with their own
// deck of 8 creatures from their collection.
//
// What Neblla keeps, not this file: each player's deck. They bring their
// cards themselves (tools.deck.bring): Neblla checks they are theirs, in a
// table only Neblla writes, and shuffles them into a pile nobody else sees,
// not even this file. This file only hears what is played (tools.on), and
// that is what it judges with.
//
// A round: one attacks with a card, the other answers with one. Strength,
// plus 3 if your element beats theirs (fire > plant > water > fire). The one
// with more wins the round; a tie, nobody. Whoever attacks changes each round.
// First to 4 rounds wins; if the cards run out, whoever has more.

const MAZO = 'duelo';
const CARTAS = 8, MANO = 3, GANAR = 4;
const GANA_A = { fuego: 'planta', planta: 'agua', agua: 'fuego' };

let s = neblla.state.get() || {
  fase: 'mazos',                         // mazos → juego → fin
  jugadores: neblla.room.users.slice(0, 2).map(u => u.id),
  listos: [],                            // who already brought their deck
  ataca: 0,                              // index in jugadores
  turno: null,                           // whose card is awaited
  mesa: { ataque: null, defensa: null }, // the cards of this round
  puntos: {},
  ronda: 1,
  historial: [],                         // [{ ronda, ataque, defensa, gana }]
  ganador: null,                         // an id, or 'empate'
};
for (const id of s.jugadores) if (!(id in s.puntos)) s.puntos[id] = 0;

const publicar = () => neblla.state.set(s);
const otro = (id) => s.jugadores.find(j => j !== id);
const valor = (carta, contra) => carta.fuerza + (GANA_A[carta.elemento] === contra.elemento ? 3 : 0);

if (s.fase === 'mazos' && !s.creada) {
  s.creada = true;
  neblla.tools.deck.create(MAZO, [], { fromRows: { table: 'coleccion', min: CARTAS, max: CARTAS } }).then(publicar);
}

// A player says they brought their deck: Neblla's counts say if it is true.
neblla.message.on(async (m) => {
  if (m.to !== 'server' || m.data?.type !== 'traido' || s.fase !== 'mazos') return;
  if (!s.jugadores.includes(m.from) || s.listos.includes(m.from)) return;
  const cuentas = await neblla.tools.deck.counts(MAZO);
  if (cuentas[m.from]?.pile !== CARTAS) return neblla.message.to(m.from, { type: 'rechazado', motivo: 'sin_mazo' });
  s.listos.push(m.from);
  if (s.listos.length === 2) {
    for (const id of s.jugadores) await neblla.tools.deck.deal(MAZO, id, MANO);
    s.fase = 'juego';
    s.turno = s.jugadores[s.ataca];
  }
  publicar();
});

// Every card played, announced by Neblla to the whole room.
neblla.tools.on('event', async (e) => {
  if (e.tool !== 'deck' || e.name !== MAZO || e.op !== 'play' || s.fase !== 'juego') return;
  // Out of turn, the card is lost: the client does not let it happen.
  if (e.user !== s.turno) return;
  const carta = { id: e.card.id, criatura: e.card.criatura, elemento: e.card.elemento, fuerza: e.card.fuerza, rareza: e.card.rareza };
  if (!s.mesa.ataque) {
    s.mesa.ataque = { ...carta, de: e.user };
    s.turno = otro(e.user);
    return publicar();
  }
  s.mesa.defensa = { ...carta, de: e.user };
  const a = s.mesa.ataque, d = s.mesa.defensa;
  const va = valor(a, d), vd = valor(d, a);
  const gana = va > vd ? a.de : vd > va ? d.de : null;
  if (gana) s.puntos[gana] += 1;
  s.historial.push({ ronda: s.ronda, ataque: { ...a, valor: va }, defensa: { ...d, valor: vd }, gana });
  s.mesa = { ataque: null, defensa: null };
  s.ronda += 1;
  s.ataca = 1 - s.ataca;
  // A new card for each, while their pile lasts.
  const cuentas = await neblla.tools.deck.counts(MAZO);
  for (const id of s.jugadores) if (cuentas[id]?.pile > 0) await neblla.tools.deck.deal(MAZO, id, 1);
  const despues = await neblla.tools.deck.counts(MAZO);
  const sinCartas = s.jugadores.some(id => (despues[id]?.hand || 0) === 0);
  const [j1, j2] = s.jugadores;
  if (s.puntos[j1] >= GANAR || s.puntos[j2] >= GANAR || sinCartas) {
    s.fase = 'fin';
    s.turno = null;
    s.ganador = s.puntos[j1] === s.puntos[j2] ? 'empate' : (s.puntos[j1] > s.puntos[j2] ? j1 : j2);
  } else {
    s.turno = s.jugadores[s.ataca];
  }
  publicar();
});

// If one leaves mid-duel, the other wins.
neblla.room.on('userLeft', ({ user }) => {
  if (s.fase === 'fin' || !s.jugadores.includes(user.id)) return;
  s.fase = 'fin';
  s.turno = null;
  s.ganador = otro(user.id);
  s.abandono = user.id;
  publicar();
});

publicar();
