"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportExportPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/spaces/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error ?? "가져오기에 실패했습니다.");
      } else {
        setMessage(
          `복원 ${result.restored}건, 신규 등록 ${result.imported}건` +
            (result.skipped > 0
              ? `, 이번 달 한도 초과로 건너뜀 ${result.skipped}건`
              : ""),
        );
        router.refresh();
      }
    } catch {
      setMessage("파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/spaces/export"
          className="rounded-md border border-black/10 px-3 py-1.5 dark:border-white/15"
        >
          내보내기(Export)
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-black/10 px-3 py-1.5 disabled:opacity-50 dark:border-white/15"
        >
          가져오기(Import)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
      {message && <p className="text-black/60 dark:text-white/60">{message}</p>}
    </div>
  );
}
