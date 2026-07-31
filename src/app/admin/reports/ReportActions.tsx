"use client";

import { useState, useTransition } from "react";
import { takeDownReportedSpace, dismissReport } from "./actions";

export default function ReportActions({
  reportId,
  spaceId,
}: {
  reportId: string;
  spaceId: string;
}) {
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
          onClick={() => run(() => takeDownReportedSpace(reportId, spaceId))}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          비공개 전환
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => dismissReport(reportId))}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
        >
          기각
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
