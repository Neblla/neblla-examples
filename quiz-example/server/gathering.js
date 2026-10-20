// server/gathering.js — mientras la sala espera jugadores. Arranca cuando
// quien dirige (el master) pulsa «Empezar»; nadie más puede.
neblla.message.on((m) => {
  if (m.to !== 'server' || !m.data || m.data.type !== 'start') return;
  if (!neblla.room.master || neblla.room.master.id !== m.from) return;
  neblla.room.start();
});
