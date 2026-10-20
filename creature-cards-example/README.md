# Criaturas

Un juego de cartas coleccionables hecho con [Neblla](https://neblla.com): abre sobres, completa una colección de 30 criaturas, cambia cartas con tus amigos y reta a duelos con tu propio mazo.

Juégalo en https://creature-cards-example.neblla.app/ (es un ejemplo: la tienda cobra con la tarjeta de prueba 4242 4242 4242 4242, sin cargo real).

## Qué hace Neblla por él

- **La colección no se puede trucar.** Es la tabla `coleccion` con `write: 'neblla'`: el móvil la lee, pero solo Neblla le añade cartas.
- **Sobres con sorteo justo.** `neblla.db.draw('sobre')`: en cada apertura Neblla baraja las 939 cartas, cobra y apunta las 5 cartas antes de enseñarlas. Las reglas (copias de cada carta, precio, un sobre gratis cada 12 horas) están en los ajustes de la app, no en el código. La probabilidad de cada carta es pública (`neblla.db.drawInfo`).
- **Tienda con Stripe.** Sobres y monedas son créditos que se compran; 3 sobres de regalo al entrar.
- **Amigos.** Ven la colección del otro (`visible`) y se cambian cartas (`trade`): todo o nada.
- **Duelos con tu propio mazo.** Una sala de dos con emparejamiento; cada jugador trae sus 8 cartas (`tools.deck` con `fromRows`), Neblla comprueba que son suyas y nadie más ve su mazo. `server/room.js` hace de árbitro.

## Ficheros

- `index.html`, `main.css`: la página.
- `creatures.js`: las 30 criaturas, dibujadas con código (SVG).
- `client.js`: todo lo que hace el jugador.
- `server/room.js`: el árbitro del duelo. `server/gathering.js` lo genera Neblla a partir de las reglas de emparejamiento.
