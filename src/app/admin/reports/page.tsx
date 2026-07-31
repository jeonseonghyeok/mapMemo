import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import ReportActions from "./ReportActions";
import type { Space, Category } from "@/types/database";

type ReportRow = {
  id: string;
  space_id: string;
  reported_by: string;
  reason: string;
  created_at: string;
  spaces: (Space & { categories: Pick<Category, "name"> | null }) | null;
};

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  if (!isAdminEmail(user.email)) {
    return (
      <main className="mx-auto max-w-lg px-6 py-10 text-sm">
        관리자만 접근할 수 있는 페이지입니다.
      </main>
    );
  }

  const supabaseAdmin = createAdminClient();
  const { data: reports, error } = await supabaseAdmin
    .from("reports")
    .select("id, space_id, reported_by, reason, created_at, spaces(*, categories(name))")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<ReportRow[]>();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">신고 검토</h1>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {reports?.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          대기 중인 신고가 없습니다.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {reports?.map((report) => {
          const space = report.spaces;
          const name =
            (space?.details as { name?: string } | undefined)?.name ??
            space?.location?.address ??
            "이름 없음";

          return (
            <div
              key={report.id}
              className="flex items-center justify-between rounded-md border border-black/10 p-3 dark:border-white/15"
            >
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {space?.categories?.name ?? "카테고리 없음"} ·{" "}
                  {space?.location.lat.toFixed(5)}, {space?.location.lng.toFixed(5)}
                </p>
                <p className="mt-1 text-xs text-black/70 dark:text-white/70">
                  신고 사유: {report.reason}
                </p>
              </div>
              <ReportActions reportId={report.id} spaceId={report.space_id} />
            </div>
          );
        })}
      </div>
    </main>
  );
}
