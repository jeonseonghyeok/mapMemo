import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright MCP가 스크린샷/스냅샷을 계속 이 폴더에 써서, 감시 대상에 포함되면
  // 파일이 바뀔 때마다 dev 서버가 재빌드→풀 리로드를 반복하는 무한 루프가 발생했다
  // (리소스 고갈로 PC 전체가 느려지는 원인 중 하나였음) — 워처에서 완전히 제외한다
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/.git/**", "**/.playwright-mcp/**"],
    };
    return config;
  },
};

export default nextConfig;
