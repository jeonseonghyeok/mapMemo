-- ============================================================
-- migration 0007: handle_new_user() search_path 버그 수정
--
-- 배경: 0006에서 만든 handle_new_user() 트리거가 SECURITY DEFINER인데 search_path를
-- 고정하지 않아서, auth.users insert 컨텍스트(supabase_auth_admin 롤)에서 실행될 때
-- 스키마 없는 "profiles"가 public.profiles로 해석되지 않아
-- "relation \"profiles\" does not exist" 에러로 회원가입 자체가 500으로 실패했음.
-- → 테이블 참조를 public.profiles로 명시하고, 함수에 search_path를 고정해 재발 방지.
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
declare
  desired_nickname text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
    'user_' || substr(new.id::text, 1, 8)
  );
begin
  begin
    insert into public.profiles (id, nickname) values (new.id, desired_nickname);
  exception when unique_violation then
    insert into public.profiles (id, nickname)
    values (new.id, desired_nickname || '_' || substr(new.id::text, 1, 4));
  end;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
