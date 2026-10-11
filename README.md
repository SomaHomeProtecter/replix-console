# replix-console — Replix 운영 콘솔 (console.replix.tv)

팀 관리자용 도구를 한 콘솔로 모은다(2026-09-27 조현빈 결정 → 2026-10-10 한 앱으로 통합, HP-506). 공용 틀(`shell/app`)이 로그인·연결 서버·화면 틀·홈을 맡고, 시딩과 조치 소스를 그대로 불러 자기완결 HTML 한 장으로 빌드한다. GitHub Pages(`docs/`, 사용자 지정 도메인 `console.replix.tv`)로 서빙하며 **main 머지가 곧 배포**다.

| 경로 | 화면 | 소스 | 담당 |
| --- | --- | --- | --- |
| `/` | 콘솔 홈 · 공용 틀(톱바·왼쪽 메뉴·로그인) | `shell/app` | 공용 |
| (모든 경로) | 공용 기반 — 로그인·연결 환경·PROD 확인·API 호출·시각 표기·디자인 토큰 | `core` | 공용 |
| `/seeding/` | 시딩(HP-434~436) | `seeding/app/src` | 조현빈 |
| `/moderation/<env>/` | 조치(HP-223·HP-293·HP-336, 이관 HP-456) | `moderation/app/src` | 김지호 |
| 없는 주소 | 404 안내 + 조치 깊은 주소 복원 | `docs/404.html` | 공용 |

세 경로의 `index.html`은 같은 한 장이다(빌드가 도구 경로에 복사한다). 도구 폴더는 담당자가 맡고(HP-456 D3), 공용 파일(`core`, `shell/app`, `docs/404.html`, 루트 `package.json`)은 서로 확인한 뒤 머지한다.

## 로그인과 연결 서버 (HP-506)

- 콘솔을 열 때 그 서버의 Keycloak에 **한 번** 로그인한다. 메뉴를 옮길 때는 페이지를 다시 열지 않으므로 다시 로그인하지 않는다.
- 서버(PROD/DEV)는 톱바의 **서버 칩으로만** 바꾼다. 서버가 바뀌면 페이지를 새로 열고 그 서버로 다시 로그인한다 — PROD와 DEV는 Keycloak 서버 자체가 다르다(`auth.replix.tv` / `auth.replix-dev.site`).
- 홈과 시딩은 **PROD 전용**이다(시딩 작업물 정본 = 운영). DEV는 조치를 개발 서버에서 시험할 때 쓰고, DEV에서 홈·시딩을 누르면 PROD로 새로 열린다. 시딩의 '개발에 넣기'는 지금처럼 4단계의 개발 로그인 창으로 넣는다.
- 콘솔 역할(`admin`·`admin_console_viewer`·`moderation_operator`·`feature_flag_operator`·`prod_change_approver`)이 하나도 없는 계정은 권한 없음 화면과 '다른 계정으로 로그인'을 본다.
- PROD 쓰기 최종 확인('PROD' 입력 창)은 콘솔 전체에 하나다 — 조치의 모든 PROD 쓰기와 시딩의 운영 넣기·지우기가 같은 창을 거친다.
- 시딩 화면은 격리 영역(Shadow DOM)에 그린다. 시딩(Tailwind)과 조치(전역 CSS)가 `.btn`·`.card`·`.pill` 같은 같은 이름의 클래스를 써서, 한 페이지에 그대로 두면 서로의 모양을 덮어쓴다.

## 개발

```bash
npm install                                     # 저장소 루트에서 한 번 — 의존성은 한 벌이다(HP-524)
cp shell/app/.env.example shell/app/.env.local  # 개발 서버용 LOCAL/DEV/PROD 값
npm run dev                                     # http://localhost:5173/ — 홈·시딩은 DEV, 조치는 /moderation/<env>/
npm test                                        # 네 폴더(core·shell·moderation·seeding) vitest — 한 폴더만: npx vitest --project moderation
npm run typecheck                               # 네 폴더 tsc
npm run build                                   # typecheck + docs/index.html 과 도구 경로 복사본 갱신 — 빌드 결과를 함께 커밋한다
```

- 포트 5173 고정: Keycloak `replix-web` redirect URI에 등록된 개발 주소다. 포트가 밀리면 로그인이 조용히 깨져 기동을 실패시킨다.
- 호스팅 빌드는 공용 기반의 호스팅 프로필 `core/hosted-env/.env.production`만 읽는다(DEV·PROD만 싣고 LOCAL은 없다).
- 시딩·조치 폴더에는 따로 띄우는 개발 서버·빌드가 없다(HP-521) — 공용 틀 하나로 개발하고 빌드한다.
- 연결 환경 규칙(주소 경로 `/moderation/prod|dev/`, 깊은 주소 복원, 쓰기 중 이탈 차단)은 `core/README.md`.

`docs/404.html`이 필요한 이유: GitHub Pages는 없는 경로에 404를 주는데, 조치는 주소마다 화면이 달라 `/moderation/prod/users/42` 같은 깊은 주소에서 새로고침하거나 로그인에서 돌아오면 그 404를 받는다. 404.html이 `/moderation/*` 경로를 `/moderation/?p=`로 넘기고, 콘솔 부팅이 원래 주소를 되살린다. 시딩은 쿼리(`?view=prompts`, `?work=&episode=`)만 써서 영향이 없다.

## 도메인·인증

- 가비아: `console` CNAME → `somahomeprotecter.github.io`
- Keycloak(dev·prod) `replix-web` 리다이렉트: `https://console.replix.tv/*` (개발 서버는 `http://localhost:5173/*`)
- 시딩 '개발에 넣기'의 로그인 창은 `/seeding/dev-callback.html`로 돌아온다(`shell/app/public/seeding/`).
- BE CORS 는 모든 origin 허용이라 추가 설정 없음.
