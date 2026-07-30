"use client";

import { useState, useTransition } from "react";
import { approveSubmission, rejectSubmission } from "./actions";

export default function SubmissionActions({ submissionId }: { submissionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => run(() => approveSubmission(submissionId))}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          승인
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => rejectSubmission(submissionId))}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          반려
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
