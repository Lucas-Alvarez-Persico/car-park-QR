/* =========================================================
   Riglos Plaza - capa de datos contra Supabase

   Habla directo con la API REST (PostgREST) usando fetch, sin
   la libreria supabase-js: la app sigue sin dependencias ni build.

   Expone window.RP. Todas las funciones devuelven promesas y
   tiran RpError con un mensaje ya listo para mostrarle a la gente.
   ========================================================= */

window.RP = (() => {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  const REST = `${String(cfg.URL || '').replace(/\/+$/, '')}/rest/v1`;

  const configurado = () =>
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(cfg.URL || '')) &&
    String(cfg.ANON_KEY || '').length > 20;

  /* ---------------- Errores ---------------- */

  class RpError extends Error {
    constructor(mensaje, codigo, detalle) {
      super(mensaje);
      this.name = 'RpError';
      this.codigo = codigo || 'RP_DESCONOCIDO';
      this.detalle = detalle || null;
    }
  }

  // Traduce el error crudo de Postgres/PostgREST a algo mostrable.
  function traducir(status, cuerpo) {
    const hint = cuerpo && cuerpo.hint;
    const code = cuerpo && cuerpo.code;
    const msg = (cuerpo && cuerpo.message) || '';

    // Las reglas propias ya vienen con el mensaje escrito desde el trigger
    if (hint && hint.startsWith('RP_')) return new RpError(msg, hint, cuerpo);

    // Unicidad: dos personas registrando al mismo tiempo
    if (code === '23505') {
      if (msg.includes('turnos_una_por_cochera')) {
        return new RpError(
          'Esa cochera acaba de ser ocupada por otra persona.',
          'RP_COCHERA_TOMADA', cuerpo);
      }
      if (msg.includes('turnos_una_por_patente')) {
        return new RpError(
          'Esa patente ya figura estacionada en una cochera.',
          'RP_PATENTE_ACTIVA', cuerpo);
      }
      return new RpError('El registro ya existe.', 'RP_DUPLICADO', cuerpo);
    }

    // Restricciones de formato
    if (code === '23514') {
      if (msg.includes('patente_formato')) {
        return new RpError(
          'Patente invalida. Formatos validos: ABC123 o AB123CD.',
          'RP_PATENTE_FORMATO', cuerpo);
      }
      if (msg.includes('duracion_valida')) {
        return new RpError(
          'La duracion tiene que ir de a 30 minutos, hasta 4 h.',
          'RP_DURACION', cuerpo);
      }
      if (msg.includes('depto')) {
        return new RpError('Departamento invalido.', 'RP_DEPTO', cuerpo);
      }
      return new RpError('Los datos no cumplen una regla de la base.',
                         'RP_CHECK', cuerpo);
    }

    if (status === 401 || status === 403) {
      return new RpError(
        'La base rechazo la conexion. Revisar la anon key y las politicas de RLS.',
        'RP_NO_AUTORIZADO', cuerpo);
    }
    if (status === 404) {
      return new RpError(
        'No se encontro la tabla o la funcion. Falta correr schema.sql.',
        'RP_SIN_ESQUEMA', cuerpo);
    }

    return new RpError(msg || `Error ${status} al hablar con la base.`,
                       'RP_HTTP_' + status, cuerpo);
  }

  /* ---------------- Transporte ---------------- */

  async function pedir(ruta, opciones = {}) {
    if (!configurado()) {
      throw new RpError(
        'Falta completar supabase-config.js con la URL y la anon key del proyecto.',
        'RP_SIN_CONFIG');
    }

    const headers = Object.assign({
      apikey: cfg.ANON_KEY,
      Authorization: `Bearer ${cfg.ANON_KEY}`,
      'Content-Type': 'application/json'
    }, opciones.headers || {});

    let res;
    try {
      res = await fetch(REST + ruta, Object.assign({}, opciones, { headers }));
    } catch (e) {
      throw new RpError('Sin conexion con la base.', 'RP_SIN_RED', e.message);
    }

    if (!res.ok) {
      let cuerpo = null;
      try { cuerpo = await res.json(); } catch (e) { /* respuesta sin JSON */ }
      throw traducir(res.status, cuerpo);
    }

    if (res.status === 204) return null;

    const rango = res.headers.get('content-range');
    const texto = await res.text();
    const datos = texto ? JSON.parse(texto) : null;

    // Para los pedidos con count=exact devolvemos tambien el total
    if (rango) {
      const total = Number(String(rango).split('/')[1]);
      if (!Number.isNaN(total)) return { datos, total };
    }
    return datos;
  }

  /* ---------------- Mapeo de filas ---------------- */

  const ms = (iso) => (iso ? new Date(iso).getTime() : null);

  // Pasa una fila de la base a la forma que ya usa la app
  function aTurno(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      spotId: fila.cochera,
      patente: fila.patente,
      depto: fila.depto,
      duracionMin: fila.duracion_min,
      ingreso: ms(fila.ingreso),
      egresoPrev: ms(fila.egreso_previsto),
      egresoReal: ms(fila.egreso_real)
    };
  }

  /* ---------------- Pedidos ---------------- */

  const COLS = 'id,cochera,patente,depto,duracion_min,ingreso,egreso_previsto,egreso_real';

  // Turnos abiertos = cocheras ocupadas ahora
  async function turnosActivos() {
    const filas = await pedir(
      `/turnos?select=${COLS}&egreso_real=is.null&order=cochera.asc`);
    return filas.map(aTurno);
  }

  // Turnos cerrados = historial, del mas reciente al mas viejo
  async function historial(limite = 200) {
    const filas = await pedir(
      `/turnos?select=${COLS}&egreso_real=not.is.null` +
      `&order=egreso_real.desc&limit=${Number(limite) || 200}`);
    return filas.map(aTurno);
  }

  // Las dos cosas de una, en paralelo
  async function estado(limiteHistorial = 200) {
    const [activos, hist] = await Promise.all([
      turnosActivos(),
      historial(limiteHistorial)
    ]);
    return { activos, historial: hist };
  }

  // Alta. El servidor pone ingreso y egreso previsto: aca solo va
  // cuanto dura la estadia, en minutos.
  async function registrarIngreso({ cochera, patente, depto, duracionMin }) {
    const filas = await pedir('/turnos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        cochera: Number(cochera),
        patente: String(patente).toUpperCase().replace(/[^A-Z0-9]/g, ''),
        depto: String(depto).toUpperCase().replace(/\s+/g, ''),
        duracion_min: Number(duracionMin)
      })
    });
    return aTurno(Array.isArray(filas) ? filas[0] : filas);
  }

  // Cierre. La hora de salida tambien la pone el servidor.
  async function cerrarTurno(id) {
    const fila = await rpc('cerrar_turno', { p_id: id });
    return aTurno(fila);
  }

  // Invitaciones que le quedan al departamento este mes
  function cupoRestante(depto) {
    return rpc('cupo_restante', { p_depto: String(depto).toUpperCase().replace(/\s+/g, '') });
  }

  // Fecha desde la que la patente puede volver, o null si puede entrar ya
  async function patenteLibreDesde(patente) {
    const iso = await rpc('patente_libre_desde', {
      p_patente: String(patente).toUpperCase().replace(/[^A-Z0-9]/g, '')
    });
    return ms(iso);
  }

  function rpc(nombre, args) {
    return pedir(`/rpc/${nombre}`, {
      method: 'POST',
      body: JSON.stringify(args || {})
    });
  }

  // Prueba de vida: confirma que hay tabla, permisos y conexion
  async function ping() {
    const r = await pedir('/turnos?select=id&limit=1', {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' }
    });
    return { ok: true, total: r && typeof r.total === 'number' ? r.total : 0 };
  }

  return {
    RpError,
    configurado,
    ping,
    estado,
    turnosActivos,
    historial,
    registrarIngreso,
    cerrarTurno,
    cupoRestante,
    patenteLibreDesde
  };
})();
