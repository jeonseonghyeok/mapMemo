-- ============================================================
-- migration 0003: approve_submission() 관리자 승인 우회 구멍 차단
--
-- 배경: approve_submission()은 SECURITY DEFINER 함수인데, PostgreSQL 함수는
-- 생성 시 기본적으로 PUBLIC에 EXECUTE 권한이 부여되고 anon/authenticated는
-- PUBLIC을 통해 이를 상속받음. 그래서 anon/authenticated만 콕 집어 REVOKE해도
-- PUBLIC 권한이 남아있으면 여전히 누구나 /rest/v1/rpc/approve_submission을
-- 직접 호출해 자신의 personal 등록을 official로 스스로 승격시킬 수 있었음.
-- 앱 코드(src/app/admin/submissions/actions.ts)의 isAdminEmail() 체크는
-- 앱 레벨일 뿐, DB 함수 자체는 호출자를 검증하지 않았음.
-- → PUBLIC의 EXECUTE 권한을 회수해 service_role(관리자 전용 백엔드 라우트)
--   에서만 호출 가능하도록 제한.
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

revoke execute on function approve_submission(uuid, uuid) from public;

-- PUBLIC 회수는 anon/authenticated/service_role 모두의 상속 권한을 없애버리므로,
-- 정작 관리자 승인 플로우(src/lib/supabase/admin.ts의 service_role 클라이언트)가
-- 호출하지 못하게 됨 → service_role에는 명시적으로 다시 부여해야 함.
grant execute on function approve_submission(uuid, uuid) to service_role;
