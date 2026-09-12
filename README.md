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
| `supabase/auth.sql` | Usuarios por departamento y cierre del acceso anónimo |
| `supabase/keepalive.sql` | Ping diario y cierre de funciones públicas |
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

**Se entra con el departamento**, no con un usuario genérico: cada depto es una
cuenta de Supabase Auth. La sesión vive en `sessionStorage`, así que al cerrar
la pestaña hay que volver a entrar — que es lo correcto para un QR que usan
distintas personas en el mismo teléfono.

Departamentos de prueba: `1A`, `2A` y `3A`, todos con contraseña `123`.

Internamente cada depto es el mail `<depto>@riglosplaza.com.ar`. Es solo un
identificador: **nunca se manda un correo a esa dirección**, y el dominio no
necesita existir. La app arma el mail sola, el vecino solo escribe `1A`.

### Qué cambia al estar logueado

- La barra superior muestra el departamento y **cuántas invitaciones le quedan**
  este mes, con color según queden varias, una o ninguna.
- Al registrar un ingreso, **el departamento ya viene puesto y no se puede
  editar**: sale de la sesión.

> **El departamento nunca viaja desde el formulario.** El trigger de alta lo
> sobrescribe con el del usuario logueado. Si no fuera así, cualquiera podría
> gastarle el cupo mensual a otro departamento simplemente cambiando el campo.

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
2. En el **SQL Editor**, pegar y ejecutar
   [`supabase/schema.sql`](supabase/schema.sql) — tablas, reglas e índices.
3. Después, en el mismo editor, ejecutar
   [`supabase/auth.sql`](supabase/auth.sql) — usuarios por departamento y
   cierre del acceso anónimo. **En este orden**, porque el segundo modifica
   cosas que crea el primero.
4. En **Project Settings → Data API**, copiar *Project URL* y la clave
   *anon / publishable*, y pegarlas en
   [`supabase-config.js`](supabase-config.js).
5. Abrir `test-db.html` y correr los tres pasos: login, lectura y ciclo
   completo.

### Agregar los departamentos reales

`auth.sql` deja una función para eso. Una línea por departamento en el SQL
Editor:

```sql
select public.crear_depto('4B', 'la-clave-de-ese-depto');
```

> **Ojo con las contraseñas.** `crear_depto()` escribe directo en `auth.users`,
> lo que **saltea la política de contraseñas de Supabase** (mínimo 6
> caracteres). Es lo que permite usar `123` para probar. Para las claves de
> verdad conviene el panel de Supabase (Authentication → Users → Add user, con
> *Auto Confirm*) y después enlazar el perfil a mano, o usar contraseñas que
> cumplan la política.

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

### Seguridad

`auth.sql` **saca el rol `anon` de todas las políticas**: sin sesión iniciada la
base no devuelve ni acepta nada. La anon key sigue viajando al navegador, pero
por sí sola ya no sirve para leer ni escribir turnos.

Quién puede hacer qué, estando logueado:

| Acción | Quién |
|---|---|
| Ver el estado de las cocheras y el historial | Cualquier departamento |
| Registrar un ingreso | Cualquiera, siempre a nombre de **su propio** depto |
| Marcar una salida | Cualquiera, incluso de un auto que invitó otro |
| Ver perfiles ajenos | Nadie — cada uno ve solo el suyo |
| Borrar turnos | Nadie desde la app |

La lectura del historial es de todos a propósito: para saber si una cochera está
libre hay que poder ver la que ocupó otro departamento. Y la salida la puede
marcar cualquiera porque el auto se fue físicamente y la cochera tiene que
quedar libre, sin depender de que aparezca quien invitó.

No hay política de `delete` a propósito: el historial no se borra desde la app.
Por eso **se quitó el botón "Limpiar historial"**: el historial ahora es
compartido y no tiene sentido que cualquiera lo borre desde el teléfono. En su
lugar el panel muestra la cantidad de registros. Si más adelante hace falta
purgarlo, va a ser una acción de administrador.

### Mantener el proyecto despierto

El plan Free **pausa los proyectos tras 7 días sin actividad**, y hay que
despertarlos a mano desde el panel. Para una app de edificio que puede pasar una
semana sin invitados, eso significa un QR que falla justo cuando alguien lo
necesita.

La solución: [`supabase/keepalive.sql`](supabase/keepalive.sql) crea una función
`keepalive()` que hace una lectura real contra la base y devuelve solo la hora
del servidor, y
[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) la llama
una vez por día desde GitHub Actions.

Hay que cargar dos secrets en *Settings → Secrets and variables → Actions*:
`SUPABASE_URL` y `SUPABASE_ANON_KEY`. Si el ping falla, el job falla y GitHub
manda un mail — que es la única forma de enterarse antes que los vecinos.

> **Tres advertencias.**
>
> 1. Que una lectura cuente como actividad es el comportamiento observado, no
>    una garantía: Supabase puede cambiar la política sin avisar.
> 2. **GitHub deshabilita los workflows programados tras 60 días sin actividad
>    en el repositorio.** O sea que el keep-alive se apaga solo justo en los
>    proyectos terminados, que son los que más lo necesitan. Se reactiva desde
>    la pestaña Actions, pero hay que acordarse.
> 3. Si el sistema pasa a ser algo de lo que dependa el edificio, lo correcto
>    es el plan Pago y no este parche.

Si el punto 2 preocupa, la alternativa es un cron externo (cron-job.org,
UptimeRobot) que no se apaga solo, apuntado a la misma URL de `keepalive()`.

### Funciones cerradas al público

Supabase le da `execute` a `anon` sobre todo lo que esté en el esquema `public`.
Eso dejaba consultables sin sesión `cupo_restante()`, `patente_libre_desde()`,
`mi_cupo()` y `cerrar_turno()` — o sea que cualquiera con la anon key podía
averiguar cuántas invitaciones le quedan a un departamento, o si una patente
estuvo en el edificio. `keepalive.sql` les revoca el permiso.

La única función que queda abierta es `keepalive()`, que no devuelve ningún dato
del edificio.

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

## Publicar

Pensado para **Cloudflare Pages** o **Netlify**, que en su plan gratuito
aceptan repositorios privados — a diferencia de GitHub Pages, que en el plan
Free obliga a que el repo sea público.

`tools/build.sh` arma una carpeta `dist/` con **solo los archivos que el
navegador necesita** y genera ahí `supabase-config.js` a partir de variables de
entorno. Así la clave nunca vive en el repositorio, y el README, los `.sql` del
esquema y las herramientas no quedan publicados.

### Las variables

Van en el panel del hosting, como variables **de build** (no como secretos del
runtime): quien las usa es `tools/build.sh` mientras construye, no el sitio ya
publicado.

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | la clave *anon / publishable* |

Si falta cualquiera de las dos, **el build falla** en vez de publicar un sitio
roto que arranca pidiendo la configuración.

### Cloudflare Workers

Cloudflare empuja los proyectos nuevos hacia **Workers**, no hacia Pages, aunque
se entre por "Workers & Pages". Se reconoce porque el deploy command dice
`npx wrangler deploy` y **no hay campo "Build output directory"**.

Ahí la carpeta a publicar se declara en [`wrangler.toml`](wrangler.toml), no en
el panel. Configuración:

| Campo | Valor |
|---|---|
| Build command | `sh tools/build.sh` |
| Deploy command | `npx wrangler deploy` |
| Carpeta publicada | sale de `[assets] directory` en `wrangler.toml` |

> El campo `name` de `wrangler.toml` tiene que **coincidir con el nombre del
> Worker** ya creado en Cloudflare. Si no coincide, `wrangler deploy` crea un
> Worker nuevo aparte y terminás con dos proyectos.

### Cloudflare Pages o Netlify

Si en cambio es un proyecto de Pages (o Netlify), `wrangler.toml` se ignora y la
carpeta se configura en el panel:

| Campo | Valor |
|---|---|
| Build command | `sh tools/build.sh` |
| Build output directory | `dist` |

Netlify además toma `netlify.toml`, que ya trae ambos valores y las cabeceras.

Para probar el build localmente:

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=sb_publishable_xxx sh tools/build.sh
```

### Qué NO se publica

`dist/` se arma copiando archivo por archivo, no clonando la carpeta. Quedan
afuera `README.md`, `supabase/*.sql` y `tools/`. Se agregan un `robots.txt` que
bloquea a los buscadores y cabeceras `X-Robots-Tag: noindex`, porque es una
demo y no tiene por qué aparecer en Google.

### Antes de que lo use gente de verdad

La demo sale con las contraseñas `123` para `1A`, `2A` y `3A`. Eso es cómodo
para mostrar, pero significa que **cualquiera que llegue a la URL puede entrar**
y ver el historial completo. Mientras siga así, no cargar patentes ni
departamentos reales: son datos personales de los visitantes del edificio.
