// 커뮤니티 공유(shared=true) 등록 시 콘텐츠 자체를 스캔하는 안전장치.
// PLANNING.md 3.2.2/4.1 — entrance 사고 때 카테고리 이름 기반 안전장치가 이름 변경 한 번에
// 무력화됐던 교훈으로, 카테고리가 아니라 텍스트 내용을 직접 검사한다.

const SENSITIVE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "전화번호", pattern: /01[016789]-?\d{3,4}-?\d{4}/ },
  { label: "전화번호(지역번호)", pattern: /0\d{1,2}-\d{3,4}-\d{4}/ },
  { label: "주민등록번호", pattern: /\d{6}-?[1-4]\d{6}/ },
  {
    label: "비밀번호/출입코드 관련 표현",
    pattern: /(비밀\s?번호|비번|패스워드|password|pw\s*[:=]|현관\s?(비번|비밀번호|코드)?|출입\s?(코드|번호)|도어락|공동현관)/i,
  },
];

export function findSensitivePatterns(text: string): string[] {
  if (!text) return [];
  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

export function containsSensitiveContent(text: string): boolean {
  return findSensitivePatterns(text).length > 0;
}
