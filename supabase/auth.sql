-- =========================================================
-- Riglos Plaza - Usuarios por departamento
--
-- Correr DESPUES de schema.sql, una sola vez.
-- Cada departamento es un usuario de Supabase Auth.
-- =========================================================

-- ---------------------------------------------------------
-- Perfil: la union entre el usuario de auth y su departamento
-- ---------------------------------------------------------

create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  depto      text not null unique,
  creado_en  timestamptz not null default now(),

  constraint perfil_depto_normal check (depto = upper(depto) and depto !~ '\s'),
  constraint perfil_depto_largo  check (length(depto) between 1 and 12)
);

comment on table public.perfiles is
  'Un usuario de auth por departamento. El depto sale de aca, nunca del cliente.';

-- El departamento del usuario que esta haciendo el pedido.
-- security definer para que funcione aunque perfiles quede cerrado por RLS.
create or replace function public.mi_depto()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select depto from public.perfiles where id = auth.uid();
$$;

-- Cupo del departamento propio: lo que la app muestra al entrar.
create or replace function public.mi_cupo()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.cupo_restante(public.mi_depto());
$$;


-- ---------------------------------------------------------
-- Turnos: quedan atados al usuario que los creo
-- ---------------------------------------------------------

alter table public.turnos
  add column if not exists creado_por uuid references auth.users(id);

create index if not exists turnos_creado_por on public.turnos (creado_por);

-- El alta ahora ignora el depto que mande el cliente y usa el del usuario:
-- si no, cualquiera podria gastarle el cupo a otro departamento.
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
  depto_user  text;
begin
  -- Identidad: el departamento sale del perfil, no del formulario
  depto_user := public.mi_depto();
  if depto_user is null then
    raise exception 'Sesion sin departamento asociado. Volve a entrar.'
      using hint = 'RP_SIN_PERFIL';
  end if;

  new.depto      := depto_user;
  new.creado_por := auth.uid();

  -- El servidor fija los tiempos, nunca el telefono
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

  -- Cupo mensual del departamento
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


-- ---------------------------------------------------------
-- RLS: se acabo el acceso anonimo
-- ---------------------------------------------------------

alter table public.perfiles enable row level security;

-- Cada uno ve solo su propio perfil
drop policy if exists perfiles_propio on public.perfiles;
create policy perfiles_propio on public.perfiles
  for select to authenticated
  using (id = auth.uid());

-- Turnos: hay que estar logueado para todo.
-- La lectura sigue siendo de todos los turnos a proposito: para saber si una
-- cochera esta libre hay que poder ver la que ocupo otro departamento.
drop policy if exists turnos_lectura on public.turnos;
create policy turnos_lectura on public.turnos
  for select to authenticated
  using (true);

drop policy if exists turnos_alta on public.turnos;
create policy turnos_alta on public.turnos
  for insert to authenticated
  with check (egreso_real is null);

-- Cualquier vecino puede marcar la salida, no solo quien invito:
-- el auto se fue fisicamente y la cochera tiene que quedar libre.
drop policy if exists turnos_cierre on public.turnos;
create policy turnos_cierre on public.turnos
  for update to authenticated
  using (egreso_real is null)
  with check (egreso_real is not null);


-- ---------------------------------------------------------
-- Alta de departamentos
--
-- OJO: esto escribe directo en auth.users, lo que saltea la
-- politica de contrasenas de Supabase (minimo 6 caracteres).
-- Es lo que permite usar "123" para probar. Para las claves
-- de verdad conviene el panel de Supabase o la Admin API.
-- ---------------------------------------------------------

create or replace function public.crear_depto(p_depto text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_id        uuid := gen_random_uuid();
  v_depto     text := upper(replace(trim(p_depto), ' ', ''));
  v_email     text := lower(replace(trim(p_depto), ' ', '')) || '@riglosplaza.com.ar';
  v_identidad jsonb;
begin
  v_identidad := jsonb_build_object(
    'sub', v_id::text, 'email', v_email, 'email_verified', true);

  if exists (select 1 from public.perfiles where depto = v_depto) then
    raise exception 'El departamento % ya tiene usuario', v_depto;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('depto', v_depto),
    '', '', '', ''
  );

  -- Sin identidad el login falla en las versiones nuevas de GoTrue.
  -- El esquema de auth.identities cambio entre versiones: las nuevas tienen
  -- id uuid + provider_id text; las viejas usaban id text como provider id.
  -- Se detecta cual es y se arma el insert que corresponda.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities'
       and column_name = 'provider_id'
  ) then
    execute $ins$
      insert into auth.identities (
        id, user_id, provider_id, identity_data,
        provider, last_sign_in_at, created_at, updated_at
      ) values (gen_random_uuid(), $1, $2, $3, 'email', now(), now(), now())
    $ins$ using v_id, v_id::text, v_identidad;
  else
    execute $ins$
      insert into auth.identities (
        id, user_id, identity_data,
        provider, last_sign_in_at, created_at, updated_at
      ) values ($1, $2, $3, 'email', now(), now(), now())
    $ins$ using v_id::text, v_id, v_identidad;
  end if;

  insert into public.perfiles (id, depto) values (v_id, v_depto);
  return v_id;
end;
$$;

revoke execute on function public.crear_depto(text, text) from anon, authenticated;


-- ---------------------------------------------------------
-- Los 3 departamentos de prueba
-- ---------------------------------------------------------

-- Se saltean los que ya existan, asi el script se puede volver a correr.
do $seed$
declare
  d text;
begin
  foreach d in array array['1A', '2A', '3A'] loop
    if not exists (select 1 from public.perfiles where depto = d) then
      perform public.crear_depto(d, '123');
      raise notice 'Departamento % creado', d;
    else
      raise notice 'Departamento % ya existía, se saltea', d;
    end if;
  end loop;
end;
$seed$;

-- Resultado: tiene que devolver una fila por departamento.
select p.depto, u.email, u.email_confirmed_at is not null as confirmado,
       exists (select 1 from auth.identities i where i.user_id = p.id) as tiene_identidad
  from public.perfiles p
  join auth.users u on u.id = p.id
 order by p.depto;
