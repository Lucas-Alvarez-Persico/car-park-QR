-- =========================================================
-- Riglos Plaza - Cocheras de cortesia
-- Esquema para Supabase (Postgres). Pegar entero en el
-- SQL Editor del proyecto y ejecutar una sola vez.
-- =========================================================

-- Un turno = una estadia. Mientras egreso_real es null la cochera esta
-- ocupada; cuando se completa, el mismo registro pasa a ser historial.
-- No hay dos tablas: el estado actual es una vista del mismo dato.

create table if not exists public.turnos (
  id               uuid         primary key default gen_random_uuid(),
  cochera          smallint     not null,
  patente          text         not null,
  depto            text         not null,
  duracion_min     smallint     not null,
  -- Los tiempos los pone el servidor, nunca el telefono: las reglas son
  -- todas temporales y no se puede confiar en el reloj de cada visitante.
  ingreso          timestamptz  not null default now(),
  egreso_previsto  timestamptz  not null,   -- lo calcula el trigger de alta
  egreso_real      timestamptz,
  creado_en        timestamptz  not null default now(),

  constraint cochera_valida   check (cochera between 1 and 2),
  constraint duracion_valida  check (duracion_min between 30 and 240
                                     and duracion_min % 30 = 0),
  constraint patente_normal   check (patente = upper(patente)),
  constraint patente_formato  check (patente ~ '^[A-Z]{3}[0-9]{3}$'
                                     or patente ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$'),
  constraint depto_normal     check (depto = upper(depto) and depto !~ '\s'),
  constraint depto_no_vacio   check (length(depto) between 1 and 12),
  constraint salida_posterior check (egreso_real is null or egreso_real >= ingreso)
);

comment on table public.turnos is
  'Estadias en las cocheras de cortesia. egreso_real null = cochera ocupada.';

-- ---------------------------------------------------------
-- Unicidad: estas dos reglas quedan a nivel base de datos
-- para que dos celulares registrando a la vez no las rompan.
-- ---------------------------------------------------------

-- Una sola estadia abierta por cochera
create unique index if not exists turnos_una_por_cochera
  on public.turnos (cochera) where egreso_real is null;

-- La misma patente no puede estar en las dos cocheras
create unique index if not exists turnos_una_por_patente
  on public.turnos (patente) where egreso_real is null;

-- Indices de consulta (cooldown por patente, cupo por departamento)
create index if not exists turnos_patente_ingreso
  on public.turnos (patente, ingreso desc);
create index if not exists turnos_depto_ingreso
  on public.turnos (depto, ingreso desc);


-- =========================================================
-- Parametros del reglamento, en un solo lugar
-- (el equivalente de CONFIG en app.js)
-- =========================================================

create or replace function public.rp_limite_mensual() returns int
  language sql immutable as $$ select 5 $$;

create or replace function public.rp_cooldown() returns interval
  language sql immutable as $$ select interval '24 hours' $$;

create or replace function public.rp_zona() returns text
  language sql immutable as $$ select 'America/Argentina/Buenos_Aires' $$;


-- =========================================================
-- Reglas de negocio, aplicadas en el alta
--
-- security definer a proposito: cuando mas adelante se sumen
-- usuarios y la lectura se restrinja, estas cuentas tienen que
-- seguir viendo todos los turnos o dejarian de bloquear bien.
-- =========================================================

create or replace function public.turnos_validar_alta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ultimo      timestamptz;
  libre_desde timestamptz;
  usados      int;
begin
  -- El servidor fija los tiempos, ignorando lo que mande el cliente
  new.ingreso         := now();
  new.egreso_previsto := new.ingreso + make_interval(mins => new.duracion_min);
  new.egreso_real     := null;

  -- Cooldown de 24 h contado desde el ultimo ingreso de esa patente
  select max(ingreso) into ultimo
    from public.turnos where patente = new.patente;

  if ultimo is not null then
    libre_desde := ultimo + public.rp_cooldown();
    if new.ingreso < libre_desde then
      raise exception
        'La patente % ya uso la cortesia. Podra volver a ingresar el %',
        new.patente,
        to_char(libre_desde at time zone public.rp_zona(), 'DD/MM HH24:MI')
        using hint = 'RP_COOLDOWN';
    end if;
  end if;

  -- Cupo mensual del departamento, por mes calendario de la zona local
  select count(*) into usados
    from public.turnos
   where depto = new.depto
     and ingreso >= date_trunc('month', new.ingreso at time zone public.rp_zona())
                      at time zone public.rp_zona()
     and ingreso <  (date_trunc('month', new.ingreso at time zone public.rp_zona())
                      + interval '1 month') at time zone public.rp_zona();

  if usados >= public.rp_limite_mensual() then
    raise exception
      'El departamento % ya uso sus % invitaciones de este mes',
      new.depto, public.rp_limite_mensual()
      using hint = 'RP_CUPO';
  end if;

  return new;
end;
$$;

drop trigger if exists turnos_validar_alta on public.turnos;
create trigger turnos_validar_alta
  before insert on public.turnos
  for each row execute function public.turnos_validar_alta();


-- Un turno ya creado solo se puede cerrar, nunca editar ni reabrir.
create or replace function public.turnos_solo_cerrar()
returns trigger
language plpgsql
as $$
begin
  if old.egreso_real is not null then
    raise exception 'El turno ya esta cerrado' using hint = 'RP_CERRADO';
  end if;

  if (new.id, new.cochera, new.patente, new.depto,
      new.duracion_min, new.ingreso, new.egreso_previsto)
     is distinct from
     (old.id, old.cochera, old.patente, old.depto,
      old.duracion_min, old.ingreso, old.egreso_previsto) then
    raise exception 'Un turno solo admite completar la salida'
      using hint = 'RP_INMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists turnos_solo_cerrar on public.turnos;
create trigger turnos_solo_cerrar
  before update on public.turnos
  for each row execute function public.turnos_solo_cerrar();


-- =========================================================
-- Operaciones expuestas a la app
-- =========================================================

-- Cerrar un turno. La hora de salida la pone el servidor.
-- Queda security invoker para que la politica de RLS siga
-- decidiendo quien puede cerrar cuando haya usuarios.
create or replace function public.cerrar_turno(p_id uuid)
returns public.turnos
language plpgsql
security invoker
as $$
declare
  fila public.turnos;
begin
  update public.turnos
     set egreso_real = now()
   where id = p_id and egreso_real is null
   returning * into fila;

  if not found then
    raise exception 'El turno no existe o ya fue cerrado' using hint = 'RP_CERRADO';
  end if;

  return fila;
end;
$$;

-- Cuantas invitaciones le quedan a un departamento este mes.
create or replace function public.cupo_restante(p_depto text)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(0, public.rp_limite_mensual() - count(*)::int)
    from public.turnos
   where depto = upper(p_depto)
     and ingreso >= date_trunc('month', now() at time zone public.rp_zona())
                      at time zone public.rp_zona()
     and ingreso <  (date_trunc('month', now() at time zone public.rp_zona())
                      + interval '1 month') at time zone public.rp_zona();
$$;

-- Si la patente esta bloqueada, desde cuando puede volver. null = puede entrar.
create or replace function public.patente_libre_desde(p_patente text)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when max(ingreso) + public.rp_cooldown() > now()
             then max(ingreso) + public.rp_cooldown()
         end
    from public.turnos
   where patente = upper(p_patente);
$$;


-- =========================================================
-- Seguridad (RLS)
--
-- ATENCION: mientras no haya usuarios, estas politicas dejan
-- que cualquiera que tenga la URL y la anon key lea y escriba.
-- Es el paso intermedio pedido; al sumar login hay que sacar
-- 'anon' de las tres politicas y dejar solo 'authenticated'.
-- =========================================================

alter table public.turnos enable row level security;

drop policy if exists turnos_lectura on public.turnos;
create policy turnos_lectura on public.turnos
  for select to anon, authenticated
  using (true);

drop policy if exists turnos_alta on public.turnos;
create policy turnos_alta on public.turnos
  for insert to anon, authenticated
  with check (egreso_real is null);

drop policy if exists turnos_cierre on public.turnos;
create policy turnos_cierre on public.turnos
  for update to anon, authenticated
  using (egreso_real is null)
  with check (egreso_real is not null);

-- Sin politica de delete a proposito: el historial no se borra desde la app.
