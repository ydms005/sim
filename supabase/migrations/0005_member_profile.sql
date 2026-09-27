-- =====================================================================
-- 대학길잡이 0005: 회원 정보 확장 (학생 / 학부모 / 교사) + 교사 승인
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
--        0001_stage3.sql, 0003_admin.sql, 0004_role_badges.sql 을 먼저 실행해 두어야 합니다.
--        여러 번 실행해도 안전합니다.
--
-- 이 SQL 이 하는 일 (아직 '클래스' 기능은 없습니다 — 가입/내 정보만 준비합니다)
--   * 이용자 구분에 '학부모'를 추가합니다 (학생 / 학부모 / 교사).
--   * 이름(실명) · 학교 · 학년·반·번호(학생) · 담당·학년·반(교사) 항목을 추가합니다.
--     이 항목들은 본인과 관리자만 볼 수 있고, 커뮤니티 등 다른 사람에게는 절대 보이지 않습니다.
--   * 교사로 고르면(또는 학교·담당·담임 학년반을 바꾸면) '승인 대기' 상태가 되고, 관리자가 승인해야
--     '선생님' 배지가 보입니다(관리자 계정 본인이 교사를 고르면 자동 승인). 승인 전에는 일반 회원처럼 씁니다.
--   * 필수 항목은 화면(프런트엔드)에서 막지만, 데이터베이스에도 최소한의 검증을 둡니다(직접 API를 불러도 안전하도록).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 이용자 구분 (학생 / 학부모 / 교사) + 새 항목
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles add constraint profiles_user_type_check check (user_type in ('student', 'parent', 'teacher'));

alter table public.profiles add column if not exists real_name text;
alter table public.profiles add column if not exists school text;
alter table public.profiles add column if not exists grade smallint;
alter table public.profiles add column if not exists class_no smallint;
alter table public.profiles add column if not exists student_no smallint;
alter table public.profiles add column if not exists teacher_role text;
alter table public.profiles add column if not exists teacher_grade smallint;
alter table public.profiles add column if not exists teacher_class smallint;
alter table public.profiles add column if not exists teacher_status text;

alter table public.profiles drop constraint if exists profiles_real_name_length;
alter table public.profiles add constraint profiles_real_name_length check (real_name is null or char_length(btrim(real_name)) between 2 and 20);

alter table public.profiles drop constraint if exists profiles_school_length;
alter table public.profiles add constraint profiles_school_length check (school is null or char_length(btrim(school)) between 2 and 50);

alter table public.profiles drop constraint if exists profiles_grade_range;
alter table public.profiles add constraint profiles_grade_range check (grade is null or grade between 1 and 6);

alter table public.profiles drop constraint if exists profiles_class_no_range;
alter table public.profiles add constraint profiles_class_no_range check (class_no is null or class_no between 1 and 30);

alter table public.profiles drop constraint if exists profiles_student_no_range;
alter table public.profiles add constraint profiles_student_no_range check (student_no is null or student_no between 1 and 60);

alter table public.profiles drop constraint if exists profiles_teacher_role_check;
alter table public.profiles add constraint profiles_teacher_role_check
  check (teacher_role is null or teacher_role in ('homeroom', 'subject', 'homeroom_subject'));

alter table public.profiles drop constraint if exists profiles_teacher_grade_range;
alter table public.profiles add constraint profiles_teacher_grade_range check (teacher_grade is null or teacher_grade between 1 and 6);

alter table public.profiles drop constraint if exists profiles_teacher_class_range;
alter table public.profiles add constraint profiles_teacher_class_range check (teacher_class is null or teacher_class between 1 and 30);

alter table public.profiles drop constraint if exists profiles_teacher_status_check;
alter table public.profiles add constraint profiles_teacher_status_check
  check (teacher_status is null or teacher_status in ('pending', 'approved', 'rejected'));

-- 기존 교사(0003 에서 만든 user_type='teacher')를 소급 처리: 관리자는 승인됨, 그 밖에는 승인 대기.
update public.profiles set teacher_status = 'approved' where user_type = 'teacher' and role = 'admin' and teacher_status is null;
update public.profiles set teacher_status = 'pending' where user_type = 'teacher' and role <> 'admin' and teacher_status is null;

-- 사용자 본인이 아래 항목을 바꿀 수 있게 열 권한을 줍니다. role · teacher_status 는 절대 주지 않습니다(관리자 SQL/함수로만 바뀜).
grant update (real_name, school, grade, class_no, student_no, teacher_role, teacher_grade, teacher_class)
  on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. 프로필 수정 규칙 확장: 필수 항목 검증 + 교사 승인 상태 자동 관리
--    (profiles_guard 는 0001 에서 만든 트리거 함수. is_client_request() 가 아니면(SQL 편집기·관리자 함수)
--     그대로 통과시켜, 관리자 도구가 이 검증에 막히지 않습니다.)
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  profile_fields_changed boolean;
begin
  if not public.is_client_request() then
    return new; -- SQL Editor · 관리자 함수(admin_set_user_type 등) 등 관리 작업
  end if;
  new.id := old.id;
  new.role := old.role;
  new.created_at := old.created_at;
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

  -- teacher_status 는 사용자가 직접 바꿀 수 없고, 아래 규칙으로만 정해집니다.
  new.teacher_status := old.teacher_status;
  new.real_name := nullif(btrim(coalesce(new.real_name, '')), '');
  new.school := nullif(btrim(coalesce(new.school, '')), '');

  profile_fields_changed :=
    new.user_type is distinct from old.user_type
    or new.real_name is distinct from old.real_name
    or new.school is distinct from old.school
    or new.grade is distinct from old.grade
    or new.class_no is distinct from old.class_no
    or new.student_no is distinct from old.student_no
    or new.teacher_role is distinct from old.teacher_role
    or new.teacher_grade is distinct from old.teacher_grade
    or new.teacher_class is distinct from old.teacher_class;

  if profile_fields_changed then
    if new.user_type = 'student' then
      if new.real_name is null or new.school is null or new.grade is null
         or new.class_no is null or new.student_no is null then
        raise exception '학생 정보를 모두 입력해 주세요 (이름·학교·학년·반·번호).'
          using errcode = 'P0001', hint = 'APP_INVALID';
      end if;
    elsif new.user_type = 'teacher' then
      if new.real_name is null or new.school is null or new.teacher_role is null then
        raise exception '교사 정보를 모두 입력해 주세요 (이름·학교·담당).'
          using errcode = 'P0001', hint = 'APP_INVALID';
      end if;
      if new.teacher_role in ('homeroom', 'homeroom_subject')
         and (new.teacher_grade is null or new.teacher_class is null) then
        raise exception '담임을 맡은 학년·반을 입력해 주세요.'
          using errcode = 'P0001', hint = 'APP_INVALID';
      end if;
    end if;
  end if;

  -- 승인 상태 자동 관리: 학생·학부모는 승인이 필요 없습니다.
  if new.user_type = 'teacher' then
    if old.user_type is distinct from 'teacher'
       or new.school is distinct from old.school
       or new.teacher_role is distinct from old.teacher_role
       or new.teacher_grade is distinct from old.teacher_grade
       or new.teacher_class is distinct from old.teacher_class then
      -- 관리자 계정이 교사를 고르면 바로 승인됨, 그 밖의 계정은 승인 대기로 바뀝니다.
      new.teacher_status := case when old.role = 'admin' then 'approved' else 'pending' end;
    end if;
  elsif new.user_type is distinct from old.user_type then
    -- 교사에서 학생/학부모/미선택으로 바꾸면 승인 상태를 지웁니다.
    new.teacher_status := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 관리자 함수 확장
-- ---------------------------------------------------------------------

-- 학생/학부모/교사 구분을 관리자가 대신 바꿔 줄 때. 교사로 바꾸면 대상이 관리자인지에 따라 승인 상태를 정합니다.
create or replace function public.admin_set_user_type(p_user uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  perform public.require_admin();
  if p_type not in ('student', 'parent', 'teacher') then
    raise exception '학생·학부모·교사만 고를 수 있어요.' using errcode = 'P0001', hint = 'APP_INVALID';
  end if;
  select role into target_role from public.profiles where id = p_user;
  if target_role is null then
    raise exception '회원을 찾지 못했어요.' using errcode = 'P0001', hint = 'APP_NOT_FOUND';
  end if;
  update public.profiles
    set user_type = p_type,
        teacher_status = case
          when p_type = 'teacher' then (case when target_role = 'admin' then 'approved' else 'pending' end)
          else null
        end
    where id = p_user;
end;
$$;

revoke execute on function public.admin_set_user_type(uuid, text) from public, anon;
grant execute on function public.admin_set_user_type(uuid, text) to authenticated;

-- 교사 승인/반려/대기로 되돌리기 (관리자 전용)
create or replace function public.admin_set_teacher_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text;
begin
  perform public.require_admin();
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception '승인·반려·대기 중 하나여야 해요.' using errcode = 'P0001', hint = 'APP_INVALID';
  end if;
  select user_type into target_type from public.profiles where id = p_user;
  if target_type is null then
    raise exception '회원을 찾지 못했어요.' using errcode = 'P0001', hint = 'APP_NOT_FOUND';
  end if;
  if target_type <> 'teacher' then
    raise exception '교사로 등록한 회원만 승인 상태를 바꿀 수 있어요.' using errcode = 'P0001', hint = 'APP_INVALID';
  end if;
  update public.profiles set teacher_status = p_status where id = p_user;
end;
$$;

revoke execute on function public.admin_set_teacher_status(uuid, text) from public, anon;
grant execute on function public.admin_set_teacher_status(uuid, text) to authenticated;

-- 회원 목록 (반환 항목이 늘어나 지우고 다시 만듭니다)
drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  nickname text,
  role text,
  user_type text,
  real_name text,
  school text,
  grade smallint,
  class_no smallint,
  student_no smallint,
  teacher_role text,
  teacher_grade smallint,
  teacher_class smallint,
  teacher_status text,
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
      p.real_name,
      p.school,
      p.grade,
      p.class_no,
      p.student_no,
      p.teacher_role,
      p.teacher_grade,
      p.teacher_class,
      p.teacher_status,
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

-- ---------------------------------------------------------------------
-- 4. 작성자 배지: 학생/학부모는 그대로, 교사는 '승인됨'일 때만 '선생님' 배지가 보이게
--    (이름·학교 등은 절대 다른 사람에게 나가지 않습니다)
-- ---------------------------------------------------------------------
create or replace function public.get_authors(ids uuid[])
returns table (id uuid, nickname text, is_admin boolean, user_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.nickname,
    p.role = 'admin',
    case
      when p.user_type in ('student', 'parent') then p.user_type
      when p.user_type = 'teacher' and p.teacher_status = 'approved' then 'teacher'
      else null
    end
  from public.profiles p
  where p.id = any (ids[1:200]);
$$;

grant execute on function public.get_authors(uuid[]) to anon, authenticated;

-- PostgREST(사이트가 쓰는 API)가 바뀐 테이블·함수를 바로 알아보도록 알림
notify pgrst, 'reload schema';
