# replix-console — Replix 운영 콘솔 (console.replix.tv)

팀 관리자용 도구를 한 호스트 아래 경로로 모은다(2026-09-27 조현빈 결정). GitHub Pages(`docs/`, 사용자 지정 도메인 `console.replix.tv`)로 서빙하며 **main 머지가 곧 배포**다.

| 경로 | 도구 | 소스 | 담당 |
| --- | --- | --- | --- |
| `/` | 도구 목록 | `docs/index.html` | 공용 |
| `/seeding/` | 시딩 도구(HP-434~436) | `seeding/app` (Vite + React 싱글파일 → `docs/seeding/`) | 조현빈 |
| `/moderation/` | 조치 콘솔(HP-223·HP-293·HP-336, 이관 HP-456) | `moderation/app` (Vite + React 싱글파일 → `docs/moderation/`) | 김지호 |
| 없는 주소 | 404 안내 + 조치 콘솔 깊은 주소 복원 | `docs/404.html` | 공용 |

도구 폴더는 담당자가 맡고, 공용 파일(`docs/index.html`, `docs/404.html`)은 서로 확인한 뒤 머지한다(HP-456).

## 시딩 도구 개발
```bash
cd seeding/app && npm install && npm run dev     # http://localhost:5175 → 개발 서버(api.replix-dev.site)
npm run build                                     # docs/seeding/ 갱신 — 빌드 결과를 함께 커밋한다
```
어느 서버를 겨눌지는 주소가 정한다(`src/env.ts`): `console.replix.tv` 는 운영, 그 밖(localhost 등)은 개발.

## 조치 콘솔 개발
```bash
cd moderation/app && npm install
cp .env.example .env.local   # 개발 서버용 LOCAL/DEV/PROD 값
npm run dev                  # http://localhost:5173/moderation/
npm test                     # vitest
npm run build                # docs/moderation/ 갱신 — 빌드 결과를 함께 커밋한다(hosted-env/.env.production 만 읽는다)
```
환경은 주소 경로에 실린다 — `/moderation/prod/…`, `/moderation/dev/…`. 화면 톱바에서 바꾸고, 링크·새 탭·북마크도 그 환경으로 열린다. `/moderation/`으로 열면 console.replix.tv에서는 PROD다. LOCAL은 개발 서버에서만 고를 수 있다. 자세한 규칙은 `moderation/app/README.md`.

`docs/404.html` 이 필요한 이유: GitHub Pages는 없는 경로에 404를 주는데, 조치 콘솔은 주소마다 화면이 달라 `/moderation/prod/users/42` 같은 깊은 주소에서 새로고침하거나 로그인에서 돌아오면 그 404를 받는다. 404.html이 `/moderation/*` 경로만 조치 콘솔로 되돌린다. 시딩은 라우터가 없어 영향이 없다.

## 도메인·인증
- 가비아: `console` CNAME → `somahomeprotecter.github.io`
- Keycloak(dev·prod) `replix-web` 리다이렉트: `https://console.replix.tv/*` (조치 콘솔 개발 서버는 `http://localhost:5173/*`)
- BE CORS 는 모든 origin 허용이라 추가 설정 없음.
