# replix-console — Replix 운영 콘솔 (console.replix.tv)

팀 관리자용 도구를 한 호스트 아래 경로로 모은다(2026-09-27 조현빈 결정). GitHub Pages(`docs/`, 사용자 지정 도메인 `console.replix.tv`)로 서빙하며 **main 머지가 곧 배포**다.

| 경로 | 도구 | 소스 |
| --- | --- | --- |
| `/` | 도구 목록 | `docs/index.html` |
| `/seeding/` | 시딩 도구(HP-434~436) | `seeding/app` (Vite + React 싱글파일 → `docs/seeding/`) |

## 시딩 도구 개발
```bash
cd seeding/app && npm install && npm run dev     # http://localhost:5175 → 개발 서버(api.replix-dev.site)
npm run build                                     # docs/seeding/ 갱신 — 빌드 결과를 함께 커밋한다
```
어느 서버를 겨눌지는 주소가 정한다(`src/env.ts`): `console.replix.tv` 는 운영, 그 밖(localhost 등)은 개발.

## 도메인·인증
- 가비아: `console` CNAME → `somahomeprotecter.github.io`
- Keycloak(dev·prod) `replix-web` 리다이렉트: `https://console.replix.tv/*`
- BE CORS 는 모든 origin 허용이라 추가 설정 없음.
