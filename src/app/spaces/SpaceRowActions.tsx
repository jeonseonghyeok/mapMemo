"use client";

import { useState, useTransition } from "react";
import { deleteSpace, restoreSpace, submitForReview } from "./actions";

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
