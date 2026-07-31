"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// 가입 폼에서 닉네임 중복을 미리 확인하기 위한 액션.
// profiles 조회는 로그인 사용자에게만 열려 있어(RLS), 아직 세션이 없는 가입 단계에서는
// service_role 클라이언트로 존재 여부만 확인한다 (다른 필드는 절대 노출하지 않음).
export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const trimmed = nickname.trim();
  if (!trimmed) return false;

  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("nickname", trimmed)
    .maybeSingle();

  return !data;
}
