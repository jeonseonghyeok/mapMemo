"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadKakaoSdk } from "@/lib/kakao";
import type { Space } from "@/types/database";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

export default function KakaoMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("spaces")
          .select("id, category_id, location, managed_by, details")
          .eq("managed_by", "official")
          .is("deleted_at", null);

        if (cancelled) return;

        if (fetchError) {
          setError(`데이터 조회 실패: ${fetchError.message}`);
          return;
        }

        const spaces = (data ?? []) as Pick<
          Space,
          "id" | "category_id" | "location" | "managed_by" | "details"
        >[];

        const infoWindow = new window.kakao.maps.InfoWindow({ content: "" });

        spaces.forEach((space) => {
          if (
            typeof space.location?.lat !== "number" ||
            typeof space.location?.lng !== "number"
          ) {
            return;
          }

          const position = new window.kakao.maps.LatLng(
            space.location.lat,
            space.location.lng,
          );
          const marker = new window.kakao.maps.Marker({ position, map });
          const name =
            (space.details as { name?: string } | null)?.name ??
            space.location.address ??
            "공식 공간";

          window.kakao.maps.event.addListener(marker, "click", () => {
            infoWindow.close();
            const win = new window.kakao.maps.InfoWindow({
              content: `<div style="padding:6px 10px;font-size:13px;">${name}</div>`,
            });
            win.open(map, marker);
          });
        });
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
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
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
    </div>
  );
}
