import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkMonthlyLimit } from "@/lib/usage";
import type { SpaceLocation } from "@/types/database";

type ImportRecord = {
  id?: string;
  owner_id?: string | null;
  category_id: string;
  location: SpaceLocation;
  details?: Record<string, unknown>;
  recurring_groups?: unknown[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "올바른 JSON 파일이 아닙니다." }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "spaces 배열 형식의 JSON이어야 합니다." },
      { status: 400 },
    );
  }

  const records = body as ImportRecord[];

  // 본인이 export했던 데이터(id·owner_id가 그대로인 레코드)는 복원으로 취급 —
  // id/created_at을 유지한 채 upsert하면 신규 INSERT가 아니라 UPDATE로 처리되어 과금 대상에서 자동 제외됨
  const ownRecords = records.filter((r) => r.id && r.owner_id === user.id);
  // 그 외(타인 export, 혹은 id가 없는 레코드)는 새 등록으로 취급 — 월별 무료 한도 체크 대상
  const newRecords = records.filter((r) => !(r.id && r.owner_id === user.id));

  let restored = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  if (ownRecords.length > 0) {
    const { error, count } = await supabase
      .from("spaces")
      .upsert(
        ownRecords.map((r) => ({
          id: r.id,
          category_id: r.category_id,
          location: r.location,
          details: r.details ?? {},
          recurring_groups: r.recurring_groups ?? [],
          managed_by: "personal" as const,
          owner_id: user.id,
        })),
        { onConflict: "id", count: "exact" },
      );

    if (error) failed += ownRecords.length;
    else restored += count ?? ownRecords.length;
  }

  for (const record of newRecords) {
    const { allowed } = await checkMonthlyLimit(supabase, user.id);
    if (!allowed) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.from("spaces").insert({
      category_id: record.category_id,
      location: record.location,
      details: record.details ?? {},
      recurring_groups: record.recurring_groups ?? [],
      managed_by: "personal",
      owner_id: user.id,
    });

    if (error) failed += 1;
    else imported += 1;
  }

  return NextResponse.json({ restored, imported, skipped, failed });
}
