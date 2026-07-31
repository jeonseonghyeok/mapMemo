"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkMonthlyLimit } from "@/lib/usage";
import { findSensitivePatterns } from "@/lib/contentFilter";

type CreateSpaceInput = {
  categoryId: string;
  lat: number;
  lng: number;
  name?: string;
  description?: string;
  shared: boolean;
};

export async function createSpace(input: CreateSpaceInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { allowed, count, limit } = await checkMonthlyLimit(supabase, user.id);
  if (!allowed) {
    return {
      error: `이번 달 무료 등록 한도(${limit}건)를 초과했습니다. (현재 ${count}건 등록됨)`,
    };
  }

  // 공유 등록은 콘텐츠 필터를 통과해야 함 (PLANNING.md 3.2.2) — 카테고리가 아니라
  // 실제 텍스트 내용을 스캔하므로 카테고리 이름으로는 우회할 수 없다
  if (input.shared) {
    const hits = findSensitivePatterns(`${input.name ?? ""} ${input.description ?? ""}`);
    if (hits.length > 0) {
      return {
        error: `공유하기에는 등록할 수 없는 내용이 포함되어 있습니다 (${hits.join(", ")}). 내용을 수정하거나 공유하기를 꺼주세요.`,
      };
    }
  }

  const { error } = await supabase.from("spaces").insert({
    category_id: input.categoryId,
    location: { lat: input.lat, lng: input.lng },
    managed_by: "personal",
    owner_id: user.id,
    shared: input.shared,
    details: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
  });

  if (error) {
    return { error: `등록에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/spaces");
  revalidatePath("/");
  return { error: null };
}

// 카테고리는 고정 목록이 아니라 사용자가 자유롭게 새로 만들 수 있다 (PLANNING.md 3.1)
export async function createCategory(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다.", category: null };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "카테고리 이름을 입력해주세요.", category: null };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ name: trimmed, created_by: user.id })
    .select()
    .single();

  if (error) {
    return { error: `카테고리 생성에 실패했습니다: ${error.message}`, category: null };
  }

  revalidatePath("/");
  return { error: null, category: data };
}

export async function submitForReview(spaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { error } = await supabase.rpc("submit_for_review", {
    target_space_id: spaceId,
  });

  if (error) {
    return { error: `공식 등록 신청에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/spaces");
  return { error: null };
}

export async function deleteSpace(spaceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("spaces")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", spaceId);

  if (error) {
    return { error: `삭제에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/spaces");
  return { error: null };
}

export async function restoreSpace(spaceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("spaces")
    .update({ deleted_at: null })
    .eq("id", spaceId);

  if (error) {
    return { error: `복원에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/spaces");
  return { error: null };
}

// 공유된(shared=true) space를 신고 — 관리자 1인이 /admin/reports에서 사후 검토한다
// (PLANNING.md 3.2.2 notice-and-takedown 흐름)
export async function reportSpace(spaceId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return { error: "신고 사유를 입력해주세요." };
  }

  const { error } = await supabase.from("reports").insert({
    space_id: spaceId,
    reported_by: user.id,
    reason: trimmed,
  });

  if (error) {
    return { error: `신고 접수에 실패했습니다: ${error.message}` };
  }

  return { error: null };
}
