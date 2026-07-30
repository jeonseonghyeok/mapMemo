# mapMemo

지도 기반으로 공간 정보(화장실, 스터디룸, 화상면접실, 배드민턴장, 공동현관 등)를 관리하는 앱.
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
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao Developers > 내 애플리케이션 > 플랫폼 키 > JavaScript 키 (로컬 개발 시 `http://localhost:3000`을 SDK 도메인으로 등록 필요) |

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

## 프로젝트 구조

```
src/
  app/                 # 라우트 (App Router)
    login/             # 로그인/회원가입 페이지
    auth/callback/     # Supabase OAuth·이메일 확인 콜백
  components/
    KakaoMap.tsx        # 카카오맵 SDK 로드 + official 공간 마커 표시
  lib/supabase/
    client.ts           # 브라우저(Client Component)용 Supabase 클라이언트
    server.ts            # 서버(Server Component)용 Supabase 클라이언트
    middleware.ts        # 세션 갱신 로직 (루트 middleware.ts에서 사용)
  types/
    database.ts          # schema.sql 기준 테이블 타입
    kakao-maps.d.ts       # 카카오맵 SDK 최소 타입 선언
```

## 커밋 메시지 규칙

[COMMIT_CONVENTION.md](./COMMIT_CONVENTION.md) 참고.
