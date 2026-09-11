# Riglos Plaza — Cocheras de cortesía

App web para registrar los accesos a las 2 cocheras de cortesía del edificio.
Sitio estático (HTML + CSS + JS), sin dependencias ni build.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura: login, cocheras, historial y modales |
| `styles.css` | Estilos responsive (1 columna en mobile, 2 desde 640 px) |
| `app.js` | Lógica, reglas de negocio y persistencia |

## Cómo probarla

Doble clic en `index.html` alcanza para ver la interfaz, pero para que el
guardado funcione siempre conviene servirla por HTTP:

```bash
python -m http.server 5173
```

Después abrir `http://localhost:5173`.

## Acceso

Usuario `admin`, contraseña `123` — hardcodeados en `CONFIG.USERS` (`app.js`).
La sesión vive en `sessionStorage`: al cerrar la pestaña vuelve a pedir login,
que es el comportamiento deseado para un QR que usan distintas personas.

## Reglas implementadas

- **Sin reservas.** La hora de ingreso se toma en el momento de registrar; el
  campo es de solo lectura.
- **Estadía máxima 4 h.** El egreso se elige en un desplegable propio (no el
  `select` nativo) que lista **solo los horarios permitidos**: de a 30 minutos
  desde el ingreso hasta las 4 h. Se abre hacia abajo flotando por encima del
  formulario (`position:fixed` ubicado por JS), así no altera el alto del modal,
  y siempre arranca mostrando la opción de 30 min. Viene seleccionado el máximo
  y se puede adelantar; lo que excede el límite no se ofrece.
- **Cooldown de 24 h por patente.** Se cuenta desde el *último ingreso*: si un
  auto entró a las 11:00, recién puede volver a las 11:00 del día siguiente. El
  mensaje de error indica fecha, hora y tiempo restante.
- **Patente única activa.** No se puede cargar la misma patente en las dos
  cocheras.
- **Cupo mensual: 5 invitaciones por departamento.** Se cuenta por mes
  calendario (ingresos del historial + los que estén estacionados ahora). Al
  escribir el departamento aparece en vivo cuántas le quedan: verde con 2 o más,
  ámbar con 1, rojo sin cupo e indicando la fecha de renovación. Sin cupo, el
  registro se bloquea. `5 b`, `5B` y `5b` cuentan como el mismo departamento.
- **Formato de patente** validado: `ABC123` (viejo) o `AB123CD` (Mercosur).
- **Estados visuales:** tarjetas translúcidas (`backdrop-filter`) con el borde
  del color del estado: verde = libre, rojo = ocupada, ámbar = se superó la hora
  de egreso prevista (se muestra por cuánto).
- Al marcar la salida se calcula la permanencia real y se guarda en el historial,
  marcando el exceso si lo hubo.

Los parámetros están todos arriba de `app.js`, en `CONFIG` (usuarios, cocheras,
estadía máxima, cooldown).

## Limitación importante antes de imprimir el QR

Los datos se guardan en el `localStorage` **del navegador que los cargó**. Cada
celular que escanee el QR ve su propia copia: si un vecino registra un auto desde
su teléfono, otro vecino no lo ve.

Para el uso real con QR hace falta un backend compartido (por ejemplo Firebase,
Supabase o una API propia). La app está preparada para eso: toda la persistencia
pasa por `loadState()` / `saveState()` en `app.js`; reemplazando esas dos
funciones por llamadas al servidor, el resto de la lógica queda igual.
