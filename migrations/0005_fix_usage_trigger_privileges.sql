-- ============================================================
-- migration 0005: increment_registration_count() 트리거 권한 수정
--
-- 배경: 이 함수는 spaces insert 후 monthly_registration_usage에
-- upsert하는 트리거인데, SECURITY DEFINER가 아니어서 호출자(authenticated
-- 롤로 등록하는 일반 사용자)의 권한으로 실행됨. monthly_registration_usage는
-- 자동 집계 전용 테이블이라 사용자에게 INSERT/UPDATE를 직접 열어줄 필요가
-- 없고(과금 카운트를 사용자가 조작할 수 있게 되는 건 더 위험), RLS에도
-- insert/update 정책이 없어 "permission denied for table
-- monthly_registration_usage"로 개인 마커 등록 자체가 막히고 있었음.
-- → submit_for_review/approve_submission과 동일하게 SECURITY DEFINER로
--   전환해 함수 소유자 권한으로 실행되게 함(= RLS/GRANT 우회, 트리거 로직
--   자체는 그대로 이므로 안전).
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

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
$$ language plpgsql security definer;
