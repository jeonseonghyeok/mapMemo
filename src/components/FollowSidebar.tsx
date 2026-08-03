"use client";

import { useState } from "react";

export type GroupItem = {
  key: string;
  label: string;
};

export type GroupSection = {
  kind: "official" | "mine" | "follow";
  title: string;
  items: GroupItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  hideToggle?: boolean;
  groupSections: GroupSection[];
  uncheckedGroups: Set<string>;
  onToggleGroupChecked: (key: string) => void;
  onSetGroupsChecked: (keys: string[], checked: boolean) => void;
};

// PLANNING.md 로드맵 14~16번 — 공식 데이터/내 마커/팔로우한 타인 마커 3개 상위 그룹과
// 그 아래 체크박스로 지도 표시 여부를 즉시 토글하는 트리. 팔로우를 새로 추가/해제하는 화면은
// 이번 범위가 아니라 나중에 별도로 만든다 — 여기서는 이미 존재하는 팔로우 관계를 켜고 끄는
// 것까지만 다룬다.
export default function FollowSidebar({
  open,
  onClose,
  onToggle,
  hideToggle,
  groupSections,
  uncheckedGroups,
  onToggleGroupChecked,
  onSetGroupsChecked,
}: Props) {
  // 상위 그룹은 기본 펼침 상태 — 접은 것만 이 Set에 담는다
  const [collapsedSections, setCollapsedSections] = useState<Set<GroupSection["kind"]>>(
    new Set(),
  );

  function toggleCollapsed(kind: GroupSection["kind"]) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <>
      {!hideToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "사이드바 닫기" : "사이드바 열기"}
          className="absolute right-3 top-3 z-[60] rounded-md border border-black/10 bg-background px-2 py-2 text-sm shadow-md dark:border-white/15"
        >
          {open ? "›" : "‹"}
        </button>
      )}

      {/* 패널 폭은 max-w-xs(320px)로 고정 — 화면폭이 640px(sm) 이상이면 패널이 화면의
          50% 미만이라 지도를 어둡게 가리거나 클릭을 막을 필요가 없다 */}
      {open && <div className="absolute inset-0 z-40 bg-black/20 sm:hidden" onClick={onClose} />}
      <div
        className={`absolute inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <h2 className="text-base font-semibold">그룹</h2>

        <div className="flex flex-1 flex-col gap-4">
          {groupSections.map((section) => {
            const sectionKeys = section.items.map((item) => item.key);
            const checkedCount = sectionKeys.filter((key) => !uncheckedGroups.has(key)).length;
            const allChecked = sectionKeys.length > 0 && checkedCount === sectionKeys.length;
            const someChecked = checkedCount > 0 && checkedCount < sectionKeys.length;
            const collapsed = collapsedSections.has(section.kind);

            return (
              <section key={section.kind} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    disabled={sectionKeys.length === 0}
                    onChange={() => onSetGroupsChecked(sectionKeys, !allChecked)}
                    className="h-4 w-4 shrink-0 disabled:opacity-30"
                  />
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(section.kind)}
                    className="flex flex-1 items-center justify-between text-xs font-medium text-black/50 dark:text-white/50"
                  >
                    <span>{section.title}</span>
                    <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
                  </button>
                </div>

                {!collapsed &&
                  (section.items.length === 0 ? (
                    <p className="text-sm text-black/40 dark:text-white/40">
                      {section.kind === "follow"
                        ? "아직 팔로우한 그룹이 없습니다."
                        : "아직 없습니다."}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {section.items.map((item) => (
                        <li key={item.key}>
                          <label className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15">
                            <input
                              type="checkbox"
                              checked={!uncheckedGroups.has(item.key)}
                              onChange={() => onToggleGroupChecked(item.key)}
                              className="h-4 w-4"
                            />
                            <span>{item.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ))}
              </section>
            );
          })}
        </div>

        <section className="flex flex-col gap-2 border-t border-black/10 pt-4 dark:border-white/15">
          <h3 className="text-xs font-medium text-black/50 dark:text-white/50">
            새로운 그룹 팔로우하기
          </h3>
          <p className="text-sm text-black/40 dark:text-white/40">
            다른 사용자나 그룹을 팔로우하는 화면은 준비 중입니다.
          </p>
        </section>
      </div>
    </>
  );
}
