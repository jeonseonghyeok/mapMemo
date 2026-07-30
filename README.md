# mapMemo

지도 기반으로 공간 정보(화장실, 스터디룸, 화상면접실, 배드민턴장 등)를 관리하는 앱.
개인이 등록·관리하며, 관리자 심사를 통과한 데이터만 공식(official)으로 공개됩니다.
전체 기획은 [PLANNING.md](./PLANNING.md), 데이터베이스 구조는 [schema.sql](./schema.sql) 참고.

## 기술 스택

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) — 인증, 데이터베이스(PostgreSQL), RLS
- [카카오맵 JavaScript SDK](https://apis.map.kakao.com/web/) — 지도/마커 표시

## 시작하기

### 1. 환경 변수 설정

`.env.local.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 Settings > API 에서 확인 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 프로젝트 Settings > API 에서 확인 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 프로젝트 Settings > API 에서 확인. **서버 전용** — 관리자 심사 승인, official 데이터 적재 등 RLS 우회가 필요한 작업에만 사용되며 클라이언트에 절대 노출되지 않음 |
| `ADMIN_EMAILS` | `/admin/submissions` 접근 및 심사 승인 권한을 가질 이메일 목록 (콤마 구분) |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao Developers > 내 애플리케이션 > 플랫폼 키 > JavaScript 키 (로컬 개발 시 `http://localhost:3000`을 SDK 도메인으로 등록 필요) |
| `DATA_GO_KR_SERVICE_KEY` / `DATA_GO_KR_TOILET_API_URL` | 공공데이터포털에서 사용할 화장실 데이터셋의 OpenAPI 인증키/URL. 데이터셋마다 응답 필드명이 달라 `src/lib/publicData/toilets.ts`의 필드 매핑을 실제 데이터셋에 맞게 조정해야 함 |

### 2. 의존성 설치 및 개발 서버 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

### 3. 그 외 스크립트

```bash
npm run build   # 프로덕션 빌드
npm run start   # 빌드 결과 실행
npm run lint    # ESLint 검사
```

## 구현된 기능 (PLANNING.md §7 로드맵 기준)

1. Supabase 프로젝트 + schema.sql
2. 공공데이터포털 화장실 API 연동 — `/admin/submissions`의 "공공데이터 화장실 가져오기" 버튼 (실제 데이터셋 URL/키 설정 필요, §시작하기 참고)
3. 카카오맵 마커 표시 (읽기 전용, official만)
4. Supabase Auth 로그인/회원가입 (이메일/비밀번호. 카카오 소셜로그인은 Supabase 쪽 Provider 설정이 추가로 필요해 미구현)
5. 개인 등록 기능 — `/spaces/new`
6. 공식 등록 신청 + 관리자 심사 큐 — `/spaces`에서 신청, `/admin/submissions`에서 승인/반려 (`ADMIN_EMAILS`에 등록된 이메일만 접근 가능)
7. 월별 등록 한도 체크 — 등록/가져오기 시 무료 한도(기본 월 20건) 초과하면 차단
8. Export/Import — `/spaces` 페이지에서 JSON 내보내기/가져오기 (본인 데이터 복원은 무료, 타인 데이터 가져오기는 신규 등록으로 취급되어 한도 적용)
9. PWA 설정 — `public/manifest.json` + `public/sw.js` (기본적인 오프라인 캐싱만 지원하는 최소 구성)

## 프로젝트 구조

```
src/
  app/
    login/                    # 로그인/회원가입 페이지
    auth/callback/             # Supabase OAuth·이메일 확인 콜백
    spaces/                    # 내 공간 목록/등록/삭제·복원/공식 등록 신청
    admin/submissions/         # 관리자 심사 큐 (승인/반려, 공공데이터 가져오기)
    api/spaces/export|import/  # Export/Import API
    api/admin/import-toilets/  # 공공데이터 화장실 적재 API (관리자 전용)
  components/
    KakaoMap.tsx               # official 공간 마커 표시 (읽기 전용)
    KakaoMapPicker.tsx         # 클릭/드래그로 좌표를 고르는 등록 폼용 지도
    ServiceWorkerRegister.tsx  # PWA 서비스워커 등록
  lib/
    supabase/client.ts         # 브라우저(Client Component)용 Supabase 클라이언트
    supabase/server.ts         # 서버(Server Component)용 Supabase 클라이언트
    supabase/admin.ts          # service_role 키로 RLS를 우회하는 서버 전용 클라이언트
    supabase/middleware.ts     # 세션 갱신 로직 (루트 middleware.ts에서 사용)
    admin.ts                   # ADMIN_EMAILS 기반 관리자 판별
    usage.ts                   # 월별 등록 한도 체크
    publicData/toilets.ts      # 공공데이터포털 화장실 응답 정규화
  types/
    database.ts                 # schema.sql 기준 테이블 타입
    kakao-maps.d.ts              # 카카오맵 SDK 최소 타입 선언
```

## 커밋 메시지 규칙

[COMMIT_CONVENTION.md](./COMMIT_CONVENTION.md) 참고.
