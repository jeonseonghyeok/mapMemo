import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { fetchOfficialToilets } from "@/lib/publicData/toilets";

const TOILET_CATEGORY_NAME = "화장실";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  const admin = createAdminClient();

  let toilets;
  try {
    toilets = await fetchOfficialToilets();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "공공데이터 조회에 실패했습니다." },
      { status: 502 },
    );
  }

  if (toilets.length === 0) {
    return NextResponse.json({ error: "가져올 데이터가 없습니다." }, { status: 200 });
  }

  const { data: category, error: categoryError } = await admin
    .from("categories")
    .select("id")
    .eq("name", TOILET_CATEGORY_NAME)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (categoryError || !category) {
    return NextResponse.json(
      { error: `'${TOILET_CATEGORY_NAME}' 카테고리를 찾을 수 없습니다.` },
      { status: 500 },
    );
  }

  const { error: insertError, count } = await admin.from("spaces").insert(
    toilets.map((t) => ({
      category_id: category.id,
      location: { lat: t.lat, lng: t.lng, address: t.address },
      managed_by: "official" as const,
      details: { name: t.name },
      verified: true,
    })),
    { count: "exact" },
  );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ imported: count ?? toilets.length });
}
