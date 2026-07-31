"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkMonthlyLimit } from "@/lib/usage";
import type { SpaceLocation } from "@/types/database";

// 초대 링크로 열람한 space를 본인 계정으로 가져오기(import).
// PLANNING.md 8.3/3.4: 본인 소유가 아닌 데이터의 신규 등록으로 분류되어 동일한
// 월별 한도 로직이 적용된다 (별도 예외 없음).
export async function importInvite(token: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const supabaseAdmin = createAdminClient();
  const { data: invite } = await supabaseAdmin
    .from("space_invites")
    .select("expires_at, revoked_at, spaces(category_id, location, details, recurring_groups)")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.revoked_at || new Date(invite.expires_at) < new Date()) {
    return { error: "만료되었거나 존재하지 않는 링크입니다." };
  }

  const src = invite.spaces as {
    category_id: string;
    location: SpaceLocation;
    details: Record<string, unknown>;
    recurring_groups: unknown[];
  } | null;

  if (!src) {
    return { error: "원본 공간을 찾을 수 없습니다." };
  }

  const { allowed, count, limit } = await checkMonthlyLimit(supabase, user.id);
  if (!allowed) {
    return {
      error: `이번 달 무료 등록 한도(${limit}건)를 초과했습니다. (현재 ${count}건 등록됨)`,
    };
  }

  const { error } = await supabase.from("spaces").insert({
    category_id: src.category_id,
    location: src.location,
    details: src.details,
    recurring_groups: src.recurring_groups,
    managed_by: "personal",
    owner_id: user.id,
    shared: false,
  });

  if (error) {
    return { error: `가져오기에 실패했습니다: ${error.message}` };
  }

  return { error: null };
}
