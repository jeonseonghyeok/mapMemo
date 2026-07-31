"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadKakaoSdk } from "@/lib/kakao";
import RegisterSpaceModal from "@/components/RegisterSpaceModal";
import FollowSidebar from "@/components/FollowSidebar";
import { reportSpace } from "@/app/spaces/actions";
import type { Category, Space } from "@/types/database";

declare global {
  interface Window {
    __mapmemoReport?: (spaceId: string) => void;
  }
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const OWNER_FILTER_STORAGE_KEY = "mapmemo:filterOwnerScopes";
const CATEGORY_FILTER_STORAGE_KEY = "mapmemo:filterCategories";
// PLANNING.md 8.1 — 롱프레스 판정 기준
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_PX = 10;

type SpaceRow = Pick<
  Space,
  "id" | "category_id" | "location" | "managed_by" | "details" | "owner_id"
> & {
  categories: { name: string } | null;
};

// "그룹"을 소유 범위(공식/내 등록/타인의 공유)와 카테고리, 두 개의 독립된 facet으로 분해해
// 탭으로 나눠 고르고 선택 결과를 칩으로 모아 보여준다 (PLANNING.md 8.2 재설계).
type FilterOption = {
  key: string;
  label: string;
};

type LongPressMenu = {
  screenX: number;
  screenY: number;
  lat: number;
  lng: number;
};

type FilterTab = "owner" | "category";

function ownerScopeKey(space: SpaceRow, currentUserId: string | null): string {
  if (space.managed_by === "official") return "official";
  if (space.owner_id === currentUserId) return "mine";
  return `user:${space.owner_id}`;
}

function ownerScopeLabel(
  space: SpaceRow,
  currentUserId: string | null,
  nicknames: Map<string, string>,
): string {
  if (space.managed_by === "official") return "공식";
  if (space.owner_id === currentUserId) return "내 등록";
  return (space.owner_id && nicknames.get(space.owner_id)) || "알 수 없음";
}

// 화면 픽셀 좌표 → 위경도. 롱프레스/우클릭은 아직 손을 떼지 않은 시점(=카카오맵 자체의
// click/rightclick 이벤트가 없는 시점)에 좌표가 필요해서 직접 계산한다. 카카오 SDK에
// Projection류 API가 있는지 불확실해 의존하지 않고, 확실히 존재하는 map.getBounds()로
// 컨테이너 내 상대 위치를 위경도 범위에 선형 보간한다 — 이 프로젝트가 다루는 확대 수준
// (도시 블록)에서는 메르카토르 왜곡이 무시할 만큼 작다.
function pixelToLatLng(
  map: kakao.maps.Map,
  container: HTMLElement,
  clientX: number,
  clientY: number,
): kakao.maps.LatLng {
  const rect = container.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lat = ne.getLat() + py * (sw.getLat() - ne.getLat());
  const lng = sw.getLng() + px * (ne.getLng() - sw.getLng());
  return new window.kakao.maps.LatLng(lat, lng);
}

// 재접속 시 이전 필터 상태 복원 — 렌더 중 동기적으로 읽어 lazy init에 사용
// (이펙트에서 setState하면 불필요한 리렌더가 한 번 더 발생하므로 지양)
function readStoredSet(key: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export default function KakaoMap() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  // 롱프레스 판정용 — pointerdown 시작 지점과, 임계값 이전 이동으로 취소됐는지 여부
  const pressStateRef = useRef<{ x: number; y: number; cancelled: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [ownerNicknames, setOwnerNicknames] = useState<Map<string, string>>(new Map());
  // null = 사용자가 아직 명시적으로 선택한 적 없음 → effective 값에서 "전체 선택"으로 대체
  const [selectedOwnerScopes, setSelectedOwnerScopes] = useState<Set<string> | null>(() =>
    readStoredSet(OWNER_FILTER_STORAGE_KEY),
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(() =>
    readStoredSet(CATEGORY_FILTER_STORAGE_KEY),
  );
  const [activeTab, setActiveTab] = useState<FilterTab>("owner");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [longPressMenu, setLongPressMenu] = useState<LongPressMenu | null>(null);
  const [pendingPosition, setPendingPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  // pointerdown 시점에 등록된 setTimeout 콜백은 mount 시 한 번만 만들어지는 클로저이므로,
  // 최신 로그인 상태를 보려면 ref로 미러링해서 읽는다
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // 카카오 InfoWindow는 React 트리 밖의 순수 HTML이라, 신고 버튼 클릭을 전역 콜백으로 연결한다
  useEffect(() => {
    window.__mapmemoReport = async (spaceId: string) => {
      const reason = window.prompt("신고 사유를 입력해주세요.");
      if (!reason || !reason.trim()) return;
      const result = await reportSpace(spaceId, reason);
      window.alert(result.error ?? "신고가 접수되었습니다. 검토 후 조치됩니다.");
    };
    return () => {
      delete window.__mapmemoReport;
    };
  }, []);

  const loadSpaces = useCallback(async () => {
    const supabase = createClient();
    // managed_by 필터를 걸지 않아도 RLS(spaces_read)가
    // "official 전체 + 내가 owner인 personal + 로그인 사용자에게 공유된(shared=true) personal"을
    // 알아서 걸러서 돌려준다.
    const { data, error: fetchError } = await supabase
      .from("spaces")
      .select("id, category_id, location, managed_by, details, owner_id, categories(name)")
      .is("deleted_at", null);

    if (fetchError) {
      setError(`데이터 조회 실패: ${fetchError.message}`);
      return;
    }
    const rows = (data ?? []) as unknown as SpaceRow[];
    setSpaces(rows);

    // 타인이 공유한 소유 범위는 닉네임으로 표시해야 하므로(3.3) owner의 닉네임을 조회
    const ownerIds = Array.from(
      new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id)),
    );
    if (ownerIds.length === 0) {
      setOwnerNicknames(new Map());
      return;
    }
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", ownerIds);
    setOwnerNicknames(new Map((profileRows ?? []).map((p) => [p.id, p.nickname])));
  }, []);

  const loadCategories = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .order("name");
    setCategories(data ?? []);
  }, []);

  function closeLongPressMenu() {
    setLongPressMenu(null);
  }

  function openRegisterModalAt(lat: number, lng: number) {
    setLongPressMenu(null);
    setPendingPosition({ lat, lng });
    setModalOpen(true);
  }

  async function handleCreated() {
    setModalOpen(false);
    setPendingPosition(null);
    await Promise.all([loadSpaces(), loadCategories()]);
  }

  // 롱프레스(500ms, 아직 손을 떼지 않은 시점)와 우클릭 둘 다 이 함수로 귀결된다
  const triggerMenuAt = useCallback((clientX: number, clientY: number) => {
    if (!userIdRef.current) {
      router.push("/login");
      return;
    }
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;

    const latlng = pixelToLatLng(map, container, clientX, clientY);
    const rect = container.getBoundingClientRect();
    setLongPressMenu({
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      lat: latlng.getLat(),
      lng: latlng.getLng(),
    });
  }, [router]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;
    let removeListeners: (() => void) | null = null;

    (async () => {
      try {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
        if (!appKey) {
          setError("NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되어 있지 않습니다.");
          return;
        }

        await loadKakaoSdk(appKey);
        if (cancelled || !containerRef.current) return;

        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(
            DEFAULT_CENTER.lat,
            DEFAULT_CENTER.lng,
          ),
          level: 5,
        });
        mapRef.current = map;

        // PLANNING.md 8.1: 롱프레스는 pointerdown에서 예약한 타이머가 만료되는 즉시(아직
        // 손을 떼지 않아도) 메뉴를 띄운다. 임계 거리 이상 움직이면 팬 제스처로 보고 취소한다.
        const onPointerDown = (e: PointerEvent) => {
          pressStateRef.current = { x: e.clientX, y: e.clientY, cancelled: false };
          longPressTimerRef.current = setTimeout(() => {
            const p = pressStateRef.current;
            if (!p || p.cancelled) return;
            pressStateRef.current = null;
            triggerMenuAt(p.x, p.y);
          }, LONG_PRESS_MS);
        };
        const onPointerMove = (e: PointerEvent) => {
          const p = pressStateRef.current;
          if (!p) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) {
            p.cancelled = true;
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }
        };
        const clearPress = () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          pressStateRef.current = null;
        };
        // 데스크톱 우클릭 — 브라우저 기본 컨텍스트 메뉴 대신 바로 등록 메뉴를 띄운다
        const onContextMenu = (e: MouseEvent) => {
          e.preventDefault();
          clearPress();
          triggerMenuAt(e.clientX, e.clientY);
        };

        container.addEventListener("pointerdown", onPointerDown, { passive: true });
        container.addEventListener("pointermove", onPointerMove, { passive: true });
        container.addEventListener("pointerup", clearPress, { passive: true });
        container.addEventListener("pointercancel", clearPress, { passive: true });
        container.addEventListener("contextmenu", onContextMenu);
        removeListeners = () => {
          container.removeEventListener("pointerdown", onPointerDown);
          container.removeEventListener("pointermove", onPointerMove);
          container.removeEventListener("pointerup", clearPress);
          container.removeEventListener("pointercancel", clearPress);
          container.removeEventListener("contextmenu", onContextMenu);
        };

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setUserId(user?.id ?? null);

        await Promise.all([loadSpaces(), loadCategories()]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "지도를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      removeListeners?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownerScopeOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, FilterOption>();
    for (const space of spaces) {
      const key = ownerScopeKey(space, userId);
      if (!map.has(key)) {
        map.set(key, { key, label: ownerScopeLabel(space, userId, ownerNicknames) });
      }
    }
    // 공식 → 내 등록 → 나머지(닉네임 가나다) 순으로 정렬
    return Array.from(map.values()).sort((a, b) => {
      const rank = (k: string) => (k === "official" ? 0 : k === "mine" ? 1 : 2);
      const r = rank(a.key) - rank(b.key);
      return r !== 0 ? r : a.label.localeCompare(b.label, "ko");
    });
  }, [spaces, userId, ownerNicknames]);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, FilterOption>();
    for (const space of spaces) {
      if (!map.has(space.category_id)) {
        map.set(space.category_id, {
          key: space.category_id,
          label: space.categories?.name ?? "이름 없는 카테고리",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [spaces]);

  // "선택된 게 없으면 전체 표시, 하나라도 고르면 그것만" — null이든 빈 Set이든 똑같이
  // "아직 좁히지 않음"으로 취급한다. (한 번이라도 골랐다가 마지막 하나까지 지우면 다시
  // 자동으로 "전체 표시"가 되는 게 오히려 자연스럽다)
  const effectiveOwnerScopes = useMemo(
    () =>
      selectedOwnerScopes && selectedOwnerScopes.size > 0
        ? selectedOwnerScopes
        : new Set(ownerScopeOptions.map((o) => o.key)),
    [selectedOwnerScopes, ownerScopeOptions],
  );
  const effectiveCategories = useMemo(
    () =>
      selectedCategories && selectedCategories.size > 0
        ? selectedCategories
        : new Set(categoryOptions.map((o) => o.key)),
    [selectedCategories, categoryOptions],
  );

  useEffect(() => {
    if (selectedOwnerScopes === null) return;
    localStorage.setItem(OWNER_FILTER_STORAGE_KEY, JSON.stringify(Array.from(selectedOwnerScopes)));
  }, [selectedOwnerScopes]);
  useEffect(() => {
    if (selectedCategories === null) return;
    localStorage.setItem(
      CATEGORY_FILTER_STORAGE_KEY,
      JSON.stringify(Array.from(selectedCategories)),
    );
  }, [selectedCategories]);

  // 마커 다시 그리기
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = new window.kakao.maps.InfoWindow({ content: "" });

    for (const space of spaces) {
      if (!effectiveOwnerScopes.has(ownerScopeKey(space, userId))) continue;
      if (!effectiveCategories.has(space.category_id)) continue;
      if (
        typeof space.location?.lat !== "number" ||
        typeof space.location?.lng !== "number"
      ) {
        continue;
      }

      const position = new window.kakao.maps.LatLng(
        space.location.lat,
        space.location.lng,
      );
      const marker = new window.kakao.maps.Marker({ position, map });
      markersRef.current.push(marker);

      const name =
        (space.details as { name?: string } | null)?.name ??
        space.categories?.name ??
        (space.managed_by === "official" ? "공식 공간" : "내 공간");

      // 타인이 공유한 개인 데이터에만 신고 버튼을 붙인다 (공식·내 데이터는 신고 대상 아님)
      const isOthersShared = space.managed_by === "personal" && space.owner_id !== userId;
      const reportButton = isOthersShared
        ? `<button onclick="window.__mapmemoReport && window.__mapmemoReport('${space.id}')" style="margin-left:8px;font-size:11px;color:#dc2626;border:none;background:none;cursor:pointer;text-decoration:underline;">신고</button>`
        : "";

      window.kakao.maps.event.addListener(marker, "click", () => {
        infoWindow.close();
        const win = new window.kakao.maps.InfoWindow({
          content: `<div style="padding:6px 10px;font-size:13px;">${name}${reportButton}</div>`,
        });
        win.open(map, marker);
      });
    }
  }, [spaces, effectiveOwnerScopes, effectiveCategories, userId]);

  function toggleOwnerScope(key: string) {
    setSelectedOwnerScopes((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleCategory(key: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function clearFilter() {
    setSearch("");
    setSelectedOwnerScopes(null);
    setSelectedCategories(null);
    localStorage.removeItem(OWNER_FILTER_STORAGE_KEY);
    localStorage.removeItem(CATEGORY_FILTER_STORAGE_KEY);
  }

  const activeOptions = activeTab === "owner" ? ownerScopeOptions : categoryOptions;
  const visibleOptions = search.trim()
    ? activeOptions.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : activeOptions;

  // 사용자가 명시적으로 좁힌(=null이 아닌) facet만 칩으로 보여준다 — 손대지 않은 facet은
  // "전체"라 보여줄 칩이 없다
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...(selectedOwnerScopes
      ? ownerScopeOptions
          .filter((o) => selectedOwnerScopes.has(o.key))
          .map((o) => ({ key: `owner:${o.key}`, label: o.label, onRemove: () => toggleOwnerScope(o.key) }))
      : []),
    ...(selectedCategories
      ? categoryOptions
          .filter((o) => selectedCategories.has(o.key))
          .map((o) => ({
            key: `category:${o.key}`,
            label: o.label,
            onRemove: () => toggleCategory(o.key),
          }))
      : []),
  ];

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!loading && !error && (
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-background/95 p-3 shadow-sm backdrop-blur dark:bg-background/90">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === "owner" ? "소유 범위 검색" : "카테고리 검색"}
              className="flex-1 rounded-md border border-black/10 px-3 py-1.5 text-sm outline-none dark:border-white/15"
            />
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="whitespace-nowrap rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
            >
              팔로우
            </button>
          </div>

          {(ownerScopeOptions.length > 0 || categoryOptions.length > 0) && (
            <>
              <div className="flex gap-1 border-b border-black/10 text-sm dark:border-white/15">
                {(
                  [
                    ["owner", "소유 범위"],
                    ["category", "카테고리"],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`-mb-px border-b-2 px-3 py-1.5 ${
                      activeTab === tab
                        ? "border-foreground font-medium"
                        : "border-transparent text-black/50 dark:text-white/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {visibleOptions.map((o) => {
                  const active =
                    activeTab === "owner"
                      ? effectiveOwnerScopes.has(o.key)
                      : effectiveCategories.has(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() =>
                        activeTab === "owner" ? toggleOwnerScope(o.key) : toggleCategory(o.key)
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-black/15 text-black/60 dark:border-white/20 dark:text-white/60"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {visibleOptions.length === 0 && (
                  <p className="text-xs text-black/40 dark:text-white/40">
                    검색과 일치하는 항목이 없습니다.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-black/10 pt-2 dark:border-white/15">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs dark:bg-white/10"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      aria-label={`${chip.label} 필터 제거`}
                      className="text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {chips.length === 0 && (
                  <span className="text-xs text-black/40 dark:text-white/40">전체 표시 중</span>
                )}
                <button
                  type="button"
                  onClick={clearFilter}
                  className="ml-auto whitespace-nowrap rounded-md border border-black/10 px-2.5 py-1 text-xs text-black/60 dark:border-white/15 dark:text-white/60"
                >
                  초기화
                </button>
              </div>
            </>
          )}

          <p className="text-xs text-black/40 dark:text-white/40">
            💡 지도를 길게 누르거나 우클릭해서 등록
          </p>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm">
          지도를 불러오는 중...
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-0 bg-red-600 px-3 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}

      {longPressMenu && (
        <>
          {/* 바깥 영역 클릭 시 메뉴 닫기 */}
          <div className="absolute inset-0 z-20" onClick={closeLongPressMenu} />
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-full rounded-md border border-black/10 bg-background p-1 shadow-lg dark:border-white/15"
            style={{ left: longPressMenu.screenX, top: longPressMenu.screenY - 8 }}
          >
            <button
              type="button"
              onClick={() => openRegisterModalAt(longPressMenu.lat, longPressMenu.lng)}
              className="whitespace-nowrap rounded px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              여기에 등록
            </button>
          </div>
        </>
      )}

      {modalOpen && pendingPosition && (
        <RegisterSpaceModal
          position={pendingPosition}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      <FollowSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        candidates={ownerScopeOptions
          .filter((o) => o.key.startsWith("user:"))
          .flatMap((owner) =>
            categoryOptions
              .filter((c) =>
                spaces.some(
                  (s) => ownerScopeKey(s, userId) === owner.key && s.category_id === c.key,
                ),
              )
              .map((c) => ({ key: `${owner.key}:${c.key}`, label: `${owner.label}_${c.label}` })),
          )}
      />
    </div>
  );
}
