-- ============================================================
-- migration 0006: profiles(닉네임) + reports(신고) — 1단계 기반 작업
--
-- PLANNING.md 3.3/3.2.2/7-10,13 참고. "활발한 공유"로 방향 전환하면서 필요해진
-- 두 가지 기반 테이블:
-- - profiles: 이메일을 노출하지 않고 닉네임으로만 다른 사용자에게 식별되게 함
-- - reports: shared=true 데이터에 대한 신고 → 관리자 1인 사후조치(notice-and-takedown)
--
-- ⚠️ 이번 세션에서 배운 교훈: RLS 정책만으로는 접근이 열리지 않는다. Supabase는
-- SQL Editor로 직접 만든 테이블에 anon/authenticated GRANT를 자동으로 붙여주지 않으므로,
-- 아래에 명시적 GRANT문을 반드시 포함한다 (migrations/0004에서 실제로 이 누락으로 전체
-- 조회/등록이 막혔던 사고 재발 방지).
--
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

-- ============================================================
-- 1. profiles
-- ============================================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null unique,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- 다른 로그인 사용자가 "닉네임_그룹이름"으로 검색/식별할 수 있어야 하므로 로그인 사용자
-- 전체에게 읽기 허용 (비로그인 anon에게는 열지 않음 — 커뮤니티 공유 기능 자체가
-- 로그인 사용자 대상)
create policy "profiles_read_authenticated" on profiles
for select using (auth.uid() is not null);

create policy "profiles_insert_own" on profiles
for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
for update using (auth.uid() = id);

grant select, insert, update on profiles to authenticated;

-- 회원가입 시 signUp()의 options.data.nickname으로 전달된 닉네임을 profiles에 자동 반영.
-- 이메일 인증 대기 상태에서도 auth.users row는 즉시 생성되므로, 인증 완료를 기다리지 않고
-- 바로 profiles row를 만들어도 안전함.
create or replace function handle_new_user()
returns trigger as $$
declare
  desired_nickname text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
    'user_' || substr(new.id::text, 1, 8)
  );
begin
  begin
    insert into profiles (id, nickname) values (new.id, desired_nickname);
  exception when unique_violation then
    -- 동시 가입 등으로 닉네임이 충돌하면 접미사를 붙여서라도 가입 자체는 막지 않는다
    insert into profiles (id, nickname)
    values (new.id, desired_nickname || '_' || substr(new.id::text, 1, 4));
  end;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();


-- ============================================================
-- 2. reports (신고 → 관리자 1인 사후조치)
-- ============================================================
create table reports (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references spaces(id),
  reported_by   uuid not null references auth.users(id),
  reason        text not null,
  status        text not null default 'pending' check (status in ('pending','resolved')),
  resolved_by   uuid references auth.users(id),
  resolved_at   timestamptz,
  admin_note    text,
  created_at    timestamptz not null default now()
);

create index idx_reports_status on reports(status);

alter table reports enable row level security;

create policy "reports_insert_own" on reports
for insert with check (reported_by = auth.uid());

create policy "reports_read_own" on reports
for select using (reported_by = auth.uid());

-- 관리자 화면(/admin/reports)은 service_role 키(createAdminClient)로 조회하므로
-- RLS를 우회함 — submissions/승인 플로우와 동일한 패턴. 일반 사용자용 정책은 본인이
-- 제출한 신고만 보이게 최소 권한만 부여.
grant select, insert on reports to authenticated;
