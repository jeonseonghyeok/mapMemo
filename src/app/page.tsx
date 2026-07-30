import Link from "next/link";
import KakaoMap from "@/components/KakaoMap";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-lg font-semibold">mapMemo</h1>
        {user ? (
          <div className="flex items-center gap-3">
            <Link
              href="/spaces"
              className="text-sm text-black/60 dark:text-white/60"
            >
              내 공간
            </Link>
            <span className="text-sm text-black/60 dark:text-white/60">
              {user.email}
            </span>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            로그인
          </Link>
        )}
      </header>
      <main className="flex-1">
        <KakaoMap />
      </main>
    </div>
  );
}
