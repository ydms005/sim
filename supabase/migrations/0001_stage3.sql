-- =====================================================================
-- 대학길잡이 3단계: 로그인 · 찜(계정 저장) · 대학별 Q&A 커뮤니티
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
--        여러 번 실행해도 안전하도록(이미 있는 것은 건너뛰거나 새로 고쳐 씀) 만들었습니다.
--        자세한 순서는 supabase/README.md 를 보세요.
--
-- 보안 요약
--   * 구글 이메일·이름은 auth.users(비공개)에만 있고, 공개 테이블에는 저장하지 않습니다.
--     다른 사람에게 보이는 것은 닉네임과 '선생님(관리자)' 여부뿐입니다(get_authors 함수).
--   * 모든 테이블에 RLS(행 수준 보안)를 켭니다. 글은 누구나 읽고, 쓰기는 로그인 + 이용 동의한 사람만.
--   * 작성자·대학·숨김 여부는 글쓴이가 바꿀 수 없고(트리거), 숨김은 관리자만 할 수 있습니다.
--   * 짧은 시간에 글을 너무 많이 쓰지 못하게 제한합니다(질문 10분 5개, 답변 10분 20개).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 프로필 (닉네임 · 역할 · 이용 동의 시각)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  role text not null default 'user',
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_nickname_key unique (nickname),
  constraint profiles_nickname_length check (char_length(nickname) between 2 and 12),
  -- 한글·영문·숫자·밑줄, 단어 사이 공백 한 칸만 (앞뒤 공백·연속 공백 금지)
  constraint profiles_nickname_format check (nickname ~ '^[가-힣A-Za-z0-9_]+( [가-힣A-Za-z0-9_]+)*$'),
  constraint profiles_role_check check (role in ('user', 'admin'))
);

-- 관리자인지 (RLS 정책에서 씀). security definer: profiles 의 RLS 와 상관없이 확인합니다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 이용 약관·개인정보 처리방침에 동의했는지 (글쓰기·찜 저장 조건)
create or replace function public.has_agreed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.agreed_at is not null
  );
$$;

-- 요청이 사이트 사용자(anon/authenticated 역할)에게서 왔는지.
-- SQL Editor(postgres)나 security definer 함수 안에서는 false 라서 관리 작업은 제한을 받지 않습니다.
-- (그래서 이 함수를 부르는 트리거 함수는 security definer 로 만들면 안 됩니다.)
create or replace function public.is_client_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- 임의 닉네임 만들기: '열정적인 수험생1234' (최대 12자)
create or replace function public.random_nickname()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  adjectives text[] := array['열정적인', '성실한', '용감한', '씩씩한', '꼼꼼한', '차분한', '부지런한',
                             '슬기로운', '반짝이는', '든든한', '호기심많은', '느긋한'];
  nouns text[] := array['수험생', '고3', '새내기', '탐험가', '도전자', '꿈나무', '공부벌레'];
  result text;
begin
  loop
    result := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || ' ' || nouns[1 + floor(random() * array_length(nouns, 1))::int]
      || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when char_length(result) <= 12;
  end loop;
  return result;
end;
$$;

-- 새 사용자(구글 로그인 첫 가입) → 프로필 자동 생성. 구글 이름·이메일은 복사하지 않습니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt int := 0;
begin
  loop
    begin
      insert into public.profiles (id, nickname) values (new.id, public.random_nickname())
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      -- 닉네임이 겹치면 다른 닉네임으로 다시 시도
      attempt := attempt + 1;
      if attempt >= 20 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 SQL 을 실행하기 전에 이미 로그인해 본 사용자가 있으면 프로필을 만들어 줍니다.
do $$
declare
  u record;
  attempt int;
begin
  for u in select a.id from auth.users a left join public.profiles p on p.id = a.id where p.id is null loop
    attempt := 0;
    loop
      begin
        insert into public.profiles (id, nickname) values (u.id, public.random_nickname());
        exit;
      exception when unique_violation then
        attempt := attempt + 1;
        if attempt >= 20 then raise; end if;
      end;
    end loop;
  end loop;
end;
$$;

-- 프로필 수정 제한: 사용자는 닉네임과 동의 시각만 바꿀 수 있고, 동의 시각은 서버 시각으로 한 번만 기록됩니다.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_client_request() then
    return new; -- SQL Editor 등 관리 작업
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
  return new;
end;
$$;

create or replace trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- 다른 사람에게 보여 줄 작성자 정보 (닉네임 + 관리자 여부만. 이메일 등은 절대 포함하지 않음)
create or replace function public.get_authors(ids uuid[])
returns table (id uuid, nickname text, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nickname, p.role = 'admin'
  from public.profiles p
  where p.id = any (ids[1:200]);
$$;

-- 회원 탈퇴: 로그인한 본인의 계정을 지웁니다. 프로필·찜·질문·답변이 함께 지워집니다(on delete cascade).
create or replace function public.delete_my_account()
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
  delete from auth.users where id = uid;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 찜한 대학
-- ---------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  univ_id int not null check (univ_id > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, univ_id)
);

create or replace function public.favorites_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request()
     and (select count(*) from public.favorites f where f.user_id = new.user_id) >= 300 then
    raise exception '찜은 300개까지만 할 수 있어요.' using errcode = 'P0001', hint = 'APP_LIMIT';
  end if;
  return new;
end;
$$;

create or replace trigger favorites_limit
  before insert on public.favorites
  for each row execute function public.favorites_limit();

-- ---------------------------------------------------------------------
-- 3. 커뮤니티: 질문 · 답변
-- ---------------------------------------------------------------------
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  univ_id int not null check (univ_id > 0),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  body text not null check (char_length(btrim(body)) between 2 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_hidden boolean not null default false,
  answer_count int not null default 0
);

create index if not exists questions_univ_created_idx on public.questions (univ_id, created_at desc);
create index if not exists questions_user_created_idx on public.questions (user_id, created_at desc);

create table if not exists public.answers (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.questions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_hidden boolean not null default false
);

create index if not exists answers_question_created_idx on public.answers (question_id, created_at);
create index if not exists answers_user_created_idx on public.answers (user_id, created_at desc);

-- 새 글: 작성자는 본인, 숨김·답변 수·시각은 서버가 정함 + 도배 방지
create or replace function public.posts_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  recent int;
begin
  if not public.is_client_request() then
    return new;
  end if;
  new.user_id := auth.uid();
  new.is_hidden := false;
  new.created_at := now();
  new.updated_at := now();
  if tg_table_name = 'questions' then
    new.answer_count := 0;
    select count(*) into recent from public.questions q
      where q.user_id = new.user_id and q.created_at > now() - interval '10 minutes';
    if recent >= 5 then
      raise exception '질문은 10분에 5개까지 올릴 수 있어요. 잠시 뒤에 다시 시도해 주세요.'
        using errcode = 'P0001', hint = 'APP_RATE_LIMIT';
    end if;
  else
    select count(*) into recent from public.answers a
      where a.user_id = new.user_id and a.created_at > now() - interval '10 minutes';
    if recent >= 20 then
      raise exception '답변은 10분에 20개까지 올릴 수 있어요. 잠시 뒤에 다시 시도해 주세요.'
        using errcode = 'P0001', hint = 'APP_RATE_LIMIT';
    end if;
  end if;
  return new;
end;
$$;

-- 글 수정 제한: 작성자·대학·질문 번호는 못 바꿈, 숨김은 관리자만, 내용은 작성자만(숨겨진 글은 수정 불가)
create or replace function public.posts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  admin boolean;
  content_changed boolean;
begin
  if not public.is_client_request() then
    return new;
  end if;
  admin := public.is_admin();
  if new.user_id is distinct from old.user_id then
    raise exception '작성자는 바꿀 수 없어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
  end if;
  if tg_table_name = 'questions' then
    if new.univ_id is distinct from old.univ_id then
      raise exception '질문의 대학은 바꿀 수 없어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
    end if;
    new.answer_count := old.answer_count;
    content_changed := new.title is distinct from old.title or new.body is distinct from old.body;
  else
    if new.question_id is distinct from old.question_id then
      raise exception '답변이 달린 질문은 바꿀 수 없어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
    end if;
    content_changed := new.body is distinct from old.body;
  end if;
  new.created_at := old.created_at;
  if new.is_hidden is distinct from old.is_hidden and not admin then
    raise exception '숨기기는 관리자만 할 수 있어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
  end if;
  if content_changed then
    if old.user_id is distinct from auth.uid() then
      raise exception '다른 사람의 글은 수정할 수 없어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
    end if;
    if old.is_hidden and not admin then
      raise exception '관리자가 숨긴 글은 수정할 수 없어요.' using errcode = 'P0001', hint = 'APP_FORBIDDEN';
    end if;
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create or replace trigger questions_before_insert
  before insert on public.questions
  for each row execute function public.posts_before_insert();

create or replace trigger questions_before_update
  before update on public.questions
  for each row execute function public.posts_before_update();

create or replace trigger answers_before_insert
  before insert on public.answers
  for each row execute function public.posts_before_insert();

create or replace trigger answers_before_update
  before update on public.answers
  for each row execute function public.posts_before_update();

-- 질문의 답변 수(숨기지 않은 답변만) 자동 계산
create or replace function public.refresh_answer_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  qid bigint;
begin
  foreach qid in array array[
    case when tg_op in ('INSERT', 'UPDATE') then new.question_id end,
    case when tg_op in ('DELETE', 'UPDATE') then old.question_id end
  ] loop
    if qid is not null then
      update public.questions q
        set answer_count = (select count(*) from public.answers a where a.question_id = qid and not a.is_hidden)
        where q.id = qid;
    end if;
  end loop;
  return null;
end;
$$;

create or replace trigger answers_count
  after insert or delete or update of is_hidden, question_id on public.answers
  for each row execute function public.refresh_answer_count();

-- ---------------------------------------------------------------------
-- 4. 권한 (RLS 정책 + 열 단위 권한)
--    Supabase 는 public 스키마의 새 테이블에 anon/authenticated 전체 권한을 기본으로 주므로,
--    한 번 모두 거둔 뒤 필요한 것만 다시 줍니다.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

revoke all on table public.profiles, public.favorites, public.questions, public.answers from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (nickname, agreed_at) on table public.profiles to authenticated;

grant select, delete on table public.favorites to authenticated;
grant insert (univ_id) on table public.favorites to authenticated;

grant select on table public.questions, public.answers to anon, authenticated;
grant insert (univ_id, title, body) on table public.questions to authenticated;
grant update (title, body, is_hidden) on table public.questions to authenticated;
grant insert (question_id, body) on table public.answers to authenticated;
grant update (body, is_hidden) on table public.answers to authenticated;
grant delete on table public.questions, public.answers to authenticated;

-- profiles: 본인 것만 보고 고침(관리자는 모두 볼 수 있음). 다른 사람의 닉네임은 get_authors() 로만.
drop policy if exists "profiles: 본인 또는 관리자 읽기" on public.profiles;
create policy "profiles: 본인 또는 관리자 읽기" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles: 본인 수정" on public.profiles;
create policy "profiles: 본인 수정" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- favorites: 본인 것만
drop policy if exists "favorites: 본인 읽기" on public.favorites;
create policy "favorites: 본인 읽기" on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "favorites: 본인 추가" on public.favorites;
create policy "favorites: 본인 추가" on public.favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_agreed()));

drop policy if exists "favorites: 본인 삭제" on public.favorites;
create policy "favorites: 본인 삭제" on public.favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- questions
drop policy if exists "questions: 읽기" on public.questions;
create policy "questions: 읽기" on public.questions
  for select to anon, authenticated
  using (not is_hidden or user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "questions: 쓰기" on public.questions;
create policy "questions: 쓰기" on public.questions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_agreed()));

drop policy if exists "questions: 수정" on public.questions;
create policy "questions: 수정" on public.questions
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "questions: 삭제" on public.questions;
create policy "questions: 삭제" on public.questions
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- answers
drop policy if exists "answers: 읽기" on public.answers;
-- 숨긴 질문에 달린 답변도 함께 가려집니다.
create policy "answers: 읽기" on public.answers
  for select to anon, authenticated
  using (
    (not is_hidden and exists (select 1 from public.questions q where q.id = question_id and not q.is_hidden))
    or user_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists "answers: 쓰기" on public.answers;
create policy "answers: 쓰기" on public.answers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.has_agreed())
    and exists (select 1 from public.questions q where q.id = question_id and not q.is_hidden)
  );

drop policy if exists "answers: 수정" on public.answers;
create policy "answers: 수정" on public.answers
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "answers: 삭제" on public.answers;
create policy "answers: 삭제" on public.answers
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- 함수 실행 권한: 사이트에서 부를 함수만 열어 둡니다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.favorites_limit() from public, anon, authenticated;
revoke execute on function public.posts_before_insert() from public, anon, authenticated;
revoke execute on function public.posts_before_update() from public, anon, authenticated;
revoke execute on function public.refresh_answer_count() from public, anon, authenticated;
revoke execute on function public.random_nickname() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_authors(uuid[]) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_agreed() to anon, authenticated;
grant execute on function public.is_client_request() to anon, authenticated;

-- PostgREST(사이트가 쓰는 API)가 바뀐 테이블·함수를 바로 알아보도록 알림
notify pgrst, 'reload schema';
