-- ============================================================
-- migration 0009: spaces.shared 컬럼 + RLS 확장 (커뮤니티 공유 활성화)
--
-- PLANNING.md 3.2/4.1 — 가장 민감한 단계. 콘텐츠 필터(3.2.2)와 신고+관리자 화면(3.2.2)이
-- 먼저 갖춰진 뒤(체크포인트 1 통과)에만 실행한다.
--
-- personal + shared=true 인 레코드를 다른 로그인 사용자도 조회할 수 있도록 RLS를 넓힌다.
-- 본인 소유(owner_id=auth.uid())는 shared 값과 무관하게 항상 조회 가능하므로 유지됨.
-- Supabase SQL Editor 또는 MCP apply_migration으로 실행.
-- ============================================================

alter table spaces add column shared boolean not null default true;

-- PLANNING.md 3.2: 커뮤니티 공유는 "다른 로그인 사용자"까지만 대상으로 하므로
-- auth.uid() is not null 조건을 반드시 포함한다 (anon에게까지 열리지 않도록)
alter policy "spaces_read" on spaces
using (
  managed_by = 'official'
  or owner_id = auth.uid()
  or (managed_by = 'personal' and shared = true and auth.uid() is not null)
);
