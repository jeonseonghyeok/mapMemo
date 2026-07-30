-- ============================================================
-- migration 0002: entrance(공동현관) 관련 로직 완전 제거
--
-- 배경: 카테고리 이름은 사용자가 자유롭게 바꿀 수 있음(schema.sql 1.categories).
-- categories.submittable=false로 entrance 카테고리 하나만 하드 락하는 방식은
-- 사용자가 이름을 바꾸는 순간 무의미해지는 신뢰할 수 없는 보호장치였음.
-- → entrance 자체를 서비스 범위에서 제거하고, 이를 위해 도입했던
--   submittable / access_code 컬럼도 함께 제거.
--
-- 이미 schema.sql(v2)을 실행한 Supabase 프로젝트에 적용하는 마이그레이션.
-- Supabase SQL Editor에서 실행할 것.
-- ============================================================

-- 1. submit_for_review() 재정의 — submittable 체크 제거
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

-- 2. categories_resolved 뷰 재정의 — submittable 컬럼 제거
drop view if exists categories_resolved;
create view categories_resolved as
select
  c.id,
  c.name,
  resolve_canonical(c.id) as effective_id
from categories c;

-- 3. 공동현관 카테고리로 등록된 spaces가 있다면 먼저 정리 (FK 제약 때문에 선행 필요)
--    실제 운영 데이터가 있었다면 이 DELETE 전에 백업 여부를 검토할 것
delete from spaces
where category_id in (select id from categories where name = '공동현관');

-- 4. 공동현관 시드 카테고리 삭제
delete from categories where name = '공동현관';

-- 5. 더 이상 쓰이지 않는 컬럼 제거
alter table categories drop column if exists submittable;
alter table spaces drop column if exists access_code;
