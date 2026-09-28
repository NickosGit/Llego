-- ¿Llego?: esquema inicial.
--
-- Regla de diseño (Condición 3 / Cláusula Sombra): los datos describen RUTAS y
-- HORAS, nunca a personas que trabajan en el transporte. No existe ninguna
-- columna que permita identificar un colectivo concreto ni a quien lo maneja.
--
-- RLS está activo en TODAS las tablas. La service role (solo scripts/) salta
-- RLS; la app usa la anon key + el JWT del usuario.

-- ─────────────────────────────────────────────────────────────── perfiles ──
-- Solo existe fila para quien tiene un rol distinto al normal. Nadie puede
-- darse rol a sí mismo: no hay políticas de insert/update para clientes.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'passenger' check (role in ('passenger', 'reviewer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'reviewer'
  );
$$;

-- ───────────────────────────────────────────────────────────────── paradas ──
-- Las filas las escribe scripts/sync_stops.ts leyendo config/corridor.ts, que es
-- la única fuente de coordenadas.
create table public.stops (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  seq smallint not null unique
);

alter table public.stops enable row level security;

create policy "stops_read_authenticated" on public.stops
  for select to authenticated
  using (true);

-- ────────────────────────────────────────────────────────────────── viajes ──
-- Solo duraciones y paradas. Nunca coordenadas: el recorrido GPS no sale del
-- teléfono.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  stop_from text not null references public.stops (id),
  stop_to text not null references public.stops (id),
  daytype text not null check (daytype in ('weekday', 'weekend')),
  hour smallint not null check (hour between 0 and 23),
  wait_min numeric(5, 1) not null check (wait_min between 0 and 240),
  ride_min numeric(5, 1) not null check (ride_min between 0 and 240),
  got_seat boolean not null,
  rain boolean not null default false,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  constraint trips_real_have_owner check (is_simulated or user_id is not null),
  constraint trips_forward check (stop_from <> stop_to)
);

create index trips_user_idx on public.trips (user_id, created_at desc);
create index trips_recent_idx on public.trips (stop_from, created_at desc) where not is_simulated;

alter table public.trips enable row level security;

create policy "trips_select_own" on public.trips
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "trips_insert_own" on public.trips
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_simulated = false);

-- "Mis viajes": cada quien puede borrar lo suyo (Condición 4: corregible).
create policy "trips_delete_own" on public.trips
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────────── reportes ──
-- El cliente manda solo stop_id y kind. user_id, created_at y expires_at los
-- pone la base. Nadie puede leer reportes individuales: solo el agregado.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  stop_id text not null references public.stops (id),
  kind text not null check (kind in ('long_wait', 'full', 'breakdown')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

create index reports_live_idx on public.reports (stop_id, created_at desc);

alter table public.reports enable row level security;

create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- Sin política de select: lectura directa = 0 filas.

-- Tiempos fijados por la base y límite de 1 reporte por usuario/parada/15 min.
-- security definer porque, sin política de select, el propio usuario no ve sus
-- reportes y la comprobación siempre daría "ninguno".
create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '2 hours';
  if exists (
    select 1 from public.reports r
    where r.user_id = new.user_id
      and r.stop_id = new.stop_id
      and r.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'rate_limited: un reporte por parada cada 15 minutos'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ────────────────────────────────────────────────────────────── predicciones ──
-- Las escribe scripts/train.py con la service role. Una fila por
-- (tramo, tipo de día, hora).
create table public.predictions (
  segment text not null check (segment in ('AB', 'BC', 'CD')),
  daytype text not null check (daytype in ('weekday', 'weekend')),
  hour smallint not null check (hour between 0 and 23),
  wait_p50 numeric(5, 1) not null check (wait_p50 >= 0),
  wait_p90 numeric(5, 1) not null,
  seat_prob numeric(4, 3) not null check (seat_prob between 0 and 1),
  n_obs integer not null check (n_obs >= 0),
  model_version text not null,
  is_simulated boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (segment, daytype, hour),
  constraint predictions_p90_ge_p50 check (wait_p90 >= wait_p50)
);

alter table public.predictions enable row level security;

create policy "predictions_read_authenticated" on public.predictions
  for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────── casos a revisar ──
-- Cuando los reportes contradicen al pronóstico se abre un caso para una
-- persona. El pronóstico NUNCA se cambia solo. Sin acciones de sanción ni
-- despacho: solo confirmar, descartar y anotar.
create table public.review_cases (
  id uuid primary key default gen_random_uuid(),
  stop_id text not null references public.stops (id),
  -- "window" es palabra reservada en Postgres; guardamos el inicio del bloque de 2 h.
  window_start timestamptz not null,
  reason text not null check (reason in ('long_wait_vs_low_forecast', 'fast_trips_vs_forecast')),
  forecast_p50 numeric(5, 1) not null,
  report_count integer not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  reviewer_note text check (char_length(reviewer_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint review_cases_one_per_window unique (stop_id, window_start)
);

alter table public.review_cases enable row level security;

create policy "review_cases_select_reviewer" on public.review_cases
  for select to authenticated
  using ((select public.is_reviewer()));

create policy "review_cases_update_reviewer" on public.review_cases
  for update to authenticated
  using ((select public.is_reviewer()))
  with check ((select public.is_reviewer()));

-- ─────────────────────────────────────────────────────────────── permisos ──
-- anon no toca nada. authenticated solo lo que RLS le deja, y en review_cases
-- solo puede cambiar el estado y la nota.
revoke all on public.profiles, public.stops, public.trips, public.reports,
  public.predictions, public.review_cases from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.stops to authenticated;
grant select, insert, delete on public.trips to authenticated;
grant insert (stop_id, kind) on public.reports to authenticated;
grant select on public.predictions to authenticated;
grant select on public.review_cases to authenticated;
grant update (status, reviewer_note, reviewed_at, reviewed_by) on public.review_cases to authenticated;

-- ────────────────────────────────────────────────────────── funciones RPC ──

-- Hora y tipo de día "ahora" en la zona del corredor.
create or replace function public.corridor_now()
returns table (daytype text, hour smallint, window_start timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    case when extract(isodow from now() at time zone 'America/Mexico_City') in (6, 7)
      then 'weekend' else 'weekday' end,
    extract(hour from now() at time zone 'America/Mexico_City')::smallint,
    date_bin('2 hours', now(), timestamptz '2000-01-01 00:00:00+00');
$$;

-- Reportes vivos AGREGADOS de las últimas 2 h. k-umbral: una celda
-- (parada, tipo) solo aparece si la reportaron al menos 3 personas distintas.
create or replace function public.live_reports_agg()
returns table (stop_id text, kind text, passengers integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.stop_id, r.kind, count(distinct r.user_id)::integer as passengers
  from public.reports r
  where r.created_at > now() - interval '2 hours'
    and r.expires_at > now()
  group by r.stop_id, r.kind
  having count(distinct r.user_id) >= 3;
$$;

-- Revisa si lo que reportan los pasajeros en esta parada contradice el
-- pronóstico de la hora actual. Si sí, abre UN caso por parada y bloque de 2 h
-- (idempotente) y devuelve true. Nunca modifica `predictions`.
--
-- Reglas (PACKET §9 y BUILD_PROMPT, commit 4):
--   a) ≥ 3 personas reportan espera larga y el p50 pronosticado es < 10 min.
--   b) 0 reportes de espera larga, pero ≥ 3 personas registraron esperas
--      menores a la mitad del p50.
create or replace function public.flag_contradiction(p_stop_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now record;
  v_segment text;
  v_p50 numeric;
  v_long_wait integer;
  v_fast_trips integer;
  v_reason text;
  v_count integer;
begin
  select * into v_now from public.corridor_now();

  v_segment := case p_stop_id when 'A' then 'AB' when 'B' then 'BC' when 'C' then 'CD' end;
  if v_segment is null then
    return false;
  end if;

  select p.wait_p50 into v_p50
  from public.predictions p
  where p.segment = v_segment and p.daytype = v_now.daytype and p.hour = v_now.hour;

  select count(distinct r.user_id) into v_long_wait
  from public.reports r
  where r.stop_id = p_stop_id and r.kind = 'long_wait'
    and r.created_at > now() - interval '2 hours' and r.expires_at > now();

  if v_p50 is not null then
    if v_long_wait >= 3 and v_p50 < 10 then
      v_reason := 'long_wait_vs_low_forecast';
      v_count := v_long_wait;
    elsif v_long_wait = 0 then
      select count(distinct t.user_id) into v_fast_trips
      from public.trips t
      where t.stop_from = p_stop_id and not t.is_simulated
        and t.created_at > now() - interval '2 hours'
        and t.wait_min < v_p50 / 2;
      if v_fast_trips >= 3 then
        v_reason := 'fast_trips_vs_forecast';
        v_count := v_fast_trips;
      end if;
    end if;

    if v_reason is not null then
      insert into public.review_cases (stop_id, window_start, reason, forecast_p50, report_count)
      values (p_stop_id, v_now.window_start, v_reason, v_p50, v_count)
      on conflict (stop_id, window_start) do nothing;
    end if;
  end if;

  -- "en revisión" mientras haya un caso abierto de este bloque de 2 h.
  return exists (
    select 1 from public.review_cases c
    where c.stop_id = p_stop_id and c.window_start = v_now.window_start and c.status = 'open'
  );
end;
$$;

-- Retención: reportes borrados a los 30 días. Lo llama scripts/train.py.
create or replace function public.purge_old_reports()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.reports where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.is_reviewer() from public, anon;
revoke all on function public.corridor_now() from public, anon;
revoke all on function public.live_reports_agg() from public, anon;
revoke all on function public.flag_contradiction(text) from public, anon;
revoke all on function public.purge_old_reports() from public, anon, authenticated;
revoke all on function public.reports_before_insert() from public, anon, authenticated;

grant execute on function public.is_reviewer() to authenticated;
grant execute on function public.corridor_now() to authenticated;
grant execute on function public.live_reports_agg() to authenticated;
grant execute on function public.flag_contradiction(text) to authenticated;
grant execute on function public.purge_old_reports() to service_role;
