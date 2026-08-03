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

// 별 하나당 왼쪽 절반/오른쪽 절반을 각각 클릭해 0.5 단위로 평가를 매길 수 있게 한다.
// 실제 별 아이콘을 두 겹(회색 배경 + 채워진 색을 fillPercent%만큼 잘라 보여주는 레이어)으로
// 그려서 절반만 채워진 별도 표현한다.
function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex gap-1 ${disabled ? "opacity-30" : ""}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fillPercent = value == null ? 0 : value >= n ? 100 : value >= n - 0.5 ? 50 : 0;
        return (
          <div key={n} className="relative h-7 w-7 text-2xl leading-none">
            <span className="absolute inset-0 text-black/15 dark:text-white/20">★</span>
            <span
              className="absolute inset-0 overflow-hidden text-red-500"
              style={{ width: `${fillPercent}%` }}
            >
              ★
            </span>
            {!disabled && (
              <>
                <button
                  type="button"
                  aria-label={`${n - 0.5}점`}
                  onClick={() => onChange(n - 0.5)}
                  className="absolute inset-y-0 left-0 w-1/2"
                />
                <button
                  type="button"
                  aria-label={`${n}점`}
                  onClick={() => onChange(n)}
                  className="absolute inset-y-0 right-0 w-1/2"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
  const [rating, setRating] = useState<number | null>(null);
  const [skipRating, setSkipRating] = useState(true);
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
      rating: skipRating || rating == null ? undefined : rating,
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
    // z-index를 사이드바 패널(z-50)/토글 탭(z-60)보다 높게 둬서, 태블릿·데스크탑처럼
    // 사이드바가 기본으로 열려 있는 상태에서 등록 모달을 열어도 가려지지 않게 한다
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
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

          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span>평가 (선택)</span>
              <label className="flex items-center gap-1 text-xs text-black/50 dark:text-white/50">
                <input
                  type="checkbox"
                  checked={skipRating}
                  onChange={(e) => setSkipRating(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                선택안함
              </label>
            </div>
            <StarRating value={rating} onChange={setRating} disabled={skipRating} />
          </div>

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
