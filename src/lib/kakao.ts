export const KAKAO_SDK_SRC = "https://dapi.kakao.com/v2/maps/sdk.js";

export function loadKakaoSdk(appKey: string): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src^="${KAKAO_SDK_SRC}"]`,
  );
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => window.kakao.maps.load(resolve));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${KAKAO_SDK_SRC}?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = () => reject(new Error("카카오맵 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
}
