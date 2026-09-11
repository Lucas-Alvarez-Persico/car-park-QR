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
| `supabase/schema.sql` | Esquema, reglas y políticas de la base |
| `supabase-config.js` | URL y anon key del proyecto — **fuera del repo** |
| `supabase-config.example.js` | Plantilla para copiar en un clon nuevo |
| `db.js` | Los pedidos contra la base, con `fetch` puro |
| `test-db.html` | Página para verificar la conexión y el ciclo completo |

## Cómo probarla

Hay que servirla por HTTP: abrir el archivo con doble clic no sirve, porque el
navegador bloquea los pedidos a Supabase desde `file://`.

```bash
python -m http.server 5173
```

Después abrir `http://localhost:5173`. Antes hay que completar
`supabase-config.js` (ver *Backend en Supabase*), si no la app arranca
mostrando el error de configuración.

## Acceso

Usuario `admin`, contraseña `123` — hardcodeados en `CONFIG.USERS` (`app.js`).
La sesión vive en `sessionStorage`: al cerrar la pestaña vuelve a pedir login,
que es el comportamiento deseado para un QR que usan distintas personas.

> **Este login no protege los datos.** Es una pantalla del navegador: la
> contraseña está a la vista en `app.js` y, sobre todo, la base no se entera de
> que existe. Cualquiera que tenga la URL y la anon key puede escribir turnos
> hablándole directo a la API, sin pasar por esta pantalla. Sirve para evitar
> registros accidentales, nada más. La protección real llega con Supabase Auth
> (ver *Seguridad, por ahora*).

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

## Backend en Supabase

> **Estado: conectado.** La base es la fuente de verdad; ya no se usa
> `localStorage` para los turnos (solo queda para recordar la sesión).

### Puesta en marcha

1. Crear una cuenta y un proyecto en [supabase.com](https://supabase.com) —
   el plan **Free** alcanza de sobra. Elegir la región más cercana
   (`South America (São Paulo)`).
2. En el **SQL Editor** del proyecto, pegar entero
   [`supabase/schema.sql`](supabase/schema.sql) y ejecutarlo. Se corre una
   sola vez y es idempotente: volver a correrlo no rompe nada.
3. En **Project Settings → Data API**, copiar *Project URL* y la clave
   *anon / publishable*, y pegarlas en
   [`supabase-config.js`](supabase-config.js).
4. Abrir `test-db.html` y correr las dos pruebas. La primera solo lee; la
   segunda da de alta un turno de prueba y lo cierra.

La **anon key va en el cliente a propósito**: está diseñada para eso y lo que
permite hacer lo definen las políticas de RLS. La que nunca tiene que salir del
panel de Supabase es la *service_role*, que ignora RLS por completo.

### El modelo: una sola tabla

Cada estadía es una fila de `turnos`. Mientras `egreso_real` es `null` la
cochera está ocupada; cuando se completa, esa misma fila pasa a ser historial.
No hay dos estructuras que mantener sincronizadas — el estado actual es una
consulta sobre el mismo dato.

### El servidor manda en los tiempos

Todas las reglas del reglamento son temporales, y los clientes son los
teléfonos de cualquier visitante: un reloj mal puesto podría saltearse el
cooldown o estirar la estadía. Por eso la app **no manda horarios**, manda
`duracion_min` (de a 30, hasta 240) y la base pone `ingreso` con `now()` y
calcula `egreso_previsto`. La salida se cierra con la función `cerrar_turno()`,
que también usa la hora del servidor.

### Las reglas viven en la base, no solo en el navegador

Las validaciones de `app.js` quedan para dar mensajes lindos mientras se
escribe, pero quien realmente las hace cumplir es Postgres:

| Regla | Cómo se aplica |
|---|---|
| Una cochera, un auto | Índice único parcial sobre `cochera` |
| Patente única activa | Índice único parcial sobre `patente` |
| Cooldown de 24 h | Trigger `turnos_validar_alta` |
| Cupo de 5 por depto y mes | Trigger `turnos_validar_alta` |
| Estadía máxima 4 h | `check` sobre `duracion_min` |
| Formato de patente | `check` con las dos expresiones regulares |
| Un turno no se edita ni se reabre | Trigger `turnos_solo_cerrar` |

Los dos índices únicos parciales tapan un agujero que la versión con
`localStorage` no podía cerrar: **dos vecinos registrando a la vez**. Sin eso,
dos altas simultáneas en la misma cochera se pisan; con eso, la segunda recibe
un error claro.

### Seguridad, por ahora

RLS está activo, pero las tres políticas incluyen el rol `anon`: **cualquiera
con la URL y la anon key puede leer y escribir turnos**. Es el paso intermedio
acordado hasta sumar usuarios. Cuando eso pase, alcanza con sacar `anon` de las
políticas al final de `schema.sql` y dejar solo `authenticated`.

No hay política de `delete` a propósito: el historial no se borra desde la app.
Por eso **se quitó el botón "Limpiar historial"**: el historial ahora es
compartido y no tiene sentido que cualquiera lo borre desde el teléfono. En su
lugar el panel muestra la cantidad de registros. Si más adelante hace falta
purgarlo, va a ser una acción de administrador.

### Dos cosas del plan Free a tener en cuenta

- Los proyectos **se pausan tras 7 días sin actividad** y hay que despertarlos a
  mano desde el panel. Para una app que puede pasar una semana sin uso, no es
  un detalle menor.
- El límite es de 500 MB de base y 2 proyectos activos. Para este volumen de
  datos sobra: un turno son unos pocos cientos de bytes.

### Cómo quedó la app conectada

`loadState()` / `saveState()` desaparecieron. En su lugar:

- **Arranque y refresco.** `refrescar()` lee la base y deja el estado en
  memoria solo para dibujar. Se vuelve a leer cada 30 s y, sobre todo, cada vez
  que la pestaña vuelve a estar visible — que es el caso real en un celular que
  se bloquea y se desbloquea.
- **Tres estados de interfaz** que antes no existían porque `localStorage` es
  instantáneo y nunca falla: esqueleto de carga, error, y datos.
- **Si no se puede leer, no se inventa nada.** La pantalla de error dice
  explícitamente que no se registren ingresos, porque una cochera que figura
  libre por un error de red es peor que no mostrar nada.
- **Si falla un refresco de fondo**, aparece un aviso arriba pero *no* se borra
  lo que ya estaba en pantalla.
- **El aviso de cupo** mientras se escribe el departamento ahora se le pregunta
  a la base, con 350 ms de espera para no disparar un pedido por tecla.
- **Los botones se bloquean** mientras el pedido viaja, y los errores del
  servidor se muestran en el modal sin cerrarlo, así no se pierde lo tipeado.

### Detalle a tener en cuenta

El modal muestra la hora de ingreso **del teléfono**, pero la que se guarda es
la del servidor. Si el reloj del celular está desfasado, la tarjeta va a
mostrar un horario levemente distinto al del modal. Es el precio de no confiar
en el reloj del cliente, y se corrige solo en el refresco.
