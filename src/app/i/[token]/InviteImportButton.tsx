"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importInvite } from "./actions";

export default function InviteImportButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const result = await importInvite(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-green-600">내 공간에 저장했습니다.</p>
        <button
          onClick={() => router.push("/spaces")}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          내 공간 보기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={pending}
        onClick={handleImport}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "저장 중..." : "내 공간에 저장 (가져오기)"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
