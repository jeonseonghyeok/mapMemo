"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadKakaoSdk } from "@/lib/kakao";
import RegisterSpaceModal from "@/components/RegisterSpaceModal";
import FollowSidebar, { type GroupSection } from "@/components/FollowSidebar";
import { reportSpace } from "@/app/spaces/actions";
import type { Category, Space } from "@/types/database";

declare global {
  interface Window {
    __mapmemoReport?: (spaceId: string) => void;
  }
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const UNCHECKED_GROUPS_STORAGE_KEY = "mapmemo:uncheckedGroups";
// PLANNING.md 8.1 — 롱프레스 판정 기준
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_PX = 10;

type SpaceRow = Pick<
  Space,
  "id" | "category_id" | "location" | "managed_by" | "details" | "owner_id"
> & {
  categories: { name: string } | null;
};

type LongPressMenu = {
  screenX: number;
  screenY: number;
  lat: number;
  lng: number;
};

// 그룹 키 포맷: "official:<categoryId>" | "mine:<categoryId>" | "follow:<ownerId>:<categoryId>"
// 사이드바는 이 키 하나로 상위 그룹(공식/내 마커/팔로우한 타인 마커) 소속과 조회 조건을
// 동시에 표현한다 — 체크 시 이 키만으로 어떤 조건으로 spaces를 조회할지 결정할 수 있다.
function parseGroupKey(key: string): { kind: "official" | "mine" | "follow"; categoryId: string; ownerId?: string } {
  const [kind, a, b] = key.split(":");
  if (kind === "follow") return { kind: "follow", ownerId: a, categoryId: b };
  return { kind: kind as "official" | "mine", categoryId: a };
}

function dedupeByCategory(
  rows: { category_id: string; categories: { name: string } | null }[] | null | undefined,
  kind: "official" | "mine",
): GroupSection["items"] {
  const map = new Map<string, GroupSection["items"][number]>();
  for (const row of rows ?? []) {
    if (!map.has(row.category_id)) {
      map.set(row.category_id, {
        key: `${kind}:${row.category_id}`,
        label: row.categories?.name ?? "이름 없는 카테고리",
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ko"));
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

// 재접속 시 이전 체크 해제 상태 복원 — 렌더 중 동기적으로 읽어 lazy init에 사용
function readStoredSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  // 사이드바 트리 뼈대(공식 데이터/내 마커/팔로우한 타인 마커) — 위치/상세 정보 없이
  // "어떤 그룹이 존재하는지"만 담는다. 실제 마커 데이터는 체크 시 groupCache로 지연 로딩된다.
  const [groupSections, setGroupSections] = useState<GroupSection[]>([]);
  const [groupCache, setGroupCache] = useState<Map<string, SpaceRow[]>>(new Map());
  // 그룹 목록은 동적으로 늘어나므로(새 카테고리/새 팔로우) "포함 목록"이 아니라 "제외 목록"을
  // 저장한다 — 저장 시점에 없던 새 그룹도 자동으로 기본 체크(표시)되게 하기 위함
  const [uncheckedGroups, setUncheckedGroups] = useState<Set<string>>(() =>
    readStoredSet(UNCHECKED_GROUPS_STORAGE_KEY),
  );
  // 데스크탑(md 이상)에서는 사이드바가 기본으로 열려 있도록 한다. 서버 렌더링과 클라이언트
  // 최초 렌더링이 항상 같은 값(false)이어야 hydration mismatch가 안 나므로, 초기값은
  // false로 고정하고 마운트 후 effect에서 media query를 확인해 보정한다
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(true);
  }, []);
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

  // 사이드바 트리 뼈대만 다시 조회(위치/상세 정보는 가져오지 않음 — 가벼움)
  const loadGroupSections = useCallback(async (uid: string | null) => {
    const supabase = createClient();

    const { data: officialRows } = await supabase
      .from("spaces")
      .select("category_id, categories(name)")
      .eq("managed_by", "official")
      .is("deleted_at", null);
    const officialItems = dedupeByCategory(
      officialRows as unknown as { category_id: string; categories: { name: string } | null }[],
      "official",
    );

    let mineItems: GroupSection["items"] = [];
    if (uid) {
      const { data: mineRows } = await supabase
        .from("spaces")
        .select("category_id, categories(name)")
        .eq("owner_id", uid)
        .is("deleted_at", null);
      mineItems = dedupeByCategory(
        mineRows as unknown as { category_id: string; categories: { name: string } | null }[],
        "mine",
      );
    }

    let followItems: GroupSection["items"] = [];
    if (uid) {
      const { data: followRows } = await supabase
        .from("follows")
        .select("owner_id, category_id, categories(name)")
        .eq("follower_id", uid);
      const rows = (followRows ?? []) as unknown as {
        owner_id: string;
        category_id: string;
        categories: { name: string } | null;
      }[];
      const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
      let nicknames = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, nickname")
          .in("id", ownerIds);
        nicknames = new Map((profileRows ?? []).map((p) => [p.id, p.nickname]));
      }
      followItems = rows
        .map((r) => ({
          key: `follow:${r.owner_id}:${r.category_id}`,
          label: `${nicknames.get(r.owner_id) ?? "알 수 없음"}_${r.categories?.name ?? "이름 없는 카테고리"}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko"));
    }

    setGroupSections([
      { kind: "official", title: "공식 데이터", items: officialItems },
      { kind: "mine", title: "내 마커", items: mineItems },
      { kind: "follow", title: "팔로우한 타인 마커", items: followItems },
    ]);
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

  // 그룹 키 하나로 해당 그룹의 마커 데이터만 조회 — RLS(spaces_read)가 shared=true 등
  // 나머지 조건을 알아서 걸러준다
  const fetchGroupSpaces = useCallback(async (key: string): Promise<SpaceRow[]> => {
    const supabase = createClient();
    const parsed = parseGroupKey(key);
    let query = supabase
      .from("spaces")
      .select("id, category_id, location, managed_by, details, owner_id, categories(name)")
      .eq("category_id", parsed.categoryId)
      .is("deleted_at", null);

    if (parsed.kind === "official") {
      query = query.eq("managed_by", "official");
    } else if (parsed.kind === "mine") {
      query = query.eq("owner_id", userIdRef.current ?? "");
    } else {
      query = query.eq("owner_id", parsed.ownerId ?? "");
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      setError(`데이터 조회 실패: ${fetchError.message}`);
      return [];
    }
    return (data ?? []) as unknown as SpaceRow[];
  }, []);

  // 그룹 목록(groupSections)이 갱신될 때마다, 체크된(uncheckedGroups에 없는) 그룹 중 아직
  // 캐시에 없는 것만 새로 조회한다 — 최초 로드 시 기본 체크된 그룹 전부, 이후엔 신규 그룹만
  useEffect(() => {
    const allItems = groupSections.flatMap((s) => s.items);
    const toFetch = allItems.filter(
      (item) => !uncheckedGroups.has(item.key) && !groupCache.has(item.key),
    );
    if (toFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        toFetch.map(async (item) => [item.key, await fetchGroupSpaces(item.key)] as const),
      );
      if (cancelled) return;
      setGroupCache((prev) => {
        const next = new Map(prev);
        for (const [key, rows] of entries) next.set(key, rows);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSections]);

  useEffect(() => {
    localStorage.setItem(UNCHECKED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(uncheckedGroups)));
  }, [uncheckedGroups]);

  // 체크 해제는 서버 통신 없이 클라이언트에서만 숨김. 체크는 캐시에 없을 때만 조회(재사용
  // 우선) — 상위 그룹의 "전체 선택/전체 취소"도 이 함수 하나로 여러 키를 한 번에 처리한다
  async function setGroupsChecked(keys: string[], checked: boolean) {
    if (checked) {
      setUncheckedGroups((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
      const missing = keys.filter((key) => !groupCache.has(key));
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (key) => [key, await fetchGroupSpaces(key)] as const),
      );
      setGroupCache((prev) => {
        const next = new Map(prev);
        for (const [key, rows] of entries) next.set(key, rows);
        return next;
      });
    } else {
      setUncheckedGroups((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.add(key);
        return next;
      });
    }
  }

  function toggleGroupChecked(key: string) {
    setGroupsChecked([key], uncheckedGroups.has(key));
  }

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
    // "내 마커" 버킷은 캐시를 통째로 비워, 그룹 목록 재조회 후 이어지는 effect가
    // (기존 카테고리든 새 카테고리든) 다시 채우게 한다
    setGroupCache((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith("mine:")) next.delete(key);
      }
      return next;
    });
    await loadGroupSections(userIdRef.current);
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

        await Promise.all([loadCategories(), loadGroupSections(user?.id ?? null)]);
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

  // 마커 다시 그리기 — 체크된 그룹의 캐시된 데이터만 사용(서버 재조회 없음)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // 열려 있는 정보창을 추적해서, 같은 마커를 다시 클릭하면 닫고(토글), 다른 마커를
    // 클릭하면 이전 정보창을 닫고 새로 연다(한 번에 하나만 표시)
    let openInfo: { marker: kakao.maps.Marker; win: kakao.maps.InfoWindow } | null = null;

    const allItems = groupSections.flatMap((s) => s.items);
    const visibleSpaces = allItems
      .filter((item) => !uncheckedGroups.has(item.key))
      .flatMap((item) => groupCache.get(item.key) ?? []);

    for (const space of visibleSpaces) {
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

      const details = space.details as { name?: string; rating?: number; description?: string } | null;
      const name =
        details?.name ??
        space.categories?.name ??
        (space.managed_by === "official" ? "공식 공간" : "내 공간");
      const description =
        details?.description && details.description.length > 10
          ? `${details.description.slice(0, 10)}…`
          : details?.description;

      // 타인이 공유한 개인 데이터에만 신고 버튼을 붙인다 (공식·내 데이터는 신고 대상 아님)
      const isOthersShared = space.managed_by === "personal" && space.owner_id !== userId;
      const reportButton = isOthersShared
        ? `<button onclick="window.__mapmemoReport && window.__mapmemoReport('${space.id}')" style="margin-left:8px;font-size:11px;color:#dc2626;border:none;background:none;cursor:pointer;text-decoration:underline;">신고</button>`
        : "";

      const lines = [
        `<div>${name}${reportButton}</div>`,
        details?.rating != null ? `<div>★ ${details.rating.toFixed(1)}</div>` : "",
        description ? `<div>${description}</div>` : "",
      ]
        .filter(Boolean)
        .join("");

      const win = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:13px;">${lines}</div>`,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        if (openInfo?.marker === marker) {
          // 이미 열려 있는 마커를 다시 클릭 → 닫기(토글)
          win.close();
          openInfo = null;
          return;
        }
        openInfo?.win.close();
        win.open(map, marker);
        openInfo = { marker, win };
      });
    }
  }, [groupSections, uncheckedGroups, groupCache, userId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!loading && !error && (
        <p className="absolute left-3 top-3 z-10 rounded-md bg-background/90 px-3 py-1.5 text-xs text-black/40 shadow-sm backdrop-blur dark:bg-background/80 dark:text-white/40">
          💡 지도를 길게 누르거나 우클릭해서 등록
        </p>
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
        onToggle={() => setSidebarOpen((v) => !v)}
        hideToggle={modalOpen}
        groupSections={groupSections}
        uncheckedGroups={uncheckedGroups}
        onToggleGroupChecked={toggleGroupChecked}
        onSetGroupsChecked={setGroupsChecked}
      />
    </div>
  );
}
