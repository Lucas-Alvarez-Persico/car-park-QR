-- =========================================================
-- Riglos Plaza - Permisos de ejecucion de funciones
--
-- Correr DESPUES de schema.sql, auth.sql y keepalive.sql.
-- Se puede volver a correr sin problema.
--
-- POR QUE EXISTE ESTE ARCHIVO
-- Postgres concede EXECUTE a PUBLIC en toda funcion nueva, y los
-- roles anon y authenticated heredan de PUBLIC. Por eso un
-- "revoke ... from anon" NO alcanza: hay que revocar de PUBLIC y
-- recien despues conceder a quien corresponda.
--
-- Sin esto, cualquiera con la anon key (que es publica, viaja en el
-- JS del sitio) podia ejecutar crear_depto() y darse de alta un
-- departamento propio.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Cerrar todo
-- ---------------------------------------------------------

revoke execute on function public.crear_depto(text, text)      from public, anon, authenticated;
revoke execute on function public.cupo_restante(text)          from public, anon, authenticated;
revoke execute on function public.patente_libre_desde(text)    from public, anon, authenticated;
revoke execute on function public.mi_cupo()                    from public, anon, authenticated;
revoke execute on function public.mi_depto()                   from public, anon, authenticated;
revoke execute on function public.cerrar_turno(uuid)           from public, anon, authenticated;
revoke execute on function public.keepalive()                  from public, anon, authenticated;
revoke execute on function public.rp_limite_mensual()          from public, anon, authenticated;
revoke execute on function public.rp_cooldown()                from public, anon, authenticated;
revoke execute on function public.rp_zona()                    from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2. Abrir solo lo necesario
-- ---------------------------------------------------------

-- Lo unico que se llama sin sesion: el ping diario del cron.
-- No devuelve ningun dato del edificio.
grant execute on function public.keepalive() to anon, authenticated, service_role;

-- Lo que usa la app, ya con el vecino logueado.
grant execute on function public.cupo_restante(text)       to authenticated, service_role;
grant execute on function public.patente_libre_desde(text) to authenticated, service_role;
grant execute on function public.mi_cupo()                 to authenticated, service_role;
grant execute on function public.mi_depto()                to authenticated, service_role;
grant execute on function public.cerrar_turno(uuid)        to authenticated, service_role;

-- crear_depto() NO se concede a nadie a proposito: da de alta usuarios.
-- Se sigue pudiendo correr desde el SQL Editor, que actua como el dueño
-- de la funcion y no necesita permiso explicito.

-- Los parametros del reglamento no hacen falta desde afuera: los triggers
-- son security definer y corren como dueño, asi que los ven igual.


-- ---------------------------------------------------------
-- 3. Que las funciones NUEVAS no nazcan abiertas
-- ---------------------------------------------------------
-- Sin esto, la proxima funcion que se cree vuelve a quedar publica
-- y hay que acordarse de cerrarla a mano.

alter default privileges in schema public
  revoke execute on functions from public, anon;


-- ---------------------------------------------------------
-- 4. Comprobacion
--
-- anon_puede tiene que ser true SOLO en keepalive.
-- crear_depto tiene que estar en false en las dos columnas.
-- ---------------------------------------------------------

select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as logueado_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
 order by 1;
