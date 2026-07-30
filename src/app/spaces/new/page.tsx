"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import KakaoMapPicker from "@/components/KakaoMapPicker";
import { createSpace } from "../actions";
import type { Category } from "@/types/database";

export default function NewSpacePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setCategories(data ?? []);
        if (data?.[0]) setCategoryId(data[0].id);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categoryId) {
      setError("카테고리를 선택해주세요.");
      return;
    }
    if (!position) {
      setError("지도를 클릭해서 위치를 지정해주세요.");
      return;
    }

    setSubmitting(true);
    const result = await createSpace({
      categoryId,
      lat: position.lat,
      lng: position.lng,
      address: address || undefined,
      name: name || undefined,
      description: description || undefined,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/spaces");
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">공간 등록</h1>
        <Link href="/spaces" className="text-sm text-black/60 dark:text-white/60">
          목록으로
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          카테고리
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          위치 (지도를 클릭해 지정)
          <KakaoMapPicker value={position} onChange={setPosition} />
          {position && (
            <p className="text-xs text-black/50 dark:text-white/50">
              선택됨: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          이름 (선택)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 2층 여자화장실"
            className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          주소 (선택)
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          설명 (선택)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
    </main>
  );
}
