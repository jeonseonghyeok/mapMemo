import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import InviteImportButton from "./InviteImportButton";
import type { Space, Category } from "@/types/database";

type InviteRow = {
  owner_id: string;
  expires_at: string;
  revoked_at: string | null;
  spaces: (Space & { categories: Pick<Category, "name"> | null }) | null;
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabaseAdmin = createAdminClient();

  const { data: invite } = await supabaseAdmin
    .from("space_invites")
    .select("owner_id, expires_at, revoked_at, spaces(*, categories(name))")
    .eq("token", token)
    .maybeSingle<InviteRow>();

  const isInvalid =
    !invite || invite.revoked_at || new Date(invite.expires_at) < new Date();

  if (isInvalid || !invite) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-10 text-center">
        <h1 className="text-xl font-semibold">유효하지 않은 링크</h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          만료되었거나 존재하지 않는 공유 링크입니다.
        </p>
      </main>
    );
  }

  const space = invite.spaces;
  if (!space) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-10 text-center">
        <h1 className="text-xl font-semibold">유효하지 않은 링크</h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          만료되었거나 존재하지 않는 공유 링크입니다.
        </p>
      </main>
    );
  }

  const { data: ownerProfile } = await supabaseAdmin
    .from("profiles")
    .select("nickname")
    .eq("id", invite.owner_id)
    .maybeSingle();

  const name =
    (space.details as { name?: string } | null)?.name ??
    space.categories?.name ??
    "이름 없음";
  const description = (space.details as { description?: string } | null)?.description;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">공유받은 공간</h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          {ownerProfile?.nickname ?? "알 수 없음"}님이 공유했습니다
        </p>
      </div>

      <div className="rounded-md border border-black/10 p-4 dark:border-white/15">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-black/50 dark:text-white/50">
          {space.categories?.name ?? "카테고리 없음"} · {space.location.lat.toFixed(5)},{" "}
          {space.location.lng.toFixed(5)}
        </p>
        {description && <p className="mt-2 text-sm">{description}</p>}
      </div>

      {user ? (
        <InviteImportButton token={token} />
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/i/${token}`)}`}
          className="rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background"
        >
          로그인하고 내 공간에 저장
        </Link>
      )}
    </main>
  );
}
