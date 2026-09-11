/* =========================================================
   Riglos Plaza - capa de datos contra Supabase

   Habla directo con la API REST (PostgREST) y con GoTrue usando
   fetch, sin la libreria supabase-js: la app sigue sin dependencias
   ni build.

   Expone window.RP. Todas las funciones devuelven promesas y
   tiran RpError con un mensaje ya listo para mostrarle a la gente.
   ========================================================= */

window.RP = (() => {
  'use strict';

  // Se normaliza lo que venga: una barra final o un espacio al pegar la
  // variable de entorno no tienen por que romper el arranque.
  const cfg = window.SUPABASE_CONFIG || {};
  const URL_BASE = String(cfg.URL || '').trim().replace(/\/+$/, '');
  const ANON = String(cfg.ANON_KEY || '').trim();

  const BASE = URL_BASE;
  const REST = `${BASE}/rest/v1`;
  const AUTH = `${BASE}/auth/v1`;

  // Cada departamento es un usuario. El mail es solo un identificador
  // interno: nunca se manda correo a esta direccion.
  const DOMINIO = 'riglosplaza.com.ar';
  // Se escribe el departamento ("1A"), pero si alguien pega el mail entero
  // tambien se acepta, para no trabarlo por un detalle de formato.
  const emailDe = valor => {
    const v = String(valor).trim().toLowerCase().replace(/\s+/g, '');
    return v.includes('@') ? v : `${v}@${DOMINIO}`;
  };

  const SESION_KEY = 'rp_auth_v1';

  // Devuelve null si esta todo bien, o el motivo concreto si falta algo.
  // El mensaje tiene que decir que arreglar, no solo que algo falta.
  function problemaDeConfig() {
    if (!window.SUPABASE_CONFIG) {
      return 'No se cargó supabase-config.js. Si es un deploy, revisá que el ' +
             'build command sea "sh tools/build.sh" y el output directory "dist".';
    }
    if (!URL_BASE || /TU-PROYECTO/i.test(URL_BASE)) {
      return 'Falta la URL del proyecto en supabase-config.js (o en la variable SUPABASE_URL).';
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_BASE)) {
      return `La URL del proyecto no tiene el formato esperado: "${URL_BASE}". ` +
             'Tiene que ser https://xxxx.supabase.co';
    }
    if (!ANON || /TU-ANON-KEY/i.test(ANON) || ANON.length < 20) {
      return 'Falta la anon key en supabase-config.js (o en la variable SUPABASE_ANON_KEY).';
    }
    return null;
  }

  const configurado = () => problemaDeConfig() === null;

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
      return new RpError('Los datos no cumplen una regla de la base.',
                         'RP_CHECK', cuerpo);
    }

    if (status === 401 || status === 403) {
      return new RpError('Tu sesion venció. Volvé a entrar.',
                         'RP_SESION', cuerpo);
    }
    if (status === 404) {
      return new RpError(
        'No se encontro la tabla o la funcion. Falta correr el SQL del esquema.',
        'RP_SIN_ESQUEMA', cuerpo);
    }

    return new RpError(msg || `Error ${status} al hablar con la base.`,
                       'RP_HTTP_' + status, cuerpo);
  }

  /* ---------------- Sesion ----------------
     Vive en sessionStorage: al cerrar la pestana hay que volver a
     entrar, que es lo que corresponde para un QR que usan distintas
     personas en el mismo telefono. */

  let sesion = null;

  function leerSesion() {
    try {
      const raw = sessionStorage.getItem(SESION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function guardarSesion(s) {
    sesion = s;
    try {
      if (s) sessionStorage.setItem(SESION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESION_KEY);
    } catch (e) { /* modo privado sin storage: la sesion dura lo que la pagina */ }
  }

  sesion = leerSesion();

  const headersBase = () => ({
    apikey: ANON,
    'Content-Type': 'application/json'
  });

  async function pedirAuth(ruta, body, extra) {
    if (!configurado()) {
      throw new RpError(problemaDeConfig(), 'RP_SIN_CONFIG');
    }
    let res;
    try {
      res = await fetch(AUTH + ruta, {
        method: 'POST',
        headers: Object.assign(headersBase(), extra || {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new RpError('Sin conexion con el servidor.', 'RP_SIN_RED', e.message);
    }

    const texto = await res.text();
    const datos = texto ? JSON.parse(texto) : null;

    if (!res.ok) {
      // GoTrue cambio de formato entre versiones: contemplamos los dos
      const codigo = (datos && (datos.error_code || datos.error)) || '';
      const msg = (datos && (datos.msg || datos.error_description || datos.message)) || '';
      if (/invalid[_ ]?(grant|credentials)/i.test(codigo) ||
          /invalid login credentials/i.test(msg)) {
        throw new RpError('Departamento o contraseña incorrectos.',
                          'RP_CREDENCIALES', datos);
      }
      throw new RpError(msg || `Error ${res.status} al iniciar sesion.`,
                        'RP_AUTH_' + res.status, datos);
    }
    return datos;
  }

  function guardarDesdeToken(datos) {
    guardarSesion({
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      // expires_at viene en segundos; lo pasamos a ms
      expira: (datos.expires_at
        ? datos.expires_at * 1000
        : Date.now() + (datos.expires_in || 3600) * 1000),
      userId: datos.user && datos.user.id,
      depto: datos.user && datos.user.user_metadata && datos.user.user_metadata.depto
    });
    return sesion;
  }

  async function iniciarSesion(depto, password) {
    const datos = await pedirAuth('/token?grant_type=password',
      { email: emailDe(depto), password: String(password) });
    return guardarDesdeToken(datos);
  }

  async function refrescarToken() {
    if (!sesion || !sesion.refresh_token) {
      throw new RpError('No hay sesion activa.', 'RP_SESION');
    }
    try {
      const datos = await pedirAuth('/token?grant_type=refresh_token',
        { refresh_token: sesion.refresh_token });
      return guardarDesdeToken(datos);
    } catch (e) {
      guardarSesion(null);          // el refresh no sirve mas
      throw new RpError('Tu sesion venció. Volvé a entrar.', 'RP_SESION');
    }
  }

  async function cerrarSesion() {
    const s = sesion;
    guardarSesion(null);
    if (!s) return;
    try {
      await pedirAuth('/logout', null,
        { Authorization: `Bearer ${s.access_token}` });
    } catch (e) { /* si falla, la sesion local ya se borro igual */ }
  }

  const haySesion = () => !!(sesion && sesion.access_token);
  const deptoActual = () => (sesion ? sesion.depto : null);

  // Refresca por adelantado si al token le queda menos de un minuto
  async function tokenVigente() {
    if (!haySesion()) return null;
    if (sesion.expira && sesion.expira - Date.now() < 60000) {
      await refrescarToken();
    }
    return sesion.access_token;
  }

  /* ---------------- Transporte ---------------- */

  async function pedir(ruta, opciones = {}, reintento = false) {
    if (!configurado()) {
      throw new RpError(problemaDeConfig(), 'RP_SIN_CONFIG');
    }

    const token = await tokenVigente();
    const headers = Object.assign({
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json'
    }, opciones.headers || {});

    let res;
    try {
      res = await fetch(REST + ruta, Object.assign({}, opciones, { headers }));
    } catch (e) {
      throw new RpError('Sin conexion con la base.', 'RP_SIN_RED', e.message);
    }

    // Token rechazado: se intenta refrescar una sola vez
    if (res.status === 401 && haySesion() && !reintento) {
      await refrescarToken();
      return pedir(ruta, opciones, true);
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

    if (rango) {
      const total = Number(String(rango).split('/')[1]);
      if (!Number.isNaN(total)) return { datos, total };
    }
    return datos;
  }

  /* ---------------- Mapeo de filas ---------------- */

  const ms = (iso) => (iso ? new Date(iso).getTime() : null);

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

  async function turnosActivos() {
    const filas = await pedir(
      `/turnos?select=${COLS}&egreso_real=is.null&order=cochera.asc`);
    return filas.map(aTurno);
  }

  async function historial(limite = 200) {
    const filas = await pedir(
      `/turnos?select=${COLS}&egreso_real=not.is.null` +
      `&order=egreso_real.desc&limit=${Number(limite) || 200}`);
    return filas.map(aTurno);
  }

  // Estado completo mas el cupo propio, todo en paralelo
  async function estado(limiteHistorial = 200) {
    const [activos, hist, cupo] = await Promise.all([
      turnosActivos(),
      historial(limiteHistorial),
      miCupo()
    ]);
    return { activos, historial: hist, cupo };
  }

  // Alta. El servidor pone ingreso, egreso previsto Y departamento:
  // el depto sale del usuario logueado, no de lo que mande el formulario.
  async function registrarIngreso({ cochera, patente, duracionMin }) {
    const filas = await pedir('/turnos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        cochera: Number(cochera),
        patente: String(patente).toUpperCase().replace(/[^A-Z0-9]/g, ''),
        duracion_min: Number(duracionMin)
      })
    });
    return aTurno(Array.isArray(filas) ? filas[0] : filas);
  }

  async function cerrarTurno(id) {
    const fila = await rpc('cerrar_turno', { p_id: id });
    return aTurno(fila);
  }

  // Invitaciones que le quedan al departamento de la sesion
  function miCupo() {
    return rpc('mi_cupo', {});
  }

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
    auth: {
      iniciarSesion,
      cerrarSesion,
      haySesion,
      depto: deptoActual,
      refrescarToken
    },
    ping,
    estado,
    turnosActivos,
    historial,
    registrarIngreso,
    cerrarTurno,
    miCupo,
    patenteLibreDesde
  };
})();
