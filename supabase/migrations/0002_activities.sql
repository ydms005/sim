-- =====================================================================
-- 대학길잡이 — 활동정리(/activities): 학생 개인 활동 카드 + AI 요약·상담 동의
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
--        0001_stage3.sql 을 먼저 실행해 두어야 합니다(profiles, is_admin(), has_agreed() 등을 씁니다).
--        여러 번 실행해도 안전합니다.
--
-- 보안 요약
--   * 학생이 올리는 생기부 등 원본 PDF 는 이 서버에 전혀 저장되지 않습니다(학생 브라우저 안에만 있음).
--     여기 저장되는 것은 학생이 직접 쓰는 '활동 카드'(activities)뿐입니다.
--   * activities 는 본인만 읽고 쓸 수 있습니다. 관리자도 볼 수 없습니다(개인정보 보호를 위해 일부러 예외를 두지 않음).
--   * AI 기능을 쓰려면 이용 동의(agreed_at)와 별도로 '개인정보 국외 이전' 동의(ai_consent_at)가 필요합니다.
--     이 시각은 give_ai_consent()/revoke_ai_consent() 함수로만 바꿀 수 있고, 사용자가 직접 고칠 수 없습니다.
--   * ai_usage 는 하루 사용량(요청 수·글자 수) 기록으로, 읽기는 본인 것만, 쓰기는 Edge Function(service_role)만 합니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 활동 카드 (동아리·봉사·진로 등)
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('동아리', '봉사', '진로', '교과세특', '독서', '수상', '자율', '기타')),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  occurred_on date,
  content text not null default '' check (char_length(content) <= 5000),
  reflection text not null default '' check (char_length(reflection) <= 3000),
  related_major text not null default '' check (char_length(related_major) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_user_created_idx on public.activities (user_id, created_at desc);

-- 새 활동 카드: 작성자·시각은 서버가 정함 (요청이 사이트 사용자에게서 온 경우에만)
create or replace function public.activities_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() then
    new.user_id := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- 활동 카드 수정: 작성자·생성 시각은 못 바꾸고, 수정 시각은 서버가 갱신
create or replace function public.activities_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger activities_before_insert
  before insert on public.activities
  for each row execute function public.activities_before_insert();

create or replace trigger activities_before_update
  before update on public.activities
  for each row execute function public.activities_before_update();

alter table public.activities enable row level security;
revoke all on table public.activities from anon, authenticated;

grant select, delete on table public.activities to authenticated;
grant insert (category, title, occurred_on, content, reflection, related_major) on table public.activities to authenticated;
grant update (category, title, occurred_on, content, reflection, related_major) on table public.activities to authenticated;

-- 본인 것만 읽고 쓸 수 있음. 관리자도 예외 없음(개인 활동 기록이라 일부러 열어 주지 않습니다).
drop policy if exists "activities: 본인만 읽기" on public.activities;
create policy "activities: 본인만 읽기" on public.activities
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "activities: 본인만 추가" on public.activities;
create policy "activities: 본인만 추가" on public.activities
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "activities: 본인만 수정" on public.activities;
create policy "activities: 본인만 수정" on public.activities
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "activities: 본인만 삭제" on public.activities;
create policy "activities: 본인만 삭제" on public.activities
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke execute on function public.activities_before_insert() from public, anon, authenticated;
revoke execute on function public.activities_before_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. AI(국외 이전) 동의 — profiles 에 시각 추가, 전용 함수로만 기록
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists ai_consent_at timestamptz;

-- profiles_guard(0001) 를 다시 정의해 ai_consent_at 도 사용자가 직접 못 바꾸게 막습니다.
-- (열 단위 권한에서도 ai_consent_at 을 authenticated 에 주지 않으므로 이중으로 막혀 있습니다.)
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_client_request() then
    return new; -- SQL Editor 등 관리 작업 (give_ai_consent() 등 security definer 함수 포함)
  end if;
  new.id := old.id;
  new.role := old.role;
  new.created_at := old.created_at;
  new.ai_consent_at := old.ai_consent_at;
  if old.agreed_at is not null then
    new.agreed_at := old.agreed_at;
  elsif new.agreed_at is not null then
    new.agreed_at := now();
  end if;
  new.nickname := btrim(new.nickname);
  if new.nickname is distinct from old.nickname and old.role <> 'admin'
     and new.nickname ~* '(관리자|운영자|선생님|admin)' then
    raise exception '''관리자'', ''운영자'', ''선생님'' 같은 말은 닉네임에 쓸 수 없어요.'
      using errcode = 'P0001', hint = 'APP_NICKNAME_RESERVED';
  end if;
  return new;
end;
$$;

-- AI 기능 이용 동의(개인정보 국외 이전 동의) 기록. 클라이언트는 이 함수로만 시각을 남길 수 있습니다.
create or replace function public.give_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '로그인이 필요해요.' using errcode = 'P0001', hint = 'APP_LOGIN_REQUIRED';
  end if;
  update public.profiles set ai_consent_at = now() where id = uid;
end;
$$;

-- 동의 철회 (다시 동의하기 전까지 AI 기능을 못 씀)
create or replace function public.revoke_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '로그인이 필요해요.' using errcode = 'P0001', hint = 'APP_LOGIN_REQUIRED';
  end if;
  update public.profiles set ai_consent_at = null where id = uid;
end;
$$;

revoke execute on function public.give_ai_consent() from public, anon;
grant execute on function public.give_ai_consent() to authenticated;
revoke execute on function public.revoke_ai_consent() from public, anon;
grant execute on function public.revoke_ai_consent() to authenticated;

-- ---------------------------------------------------------------------
-- 3. AI 사용량(하루 요청 수·글자 수) — Edge Function(activity-ai)의 사용량 제한용
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0,
  input_chars bigint not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;

-- 읽기는 본인 것만(내 정보 화면 등에서 오늘 몇 번 썼는지 보여줄 때 씀). insert/update/delete 권한은 아무에게도 주지 않고,
-- service_role(Edge Function)만 bump_ai_usage() 로 늘립니다.
drop policy if exists "ai_usage: 본인 읽기" on public.ai_usage;
create policy "ai_usage: 본인 읽기" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 하루 사용량을 확인하고, 한도 안이면 원자적으로 늘립니다. Edge Function 이 service_role 로만 부릅니다
-- (일반 사용자는 남의 user_id 로 부르거나 한도 확인을 우회할 수 없어야 하므로 authenticated 에는 권한을 주지 않습니다).
create or replace function public.bump_ai_usage(
  p_user_id uuid,
  p_chars bigint,
  p_max_requests int,
  p_max_chars bigint
)
returns table (allowed boolean, requests int, input_chars bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'utc')::date;
  cur_requests int;
  cur_chars bigint;
begin
  insert into public.ai_usage (user_id, day) values (p_user_id, d)
    on conflict (user_id, day) do nothing;

  select ai.requests, ai.input_chars into cur_requests, cur_chars
    from public.ai_usage ai
    where ai.user_id = p_user_id and ai.day = d
    for update;

  if cur_requests >= p_max_requests or cur_chars + greatest(p_chars, 0) > p_max_chars then
    return query select false, cur_requests, cur_chars;
    return;
  end if;

  update public.ai_usage
    set requests = cur_requests + 1, input_chars = cur_chars + greatest(p_chars, 0)
    where user_id = p_user_id and day = d;

  return query select true, cur_requests + 1, cur_chars + greatest(p_chars, 0);
end;
$$;

revoke execute on function public.bump_ai_usage(uuid, bigint, int, bigint) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, bigint, int, bigint) to service_role;

-- PostgREST(사이트가 쓰는 API)가 바뀐 테이블·함수를 바로 알아보도록 알림
notify pgrst, 'reload schema';
