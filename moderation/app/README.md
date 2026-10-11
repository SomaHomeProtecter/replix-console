# Replix 조치 콘솔 (moderation/app)

신고 큐를 보고 **가림 · 계정 정지 · 기각**을 수행하는 운영 콘솔이다(HP-227, 화면 정본 = HP-227 코멘트 11343).

**https://console.replix.tv/moderation/ 에서 연다**(HP-456). 2026-10-10부터 운영 콘솔 공용 틀(`shell/app`, HP-506)이 이 소스를 불러 한 앱으로 빌드한다 — 톱바·왼쪽 메뉴·로그인은 틀이 맡고, 이 폴더는 조치 화면(`ModerationRoutes`)과 관리 API 래퍼(`api/admin.ts`)를 낸다. 환경·인증·API 호출·PROD 확인은 콘솔 공용 기반 `core/`가 맡는다(HP-522). 한 화면에서 DEV/PROD를 전환하고(개발 서버는 LOCAL까지), 환경을 바꾸면 기존 토큰과 화면 상태를 폐기하고 해당 Keycloak에서 다시 인증한다. 서버의 환경·issuer·audience·azp 자기 선언과 콘솔 프로필이 하나라도 다르면 데이터를 그리기 전에 차단한다(HP-337).

## 왜 replix-console에 있나 (HP-267 → HP-456)

2026-09-28까지는 `Replix-be/admin-ui/`에 있었다. BE API와 콘솔이 함께 바뀔 때 **한 PR·한 리뷰로 원자적으로** 나가는 이득 때문이었고(HP-267), 분리 조건 셋 중 첫째가 "**자체 배포 대상이 생길 때** — 호스팅을 붙이는 순간 BE와 릴리즈 단위가 갈린다"였다. console.replix.tv(운영 도구를 한 호스트 아래 경로로 모으는 GitHub Pages)가 그 배포 대상이라, 커밋 이력째(git subtree) 이 저장소로 옮겼다(HP-456, 김지호 결정).

- **치른 값**: BE API와 화면을 함께 바꾸면 PR이 두 저장소로 갈린다. **BE를 먼저 배포하고 콘솔을 나중에 머지**한다 — 콘솔이 먼저 나가면 아직 없는 API를 부른다. 관리 API는 필드를 더하는 쪽으로 바꾼다.
- **공개 저장소다**: Replix-be(비공개)와 달리 replix-console은 공개다. 소스·주석·테스트·이력이 공개되는 것을 알고 옮겼다. 비밀값은 원래 없다(브라우저에 실리는 공개 값뿐) — 앞으로도 넣지 않는다.

## 배포

배포물은 저장소 루트의 `npm run build`가 만든다(공용 틀 `shell/app`이 이 소스를 함께 묶는다) — `docs/index.html` 한 장과 그 복사본 `docs/seeding/`·`docs/moderation/index.html`. 이 파일들을 함께 커밋하고 **main 머지가 곧 배포**다. GitHub Pages 캐시가 `max-age=600`이라 반영까지 최대 10분 걸린다. 이 폴더에는 따로 빌드하는 길이 없다(HP-521).

연결 환경(주소 경로 `/moderation/<local|dev|prod>/`)·로그인·서버 대조·깊은 주소 복원·프레임 차단·쓰기 중 이탈 규칙과 환경 변수·Keycloak redirect URI는 콘솔 공용 기반으로 옮겼다 — [`core/README.md`](../../core/README.md)(HP-522).

## 요구 사항

- Node 20+ / npm
- 콘솔 사용자 Keycloak 계정에 realm 역할이 필요하다. 기존 **`admin`**은 모든 기능을 유지한다.
  - `admin_console_viewer`: 조회 전용
  - `moderation_operator`: 조회 + 신고·메시지·계정 조치
  - `feature_flag_operator`: 기능 제어(HP-343에서 사용)
  - `prod_change_approver`: PROD 고위험 변경 승인(HP-343에서 사용)

## 시작하기

조치만 따로 띄우는 개발 서버는 없다(HP-521) — 콘솔 전체(홈·시딩·조치)를 공용 틀 개발 서버로 띄운다.

```bash
npm install                                   # 저장소 루트에서 한 번(HP-524)
cp shell/app/.env.example shell/app/.env.local  # 개발 서버용 LOCAL/DEV/PROD 값(core/README.md 환경 변수)
npm run dev                                   # http://localhost:5173/moderation/dev/ (로컬 BE는 /moderation/local/)
npx vitest --project moderation               # 조치 테스트(전체는 npm test)
```

포트는 **5173 고정**(strictPort — redirect URI 등록과 일치해야 해서, 포트가 밀리면 기동을 실패시킨다). 톱바의 서버 칩에서 전환하면 주소 경로의 환경 조각이 바뀐다(`/moderation/local|dev|prod/`).

## 테스트

```bash
npx vitest --project moderation   # 저장소 루트에서 — vitest(RTL 컴포넌트·API 래퍼 유닛)
npm run typecheck                 # 네 폴더 tsc
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
