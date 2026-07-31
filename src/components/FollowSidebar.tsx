"use client";

import { useState } from "react";

type Candidate = {
  key: string;
  label: string; // "{닉네임}_{카테고리명}"
};

type Props = {
  open: boolean;
  onClose: () => void;
  candidates: Candidate[];
};

// PLANNING.md 로드맵 15번 — 팔로우 사이드바 뼈대. follows 테이블/영속화는 다음 단계라
// "팔로우" 버튼은 아직 아무것도 저장하지 않고 안내만 띄운다. 지도는 그대로 두고 이 패널만
// 오른쪽에서 슬라이드 인/아웃한다.
export default function FollowSidebar({ open, onClose, candidates }: Props) {
  const [search, setSearch] = useState("");

  const visible = search.trim()
    ? candidates.filter((c) => c.label.toLowerCase().includes(search.trim().toLowerCase()))
    : candidates;

  return (
    <>
      {open && <div className="absolute inset-0 z-40 bg-black/20" onClick={onClose} />}
      <div
        className={`absolute inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col gap-4 bg-background p-4 shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">팔로우</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-black/50 dark:text-white/50"
          >
            닫기
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="닉네임_그룹이름 검색"
          className="rounded-md border border-black/10 px-3 py-2 text-sm outline-none dark:border-white/15"
        />

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-black/50 dark:text-white/50">
            공유 중인 그룹
          </h3>
          {visible.length === 0 && (
            <p className="text-sm text-black/40 dark:text-white/40">
              {candidates.length === 0
                ? "아직 다른 사용자가 공유한 그룹이 없습니다."
                : "검색과 일치하는 그룹이 없습니다."}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {visible.map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15"
              >
                <span>{c.label}</span>
                <button
                  type="button"
                  title="팔로우 기능은 곧 제공됩니다"
                  onClick={() => window.alert("팔로우 기능은 곧 제공됩니다.")}
                  className="whitespace-nowrap rounded-md border border-black/10 px-2 py-1 text-xs text-black/40 dark:border-white/15 dark:text-white/40"
                >
                  팔로우(준비 중)
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-black/50 dark:text-white/50">
            팔로우한 회원/그룹
          </h3>
          <p className="text-sm text-black/40 dark:text-white/40">
            아직 팔로우 기능이 준비되지 않았습니다.
          </p>
        </section>
      </div>
    </>
  );
}
