# 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/)를 기반으로 단순화한 규칙입니다.

## 형식

```
<type>(<scope>): <subject>

<body(선택)>
```

- **type**: 변경 종류 (아래 목록 중 하나, 소문자)
- **scope**: 변경 범위 — 선택사항, 생략 가능 (예: `auth`, `map`, `spaces`, `schema`)
- **subject**: 무엇을 했는지 한 줄 요약, 마침표 없이, 명령형으로 ("~함" 보다 "~추가"/"~수정" 형태 권장)
- **body**: 필요할 때만 — *무엇을* 했는지가 아니라 *왜* 했는지 설명

## type 목록

| type | 용도 |
| --- | --- |
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `style` | 포맷팅, 세미콜론 등 코드 의미에 영향 없는 변경 |
| `docs` | 문서(README, 주석 등)만 변경 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드 설정, 패키지, 기타 잡무성 변경 |
| `perf` | 성능 개선 |

## 예시

```
feat(map): 카카오맵 official 공간 마커 표시 기능 추가

fix(auth): 로그인 실패 시 에러 메시지가 안 보이던 문제 수정

docs: README에 환경 변수 설명 추가

chore: Supabase SSR 클라이언트 패키지 설치

refactor(map): Kakao SDK 로딩 로직을 별도 함수로 분리
```

## 원칙

- 커밋은 하나의 논리적 변경 단위로 쪼갤 것 (기능 추가 + 무관한 리팩토링을 한 커밋에 섞지 않기)
- 제목은 50자 내외를 권장, 자세한 이유·배경은 본문(body)에
- 1인 개발 프로젝트이므로 PR 단위 규칙은 두지 않지만, 커밋 로그만 보고도 변경 이력을 추적할 수 있게 작성
