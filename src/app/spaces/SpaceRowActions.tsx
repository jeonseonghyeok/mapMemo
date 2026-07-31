"use client";

import { useState, useTransition } from "react";
import { deleteSpace, restoreSpace, submitForReview, createInvite } from "./actions";

type Props = {
  spaceId: string;
  deleted: boolean;
  submissionStatus: "pending" | "approved" | "rejected" | null;
};

export default function SpaceRowActions({
  spaceId,
  deleted,
  submissionStatus,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  // PLANNING.md 8.3 — 지인에게 명시적으로 공유하는 초대 링크 생성
  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const result = await createInvite(spaceId);
      if (result.error || !result.token) {
        setError(result.error ?? "초대 링크 생성에 실패했습니다.");
        return;
      }
      const url = `${window.location.origin}/i/${result.token}`;
      try {
        await navigator.clipboard.writeText(url);
        window.alert(`공유 링크가 복사되었습니다 (7일간 유효):\n${url}`);
      } catch {
        window.prompt("아래 링크를 복사하세요 (7일간 유효):", url);
      }
    });
  }

  if (deleted) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          disabled={pending}
          onClick={() => run(() => restoreSpace(spaceId))}
          className="text-sm text-blue-600 underline disabled:opacity-50"
        >
          복원
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        {submissionStatus === null && (
          <button
            disabled={pending}
            onClick={() => run(() => submitForReview(spaceId))}
            className="text-sm text-blue-600 underline disabled:opacity-50"
          >
            공식 등록 신청
          </button>
        )}
        {submissionStatus === "pending" && (
          <span className="text-sm text-amber-600">심사 중</span>
        )}
        {submissionStatus === "approved" && (
          <span className="text-sm text-green-600">공식 등록됨</span>
        )}
        {submissionStatus === "rejected" && (
          <button
            disabled={pending}
            onClick={() => run(() => submitForReview(spaceId))}
            className="text-sm text-blue-600 underline disabled:opacity-50"
          >
            반려됨 · 재신청
          </button>
        )}
        <button
          disabled={pending}
          onClick={handleInvite}
          className="text-sm text-blue-600 underline disabled:opacity-50"
        >
          초대 링크
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => deleteSpace(spaceId))}
          className="text-sm text-red-600 underline disabled:opacity-50"
        >
          삭제
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
