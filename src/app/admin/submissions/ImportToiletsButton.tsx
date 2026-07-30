"use client";

import { useState } from "react";

export default function ImportToiletsButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/import-toilets", { method: "POST" });
      const result = await res.json();
      setMessage(res.ok ? `${result.imported ?? 0}건 가져옴` : result.error);
    } catch {
      setMessage("요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="rounded-md border border-black/10 px-3 py-1.5 disabled:opacity-50 dark:border-white/15"
      >
        공공데이터 화장실 가져오기
      </button>
      {message && <span className="text-black/60 dark:text-white/60">{message}</span>}
    </div>
  );
}
