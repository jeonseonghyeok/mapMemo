"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadKakaoSdk } from "@/lib/kakao";
import RegisterSpaceModal from "@/components/RegisterSpaceModal";
import type { Category, Space } from "@/types/database";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const FILTER_STORAGE_KEY = "mapmemo:groupFilter";

type SpaceRow = Pick<Space, "id" | "category_id" | "location" | "managed_by" | "details"> & {
  categories: { name: string } | null;
};

// "그룹" = 카테고리 x 소유 범위(공식/내 등록) 조합. 같은 카테고리라도
// 공식 데이터와 내가 등록한 개인 데이터를 별도 태그로 켜고 끌 수 있게 한다.
type Group = {
  key: string;
  label: string;
  managedBy: "official" | "personal";
};

// 마커 등록 흐름: idle(평소) → placing(위치 클릭 대기) → placed(위치 지정됨, 모달 열기 가능)
type PlacementMode = "idle" | "placing" | "placed";

function groupKey(managedBy: "official" | "personal", categoryId: string) {
  return `${managedBy}:${categoryId}`;
}

// 재접속 시 이전 필터 상태 복원 — 렌더 중 동기적으로 읽어 lazy init에 사용
// (이펙트에서 setState하면 불필요한 리렌더가 한 번 더 발생하므로 지양)
function readStoredKeys(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
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
  const tempMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const modeRef = useRef<PlacementMode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  // null = 사용자가 아직 명시적으로 선택한 적 없음 → effectiveSelectedKeys에서 "전체 선택"으로 대체
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(readStoredKeys);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<PlacementMode>("idle");
  const [pendingPosition, setPendingPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);

  function setModeBoth(next: PlacementMode) {
    modeRef.current = next;
    setMode(next);
  }

  const loadSpaces = useCallback(async () => {
    const supabase = createClient();
    // managed_by 필터를 걸지 않아도 RLS(spaces_read)가
    // "official 전체 + 내가 owner인 personal"만 돌려준다.
    const { data, error: fetchError } = await supabase
      .from("spaces")
      .select("id, category_id, location, managed_by, details, categories(name)")
      .is("deleted_at", null);

    if (fetchError) {
      setError(`데이터 조회 실패: ${fetchError.message}`);
      return;
    }
    setSpaces((data ?? []) as unknown as SpaceRow[]);
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

  // 임시 마커(등록 대기 위치)를 지정된 좌표에 그리거나 옮긴다
  const placeTempMarker = useCallback((latlng: kakao.maps.LatLng) => {
    const map = mapRef.current;
    if (!map) return;

    if (!tempMarkerRef.current) {
      const marker = new window.kakao.maps.Marker({
        position: latlng,
        map,
        draggable: true,
      });
      window.kakao.maps.event.addListener(marker, "dragend", () => {
        const pos = marker.getPosition();
        setPendingPosition({ lat: pos.getLat(), lng: pos.getLng() });
      });
      tempMarkerRef.current = marker;
    } else {
      tempMarkerRef.current.setPosition(latlng);
      tempMarkerRef.current.setMap(map);
    }
  }, []);

  function cancelPlacing() {
    tempMarkerRef.current?.setMap(null);
    setPendingPosition(null);
    setModeBoth("idle");
  }

  function startPlacing() {
    if (!userId) {
      router.push("/login");
      return;
    }
    setModeBoth("placing");
  }

  async function handleCreated() {
    setModalOpen(false);
    tempMarkerRef.current?.setMap(null);
    setPendingPosition(null);
    setModeBoth("idle");
    await Promise.all([loadSpaces(), loadCategories()]);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

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

        // 배치 모드(placing/placed)에서 지도를 클릭하면 그 자리에 임시 마커를 놓는다
        window.kakao.maps.event.addListener(map, "click", (e) => {
          if (modeRef.current === "idle") return;
          placeTempMarker(e.latLng);
          setPendingPosition({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
          setModeBoth("placed");
        });

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const space of spaces) {
      const key = groupKey(space.managed_by, space.category_id);
      if (!map.has(key)) {
        const categoryName = space.categories?.name ?? "이름 없는 카테고리";
        map.set(key, {
          key,
          label: `${categoryName} · ${space.managed_by === "official" ? "공식" : "내 등록"}`,
          managedBy: space.managed_by,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [spaces]);

  // 사용자가 아직 필터를 건드리지 않았다면(=선택값이 없다면) 기본값은 "전체 선택"
  const effectiveSelectedKeys = useMemo(
    () => selectedKeys ?? new Set(groups.map((g) => g.key)),
    [selectedKeys, groups],
  );

  // 사용자가 명시적으로 선택한 뒤에만 localStorage에 저장 (기본 전체 선택 상태는 저장 안 함)
  useEffect(() => {
    if (selectedKeys === null) return;
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(Array.from(selectedKeys)));
  }, [selectedKeys]);

  // 마커 다시 그리기
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = new window.kakao.maps.InfoWindow({ content: "" });

    for (const space of spaces) {
      const key = groupKey(space.managed_by, space.category_id);
      if (!effectiveSelectedKeys.has(key)) continue;
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

      window.kakao.maps.event.addListener(marker, "click", () => {
        infoWindow.close();
        const win = new window.kakao.maps.InfoWindow({
          content: `<div style="padding:6px 10px;font-size:13px;">${name}</div>`,
        });
        win.open(map, marker);
      });
    }
  }, [spaces, effectiveSelectedKeys]);

  function toggleGroup(key: string) {
    setSelectedKeys((prev) => {
      // prev가 null이면 아직 "전체 선택" 기본값 상태 — 거기서부터 토글 시작
      const next = new Set(prev ?? effectiveSelectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function clearFilter() {
    setSearch("");
    setSelectedKeys(new Set());
  }

  const visibleGroups = search.trim()
    ? groups.filter((g) => g.label.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!loading && !error && (
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-background/95 p-3 shadow-sm backdrop-blur dark:bg-background/90">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="그룹 검색 (예: 화장실, 공식, 내 등록)"
              className="flex-1 rounded-md border border-black/10 px-3 py-1.5 text-sm outline-none dark:border-white/15"
            />
            <button
              type="button"
              onClick={clearFilter}
              className="whitespace-nowrap rounded-md border border-black/10 px-3 py-1.5 text-sm text-black/60 dark:border-white/15 dark:text-white/60"
            >
              초기화
            </button>

            {mode === "idle" && (
              <button
                type="button"
                onClick={startPlacing}
                className="whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
              >
                + 등록
              </button>
            )}
            {mode === "placing" && (
              <button
                type="button"
                onClick={cancelPlacing}
                className="whitespace-nowrap rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
              >
                취소
              </button>
            )}
            {mode === "placed" && (
              <>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                >
                  등록하기
                </button>
                <button
                  type="button"
                  onClick={cancelPlacing}
                  className="whitespace-nowrap rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
                >
                  취소
                </button>
              </>
            )}
          </div>

          {mode === "placing" && (
            <p className="text-xs text-black/60 dark:text-white/60">
              지도를 클릭해서 마커를 놓을 위치를 지정하세요.
            </p>
          )}
          {mode === "placed" && (
            <p className="text-xs text-black/60 dark:text-white/60">
              위치가 지정되었습니다. 마커를 드래그해 조정하거나 지도를 다시 클릭해 옮길 수
              있어요. 준비되면 &quot;등록하기&quot;를 눌러주세요.
            </p>
          )}

          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visibleGroups.map((g) => {
                const active = effectiveSelectedKeys.has(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-black/15 text-black/60 dark:border-white/20 dark:text-white/60"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
              {visibleGroups.length === 0 && (
                <p className="text-xs text-black/40 dark:text-white/40">
                  검색과 일치하는 그룹이 없습니다.
                </p>
              )}
            </div>
          )}
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

      {modalOpen && pendingPosition && (
        <RegisterSpaceModal
          position={pendingPosition}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
