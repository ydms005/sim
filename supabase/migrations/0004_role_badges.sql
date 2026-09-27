-- =====================================================================
-- 대학길잡이 0004: 커뮤니티 작성자 배지 (관리자 / 선생님 / 학생)
-- 0001 의 get_authors 는 닉네임과 관리자 여부만 돌려주었습니다. 학생/교사 구분(0003 의 profiles.user_type)도
-- 함께 돌려주어, 글쓴이 옆에 '관리자' · '선생님' · '학생' 배지를 붙일 수 있게 합니다.
-- ※ 0005_member_profile.sql 이 이 내용을 포함(교사 승인 반영)하므로, 0005 를 실행했다면 이 파일은 실행하지 마세요.
-- 이메일 등 다른 정보는 여전히 돌려주지 않습니다. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- 돌려주는 열이 바뀌므로 먼저 지우고 다시 만듭니다.
drop function if exists public.get_authors(uuid[]);

create function public.get_authors(ids uuid[])
returns table (id uuid, nickname text, is_admin boolean, user_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nickname, p.role = 'admin', p.user_type
  from public.profiles p
  where p.id = any (ids[1:200]);
$$;

grant execute on function public.get_authors(uuid[]) to anon, authenticated;
