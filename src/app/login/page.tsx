"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkNicknameAvailable } from "./actions";

type Mode = "sign-in" | "sign-up";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "sign-up") {
      const trimmed = nickname.trim();
      if (!trimmed) {
        setError("닉네임을 입력해주세요.");
        return;
      }
      setLoading(true);
      const available = await checkNicknameAvailable(trimmed);
      if (!available) {
        setLoading(false);
        setError("이미 사용 중인 닉네임입니다.");
        return;
      }
    } else {
      setLoading(true);
    }

    const supabase = createClient();
    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { nickname: nickname.trim() } },
          });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (mode === "sign-up") {
      setError("가입 확인 메일을 보냈습니다. 메일함을 확인해주세요.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">
        {mode === "sign-in" ? "로그인" : "회원가입"}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
            placeholder="6자 이상"
          />
        </label>

        {mode === "sign-up" && (
          <label className="flex flex-col gap-1 text-sm">
            닉네임
            <input
              type="text"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
              placeholder="다른 사용자에게 보여질 이름"
            />
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? "처리 중..." : mode === "sign-in" ? "로그인" : "회원가입"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
        className="text-sm text-black/60 underline dark:text-white/60"
      >
        {mode === "sign-in"
          ? "계정이 없으신가요? 회원가입"
          : "이미 계정이 있으신가요? 로그인"}
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
