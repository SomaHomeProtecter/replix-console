# replix-console 공용 기반 (core)

운영 콘솔(console.replix.tv) 전체가 같이 쓰는 기반이다(HP-522, 2026-10-11 조현빈 결정). 공용 틀(`shell/app`)·조치(`moderation/app`)·시딩(`seeding/app`)이 모두 `@core/…`로 가져다 쓴다. 종전에는 조치 폴더 안에 있어서, 콘솔 전체에 걸리는 변경이 매번 조치 폴더 변경이 됐다.

**담당**: 공용이다 — HP-456 D3의 공용 파일 규칙대로 **서로 확인한 뒤 머지**한다.

| 파일 | 하는 일 |
| --- | --- |
| `src/auth.ts` | Keycloak 로그인·토큰·역할·로그아웃·서버 전환 |
| `src/env.ts` · `src/environment.ts` | 연결 환경(LOCAL·DEV·PROD) 프로필, 주소 경로의 환경 조각, 깊은 주소 복원 |
| `src/environmentGuard.ts` | 로그인 직후 서버의 환경 자기 선언과 프로필 대조(HP-337) |
| `src/bootGuards.ts` | 다른 사이트의 프레임 안에서 부팅하지 않기 |
| `src/prodWriteConfirmation.ts` · `src/ProductionWriteGuard.tsx` | PROD 쓰기 최종 확인('PROD' 입력 창)과 묶음 승인(HP-514) |
| `src/api/client.ts` | API 호출(토큰·시간 상한·PROD 확인·쓰기 중 이탈 경고) |
| `src/writing.tsx` | 쓰기 중 잠금 상태(공용 틀이 이동 수단을 잠근다) |
| `src/time.ts` | 한국 시각 표기와 날짜 입력 칸 ↔ 저장값 변환(HP-516) |
| `src/styles/core.css` | 디자인 토큰·기본 요소·버튼·다이얼로그·톱바 부품·PROD 확인 창 |
| `hosted-env/.env.production` | 호스팅 빌드가 읽는 연결 프로필(공개 값뿐) |

테스트: 저장소 루트에서 `npm test`(전체) 또는 `npx vitest --project core`.

## 연결 환경과 배포 규칙

- **호스팅 프로필** = `core/hosted-env/.env.production`(커밋). 빌드는 이 폴더만 읽는다(`envDir`) — 루트의 `.env.local`까지 읽으면 만든 사람의 PC 설정이 공개 번들에 섞인다. 셸에서 export한 `VITE_*`는 여전히 가장 앞서니 빌드 전에 비워 둔다. DEV·PROD만 싣는다 — 공개 호스트에서 개인 PC의 LOCAL을 겨누는 선택지는 쓸 곳이 없다.
- **환경은 주소 경로에 싣는다**: `/moderation/prod/…`, `/moderation/dev/…`(개발 서버는 `/moderation/local/…`까지). 링크·새 탭·북마크·복사한 주소가 늘 자기 환경을 말한다 — 탭 저장소에 들고 다니면 새 탭과 복사한 주소가 환경을 잃고 PROD로 열려, DEV에서 보던 `/users/42`가 운영의 다른 사람으로 뜬다. 조각이 없는 주소(`/moderation/`, 옛 깊은 주소)는 옛 `?environment=` → console.replix.tv면 PROD → `VITE_DEFAULT_ENVIRONMENT` 순으로 정해 조각을 넣은 주소로 바꾼다(`src/environment.ts`의 `resolveEnvironment`).
- **깊은 주소**: GitHub Pages는 없는 경로에 404를 준다. `/moderation/prod/users/42`에서 새로고침하거나 로그인에서 돌아오면 `docs/404.html`이 원래 경로를 `?p=`에 실어 앱 루트로 보내고, 부팅 첫 단계(`src/env.ts`의 `initEnv`)가 주소를 되돌린다(해시의 로그인 응답은 유지).
- **부팅 순서**: `initEnv`(주소 정본화·환경 결정) → Keycloak 로그인 → 서버 환경 대조(HP-337) → 렌더. 공용 틀(`shell/app/src/boot.ts`)이 같은 순서로 콘솔 전체를 연다 — 조치 주소가 아니면(홈·시딩) `initEnv` 대신 `loadProfile`로 환경을 싣고, 콘솔 역할이 하나도 없으면 서버 대조 전에 권한 없음 화면을 보인다. 경로 기준은 `MODERATION_BASE_PATH`(Vite base가 아니다 — 틀은 base '/'로 빌드한다). 환경은 모듈을 평가할 때가 아니라 부팅 안에서 정한다 — 싱글파일 빌드는 동적 import까지 즉시 평가해서, 모듈 평가 중 예외는 부팅의 catch에 닿지 않는다.
- **프레임 차단**: GitHub Pages는 X-Frame-Options·CSP 헤더를 못 붙인다. Keycloak 세션이 살아 있으면 프레임 안에서도 화면 없이 로그인이 끝나므로 `shell/app/src/main.tsx`가 프레임 안에서는 부팅하지 않는다(`src/bootGuards.ts`의 `isFramed`).
- **쓰기 중 이탈**: 공용 틀은 메뉴를 옮길 때 페이지를 다시 열지 않고, `useWriting()`이 켜져 있는 동안 메뉴·서버 칩·로그아웃을 모두 잠근다. 서버를 바꾸는 이동은 페이지를 새로 연다. 쓰기 요청이 도는 동안에는 `src/api/client.ts`가 브라우저의 "떠나시겠습니까?"로 붙잡는다(새로고침·탭 닫기 포함).
- ⚠️ `vite-plugin-singlefile`은 빌드 때 `base`를 `./`로 바꾼다. 그러면 환경 경로와 전환 복귀 경로가 깨져 `overrideConfig`로 되돌려 둔다(`shell/app/vite.config.ts`).
- ⚠️ 환경 전환에서 `keycloak.clearToken()`을 부르지 말 것 — keycloak-js 26은 login-required로 init했으면 거기서 곧바로 로그인 이동을 시작해 전환 이동을 취소한다(`src/auth.ts`).

## 환경 변수 (shell/app/.env.local · core/hosted-env/.env.production)

환경마다 `VITE_<LOCAL|DEV|PROD>_API_BASE_URL`, `KC_URL`, `KC_REALM`, `KC_CLIENT_ID`,
`EXPECTED_AUDIENCE`, `EXPECTED_AZP`를 각각 둔다. 개발 서버 예시는 `shell/app/.env.example`, 호스팅 빌드 값은 `core/hosted-env/.env.production`이 정본이다.
`VITE_DEFAULT_ENVIRONMENT`는 주소에 환경이 없을 때(옛 `?environment=`도 없고 console.replix.tv도 아닐 때) 쓰며, 값은 부팅 때마다 검증한다.

client는 **기존 `replix-web`을 그대로 쓴다**. BE는 issuer·audience·azp를 독립 검증하므로 어느 하나라도 다른 토큰은 401이다.

## Keycloak redirect URI

`replix-web` client의 redirect URI에 `https://console.replix.tv/*`(호스팅, dev·prod 모두 — 2026-09-27 시딩 도구와 함께 등록)와 `http://localhost:5173/*`(개발 서버)가 있어야 한다.

- **dev**: `localhost:5173` 반영 확인 완료(2026-08-04, kcadm 실측). Replix-be realm import 정본(`keycloak/import/replix-realm.json`)에는 두 주소가 다 있다.
- **EKS가 실제로 읽는 사본**(`Replix-be/k8s/overlays/{dev,prod}/replix-realm.json`)에는 `https://console.replix.tv/*`가 빠져 있었다(2026-09-28 발견). 이 사본은 **빈 DB로 재구축할 때만** 쓰이므로 운영·개발 로그인은 kcadm으로 넣은 값으로 계속 됐지만, 재구축하면 콘솔 로그인이 `invalid redirect_uri`로 깨질 상태였다. 2026-10-01 Replix-be #308(develop)로 정본과 맞췄고, prod 오버레이는 그다음 릴리스에 main으로 들어간다. ConfigMap은 `disableNameSuffixHash: true`라 사본을 고쳐도 Keycloak은 재시작되지 않는다.
- **기존(영속) Keycloak에 없는 경우**: import는 기존 DB를 건너뛰므로(IGNORE_EXISTING) 재기동으로는 안 들어간다. 관리 콘솔에서 직접 추가하거나 kcadm으로 반영한다(기존 URI를 보존해 병합할 것).
