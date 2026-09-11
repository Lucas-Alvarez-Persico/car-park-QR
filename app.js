/* =========================================================
   Riglos Plaza - Cocheras de cortesia
   App estatica. Persistencia en localStorage.
   ========================================================= */

const CONFIG = {
  // Usuario hardcodeado (provisorio, hasta tener backend)
  USERS: { admin: '123' },
  // Cocheras disponibles. La foto se muestra mientras la cochera esta libre.
  SPOTS: [
    { id: 1, name: 'Cochera 1', foto: 'img/cochera-1.jpg' },
    { id: 2, name: 'Cochera 2', foto: 'img/cochera-2.jpg' }
  ],
  MAX_STAY_MS: 4 * 60 * 60 * 1000,   // estadia maxima: 4 h
  COOLDOWN_MS: 24 * 60 * 60 * 1000,  // misma patente: 1 vez cada 24 h
  MONTHLY_LIMIT: 5,                  // invitaciones por departamento y por mes
  HISTORY_MAX: 200
};

const STORE_KEY = 'rp_parking_v1';
const SESSION_KEY = 'rp_session_v1';

/* ================= Estado ================= */

let state = loadState();

function emptyState() {
  const spots = {};
  CONFIG.SPOTS.forEach(s => { spots[s.id] = null; });
  return { spots, history: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const base = emptyState();
    if (parsed && parsed.spots) {
      CONFIG.SPOTS.forEach(s => { base.spots[s.id] = parsed.spots[s.id] || null; });
    }
    if (parsed && Array.isArray(parsed.history)) base.history = parsed.history;
    return base;
  } catch (e) {
    return emptyState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('No se pudo guardar en este dispositivo');
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

function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}`;
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
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ================= Reglas de negocio ================= */

// Devuelve el ultimo ingreso registrado de una patente (activo o historico)
function lastEntryFor(plate) {
  let last = null;
  CONFIG.SPOTS.forEach(s => {
    const occ = state.spots[s.id];
    if (occ && occ.patente === plate && (!last || occ.ingreso > last.ingreso)) last = occ;
  });
  state.history.forEach(h => {
    if (h.patente === plate && (!last || h.ingreso > last.ingreso)) last = h;
  });
  return last;
}

// Invitaciones ya usadas por un departamento en el mes de la fecha de referencia.
// Cuenta las cocheras ocupadas ahora mas el historial.
function usosDelMes(depto, ref) {
  const clave = monthKey(ref);
  let usos = 0;

  CONFIG.SPOTS.forEach(s => {
    const occ = state.spots[s.id];
    if (occ && normalizeDepto(occ.depto) === depto && monthKey(occ.ingreso) === clave) usos++;
  });
  state.history.forEach(h => {
    if (normalizeDepto(h.depto) === depto && monthKey(h.ingreso) === clave) usos++;
  });

  return usos;
}

function cupoRestante(depto, ref) {
  return Math.max(0, CONFIG.MONTHLY_LIMIT - usosDelMes(depto, ref));
}

// null si puede ingresar; string con el motivo si esta bloqueada
function cooldownBlock(plate, now) {
  const activo = CONFIG.SPOTS
    .map(s => ({ spot: s, occ: state.spots[s.id] }))
    .find(x => x.occ && x.occ.patente === plate);

  if (activo) return `La patente ${plate} ya está estacionada en ${activo.spot.name}.`;

  const last = lastEntryFor(plate);
  if (!last) return null;

  const libreDesde = last.ingreso + CONFIG.COOLDOWN_MS;
  if (now < libreDesde) {
    return `La patente ${plate} ya usó la cortesía el ${fmtDateHour(last.ingreso)}. ` +
           `Podrá volver a ingresar el ${fmtDateHour(libreDesde)} (${fmtDuration(libreDesde - now)} restantes).`;
  }
  return null;
}

/* ================= Render ================= */

function render() {
  renderSpots();
  renderHistory();
  renderClock();
}

function renderClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' · ' + fmtHour(now.getTime());
}

function renderSpots() {
  const now = Date.now();
  const cont = $('#spots');
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
  $('#in-depto').value = '';
  $('#depto-cupo').hidden = true;
  $('#in-ingreso').value = fmtHour(now);
  $('#in-ingreso').dataset.ts = String(now);
  buildEgresoOptions(now);
  hideEntryError();

  $('#entry-modal').hidden = false;
  setTimeout(() => $('#in-patente').focus(), 50);
}

function closeEntryModal() {
  closeEgresoDropdown();
  $('#entry-modal').hidden = true;
  entrySpotId = null;
}

// Aviso en vivo del cupo mensual mientras se escribe el departamento
function renderCupo() {
  const el = $('#depto-cupo');
  const depto = normalizeDepto($('#in-depto').value);

  if (!depto) { el.hidden = true; return; }

  const now = Date.now();
  const restante = cupoRestante(depto, now);
  const total = CONFIG.MONTHLY_LIMIT;

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

function submitEntry(ev) {
  ev.preventDefault();
  if (entrySpotId === null) return;

  const plate = normalizePlate($('#in-patente').value);
  const depto = normalizeDepto($('#in-depto').value);
  const ingreso = Number($('#in-ingreso').dataset.ts);
  const egresoPrev = Number($('#in-egreso').value);

  if (!plate) return showEntryError('Ingresá la patente del vehículo.');
  if (!isValidPlate(plate)) {
    return showEntryError('Patente inválida. Formatos válidos: ABC123 o AB123CD.');
  }
  if (!depto) return showEntryError('Indicá el departamento que invita.');
  if (!egresoPrev) return showEntryError('Elegí la hora de egreso.');

  const bloqueo = cooldownBlock(plate, Date.now());
  if (bloqueo) return showEntryError(bloqueo);

  const restante = cupoRestante(depto, Date.now());
  if (restante === 0) {
    return showEntryError(
      `El departamento ${depto} ya usó sus ${CONFIG.MONTHLY_LIMIT} invitaciones de este mes. ` +
      `El cupo se renueva el ${fmtDate(nextMonthStart(Date.now()))}.`
    );
  }

  if (egresoPrev <= ingreso) {
    return showEntryError('La hora de egreso debe ser posterior al ingreso.');
  }
  if (egresoPrev - ingreso > CONFIG.MAX_STAY_MS) {
    return showEntryError(
      `La estadía máxima es de 4 h. El egreso no puede ser posterior a las ${fmtHour(ingreso + CONFIG.MAX_STAY_MS)}.`
    );
  }

  state.spots[entrySpotId] = { patente: plate, depto, ingreso, egresoPrev };
  saveState();
  closeEntryModal();
  render();
  const quedan = restante - 1;
  toast(`${plate} registrado hasta las ${fmtHour(egresoPrev)} · ` +
        (quedan === 0
          ? `el ${depto} se quedó sin cupo este mes`
          : `al ${depto} le ${quedan === 1 ? 'queda' : 'quedan'} ${quedan} este mes`));
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

  confirmAction = () => {
    const salida = Date.now();
    state.history.unshift({
      patente: occ.patente,
      depto: occ.depto,
      spotId,
      ingreso: occ.ingreso,
      egresoPrev: occ.egresoPrev,
      egresoReal: salida
    });
    state.history = state.history.slice(0, CONFIG.HISTORY_MAX);
    state.spots[spotId] = null;
    saveState();
    render();
    toast(`${occ.patente} se retiró · ${fmtDuration(salida - occ.ingreso)}`);
  };

  $('#confirm-modal').hidden = false;
}

function openClearHistoryConfirm() {
  if (!state.history.length) return toast('El historial ya está vacío');
  $('#confirm-title').textContent = 'Limpiar historial';
  $('#confirm-body').innerHTML =
    `<p>Se eliminarán <strong>${state.history.length}</strong> movimientos registrados. ` +
    `Las patentes dejarán de tener el bloqueo de 24 h. Esta acción no se puede deshacer.</p>`;
  confirmAction = () => {
    state.history = [];
    saveState();
    render();
    toast('Historial vacío');
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
  render();
}

function showLogin() {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  $('#login-form').reset();
  $('#login-error').hidden = true;
}

function submitLogin(ev) {
  ev.preventDefault();
  const user = $('#login-user').value.trim().toLowerCase();
  const pass = $('#login-pass').value;

  if (CONFIG.USERS[user] !== undefined && CONFIG.USERS[user] === pass) {
    sessionStorage.setItem(SESSION_KEY, user);
    showApp();
    return;
  }
  const err = $('#login-error');
  err.textContent = 'Usuario o contraseña incorrectos.';
  err.hidden = false;
  $('#login-pass').value = '';
  $('#login-pass').focus();
}

/* ================= Eventos ================= */

$('#login-form').addEventListener('submit', submitLogin);

$('#logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
});

$('#spots').addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const spotId = Number(btn.dataset.spot);
  if (btn.dataset.action === 'entry') openEntryModal(spotId);
  if (btn.dataset.action === 'exit') openExitConfirm(spotId);
});

$('#entry-form').addEventListener('submit', submitEntry);
$('#in-patente').addEventListener('input', ev => {
  ev.target.value = normalizePlate(ev.target.value);
  hideEntryError();
});
$('#in-depto').addEventListener('input', ev => {
  ev.target.value = ev.target.value.toUpperCase();
  hideEntryError();
  renderCupo();
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
$('#confirm-ok').addEventListener('click', () => {
  const fn = confirmAction;
  closeConfirm();
  if (fn) fn();
});
$('#clear-history').addEventListener('click', openClearHistoryConfirm);

document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (egresoDropdownAbierto()) return closeEgresoDropdown(); // primero el desplegable
  if (!$('#entry-modal').hidden) closeEntryModal();
  if (!$('#confirm-modal').hidden) closeConfirm();
});

// Si otra pestaña del mismo dispositivo modifica el estado, refrescamos
window.addEventListener('storage', ev => {
  if (ev.key !== STORE_KEY) return;
  state = loadState();
  if (!$('#app').hidden) render();
});

// Refresco de relojes y contadores
setInterval(() => {
  if (!$('#app').hidden) { renderSpots(); renderClock(); }
}, 15000);

/* ================= Arranque ================= */

if (sessionStorage.getItem(SESSION_KEY)) showApp();
else showLogin();
