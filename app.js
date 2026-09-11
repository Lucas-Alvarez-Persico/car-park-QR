/* =========================================================
   Riglos Plaza - Cocheras de cortesia
   App estatica. Los datos viven en Supabase (ver db.js).
   ========================================================= */

const CONFIG = {
  // Los usuarios viven en Supabase Auth: uno por departamento.
  // Cocheras disponibles. La foto se muestra mientras la cochera esta libre.
  SPOTS: [
    { id: 1, name: 'Cochera 1', foto: 'img/cochera-1.jpg' },
    { id: 2, name: 'Cochera 2', foto: 'img/cochera-2.jpg' }
  ],
  MAX_STAY_MS: 4 * 60 * 60 * 1000,   // estadia maxima: 4 h
  MONTHLY_LIMIT: 5,                  // invitaciones por departamento y por mes
  HISTORY_MAX: 200,
  REFRESH_MS: 30000,                 // cada cuanto se vuelve a leer la base
  TICK_MS: 15000                     // cada cuanto se redibujan los contadores
};

/* ================= Estado =================
   La base es la fuente de verdad. Esto es solo la copia en memoria
   de la ultima lectura, para poder dibujar sin volver a pedir. */

let state = { spots: {}, history: [], cupo: null };
let carga = 'inicial';   // inicial | cargando | listo | error
let errorCarga = null;
let refrescando = false;

function vaciarSpots() {
  const spots = {};
  CONFIG.SPOTS.forEach(s => { spots[s.id] = null; });
  return spots;
}

state.spots = vaciarSpots();

// Lee la base y deja el estado listo para dibujar.
async function cargarEstado() {
  const { activos, historial, cupo } = await RP.estado(CONFIG.HISTORY_MAX);
  const spots = vaciarSpots();
  activos.forEach(t => { if (t.spotId in spots) spots[t.spotId] = t; });
  state = { spots, history: historial, cupo };
}

// Si el token ya no sirve no hay nada que reintentar: hay que volver a entrar.
function sesionVencida(e) {
  if (e && e.codigo === 'RP_SESION') { showLogin('Tu sesión venció. Entrá de nuevo.'); return true; }
  return false;
}

// silencioso = refresco de fondo: si falla no rompe lo que ya se ve.
async function refrescar({ silencioso = false } = {}) {
  if (refrescando) return;
  refrescando = true;
  try {
    if (!silencioso) { carga = 'cargando'; renderSpots(); }
    await cargarEstado();
    carga = 'listo';
    errorCarga = null;
    ocultarBanner();
    render();
  } catch (e) {
    if (silencioso && carga === 'listo') {
      // Ya hay datos en pantalla: se avisa sin borrarlos
      mostrarBanner(`No se pudo actualizar: ${e.message}`);
    } else {
      carga = 'error';
      errorCarga = e;
      render();
    }
  } finally {
    refrescando = false;
  }
}

/* ================= Utilidades ================= */

const $ = sel => document.querySelector(sel);

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtHour(ms) {
  return new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDateHour(ms) {
  const d = new Date(ms);
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return `${fecha} ${fmtHour(ms)}`;
}

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function normalizePlate(str) {
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// "5 b" y "5B" son el mismo departamento
function normalizeDepto(str) {
  return String(str).toUpperCase().replace(/\s+/g, '');
}

// Primer dia del mes siguiente al de la fecha dada
function nextMonthStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// AAA123 (viejo) o AB123CD (Mercosur)
function isValidPlate(plate) {
  return /^[A-Z]{3}[0-9]{3}$/.test(plate) || /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(plate);
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

// Aviso persistente arriba de las cocheras (fallas de refresco)
function mostrarBanner(msg) {
  let el = $('#banner');
  if (!el) {
    el = document.createElement('p');
    el.id = 'banner';
    el.className = 'banner';
    $('#spots').before(el);
  }
  el.textContent = msg;
  el.hidden = false;
}
function ocultarBanner() {
  const el = $('#banner');
  if (el) el.hidden = true;
}

/* ================= Reglas de negocio =================
   Quien realmente las hace cumplir es la base (ver supabase/schema.sql).
   Lo de aca es solo para avisar antes de mandar el pedido. */

// Si la patente ya esta en una cochera lo sabemos sin consultar
function patenteEstacionada(plate) {
  const encontrado = CONFIG.SPOTS
    .map(s => ({ spot: s, occ: state.spots[s.id] }))
    .find(x => x.occ && x.occ.patente === plate);
  return encontrado ? encontrado.spot.name : null;
}

/* ================= Render ================= */

function render() {
  renderMiDepto();
  renderSpots();
  renderHistory();
  renderClock();
}

// Departamento logueado y cuantas invitaciones le quedan este mes
function renderMiDepto() {
  const el = $('#mi-depto');
  const depto = RP.auth.depto();
  if (!depto) { el.hidden = true; return; }

  el.hidden = false;
  if (state.cupo === null || state.cupo === undefined) {
    el.className = 'depto-chip';
    el.textContent = depto;
    return;
  }
  const n = state.cupo;
  el.className = 'depto-chip ' + (n === 0 ? 'chip-none' : n === 1 ? 'chip-warn' : 'chip-ok');
  el.innerHTML = `<strong>${esc(depto)}</strong>` +
    `<span>${n === 0 ? 'sin cupo' : `${n} de ${CONFIG.MONTHLY_LIMIT}`}</span>`;
}

function renderClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' · ' + fmtHour(now.getTime());
}

function renderSpots() {
  const cont = $('#spots');

  if (carga === 'inicial' || carga === 'cargando') {
    cont.innerHTML = CONFIG.SPOTS.map(() =>
      '<article class="spot spot-cargando"><div class="spot-body">' +
      '<div class="skel skel-line"></div><div class="skel skel-plate"></div>' +
      '<div class="skel skel-line"></div></div></article>').join('');
    return;
  }

  if (carga === 'error') {
    const msg = errorCarga ? errorCarga.message : 'Error desconocido.';
    cont.innerHTML = `
      <article class="spot spot-error">
        <div class="spot-body">
          <h2 class="spot-name">No se pudo leer el estado de las cocheras</h2>
          <p class="spot-empty">${esc(msg)}</p>
          <p class="spot-empty"><strong>No registres ingresos hasta que
             esto se resuelva:</strong> sin datos no hay forma de saber si
             las cocheras están libres.</p>
          <button class="btn btn-primary btn-block" data-action="reintentar">Reintentar</button>
        </div>
      </article>`;
    return;
  }

  const now = Date.now();
  cont.innerHTML = CONFIG.SPOTS.map(spot => {
    const occ = state.spots[spot.id];

    // La foto acompana los dos estados: arriba cuando la cochera esta libre,
    // de fondo tenido en bordo cuando esta ocupada.
    const foto = (alt) => spot.foto
      ? `<div class="spot-photo"${alt ? '' : ' aria-hidden="true"'}>
           <img src="${esc(spot.foto)}" alt="${esc(alt)}" loading="lazy" decoding="async">
         </div>`
      : '';

    if (!occ) {
      return `
        <article class="spot spot-free">
          ${foto(`${spot.name} vacía`)}
          <div class="spot-body">
            <div class="spot-head">
              <h2 class="spot-name">${esc(spot.name)}</h2>
              <span class="badge badge-free">Libre</span>
            </div>
            <p class="spot-empty">Sin vehículo. Registrá el ingreso al momento en que el auto entra.</p>
            <button class="btn btn-green btn-block" data-action="entry" data-spot="${spot.id}">Registrar ingreso</button>
          </div>
        </article>`;
    }

    const excedido = now > occ.egresoPrev;
    const cls = excedido ? 'spot-over' : 'spot-busy';
    const badge = excedido
      ? '<span class="badge badge-over">Excedida</span>'
      : '<span class="badge badge-busy">Ocupada</span>';
    const restante = excedido
      ? `<p class="remaining over">Excedida por ${fmtDuration(now - occ.egresoPrev)}</p>`
      : `<p class="remaining">Restan ${fmtDuration(occ.egresoPrev - now)}</p>`;

    // Proporcion de la estadia ya consumida, para la barra
    const total = Math.max(1, occ.egresoPrev - occ.ingreso);
    const pct = Math.max(0, Math.min(100, ((now - occ.ingreso) / total) * 100));

    return `
      <article class="spot ${cls}">
        ${foto('')}
        <div class="spot-body">
          <div class="spot-head">
            <h2 class="spot-name">${esc(spot.name)}</h2>
            ${badge}
          </div>
          <div><span class="plate">${esc(occ.patente)}</span></div>
          <dl class="spot-data">
            <div class="data"><dt>Departamento</dt><dd>${esc(occ.depto)}</dd></div>
            <div class="data"><dt>Permanencia</dt><dd>${fmtDuration(now - occ.ingreso)}</dd></div>
            <div class="data"><dt>Ingreso</dt><dd>${fmtHour(occ.ingreso)}</dd></div>
            <div class="data"><dt>Egreso previsto</dt><dd>${fmtHour(occ.egresoPrev)}</dd></div>
          </dl>
          <div class="meter-row">
            <div class="meter"><div class="meter-fill" style="width:${pct.toFixed(1)}%"></div></div>
            ${restante}
          </div>
          <button class="btn btn-red btn-block" data-action="exit" data-spot="${spot.id}">Marcar salida</button>
        </div>
      </article>`;
  }).join('');
}

function renderHistory() {
  const cont = $('#history');
  const cuenta = $('#history-count');

  if (carga !== 'listo') { cont.innerHTML = ''; cuenta.textContent = ''; return; }

  cuenta.textContent = state.history.length
    ? `${state.history.length} ${state.history.length === 1 ? 'registro' : 'registros'}`
    : '';

  if (!state.history.length) {
    cont.innerHTML = '<p class="empty-state">Todavía no hay movimientos registrados.</p>';
    return;
  }
  const rows = state.history.map(h => {
    const spot = CONFIG.SPOTS.find(s => s.id === h.spotId);
    const exceso = h.egresoReal > h.egresoPrev;
    return `
      <tr>
        <td class="mono">${esc(h.patente)}</td>
        <td>${esc(h.depto)}</td>
        <td class="muted">${esc(spot ? spot.name : '-')}</td>
        <td>${fmtDateHour(h.ingreso)}</td>
        <td>${fmtDateHour(h.egresoReal)}</td>
        <td>${fmtDuration(h.egresoReal - h.ingreso)}
            ${exceso ? `<span class="tag tag-over">+${fmtDuration(h.egresoReal - h.egresoPrev)}</span>` : ''}
        </td>
      </tr>`;
  }).join('');

  cont.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Patente</th><th>Depto</th><th>Cochera</th>
          <th>Ingreso</th><th>Salida</th><th>Permanencia</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ================= Modal de ingreso ================= */

let entrySpotId = null;
let enviando = false;

const EGRESO_STEP_MS = 30 * 60 * 1000; // saltos de 30 min

// Arranca en la hora de ingreso y avanza de a 30 min hasta la estadia maxima.
// Solo se listan horarios permitidos: lo que excede el maximo no se ofrece.
function buildEgresoOptions(ingreso) {
  const list = $('#egreso-list');
  list.innerHTML = '';
  const pasos = CONFIG.MAX_STAY_MS / EGRESO_STEP_MS;

  for (let i = 1; i <= pasos; i++) {
    const dur = i * EGRESO_STEP_MS;
    const ts = ingreso + dur;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dropdown-item';
    item.dataset.ts = String(ts);
    item.dataset.min = String(i * 30);   // lo que se le manda a la base
    item.setAttribute('role', 'option');
    item.innerHTML =
      `<span class="dd-hour">${fmtHour(ts)}</span><span class="dd-dur">${fmtDuration(dur)}</span>`;
    list.appendChild(item);
  }

  closeEgresoDropdown();
  selectEgreso(ingreso + CONFIG.MAX_STAY_MS); // por defecto, el maximo
}

function selectEgreso(ts) {
  const ingreso = Number($('#in-ingreso').dataset.ts);
  $('#in-egreso').value = String(ts);
  $('#egreso-label').innerHTML =
    `<span class="dd-hour">${fmtHour(ts)}</span>` +
    `<span class="dd-dur">${fmtDuration(ts - ingreso)}</span>`;

  Array.from($('#egreso-list').children).forEach(item => {
    const elegido = item.dataset.ts === String(ts);
    item.classList.toggle('is-selected', elegido);
    item.setAttribute('aria-selected', elegido ? 'true' : 'false');
    if (elegido) $('#in-egreso').dataset.min = item.dataset.min;
  });
}

// La lista es position:fixed, asi que la ubicamos a mano debajo del boton.
// De este modo flota sobre el modal sin alterar su alto ni quedar recortada.
function positionEgresoList() {
  const r = $('#egreso-btn').getBoundingClientRect();
  const list = $('#egreso-list');

  const ancho = Math.max(r.width, 180);
  const left = Math.min(r.left, window.innerWidth - ancho - 12);
  const alto = window.innerHeight - r.bottom - 16; // espacio libre hacia abajo

  list.style.width = `${ancho}px`;
  list.style.left = `${Math.max(12, left)}px`;
  list.style.top = `${r.bottom + 6}px`;
  list.style.maxHeight = `${Math.max(96, Math.min(330, alto))}px`;
}

function openEgresoDropdown() {
  $('#egreso-dd').classList.add('is-open');
  $('#egreso-btn').setAttribute('aria-expanded', 'true');

  const list = $('#egreso-list');
  list.hidden = false;
  positionEgresoList();
  list.scrollTop = 0; // siempre arranca en la opcion de 30 min

  window.addEventListener('resize', positionEgresoList);
  window.addEventListener('scroll', positionEgresoList, true);
}

function closeEgresoDropdown() {
  $('#egreso-dd').classList.remove('is-open');
  $('#egreso-btn').setAttribute('aria-expanded', 'false');
  $('#egreso-list').hidden = true;

  window.removeEventListener('resize', positionEgresoList);
  window.removeEventListener('scroll', positionEgresoList, true);
}

function egresoDropdownAbierto() {
  return !$('#egreso-list').hidden;
}

function openEntryModal(spotId) {
  const spot = CONFIG.SPOTS.find(s => s.id === spotId);
  if (!spot || state.spots[spotId]) return;

  entrySpotId = spotId;
  const now = Date.now();

  $('#entry-spot-label').textContent =
    `${spot.name} · el ingreso queda registrado ahora, no se admiten reservas.`;
  $('#in-patente').value = '';
  $('#in-depto').value = RP.auth.depto() || '';
  renderCupoModal();
  $('#in-ingreso').value = fmtHour(now);
  $('#in-ingreso').dataset.ts = String(now);
  buildEgresoOptions(now);
  hideEntryError();
  setEnviando(false);

  $('#entry-modal').hidden = false;
  setTimeout(() => $('#in-patente').focus(), 50);
}

function closeEntryModal() {
  if (enviando) return;
  closeEgresoDropdown();
  $('#entry-modal').hidden = true;
  entrySpotId = null;
}

function setEnviando(v) {
  enviando = v;
  const btn = $('#entry-submit');
  btn.disabled = v;
  btn.textContent = v ? 'Registrando…' : 'Registrar ingreso';
}

/* El cupo ya no se consulta por tecla: el departamento es el de la sesion
   y su cupo viene en la misma lectura que el resto del estado. */
function renderCupoModal() {
  const el = $('#depto-cupo');
  const depto = RP.auth.depto();
  const restante = state.cupo;

  if (!depto || restante === null || restante === undefined) { el.hidden = true; return; }

  const total = CONFIG.MONTHLY_LIMIT;
  const now = Date.now();

  el.className = 'cupo ' + (restante === 0 ? 'cupo-none' : restante === 1 ? 'cupo-warn' : 'cupo-ok');
  el.hidden = false;

  if (restante === 0) {
    el.innerHTML = `Depto <strong>${esc(depto)}</strong>: sin cupo. Ya usó las ${total} ` +
                   `invitaciones de este mes. Se renueva el ${fmtDate(nextMonthStart(now))}.`;
  } else {
    el.innerHTML = `Depto <strong>${esc(depto)}</strong>: ` +
                   `${restante === 1 ? 'queda' : 'quedan'} <strong>${restante}</strong> ` +
                   `${restante === 1 ? 'invitación' : 'invitaciones'} de ${total} este mes.`;
  }
}

function showEntryError(msg) {
  const el = $('#entry-error');
  el.textContent = msg;
  el.hidden = false;
}
function hideEntryError() { $('#entry-error').hidden = true; }

async function submitEntry(ev) {
  ev.preventDefault();
  if (entrySpotId === null || enviando) return;

  const plate = normalizePlate($('#in-patente').value);
  const duracionMin = Number($('#in-egreso').dataset.min);

  // Chequeos locales: solo para no mandar un pedido que ya sabemos que falla
  if (!plate) return showEntryError('Ingresá la patente del vehículo.');
  if (!isValidPlate(plate)) {
    return showEntryError('Patente inválida. Formatos válidos: ABC123 o AB123CD.');
  }
  if (!duracionMin) return showEntryError('Elegí la hora de egreso.');
  if (state.cupo === 0) {
    return showEntryError(
      `El departamento ${RP.auth.depto()} ya usó sus ${CONFIG.MONTHLY_LIMIT} ` +
      `invitaciones de este mes. El cupo se renueva el ${fmtDate(nextMonthStart(Date.now()))}.`);
  }

  const dondeEsta = patenteEstacionada(plate);
  if (dondeEsta) {
    return showEntryError(`La patente ${plate} ya está estacionada en ${dondeEsta}.`);
  }

  hideEntryError();
  setEnviando(true);
  try {
    // El resto de las reglas (cooldown, cupo, cochera libre) las decide
    // la base, que es la unica que ve lo que hicieron los demas telefonos.
    // El depto lo pone el servidor a partir del usuario logueado
    const turno = await RP.registrarIngreso(
      { cochera: entrySpotId, patente: plate, duracionMin });

    setEnviando(false);
    closeEntryModal();
    await refrescar({ silencioso: true });

    toast(`${turno.patente} registrado hasta las ${fmtHour(turno.egresoPrev)}`);
  } catch (e) {
    setEnviando(false);
    if (sesionVencida(e)) return;
    showEntryError(e.message);
    // Si la cochera se ocupo mientras tanto, conviene mostrar la realidad
    if (e.codigo === 'RP_COCHERA_TOMADA' || e.codigo === 'RP_PATENTE_ACTIVA') {
      refrescar({ silencioso: true });
    }
  }
}

/* ================= Salida ================= */

let confirmAction = null;

function openExitConfirm(spotId) {
  const occ = state.spots[spotId];
  const spot = CONFIG.SPOTS.find(s => s.id === spotId);
  if (!occ || !spot) return;

  const now = Date.now();
  const exceso = now > occ.egresoPrev ? now - occ.egresoPrev : 0;

  $('#confirm-title').textContent = 'Marcar salida';
  $('#confirm-body').innerHTML = `
    <p>Confirmá que el vehículo <strong>${esc(occ.patente)}</strong> se retiró de ${esc(spot.name)}.</p>
    <div class="confirm-list">
      <div><span>Departamento</span><span>${esc(occ.depto)}</span></div>
      <div><span>Ingreso</span><span>${fmtHour(occ.ingreso)}</span></div>
      <div><span>Salida</span><span>${fmtHour(now)}</span></div>
      <div><span>Permanencia</span><span>${fmtDuration(now - occ.ingreso)}</span></div>
      ${exceso ? `<div><span>Exceso</span><span>${fmtDuration(exceso)}</span></div>` : ''}
    </div>`;

  confirmAction = async () => {
    // La hora de salida la pone el servidor, no este telefono
    const cerrado = await RP.cerrarTurno(occ.id);
    await refrescar({ silencioso: true });
    toast(`${cerrado.patente} se retiró · ${fmtDuration(cerrado.egresoReal - cerrado.ingreso)}`);
  };

  $('#confirm-modal').hidden = false;
}

function closeConfirm() {
  $('#confirm-modal').hidden = true;
  confirmAction = null;
}

/* ================= Sesion ================= */

function showApp() {
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  renderMiDepto();
  renderClock();
  refrescar();
}

function showLogin(motivo) {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  $('#login-form').reset();
  setEntrando(false);
  state = { spots: vaciarSpots(), history: [], cupo: null };
  carga = 'inicial';

  const err = $('#login-error');
  if (motivo) { err.textContent = motivo; err.hidden = false; }
  else err.hidden = true;
}

let entrando = false;
function setEntrando(v) {
  entrando = v;
  const btn = $('#login-form button[type="submit"]');
  btn.disabled = v;
  btn.textContent = v ? 'Entrando…' : 'Ingresar';
}

async function submitLogin(ev) {
  ev.preventDefault();
  if (entrando) return;

  const depto = normalizeDepto($('#login-user').value);
  const pass = $('#login-pass').value;
  const err = $('#login-error');

  if (!depto) {
    err.textContent = 'Indicá tu departamento.';
    err.hidden = false;
    return;
  }

  err.hidden = true;
  setEntrando(true);
  try {
    await RP.auth.iniciarSesion(depto, pass);
    setEntrando(false);
    showApp();
  } catch (e) {
    setEntrando(false);
    err.textContent = e.message;
    err.hidden = false;
    $('#login-pass').value = '';
    $('#login-pass').focus();
  }
}

/* ================= Eventos ================= */

$('#login-form').addEventListener('submit', submitLogin);

$('#logout-btn').addEventListener('click', async () => {
  await RP.auth.cerrarSesion();
  showLogin();
});

$('#spots').addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'reintentar') return refrescar();
  const spotId = Number(btn.dataset.spot);
  if (btn.dataset.action === 'entry') openEntryModal(spotId);
  if (btn.dataset.action === 'exit') openExitConfirm(spotId);
});

$('#entry-form').addEventListener('submit', submitEntry);
$('#in-patente').addEventListener('input', ev => {
  ev.target.value = normalizePlate(ev.target.value);
  hideEntryError();
});
$('#egreso-btn').addEventListener('click', () => {
  if (egresoDropdownAbierto()) closeEgresoDropdown();
  else openEgresoDropdown();
});

$('#egreso-list').addEventListener('click', ev => {
  const item = ev.target.closest('.dropdown-item');
  if (!item) return;
  selectEgreso(Number(item.dataset.ts));
  closeEgresoDropdown();
  hideEntryError();
});

// clic fuera del desplegable lo cierra
document.addEventListener('click', ev => {
  if (!egresoDropdownAbierto()) return;
  if (!ev.target.closest('#egreso-dd')) closeEgresoDropdown();
});

$('#entry-modal').addEventListener('click', ev => {
  if (ev.target.closest('[data-close]')) closeEntryModal();
});
$('#confirm-modal').addEventListener('click', ev => {
  if (ev.target.closest('[data-close]')) closeConfirm();
});

$('#confirm-ok').addEventListener('click', async () => {
  const fn = confirmAction;
  if (!fn) return;
  const btn = $('#confirm-ok');
  btn.disabled = true;
  btn.textContent = 'Confirmando…';
  try {
    await fn();
    closeConfirm();
  } catch (e) {
    closeConfirm();
    if (sesionVencida(e)) return;
    toast(e.message);
    refrescar({ silencioso: true });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar';
  }
});

document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (egresoDropdownAbierto()) return closeEgresoDropdown(); // primero el desplegable
  if (!$('#entry-modal').hidden) closeEntryModal();
  if (!$('#confirm-modal').hidden) closeConfirm();
});

/* ================= Refresco =================
   Los datos son compartidos: otro vecino puede registrar desde su
   telefono en cualquier momento. Se vuelve a leer cada tanto, y sobre
   todo al volver a la pestana, que es el caso real en un celular. */

setInterval(() => {
  if (!$('#app').hidden && carga === 'listo') { renderSpots(); renderClock(); }
}, CONFIG.TICK_MS);

setInterval(() => {
  if (!$('#app').hidden && document.visibilityState === 'visible') {
    refrescar({ silencioso: true });
  }
}, CONFIG.REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#app').hidden) {
    refrescar({ silencioso: true });
  }
});

/* ================= Arranque ================= */

if (RP.auth.haySesion()) showApp();
else showLogin();
