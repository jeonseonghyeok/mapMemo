-- ============================================================
-- migration 0004: public 테이블 GRANT 누락 수정
--
-- 배경: schema.sql이 RLS 정책은 작성했지만 anon/authenticated 롤에 대한
-- 테이블 단위 GRANT를 빠뜨렸음. Postgres RLS는 "이미 권한이 있는 요청 중
-- 어떤 행을 보여줄지"를 제어할 뿐 권한 자체를 부여하지 않으므로,
-- GRANT 없이는 RLS 정책과 무관하게 "permission denied for table" 에러가 남.
-- (Supabase 대시보드 Table Editor로 테이블을 만들면 자동으로 붙는 grant가,
--  SQL Editor로 직접 CREATE TABLE 할 때는 붙지 않음)
--
-- 실제 권한 범위는 각 테이블의 RLS 정책과 최대한 맞춤:
-- - categories: 조회는 전체 공개, 등록은 로그인 사용자만
-- - spaces: 조회/등록/수정은 로그인 사용자만(정확한 행 필터는 RLS가 처리).
--   비로그인(anon)도 official 데이터는 봐야 하므로 SELECT는 anon도 포함
-- - submissions / monthly_registration_usage: 로그인 사용자 전용
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

grant select on categories to anon, authenticated;
grant insert on categories to authenticated;

grant select on categories_resolved to anon, authenticated;

grant select, insert, update on spaces to authenticated;
grant select on spaces to anon;

grant select, insert on submissions to authenticated;

grant select on monthly_registration_usage to authenticated;
