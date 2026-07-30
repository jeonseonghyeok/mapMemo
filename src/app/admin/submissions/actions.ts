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

export async function approveSubmission(submissionId: string) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const { error } = await supabaseAdmin.rpc("approve_submission", {
    submission_id: submissionId,
    admin_id: admin.id,
  });

  if (error) {
    return { error: `승인에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/admin/submissions");
  return { error: null };
}

export async function rejectSubmission(submissionId: string, note?: string) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const { error } = await supabaseAdmin
    .from("submissions")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: note ?? null,
    })
    .eq("id", submissionId);

  if (error) {
    return { error: `반려 처리에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/admin/submissions");
  return { error: null };
}
