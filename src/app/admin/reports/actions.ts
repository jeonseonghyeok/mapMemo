"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    throw new Error("관리자만 사용할 수 있습니다.");
  }

  return user;
}

// 신고를 받아들여 해당 space를 비공개로 전환 (soft take-down — 소유권·데이터는 유지)
export async function takeDownReportedSpace(reportId: string, spaceId: string, note?: string) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const { error: spaceError } = await supabaseAdmin
    .from("spaces")
    .update({ shared: false })
    .eq("id", spaceId);

  if (spaceError) {
    return { error: `비공개 전환에 실패했습니다: ${spaceError.message}` };
  }

  const { error } = await supabaseAdmin
    .from("reports")
    .update({
      status: "resolved",
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
      admin_note: note ?? "shared=false로 전환",
    })
    .eq("id", reportId);

  if (error) {
    return { error: `신고 처리에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/admin/reports");
  return { error: null };
}

// 신고를 검토했으나 조치가 필요 없다고 판단 — 기각
export async function dismissReport(reportId: string, note?: string) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const { error } = await supabaseAdmin
    .from("reports")
    .update({
      status: "resolved",
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
      admin_note: note ?? "기각",
    })
    .eq("id", reportId);

  if (error) {
    return { error: `신고 처리에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/admin/reports");
  return { error: null };
}
