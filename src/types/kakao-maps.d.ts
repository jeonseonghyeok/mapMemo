// Kakao Maps JS SDK — 프로젝트에서 쓰는 최소 타입만 선언 (공식 타입 패키지 미사용)
export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level?: number });
      setCenter(latlng: LatLng): void;
      panTo(latlng: LatLng): void;
      getBounds(): LatLngBounds;
    }

    class Marker {
      constructor(options: {
        position: LatLng;
        map?: Map;
        title?: string;
        draggable?: boolean;
      });
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
      getPosition(): LatLng;
    }

    class InfoWindow {
      constructor(options: { content: string });
      open(map: Map, marker: Marker): void;
      close(): void;
    }

    interface MouseEvent {
      latLng: LatLng;
    }

    namespace event {
      function addListener(
        target: Marker | Map,
        type: string,
        handler: (event: MouseEvent) => void,
      ): void;
    }

    function load(callback: () => void): void;
  }
}
