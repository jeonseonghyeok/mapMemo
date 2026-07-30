// Kakao Maps JS SDK — 프로젝트에서 쓰는 최소 타입만 선언 (공식 타입 패키지 미사용)
export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    class LatLng {
      constructor(lat: number, lng: number);
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level?: number });
      setCenter(latlng: LatLng): void;
      panTo(latlng: LatLng): void;
    }

    class Marker {
      constructor(options: { position: LatLng; map?: Map; title?: string });
      setMap(map: Map | null): void;
    }

    class InfoWindow {
      constructor(options: { content: string });
      open(map: Map, marker: Marker): void;
      close(): void;
    }

    namespace event {
      function addListener(
        target: Marker | Map,
        type: string,
        handler: () => void,
      ): void;
    }

    function load(callback: () => void): void;
  }
}
