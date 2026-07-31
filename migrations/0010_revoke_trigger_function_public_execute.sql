-- ============================================================
-- migration 0010: 트리거 전용 함수의 불필요한 PUBLIC EXECUTE 권한 회수
--
-- 0009 적용 후 get_advisors로 확인한 결과, handle_new_user()/increment_registration_count()가
-- approve_submission의 원래 문제와 같은 패턴으로 anon/authenticated에 EXECUTE가 열려 있었음
-- (/rest/v1/rpc/handle_new_user 등으로 직접 호출 가능). 트리거 전용 함수라 직접 호출해도
-- NEW가 바인딩되지 않아 실제 악용은 안 되지만(Postgres가 "trigger functions can only be
-- called as triggers"로 거부), 불필요한 노출이므로 approve_submission과 동일하게 막는다.
-- 트리거 실행 자체는 함수 소유자 권한으로 동작하므로 이 revoke로 트리거 동작에는 영향 없음.
-- ============================================================

revoke execute on function handle_new_user() from public;
revoke execute on function increment_registration_count() from public;
