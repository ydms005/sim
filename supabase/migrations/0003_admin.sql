-- =====================================================================
-- 대학길잡이 — 관리자 페이지: 회원 관리 · 저장 공간 · AI 사용량
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
--        0001_stage3.sql, 0002_activities.sql 을 먼저 실행해 두어야 합니다.
--        여러 번 실행해도 안전합니다.
--
-- 보안 요약
--   * 이 파일이 새로 만드는 함수(admin_*)는 모두 관리자(role = 'admin')만 부를 수 있고,
--     그 밖의 사용자가 부르면 '권한이 없어요(forbidden)' 오류가 납니다.
--   * 회원 목록 함수는 로그인 이메일 등 개인정보를 포함하므로 관리자만 실행할 수 있습니다.
--   * record_ai_tokens() 는 Edge Function(service_role)만 부를 수 있습니다.
--   * 회원 탈퇴(계정 삭제)는 이 SQL 이 아니라 별도의 admin-users Edge Function(auth.admin API)이 처리합니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 공통: 관리자 아니면 막기
-- ---------------------------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
  end if;
end;
$$;

revoke execute on function public.require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. 회원 구분 (학생 / 교사)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists user_type text;
alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles add constraint profiles_user_type_check check (user_type in ('student', 'teacher'));

-- 사용자 본인이 학생/교사 구분을 정할 수 있게 열 권한을 추가합니다.
-- (역할(role)은 여전히 authenticated 에 권한이 없어 사용자가 못 바꿉니다. profiles_guard 트리거도 그대로 role 을 지킵니다.)
grant update (user_type) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. 회원 목록 (관리자 전용)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  nickname text,
  role text,
  user_type text,
  question_count bigint,
  answer_count bigint,
  activity_count bigint,
  ai_requests_month bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select
      u.id,
      u.email::text,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
      u.created_at,
      u.last_sign_in_at,
      p.nickname,
      p.role,
      p.user_type,
      coalesce((select count(*) from public.questions q where q.user_id = u.id), 0) as question_count,
      coalesce((select count(*) from public.answers a where a.user_id = u.id), 0) as answer_count,
      coalesce((select count(*) from public.activities act where act.user_id = u.id), 0) as activity_count,
      coalesce((
        select sum(au.requests) from public.ai_usage au
        where au.user_id = u.id and au.day >= date_trunc('month', now() at time zone 'utc')::date
      ), 0) as ai_requests_month
    from auth.users u
    join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- 학생/교사 구분을 관리자가 대신 바꿔 줄 때 (예: 학생이 잘못 고른 경우)
create or replace function public.admin_set_user_type(p_user uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_type not in ('student', 'teacher') then
    raise exception '학생 또는 교사만 고를 수 있어요.' using errcode = 'P0001', hint = 'APP_INVALID';
  end if;
  update public.profiles set user_type = p_type where id = p_user;
end;
$$;

revoke execute on function public.admin_set_user_type(uuid, text) from public, anon;
grant execute on function public.admin_set_user_type(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 저장 공간 사용량 (관리자 전용)
-- ---------------------------------------------------------------------
create or replace function public.admin_storage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  db_bytes bigint;
  tables jsonb;
  storage_buckets jsonb := '[]'::jsonb;
  storage_total_bytes bigint := 0;
  storage_total_count bigint := 0;
begin
  perform public.require_admin();

  select pg_database_size(current_database()) into db_bytes;

  select coalesce(jsonb_agg(row_to_json(t) order by t.total_bytes desc), '[]'::jsonb) into tables
  from (
    select
      c.relname as table_name,
      pg_total_relation_size(c.oid) as total_bytes,
      greatest(c.reltuples, 0)::bigint as row_estimate
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
    limit 50
  ) t;

  -- storage.objects 는 Storage 를 한 번도 안 썼거나(버킷 없음) 이 스키마가 없는 로컬 테스트 환경에서는 없을 수 있습니다.
  if to_regclass('storage.objects') is not null then
    execute $q$
      select
        coalesce(jsonb_agg(row_to_json(b) order by b.bytes desc), '[]'::jsonb),
        coalesce(sum(b.bytes), 0),
        coalesce(sum(b.cnt), 0)
      from (
        select
          bucket_id,
          count(*) as cnt,
          sum(coalesce((metadata ->> 'size')::bigint, 0)) as bytes
        from storage.objects
        group by bucket_id
      ) b
    $q$ into storage_buckets, storage_total_bytes, storage_total_count;
  end if;

  return jsonb_build_object(
    'db_bytes', db_bytes,
    'tables', tables,
    'storage', jsonb_build_object(
      'buckets', storage_buckets,
      'total_bytes', storage_total_bytes,
      'total_count', storage_total_count
    )
  );
end;
$$;

revoke execute on function public.admin_storage_stats() from public, anon;
grant execute on function public.admin_storage_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 4. AI 사용량(토큰) 기록 — activity-ai Edge Function(service_role) 전용
-- ---------------------------------------------------------------------
alter table public.ai_usage add column if not exists input_tokens bigint not null default 0;
alter table public.ai_usage add column if not exists output_tokens bigint not null default 0;
alter table public.ai_usage add column if not exists cache_read_tokens bigint not null default 0;

create table if not exists public.ai_usage_model (
  day date not null,
  model text not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  primary key (day, model)
);

alter table public.ai_usage_model enable row level security;
revoke all on table public.ai_usage_model from anon, authenticated;
-- 클라이언트(사용자)에게는 어떤 권한도 주지 않습니다(select 도 없음). 관리자 화면은 admin_ai_usage() 로만 읽습니다.

-- 하루치 사용자 토큰 합계 + 모델별 하루 합계를 함께 적립합니다. bump_ai_usage() 로 이미 늘린 요청 수(requests)는
-- 다시 늘리지 않고, 토큰 수만 더합니다.
create or replace function public.record_ai_tokens(
  p_user_id uuid,
  p_model text,
  p_input bigint,
  p_output bigint,
  p_cache_read bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'utc')::date;
begin
  insert into public.ai_usage (user_id, day, input_tokens, output_tokens, cache_read_tokens)
    values (p_user_id, d, greatest(p_input, 0), greatest(p_output, 0), greatest(p_cache_read, 0))
  on conflict (user_id, day) do update
    set input_tokens = public.ai_usage.input_tokens + greatest(p_input, 0),
        output_tokens = public.ai_usage.output_tokens + greatest(p_output, 0),
        cache_read_tokens = public.ai_usage.cache_read_tokens + greatest(p_cache_read, 0);

  insert into public.ai_usage_model (day, model, requests, input_tokens, output_tokens, cache_read_tokens)
    values (d, coalesce(p_model, 'unknown'), 1, greatest(p_input, 0), greatest(p_output, 0), greatest(p_cache_read, 0))
  on conflict (day, model) do update
    set requests = public.ai_usage_model.requests + 1,
        input_tokens = public.ai_usage_model.input_tokens + greatest(p_input, 0),
        output_tokens = public.ai_usage_model.output_tokens + greatest(p_output, 0),
        cache_read_tokens = public.ai_usage_model.cache_read_tokens + greatest(p_cache_read, 0);
end;
$$;

revoke execute on function public.record_ai_tokens(uuid, text, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_tokens(uuid, text, bigint, bigint, bigint) to service_role;

-- 최근 p_days 일의 모델별 하루 사용량 + 그 기간 상위 사용자 (관리자 전용, 화면에 바로 쓰기 좋은 jsonb 로 반환)
create or replace function public.admin_ai_usage(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since date;
  daily jsonb;
  top_users jsonb;
begin
  perform public.require_admin();
  since := (now() at time zone 'utc')::date - greatest(coalesce(p_days, 30), 1) + 1;

  select coalesce(jsonb_agg(row_to_json(d) order by d.day, d.model), '[]'::jsonb) into daily
  from (
    select day, model, requests, input_tokens, output_tokens, cache_read_tokens
    from public.ai_usage_model
    where day >= since
  ) d;

  select coalesce(jsonb_agg(row_to_json(u) order by u.requests desc), '[]'::jsonb) into top_users
  from (
    select
      p.nickname,
      u.email::text,
      sum(au.requests) as requests,
      sum(au.input_tokens) as input_tokens,
      sum(au.output_tokens) as output_tokens,
      sum(au.cache_read_tokens) as cache_read_tokens
    from public.ai_usage au
    join public.profiles p on p.id = au.user_id
    join auth.users u on u.id = au.user_id
    where au.day >= since
    group by p.nickname, u.email
    order by sum(au.requests) desc
    limit 20
  ) u;

  return jsonb_build_object('since', since, 'daily', daily, 'top_users', top_users);
end;
$$;

revoke execute on function public.admin_ai_usage(int) from public, anon;
grant execute on function public.admin_ai_usage(int) to authenticated;

-- PostgREST(사이트가 쓰는 API)가 바뀐 테이블·함수를 바로 알아보도록 알림
notify pgrst, 'reload schema';
