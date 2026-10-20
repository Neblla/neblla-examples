// creatures.js — the 30 creatures of «Criaturas», and how each one is drawn.
// Everything is drawn by code (SVG): no image files, no outside art.
// The draw rules (how many copies of each, so how rare) live in the app's
// settings (`draws.sobre`), not here: this file only paints.

const CRIATURAS = [
  // fuego
  { id: 'chispin',    nombre: 'Chispín',    elemento: 'fuego',  rareza: 'comun',      fuerza: 1 },
  { id: 'brasilla',   nombre: 'Brasilla',   elemento: 'fuego',  rareza: 'comun',      fuerza: 2 },
  { id: 'ascuin',     nombre: 'Ascuín',     elemento: 'fuego',  rareza: 'comun',      fuerza: 3 },
  { id: 'tizon',      nombre: 'Tizón',      elemento: 'fuego',  rareza: 'comun',      fuerza: 4 },
  { id: 'fogarato',   nombre: 'Fogarato',   elemento: 'fuego',  rareza: 'rara',       fuerza: 4 },
  { id: 'llamaron',   nombre: 'Llamarón',   elemento: 'fuego',  rareza: 'rara',       fuerza: 5 },
  { id: 'volcanito',  nombre: 'Volcanito',  elemento: 'fuego',  rareza: 'rara',       fuerza: 6 },
  { id: 'pirolobo',   nombre: 'Pirolobo',   elemento: 'fuego',  rareza: 'epica',      fuerza: 7 },
  { id: 'magmazor',   nombre: 'Magmazor',   elemento: 'fuego',  rareza: 'epica',      fuerza: 8 },
  { id: 'solferon',   nombre: 'Solferón',   elemento: 'fuego',  rareza: 'legendaria', fuerza: 10 },
  // agua
  { id: 'gotin',      nombre: 'Gotín',      elemento: 'agua',   rareza: 'comun',      fuerza: 1 },
  { id: 'charquillo', nombre: 'Charquillo', elemento: 'agua',   rareza: 'comun',      fuerza: 2 },
  { id: 'burbujo',    nombre: 'Burbujo',    elemento: 'agua',   rareza: 'comun',      fuerza: 3 },
  { id: 'olita',      nombre: 'Olita',      elemento: 'agua',   rareza: 'comun',      fuerza: 4 },
  { id: 'medusela',   nombre: 'Medusela',   elemento: 'agua',   rareza: 'rara',       fuerza: 4 },
  { id: 'corrienton', nombre: 'Corrientón', elemento: 'agua',   rareza: 'rara',       fuerza: 5 },
  { id: 'caracolon',  nombre: 'Caracolón',  elemento: 'agua',   rareza: 'rara',       fuerza: 6 },
  { id: 'marejadon',  nombre: 'Marejadón',  elemento: 'agua',   rareza: 'epica',      fuerza: 7 },
  { id: 'abisalia',   nombre: 'Abisalia',   elemento: 'agua',   rareza: 'epica',      fuerza: 8 },
  { id: 'leviatina',  nombre: 'Leviatina',  elemento: 'agua',   rareza: 'legendaria', fuerza: 10 },
  // planta
  { id: 'brotin',     nombre: 'Brotín',     elemento: 'planta', rareza: 'comun',      fuerza: 1 },
  { id: 'musguin',    nombre: 'Musguín',    elemento: 'planta', rareza: 'comun',      fuerza: 2 },
  { id: 'hojarin',    nombre: 'Hojarín',    elemento: 'planta', rareza: 'comun',      fuerza: 3 },
  { id: 'setilla',    nombre: 'Setilla',    elemento: 'planta', rareza: 'comun',      fuerza: 4 },
  { id: 'raizon',     nombre: 'Raizón',     elemento: 'planta', rareza: 'rara',       fuerza: 4 },
  { id: 'espinardo',  nombre: 'Espinardo',  elemento: 'planta', rareza: 'rara',       fuerza: 5 },
  { id: 'floribela',  nombre: 'Floribela',  elemento: 'planta', rareza: 'rara',       fuerza: 6 },
  { id: 'robledon',   nombre: 'Robledón',   elemento: 'planta', rareza: 'epica',      fuerza: 7 },
  { id: 'zarzaron',   nombre: 'Zarzarón',   elemento: 'planta', rareza: 'epica',      fuerza: 8 },
  { id: 'bosquimor',  nombre: 'Bosquimor',  elemento: 'planta', rareza: 'legendaria', fuerza: 10 },
];
const POR_ID = Object.fromEntries(CRIATURAS.map(c => [c.id, c]));

const ELEMENTOS = {
  fuego:  { nombre: 'Fuego',  icono: '🔥', cuerpo: ['#ff8a4c', '#e2522b'], tripa: '#ffd29a', fondo: ['#fff1e6', '#ffd7bd'] },
  agua:   { nombre: 'Agua',   icono: '💧', cuerpo: ['#5cc4f2', '#2f86d6'], tripa: '#c9f1ff', fondo: ['#e8f7ff', '#c4e8fb'] },
  planta: { nombre: 'Planta', icono: '🌿', cuerpo: ['#7fd06a', '#3f9a45'], tripa: '#e3f7c6', fondo: ['#eefbe6', '#cdeec0'] },
};
const RAREZAS = {
  comun:      { nombre: 'Común',      marco: '#b8b2a7', orden: 0 },
  rara:       { nombre: 'Rara',       marco: '#3e7be0', orden: 1 },
  epica:      { nombre: 'Épica',      marco: '#9a4fd8', orden: 2 },
  legendaria: { nombre: 'Legendaria', marco: '#e0a51c', orden: 3 },
};
// Fire beats plant, plant beats water, water beats fire: +3 strength.
const GANA_A = { fuego: 'planta', planta: 'agua', agua: 'fuego' };
const VENTAJA = 3;

// A small seeded random, so each creature is always drawn the same.
function semilla(texto) {
  let h = 2166136261;
  for (const ch of texto) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

// A gradient's id must be unique in the page: one inside a hidden view would
// leave every other copy of the same creature without colour.
let dibujos = 0;

/** The creature's picture, as SVG markup (viewBox 0 0 120 120). */
function dibujo(c, { silueta = false } = {}) {
  const r = semilla(c.id);
  const e = ELEMENTOS[c.elemento];
  const nivel = RAREZAS[c.rareza].orden;
  const ancho = 34 + r() * 12 + nivel * 3, alto = 30 + r() * 10 + nivel * 3;
  const cx = 60, cy = 70;
  const ojo = 4 + r() * 3, sep = 10 + r() * 6;
  const g = 'g' + c.id + (++dibujos);
  const relleno = silueta ? '#cfc9bf' : `url(#${g})`;
  const tinta = silueta ? '#bdb6ab' : '#2b2420';
  let extra = '';
  if (c.elemento === 'fuego') {
    const n = 1 + Math.floor(r() * 3) + (nivel > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 8 + i * 16, h = 16 + r() * 10 + nivel * 3;
      extra += `<path d="M${x - 8} ${cy - alto + 6} Q${x - 6} ${cy - alto - h * 0.6} ${x} ${cy - alto - h} Q${x + 4} ${cy - alto - h * 0.4} ${x + 8} ${cy - alto + 6} Z" fill="${silueta ? relleno : '#ffb648'}" stroke="${tinta}" stroke-width="2"/>`;
    }
  } else if (c.elemento === 'agua') {
    extra += `<path d="M${cx - 6} ${cy - alto + 4} Q${cx} ${cy - alto - 18 - nivel * 4} ${cx + 12} ${cy - alto + 2} Z" fill="${silueta ? relleno : e.cuerpo[1]}" stroke="${tinta}" stroke-width="2"/>`;
    if (!silueta) for (let i = 0; i < 2 + nivel; i++) extra += `<circle cx="${18 + r() * 84}" cy="${14 + r() * 26}" r="${2 + r() * 4}" fill="none" stroke="#7fc8ee" stroke-width="2"/>`;
  } else {
    const n = 2 + Math.floor(r() * 2) + (nivel > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 9 + i * 18, h = 14 + r() * 8 + nivel * 2, giro = (i - (n - 1) / 2) * 20;
      extra += `<ellipse cx="${x}" cy="${cy - alto - h / 2 + 4}" rx="6" ry="${h / 2}" transform="rotate(${giro} ${x} ${cy - alto + 4})" fill="${silueta ? relleno : '#5fbf4a'}" stroke="${tinta}" stroke-width="2"/>`;
    }
  }
  // Rarer ones get more: horns for the epic, a crown for the legendary.
  if (nivel >= 2) extra += `<path d="M${cx - ancho + 8} ${cy - alto / 2} l-10 -14 l14 6 Z M${cx + ancho - 8} ${cy - alto / 2} l10 -14 l-14 6 Z" fill="${silueta ? relleno : '#fff4d6'}" stroke="${tinta}" stroke-width="2"/>`;
  if (nivel === 3 && !silueta) extra += `<path d="M${cx - 14} 20 l5 -10 l5 8 l4 -10 l4 10 l5 -8 l5 10 Z" fill="#ffd24a" stroke="#8a6200" stroke-width="2"/>`;
  const pies = `<ellipse cx="${cx - ancho / 2}" cy="${cy + alto - 2}" rx="9" ry="5" fill="${silueta ? relleno : e.cuerpo[1]}" stroke="${tinta}" stroke-width="2"/><ellipse cx="${cx + ancho / 2}" cy="${cy + alto - 2}" rx="9" ry="5" fill="${silueta ? relleno : e.cuerpo[1]}" stroke="${tinta}" stroke-width="2"/>`;
  const cara = silueta ? '' : `
    <ellipse cx="${cx}" cy="${cy + alto / 3}" rx="${ancho * 0.55}" ry="${alto * 0.45}" fill="${e.tripa}" opacity=".9"/>
    <circle cx="${cx - sep}" cy="${cy - 4}" r="${ojo + 2}" fill="#fff" stroke="${tinta}" stroke-width="1.5"/>
    <circle cx="${cx + sep}" cy="${cy - 4}" r="${ojo + 2}" fill="#fff" stroke="${tinta}" stroke-width="1.5"/>
    <circle cx="${cx - sep + 1}" cy="${cy - 3}" r="${ojo * 0.6}" fill="${tinta}"/>
    <circle cx="${cx + sep + 1}" cy="${cy - 3}" r="${ojo * 0.6}" fill="${tinta}"/>
    <path d="M${cx - 6} ${cy + 8} Q${cx} ${cy + 13 + r() * 4} ${cx + 6} ${cy + 8}" fill="none" stroke="${tinta}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${cx - sep - 6}" cy="${cy + 6}" r="3" fill="#ff8fa0" opacity=".6"/><circle cx="${cx + sep + 6}" cy="${cy + 6}" r="3" fill="#ff8fa0" opacity=".6"/>`;
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${silueta ? 'Una criatura que aún no tienes' : c.nombre}">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${e.cuerpo[0]}"/><stop offset="1" stop-color="${e.cuerpo[1]}"/></linearGradient></defs>
    ${extra}${pies}
    <ellipse cx="${cx}" cy="${cy}" rx="${ancho}" ry="${alto}" fill="${relleno}" stroke="${tinta}" stroke-width="2.5"/>
    ${cara}
  </svg>`;
}

window.Criaturas = { CRIATURAS, POR_ID, ELEMENTOS, RAREZAS, GANA_A, VENTAJA, dibujo };
