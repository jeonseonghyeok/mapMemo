"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkMonthlyLimit } from "@/lib/usage";

type CreateSpaceInput = {
  categoryId: string;
  lat: number;
  lng: number;
  address?: string;
  name?: string;
  description?: string;
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

  const { error } = await supabase.from("spaces").insert({
    category_id: input.categoryId,
    location: { lat: input.lat, lng: input.lng, address: input.address },
    managed_by: "personal",
    owner_id: user.id,
    details: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
  });

  if (error) {
    return { error: `등록에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/spaces");
  return { error: null };
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
