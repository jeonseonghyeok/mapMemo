"use client";

import { useState } from "react";
import { createCategory, createSpace } from "@/app/spaces/actions";
import type { Category } from "@/types/database";

type Props = {
  position: { lat: number; lng: number };
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
};

const NEW_CATEGORY_VALUE = "__new__";

export default function RegisterSpaceModal({
  position,
  categories,
  onClose,
  onCreated,
}: Props) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? NEW_CATEGORY_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const creatingNewCategory = categoryId === NEW_CATEGORY_VALUE;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let targetCategoryId = categoryId;

    if (creatingNewCategory) {
      const trimmed = newCategoryName.trim();
      if (!trimmed) {
        setError("새 카테고리 이름을 입력해주세요.");
        return;
      }
      setSubmitting(true);
      const categoryResult = await createCategory(trimmed);
      if (categoryResult.error || !categoryResult.category) {
        setSubmitting(false);
        setError(categoryResult.error ?? "카테고리 생성에 실패했습니다.");
        return;
      }
      targetCategoryId = categoryResult.category.id;
    } else {
      if (!targetCategoryId) {
        setError("카테고리를 선택해주세요.");
        return;
      }
      setSubmitting(true);
    }

    const result = await createSpace({
      categoryId: targetCategoryId,
      lat: position.lat,
      lng: position.lng,
      name: name || undefined,
      description: description || undefined,
      shared,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">마커 등록</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-black/50 dark:text-white/50"
          >
            닫기
          </button>
        </div>

        <p className="mb-4 text-xs text-black/50 dark:text-white/50">
          선택된 위치: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
              <option value={NEW_CATEGORY_VALUE}>+ 새 카테고리 만들기</option>
            </select>
          </label>

          {creatingNewCategory && (
            <label className="flex flex-col gap-1 text-sm">
              새 카테고리 이름
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="예: 우리 동네 배드민턴장"
                className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
              />
            </label>
          )}

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
            설명 (선택)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border border-black/10 px-3 py-2 outline-none dark:border-white/15"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="h-4 w-4"
            />
            다른 사용자에게 공유하기 (검색·팔로우 대상이 됩니다)
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
      </div>
    </div>
  );
}
