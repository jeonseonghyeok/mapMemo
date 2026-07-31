import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const DEFAULT_FREE_LIMIT = 20;

function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

// 등록 전에 이번 달 무료 등록 한도 초과 여부를 확인한다.
// (DB 트리거는 카운트만 증가시킬 뿐 차단하지 않으므로, 차단은 반드시 애플리케이션에서)
//
// PLANNING.md 3.4/7-17: 정보 공유 활성화 방향과 상충할 수 있어 한도 차단을 보류.
// monthly_registration_usage 테이블·집계 트리거는 그대로 두고(과금 모델 재설계 시 참고할
// 사용량 데이터는 계속 쌓임), allowed만 항상 true로 반환해 차단하지 않는다.
export async function checkMonthlyLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const month = currentMonthStart();

  const { data } = await supabase
    .from("monthly_registration_usage")
    .select("registration_count, limit_count")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  const count = data?.registration_count ?? 0;
  const limit = data?.limit_count ?? DEFAULT_FREE_LIMIT;

  return { allowed: true, count, limit };
}
