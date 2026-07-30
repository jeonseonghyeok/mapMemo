import "server-only";

export type NormalizedToilet = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
};

type RawRecord = Record<string, unknown>;

function pickString(record: RawRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function pickNumber(record: RawRecord, keys: string[]): number | undefined {
  const raw = pickString(record, keys);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// data.go.kr에 올라오는 "전국 공중화장실 표준데이터" 계열은 배포처마다 필드명이
// 조금씩 다르다(화장실명/명칭, 위도/lat/Y좌표 등). 알려진 후보 필드명들을 순서대로 시도한다.
// 실제 사용하는 데이터셋의 응답 스펙을 확인하고 필요하면 후보 목록을 조정할 것.
function normalizeRecord(record: RawRecord): NormalizedToilet | null {
  const name = pickString(record, ["화장실명", "명칭", "toiletNm", "name"]);
  const lat = pickNumber(record, ["위도", "lat", "latitude", "Y좌표"]);
  const lng = pickNumber(record, ["경도", "lng", "longitude", "X좌표"]);
  const address = pickString(record, [
    "소재지도로명주소",
    "소재지지번주소",
    "address",
    "roadAddress",
  ]);

  if (!name || lat === undefined || lng === undefined) return null;
  return { name, lat, lng, address };
}

// data.go.kr openapi 계열(response.body.items.item) / odcloud.kr 계열(data) 응답을 모두 처리
function extractItems(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload as RawRecord[];
  if (payload && typeof payload === "object") {
    const obj = payload as RawRecord;
    if (Array.isArray(obj.data)) return obj.data as RawRecord[];

    const response = obj.response as RawRecord | undefined;
    const body = response?.body as RawRecord | undefined;
    const items = body?.items as RawRecord | RawRecord[] | undefined;
    if (Array.isArray(items)) return items;
    if (items && Array.isArray((items as RawRecord).item)) {
      return (items as RawRecord).item as RawRecord[];
    }
  }
  return [];
}

export async function fetchOfficialToilets(): Promise<NormalizedToilet[]> {
  const apiUrl = process.env.DATA_GO_KR_TOILET_API_URL;
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;

  if (!apiUrl || !serviceKey) {
    throw new Error(
      "DATA_GO_KR_TOILET_API_URL / DATA_GO_KR_SERVICE_KEY 환경변수가 설정되어 있지 않습니다.",
    );
  }

  const url = new URL(apiUrl);
  if (!url.searchParams.has("serviceKey")) {
    url.searchParams.set("serviceKey", serviceKey);
  }
  if (!url.searchParams.has("type") && !url.searchParams.has("returnType")) {
    url.searchParams.set("type", "json");
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`공공데이터 API 호출 실패: ${res.status} ${res.statusText}`);
  }

  const payload = await res.json();
  const rawItems = extractItems(payload);

  return rawItems
    .map(normalizeRecord)
    .filter((v): v is NormalizedToilet => v !== null);
}
