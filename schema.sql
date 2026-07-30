-- ============================================================
-- 공간정보관리 앱 - Supabase 스키마 (v3)
-- 구성: categories(동적 카테고리+병합) / spaces(공간 정보)
--       submissions(공식 등록 심사 큐) / monthly_registration_usage(과금)
--
-- v3 변경사항:
-- - entrance(공동현관) 카테고리 및 관련 로직 완전 제거
--   → 카테고리 이름은 사용자가 자유롭게 바꿀 수 있어(3.1), submittable=false로
--     특정 카테고리 하나를 하드 락하는 방식은 이름 변경 한 번으로 무의미해짐.
--     신뢰할 수 없는 보호장치이므로 entrance 자체를 서비스 범위에서 제거.
-- - categories.submittable 컬럼 제거 (entrance 락 전용이었던 필드, 더 이상 쓰임새 없음)
-- - spaces.access_code 컬럼 제거 (entrance류 카테고리 전용이었던 필드)
--
-- v2 변경사항:
-- - entrances 별도 테이블 제거 → spaces로 통합
-- - spaces.visibility 컬럼 제거 → 개인 데이터는 영구 비공개, 공개는 오직 심사(submissions) 통과 시에만
-- ============================================================

-- 필요한 확장 활성화
create extension if not exists pgcrypto;   -- uuid 생성용
create extension if not exists postgis;    -- 좌표 기반 검색/클러스터링 대비 (선택)


-- ============================================================
-- 1. categories : 동적으로 생성 가능한 카테고리 + 병합 이력
-- ============================================================
create table categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                 -- 예: "부천 화장실", "화장실"
  created_by    uuid references auth.users(id),-- null이면 사이트 기본 제공 카테고리
  canonical_id  uuid references categories(id),-- 병합된 경우 최종 카테고리 id
  status        text not null default 'active' check (status in ('active','merged')),
  created_at    timestamptz not null default now()
);

create or replace function resolve_canonical(cat_id uuid) returns uuid as $$
declare
  current_id uuid := cat_id;
  next_id uuid;
begin
  loop
    select canonical_id into next_id from categories where id = current_id;
    if next_id is null then
      return current_id;
    end if;
    current_id := next_id;
  end loop;
end;
$$ language plpgsql stable;

create or replace function merge_categories(source_ids uuid[], target_id uuid)
returns void as $$
begin
  update spaces
  set category_id = target_id
  where category_id = any(source_ids);

  update categories
  set canonical_id = target_id, status = 'merged'
  where id = any(source_ids);
end;
$$ language plpgsql;

create view categories_resolved as
select
  c.id,
  c.name,
  resolve_canonical(c.id) as effective_id
from categories c;

insert into categories (name, created_by) values
  ('화장실', null),
  ('스터디룸', null),
  ('화상면접실', null),
  ('배드민턴장', null);


-- ============================================================
-- 2. spaces : 모든 공간 정보 통합 테이블 (화장실/스터디룸/배드민턴장 등)
-- ============================================================
create table spaces (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid not null references categories(id),
  location         jsonb not null,
  managed_by       text not null default 'personal' check (managed_by in ('official','personal')),
  owner_id         uuid references auth.users(id),
  details          jsonb not null default '{}',
  recurring_groups jsonb not null default '[]',
  verified         boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_spaces_category on spaces(category_id);
create index idx_spaces_owner on spaces(owner_id);
create index idx_spaces_details_gin on spaces using gin(details);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_spaces_updated_at
before update on spaces
for each row execute function set_updated_at();


-- ============================================================
-- 3. submissions : 공식 등록 심사 큐
-- ============================================================
create table submissions (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references spaces(id),
  submitted_by  uuid not null references auth.users(id),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  admin_note    text,
  created_at    timestamptz not null default now()
);

create index idx_submissions_status on submissions(status);

create or replace function submit_for_review(target_space_id uuid)
returns uuid as $$
declare
  new_submission_id uuid;
begin
  insert into submissions (space_id, submitted_by, status)
  values (target_space_id, auth.uid(), 'pending')
  returning id into new_submission_id;

  return new_submission_id;
end;
$$ language plpgsql security definer;

create or replace function approve_submission(submission_id uuid, admin_id uuid)
returns void as $$
declare
  src spaces%rowtype;
begin
  select s.* into src
  from spaces s
  where s.id = (select space_id from submissions where id = submission_id);

  insert into spaces (category_id, location, managed_by, details, recurring_groups, verified)
  values (src.category_id, src.location, 'official', src.details, src.recurring_groups, true);

  update submissions
  set status = 'approved', reviewed_by = admin_id, reviewed_at = now()
  where id = submission_id;
end;
$$ language plpgsql security definer;


-- ============================================================
-- 4. monthly_registration_usage : 월별 등록 건수 기반 과금
-- ============================================================
create table monthly_registration_usage (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id),
  month              date not null,
  registration_count int not null default 0,
  plan_tier          text not null default 'free' check (plan_tier in ('free','basic','pro')),
  limit_count        int not null default 20,
  unique(user_id, month)
);

create or replace function increment_registration_count()
returns trigger as $$
declare
  target_month date := date_trunc('month', new.created_at)::date;
  owner uuid;
begin
  owner := coalesce(new.owner_id, null);
  if owner is null then
    return new;
  end if;

  insert into monthly_registration_usage (user_id, month, registration_count)
  values (owner, target_month, 1)
  on conflict (user_id, month)
  do update set registration_count = monthly_registration_usage.registration_count + 1;

  return new;
end;
$$ language plpgsql;

create trigger trg_spaces_registration
after insert on spaces
for each row execute function increment_registration_count();


-- ============================================================
-- 5. Row Level Security (RLS) 정책
-- ============================================================
alter table categories enable row level security;
alter table spaces enable row level security;
alter table submissions enable row level security;
alter table monthly_registration_usage enable row level security;

create policy "categories_read_all" on categories
for select using (status = 'active' or status = 'merged');

create policy "categories_insert_own" on categories
for insert with check (auth.uid() is not null);

create policy "spaces_read" on spaces
for select using (
  managed_by = 'official'
  or owner_id = auth.uid()
);

create policy "spaces_write_own" on spaces
for insert with check (
  managed_by = 'personal' and owner_id = auth.uid()
);

create policy "spaces_update_own" on spaces
for update using (
  managed_by = 'personal' and owner_id = auth.uid()
);

create policy "submissions_read_own" on submissions
for select using (submitted_by = auth.uid());

create policy "submissions_insert_own" on submissions
for insert with check (submitted_by = auth.uid());

create policy "usage_read_own" on monthly_registration_usage
for select using (user_id = auth.uid());


-- ============================================================
-- 6. 참고: 애플리케이션(API) 레벨에서 처리해야 할 것
-- ============================================================
-- - 등록 요청 시 monthly_registration_usage 조회 후 limit_count 초과 여부를
--   먼저 확인하고, 초과 시 결제 유도 응답을 반환 (DB 트리거로 강제 차단 X)
-- - import(복원) 시 원본 id/owner_id/created_at을 그대로 유지해야
--   위 과금 로직이 "복원은 무료"로 정상 동작함
-- - approve_submission()은 관리자 전용 RPC이므로, service_role 키를 쓰는
--   관리자 전용 백엔드 라우트에서만 호출되도록 제한할 것
