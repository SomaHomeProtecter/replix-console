# Replix 조치 콘솔 (moderation/app)

신고 큐를 보고 **가림 · 계정 정지 · 기각**을 수행하는 운영 콘솔이다(HP-227, 화면 정본 = HP-227 코멘트 11343).

**https://console.replix.tv/moderation/ 에서 연다**(HP-456). 한 화면에서 DEV/PROD를 전환하고(개발 서버는 LOCAL까지), 환경을 바꾸면 기존 토큰과 화면 상태를 폐기하고 해당 Keycloak에서 다시 인증한다. 서버의 환경·issuer·audience·azp 자기 선언과 콘솔 프로필이 하나라도 다르면 데이터를 그리기 전에 차단한다(HP-337).

## 왜 replix-console에 있나 (HP-267 → HP-456)

2026-09-28까지는 `Replix-be/admin-ui/`에 있었다. BE API와 콘솔이 함께 바뀔 때 **한 PR·한 리뷰로 원자적으로** 나가는 이득 때문이었고(HP-267), 분리 조건 셋 중 첫째가 "**자체 배포 대상이 생길 때** — 호스팅을 붙이는 순간 BE와 릴리즈 단위가 갈린다"였다. console.replix.tv(운영 도구를 한 호스트 아래 경로로 모으는 GitHub Pages)가 그 배포 대상이라, 커밋 이력째(git subtree) 이 저장소로 옮겼다(HP-456, 김지호 결정).

- **치른 값**: BE API와 화면을 함께 바꾸면 PR이 두 저장소로 갈린다. **BE를 먼저 배포하고 콘솔을 나중에 머지**한다 — 콘솔이 먼저 나가면 아직 없는 API를 부른다. 관리 API는 필드를 더하는 쪽으로 바꾼다.
- **공개 저장소다**: Replix-be(비공개)와 달리 replix-console은 공개다. 소스·주석·테스트·이력이 공개되는 것을 알고 옮겼다. 비밀값은 원래 없다(브라우저에 실리는 공개 값뿐) — 앞으로도 넣지 않는다.

## 배포

`npm run build`가 `../../docs/moderation/index.html` 한 장을 만든다(싱글파일 — 시딩과 같은 방식). 이 파일을 함께 커밋하고 **main 머지가 곧 배포**다. GitHub Pages 캐시가 `max-age=600`이라 반영까지 최대 10분 걸린다.

- **호스팅 프로필** = `.env.production`(커밋). DEV·PROD만 싣는다 — 공개 호스트에서 개인 PC의 LOCAL을 겨누는 선택지는 쓸 곳이 없다.
- **기본 환경은 주소가 정한다**: console.replix.tv 로 처음 열면 PROD(시딩 `env.ts`와 같은 규칙), 그 밖의 주소는 `VITE_DEFAULT_ENVIRONMENT`. 우선순위 = 주소의 `?environment=` → 이 탭에서 고른 값(sessionStorage) → 주소 규칙 → 빌드 기본값. 탭을 옮기면 `?environment=`가 주소에서 빠지므로, 탭 저장소가 없으면 DEV에서 일하던 사람이 새로고침 한 번에 PROD로 넘어간다.
- **깊은 주소**: GitHub Pages는 없는 경로에 404를 준다. `/moderation/users/42`에서 새로고침하거나 로그인에서 돌아오면 `docs/404.html`이 원래 경로를 `?p=`에 실어 보내고, `index.html` 머리의 스크립트가 모듈 평가 전에 주소를 되돌린다(해시의 로그인 응답은 유지).
- **프레임 차단**: GitHub Pages는 X-Frame-Options·CSP 헤더를 못 붙인다. Keycloak 세션이 살아 있으면 프레임 안에서도 화면 없이 로그인이 끝나므로 `main.tsx`가 프레임 안에서는 부팅하지 않는다.
- ⚠️ `vite-plugin-singlefile`은 빌드 때 `base`를 `./`로 바꾼다. 그러면 라우터 basename과 환경 전환 복귀 경로가 깨져 `overrideConfig`로 되돌려 둔다(`vite.config.ts`).

## 요구 사항

- Node 20+ / npm
- 콘솔 사용자 Keycloak 계정에 realm 역할이 필요하다. 기존 **`admin`**은 모든 기능을 유지한다.
  - `admin_console_viewer`: 조회 전용
  - `moderation_operator`: 조회 + 신고·메시지·계정 조치
  - `feature_flag_operator`: 기능 제어(HP-343에서 사용)
  - `prod_change_approver`: PROD 고위험 변경 승인(HP-343에서 사용)

## 시작하기

```bash
cd moderation/app
npm install
cp .env.example .env.local   # 기본값 = dev 환경. 로컬 BE 대상이면 아래 표 참조
npm run dev                  # http://localhost:5173/moderation/
```

브라우저에서 `http://localhost:5173/moderation/` → Keycloak 로그인 → 신고 큐. 포트는 **5173 고정**(strictPort — redirect URI 등록과 일치해야 해서, 포트가 밀리면 기동을 실패시킨다). 톱바 환경 선택에서 전환하며 URL에는 `?environment=DEV|PROD|LOCAL`이 남는다. 톱바 왼쪽 "Replix / 조치 콘솔 ▾"은 운영 콘솔 홈(`/`)과 시딩 도구(`/seeding/`)로 가는 전환 메뉴라 개발 서버에서는 열리지 않는다.

## 환경 변수 (.env.local · .env.production)

환경마다 `VITE_<LOCAL|DEV|PROD>_API_BASE_URL`, `KC_URL`, `KC_REALM`, `KC_CLIENT_ID`,
`EXPECTED_AUDIENCE`, `EXPECTED_AZP`를 각각 둔다. 개발 서버 예시는 `.env.example`, 호스팅 빌드 값은 `.env.production`이 정본이다.
`VITE_DEFAULT_ENVIRONMENT`는 주소·탭 선택이 모두 없을 때만 쓴다(위 "배포" 우선순위).

client는 **기존 `replix-web`을 그대로 쓴다**. BE는 issuer·audience·azp를 독립 검증하므로 어느 하나라도 다른 토큰은 401이다.

## Keycloak redirect URI

`replix-web` client의 redirect URI에 `https://console.replix.tv/*`(호스팅, dev·prod 모두 — 2026-09-27 시딩 도구와 함께 등록)와 `http://localhost:5173/*`(개발 서버)가 있어야 한다.

- **dev**: `localhost:5173` 반영 확인 완료(2026-08-04, kcadm 실측). Replix-be realm import 정본(`keycloak/import/replix-realm.json`)에는 두 주소가 다 있다.
- ⚠️ **EKS가 실제로 읽는 사본**(`Replix-be/k8s/overlays/{dev,prod}/replix-realm.json`)에는 `https://console.replix.tv/*`가 없다(2026-09-28 기준 드리프트). 지금 운영·개발 Keycloak은 kcadm으로 넣어 둬서 문제없지만, **빈 DB로 재구축하면 콘솔 로그인이 `invalid redirect_uri`로 깨진다** — 그때는 아래처럼 kcadm으로 다시 넣는다. 사본을 고치면 configMapGenerator 해시가 바뀌어 다음 배포 때 Keycloak이 재시작된다.
- **기존(영속) Keycloak에 없는 경우**: import는 기존 DB를 건너뛰므로(IGNORE_EXISTING) 재기동으로는 안 들어간다. 관리 콘솔에서 직접 추가하거나 kcadm으로 반영한다(기존 URI를 보존해 병합할 것).

## 테스트 · 빌드

```bash
npm test        # vitest (RTL 컴포넌트·클라이언트 유닛)
npm run build   # tsc --noEmit + vite build
```

## 범위 (정본 확정)

- 화면 5개:
  - **신고 큐**(홈) — 테이블 + 상세 **모달**, 상태·사유 필터, 커서 페이징.
    - 모달이 닫힌 큐에서 `J`/`K`로 행 이동, `Enter`로 상세를 연다. 상세 안에서는 `B` 가림 · `N` 조치 없이 종결 · `X` 기각 · `S` 정지 확인 창 · `Esc` 닫기다.
    - 신고를 닫는 조치가 성공하면 다음 OPEN 행에 포커스만 두며 자동으로 상세를 열지 않는다. 운영자가 `Enter`로 내용을 확인해야 다음 조치 키가 활성화된다.
  - **정지 현황판**(`/suspensions`, HP-300) — 정지 상태인 계정을 만료 임박순으로. **진행 중 · 무기한 · 만료됨(자동 해제 대기)** 세 갈래로 세고, 행에서 바로 해제한다(확인 한 단계를 거친다).
  - **조치 로그**(`/actions`, HP-299) — 처리자·조치 종류·기간으로 전역 감사 이력을 조회한다.
  - **오탐 검토**(`/moderation-reviews`, HP-302) — 클린봇 차단 표본의 단계·category·실제 모델 점수를 보고 오탐/정탐으로 판정한다. 판정은 메시지를 되살리지 않는다.
  - **사용자 상세** — 기본 정보 + 받은 신고·조치 이력·정지 이력 탭.
- **사용자 상세 진입** — 신고 큐·정지 현황판·조치 로그의 이름 또는 톱바 검색을 쓴다. 검색은 **ID 정확 일치·닉네임 부분 일치·이메일 정확 일치**만 최대 10건으로 열며, 빈 검색으로 전체 목록을 펼치지 않는다.
- **지표·차트 없음**(HP-228 Grafana 담당) · **회원 전체 목록 없음**. 현황판은 회원 목록이 아니라 **조치가 걸려 있는 계정의 목록**이다 — 정지된 계정만, 상한(`replix.admin.suspended-limit`, 기본 200)까지 싣고 잘리면 그 사실을 화면이 밝힌다.
- 빨강은 파괴적 조치(정지) 전용 — 나머지는 잉크 톤.
