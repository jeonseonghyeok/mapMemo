-- ============================================================
-- migration 0011: space_invites — 지인에게 명시적 공유(초대) (PLANNING.md 8.3)
--
-- 3.2/3.5의 커뮤니티 공유(팔로우·검색 기반, 승인 없이 열림)와는 별개로,
-- 소유자가 특정 space를 특정 링크를 아는 사람에게만 콕 집어 보여주는 기능.
-- shared=false인 비공개 데이터도 이 초대 링크로는 예외적으로 열람 가능하다.
--
-- 토큰 조회는 일반 사용자 클라이언트가 아니라 service_role(관리자 클라이언트)로
-- src/app/i/actions.ts의 resolveInvite()에서 처리하므로, anon/authenticated에게
-- 별도 select 정책을 열어줄 필요는 없다 — 소유자 본인의 CRUD만 RLS로 허용.
-- Supabase에 apply_migration으로 직접 적용.
-- ============================================================

create table space_invites (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id),
  owner_id    uuid not null references auth.users(id),
  token       text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_space_invites_token on space_invites(token);
create index idx_space_invites_space on space_invites(space_id);

alter table space_invites enable row level security;

create policy "space_invites_owner_all" on space_invites
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

grant select, insert, update, delete on space_invites to authenticated;
grant select, insert, update, delete on space_invites to service_role;
