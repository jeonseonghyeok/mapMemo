"use client";

import { useEffect, useRef, useState } from "react";
import { loadKakaoSdk } from "@/lib/kakao";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (position: { lat: number; lng: number }) => void;
};

export default function KakaoMapPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerRef = useRef<kakao.maps.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
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

        const center = new window.kakao.maps.LatLng(
          value?.lat ?? DEFAULT_CENTER.lat,
          value?.lng ?? DEFAULT_CENTER.lng,
        );
        const map = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 4,
        });
        mapRef.current = map;

        const marker = new window.kakao.maps.Marker({
          position: center,
          map: value ? map : undefined,
          draggable: true,
        });
        markerRef.current = marker;

        const placeMarker = (latlng: kakao.maps.LatLng) => {
          marker.setPosition(latlng);
          marker.setMap(map);
          onChangeRef.current({ lat: latlng.getLat(), lng: latlng.getLng() });
        };

        window.kakao.maps.event.addListener(map, "click", (e) => {
          placeMarker(e.latLng);
        });
        window.kakao.maps.event.addListener(marker, "dragend", () => {
          const pos = marker.getPosition();
          onChangeRef.current({ lat: pos.getLat(), lng: pos.getLng() });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-md border border-black/10 dark:border-white/15">
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
      {!loading && !error && !value && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
          지도를 클릭해서 위치를 지정하세요
        </div>
      )}
    </div>
  );
}
