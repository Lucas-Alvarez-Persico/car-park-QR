-- =========================================================
-- Riglos Plaza - Mantener el proyecto despierto
--
-- Correr DESPUES de schema.sql y auth.sql.
--
-- El plan Free de Supabase pausa los proyectos tras 7 dias sin
-- actividad. Esta funcion existe para que una tarea programada la
-- llame una vez por dia y la base registre movimiento.
-- =========================================================

-- Hace una lectura real contra una tabla (no solo "select now()"),
-- para que cuente como actividad de base y no solo de API.
-- No devuelve ningun dato del edificio: solo la hora del servidor.
create or replace function public.keepalive()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  select count(*) into n from public.turnos;
  return now();
end;
$$;

comment on function public.keepalive() is
  'Ping diario para que el plan Free no pause el proyecto. No expone datos.';

-- Es la unica funcion que se llama sin sesion iniciada.
grant execute on function public.keepalive() to anon;


-- ---------------------------------------------------------
-- De paso: cerrar las funciones que no tienen por que ser
-- publicas. Por defecto Supabase le da execute a anon sobre
-- todo lo que este en public, y estas tres filtran informacion
-- del edificio a cualquiera que tenga la anon key.
-- ---------------------------------------------------------

revoke execute on function public.cupo_restante(text)       from anon;
revoke execute on function public.patente_libre_desde(text) from anon;
revoke execute on function public.mi_cupo()                 from anon;
revoke execute on function public.cerrar_turno(uuid)        from anon;

-- Comprobacion: tiene que devolver la hora del servidor.
select public.keepalive();
