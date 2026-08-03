-- ============================================================
-- migration 0012: follows(그룹 팔로우) 테이블
--
-- PLANNING.md 3.5/로드맵 14번 — 사이드바의 "팔로우한 타인 마커" 상위 그룹을 실제
-- 팔로우 관계로 걸러 보여주기 위한 최소 테이블. 팔로우를 새로 추가/해제하는 화면은
-- 이번 범위가 아니라 나중에 별도로 만들며, 이번엔 이미 존재하는 관계를 사이드바에서
-- 체크박스로 켜고 끄는 것까지만 지원한다.
--
-- ⚠️ migrations/0006의 교훈: RLS 정책만으로는 접근이 열리지 않는다. Supabase는
-- SQL Editor로 만든 테이블에 anon/authenticated GRANT를 자동으로 붙여주지 않으므로
-- 아래에 명시적 GRANT문을 반드시 포함한다.
--
-- Supabase SQL Editor 또는 MCP apply_migration으로 실행.
-- ============================================================

create table follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references auth.users(id),
  owner_id     uuid not null references auth.users(id), -- 팔로우 대상 그룹의 소유자
  category_id  uuid not null references categories(id),
  created_at   timestamptz not null default now(),
  unique (follower_id, owner_id, category_id)
);

alter table follows enable row level security;

create policy "follows_read_own" on follows
for select using (follower_id = auth.uid());

create policy "follows_insert_own" on follows
for insert with check (follower_id = auth.uid());

create policy "follows_delete_own" on follows
for delete using (follower_id = auth.uid());

grant select, insert, delete on follows to authenticated;
