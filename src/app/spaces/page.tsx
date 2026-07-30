import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SpaceRowActions from "./SpaceRowActions";
import ImportExportPanel from "./ImportExportPanel";
import type { Submission } from "@/types/database";

export default async function SpacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: spaces } = await supabase
    .from("spaces")
    .select("*, categories(name)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const spaceIds = (spaces ?? []).map((s) => s.id);
  const { data: submissions } = spaceIds.length
    ? await supabase
        .from("submissions")
        .select("*")
        .in("space_id", spaceIds)
        .order("created_at", { ascending: false })
    : { data: [] as Submission[] };

  const latestSubmissionBySpace = new Map<string, Submission>();
  for (const s of submissions ?? []) {
    if (!latestSubmissionBySpace.has(s.space_id)) {
      latestSubmissionBySpace.set(s.space_id, s);
    }
  }

  const activeSpaces = (spaces ?? []).filter((s) => !s.deleted_at);
  const deletedSpaces = (spaces ?? []).filter((s) => s.deleted_at);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">내 공간</h1>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-black/60 dark:text-white/60">
            지도
          </Link>
          <Link
            href="/"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + 지도에서 등록
          </Link>
        </div>
      </div>

      <ImportExportPanel />

      <section className="flex flex-col gap-3">
        {activeSpaces.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            등록된 공간이 없습니다.
          </p>
        )}
        {activeSpaces.map((space) => {
          const category = (
            space as unknown as { categories: { name: string } | null }
          ).categories;
          const name =
            (space.details as { name?: string })?.name ??
            space.location.address ??
            category?.name ??
            "이름 없음";
          const submission = latestSubmissionBySpace.get(space.id) ?? null;

          return (
            <div
              key={space.id}
              className="flex items-center justify-between rounded-md border border-black/10 p-3 dark:border-white/15"
            >
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {category?.name ?? "카테고리 없음"}
                </p>
              </div>
              <SpaceRowActions
                spaceId={space.id}
                deleted={false}
                submissionStatus={submission?.status ?? null}
              />
            </div>
          );
        })}
      </section>

      {deletedSpaces.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
            삭제됨
          </h2>
          {deletedSpaces.map((space) => {
            const name =
              (space.details as { name?: string })?.name ??
              space.location.address ??
              "이름 없음";
            return (
              <div
                key={space.id}
                className="flex items-center justify-between rounded-md border border-black/10 p-3 opacity-60 dark:border-white/15"
              >
                <p className="text-sm">{name}</p>
                <SpaceRowActions
                  spaceId={space.id}
                  deleted={true}
                  submissionStatus={null}
                />
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
