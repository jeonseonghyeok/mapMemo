-- ============================================================
-- migration 0008: service_role 테이블 GRANT 전체 누락 수정
--
-- 배경: 이 프로젝트의 모든 테이블이 SQL Editor로 직접 생성되어, anon/authenticated뿐
-- 아니라 service_role에도 자동으로 GRANT가 붙지 않았다. BYPASSRLS 속성은 RLS 정책만
-- 우회할 뿐 기본 테이블 권한(GRANT)과는 별개 메커니즘이라, service_role로 접속하는
-- 관리자 페이지(createAdminClient, /admin/submissions, /admin/reports 등)의 직접 테이블
-- 조회가 전부 "permission denied"로 막혀 있었다.
-- (RPC 기반 approve_submission 등은 함수가 SECURITY DEFINER로 postgres 소유이기 때문에
-- 이 문제를 우연히 피해갔음)
--
-- service_role은 RLS를 우회하는 신뢰된 백엔드 전용 롤이므로 전체 CRUD를 부여한다.
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

grant select, insert, update, delete on categories to service_role;
grant select, insert, update, delete on spaces to service_role;
grant select, insert, update, delete on submissions to service_role;
grant select, insert, update, delete on monthly_registration_usage to service_role;
grant select, insert, update, delete on profiles to service_role;
grant select, insert, update, delete on reports to service_role;
