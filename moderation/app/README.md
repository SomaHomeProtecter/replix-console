# Replix 조치 콘솔 (admin-ui)

신고 큐를 보고 **가림 · 계정 정지 · 기각**을 수행하는 운영 콘솔이다(HP-227, 화면 정본 = HP-227 코멘트 11343).

**현재는 배포하지 않는다** — 팀원이 로컬에서 `npm run dev`로 열되 한 화면에서 LOCAL/DEV/PROD를 전환한다. 환경을 바꾸면 기존 토큰과 화면 상태를 폐기하고 해당 Keycloak에서 다시 인증한다. 서버의 환경·issuer·audience·azp 자기 선언과 콘솔 프로필이 하나라도 다르면 데이터를 그리기 전에 차단한다(HP-337).

## 왜 BE 레포에 있나 · 언제 분리하나 (HP-267)

이 SPA는 별도 레포가 아니라 `Replix-be/admin-ui/`에 있다. **빌드·런타임 결합은 0**이다 — `settings.gradle`에 서브프로젝트로 없어 `./gradlew build`가 건드리지 않고, `Dockerfile`도 `gradlew · settings.gradle · build.gradle · gradle/ · src/`만 COPY해서 **런타임 이미지에 들어가지 않는다**. 같이 두는 이득은 BE API와 콘솔이 함께 바뀔 때 **한 PR·한 리뷰로 원자적으로** 나간다는 것이다(HP-227에서 BE 2건 + SPA가 그렇게 나갔다 — 레포가 갈렸으면 매번 두 PR + 버전 스큐).

유일한 실제 비용이던 **CI 헛돌기**(admin-ui만 바꿔도 BE 풀 빌드 + ECR push + dev 재배포가 돌아 내용이 같은 이미지를 새 태그로 올리던 문제)는 `Jenkinsfile`의 경로 필터로 막았다 — 그러니 **"레포에 섞여 지저분하다"는 이유만으로 쪼개지 말 것.** 3인 팀에 이미 레포가 4개(be·extension·AI·site)라 5번째의 동기화 비용이 결합도 0인 현 상태의 불편보다 크다.

**아래 셋 중 하나라도 성립하면 그때 분리한다:**

1. **자체 배포 대상이 생길 때** — 지금은 로컬 `npm run dev` 전용이라 배포 파이프라인이 아예 없다(아래 "배포하지 않는다"). S3+CloudFront 같은 호스팅을 붙이는 순간 BE와 릴리즈 단위가 갈린다.
2. **오너가 갈리거나 릴리즈 주기가 달라질 때** — 콘솔과 BE API를 서로 다른 사람이 다른 주기로 내보내기 시작하면, 한 PR로 묶이는 이득이 사라지고 남의 레포를 건드리는 비용만 남는다.
3. **콘솔 자체 CI 게이트(lint·vitest)가 BE 파이프라인을 막을 때** — 프런트 테스트 실패로 BE 배포가 막히기 시작하면 파이프라인을 갈라야 한다.

## 요구 사항

- Node 20+ / npm
- 콘솔 사용자 Keycloak 계정에 realm 역할이 필요하다. 기존 **`admin`**은 모든 기능을 유지한다.
  - `admin_console_viewer`: 조회 전용
  - `moderation_operator`: 조회 + 신고·메시지·계정 조치
  - `feature_flag_operator`: 기능 제어(HP-343에서 사용)
  - `prod_change_approver`: PROD 고위험 변경 승인(HP-343에서 사용)

## 시작하기

```bash
cd admin-ui
npm install
cp .env.example .env.local   # 기본값 = dev 환경. 로컬 BE 대상이면 아래 표 참조
npm run dev                  # http://localhost:5173
```

브라우저에서 `http://localhost:5173` → Keycloak 로그인 → 신고 큐. 포트는 **5173 고정**(strictPort — redirect URI 등록과 일치해야 해서, 포트가 밀리면 기동을 실패시킨다). 톱바 환경 선택에서 전환하며 URL에는 `?environment=DEV|PROD|LOCAL`이 남는다.

## 환경 변수 (.env.local)

환경마다 `VITE_<LOCAL|DEV|PROD>_API_BASE_URL`, `KC_URL`, `KC_REALM`, `KC_CLIENT_ID`,
`EXPECTED_AUDIENCE`, `EXPECTED_AZP`를 각각 둔다. 전체 예시는 `.env.example`이 정본이다.
`VITE_DEFAULT_ENVIRONMENT`는 URL 선택값이 없을 때만 사용한다.

client는 **기존 `replix-web`을 그대로 쓴다**. BE는 issuer·audience·azp를 독립 검증하므로 어느 하나라도 다른 토큰은 401이다.

## Keycloak redirect URI

`replix-web` client의 redirect URI에 `http://localhost:5173/*`가 등록돼 있어야 한다.

- **dev**: 반영 확인 완료(2026-08-04, kcadm 실측). realm import 파일(`keycloak/import/replix-realm.json`)에도 포함돼 있어 새 환경은 자동이다.
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
