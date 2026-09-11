# Riglos Plaza — Cocheras de cortesía

App web para registrar los accesos a las 2 cocheras de cortesía del edificio.
Sitio estático (HTML + CSS + JS), sin dependencias ni build.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura: login, cocheras, historial y modales |
| `styles.css` | Estilos responsive (1 columna en mobile, 2 desde 680 px) |
| `app.js` | Lógica, reglas de negocio y persistencia |
| `img/` | Fotos del estacionamiento, ya recortadas y optimizadas |

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
- **Estados visuales:** la foto de la cochera está en los dos estados, pero
  cambia de rol. *Libre:* la foto va a color como banda superior y los datos
  debajo, sobre blanco. *Ocupada / Excedida:* la foto pasa a ser el fondo de
  toda la tarjeta, en escala de grises y teñida de bordo, con una capa bordo
  translúcida encima y los datos en blanco por arriba — la excedida lleva esa
  capa bastante más cargada. Debajo hay una barra con la proporción de la
  estadía ya consumida.
- Al marcar la salida se calcula la permanencia real y se guarda en el historial,
  marcando el exceso si lo hubo.

Los parámetros están todos arriba de `app.js`, en `CONFIG` (usuarios, cocheras,
estadía máxima, cooldown).

## Identidad visual

Interfaz sobria: superficies blancas, bordes de un pelo, mucho aire y nada de
texturas decorativas. El único elemento gráfico son las fotos del propio
estacionamiento, y el color se usa solamente como señal de estado.

| Color | Hex | Uso |
|---|---|---|
| Wine Plum | `#653239` | Tinta de títulos, botón primario, estado *Excedida* |
| Dusty Rose | `#AF7A6D` | Acentos, foco de campos, estado *Ocupada* |
| Sand Dune | `#E2D4BA` | Base del fondo de página |
| Bone | `#CCC7B9` | Filetes y bordes neutros |
| Frosted Mint | `#EAF9D9` | Estado *Libre* y avisos de cupo disponible |

Todo está en `:root` de `styles.css`: los cinco colores de la paleta y, abajo,
los derivados (versiones más claras u oscuras del mismo tono) que hacían falta
para tener contraste legible en texto y botones.

### Las fotos

En `img/` hay tres archivos generados a partir de las fotos originales del
estacionamiento, recortados y comprimidos para que entren rápido en un celular:

| Archivo | Dónde se usa | Peso |
|---|---|---|
| `entrada.jpg` | Fondo a pantalla completa del login, con un velo oscuro encima | 165 KB |
| `cochera-1.jpg` | Tarjeta de la Cochera 1: banda superior si está libre, fondo teñido si está ocupada | 39 KB |
| `cochera-2.jpg` | Ídem para la Cochera 2 | 37 KB |

No hay una foto de la parcela izquierda sola, así que `cochera-1.jpg` es un
recorte ampliado de la foto general: se queda con el tramo que va de la pared
izquierda a la columna central, que es justo el límite de esa parcela. Las dos
miniaturas se generan en 16:9, la misma proporción que espera `.spot-photo`,
para que el CSS no las vuelva a recortar.

La ruta de cada foto está en `CONFIG.SPOTS` (`app.js`), en la propiedad `foto`.
Si a una cochera se le saca esa propiedad, la tarjeta simplemente se muestra sin
imagen. Las miniaturas cargan con `loading="lazy"`.

Se generan con `tools/prep-img.py`, que necesita Pillow (`pip install pillow`):

```bash
python tools/prep-img.py <carpeta-con-las-fotos-originales>
```

Redimensiona a 1500 px de ancho la entrada y 760 px las miniaturas, y guarda en
JPEG progresivo con calidad 74. Los recortes están como fracciones del alto y
el ancho, así que sirven igual si la foto original cambia de resolución.

Tipografías: **Fraunces** (serif) solo para el nombre del edificio y **Archivo**
para todo lo demás, con `font-variant-numeric: tabular-nums` en horas y
duraciones para que los números no bailen al actualizarse. Se cargan desde
Google Fonts y tienen fallback a fuentes del sistema.

## Limitación importante antes de imprimir el QR

Los datos se guardan en el `localStorage` **del navegador que los cargó**. Cada
celular que escanee el QR ve su propia copia: si un vecino registra un auto desde
su teléfono, otro vecino no lo ve.

Para el uso real con QR hace falta un backend compartido (por ejemplo Firebase,
Supabase o una API propia). La app está preparada para eso: toda la persistencia
pasa por `loadState()` / `saveState()` en `app.js`; reemplazando esas dos
funciones por llamadas al servidor, el resto de la lógica queda igual.
