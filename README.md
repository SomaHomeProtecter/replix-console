# Replix 조치 콘솔 (admin-ui)

신고 큐를 보고 **가림 · 계정 정지 · 기각**을 수행하는 운영 콘솔이다(HP-227, 화면 정본 = HP-227 코멘트 11343).

**배포하지 않는다 (확정)** — 팀원이 로컬에서 `npm run dev`로 연다. 방어선은 URL 비밀이 아니라 **토큰 + admin 역할**이므로 로컬 구동으로도 보안 수준은 같고, 공개 호스팅(Pages/ALB)은 무단 접근 시도 표면과 CD만 늘린다. 팀 외부 운영자가 생기면 그때 호스팅을 다시 판단한다.

## 요구 사항

- Node 20+ / npm
- 콘솔 사용자 Keycloak 계정에 realm 역할 **`admin`** — 없으면 로그인은 되지만 목록·조치가 전부 403이고, 그 판정이 화면에 그대로 뜬다(의도된 동작).

## 시작하기

```bash
cd admin-ui
npm install
cp .env.example .env.local   # 기본값 = dev 환경. 로컬 BE 대상이면 아래 표 참조
npm run dev                  # http://localhost:5173
```

브라우저에서 `http://localhost:5173` → Keycloak 로그인 → 신고 큐. 포트는 **5173 고정**(strictPort — redirect URI 등록과 일치해야 해서, 포트가 밀리면 기동을 실패시킨다).

## 환경 변수 (.env.local)

| 변수 | dev 환경 | 로컬 BE |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://api.replix-dev.site` | `http://localhost:8080` |
| `VITE_KC_URL` | `https://auth.replix-dev.site` | `http://localhost:8081` |
| `VITE_KC_REALM` | `replix` | `replix` |
| `VITE_KC_CLIENT_ID` | `replix-web` | `replix-web` |

client는 **기존 `replix-web`을 그대로 쓴다** — BE `AzpValidator`가 단일 azp만 수용해 새 client 토큰은 401이 된다(HP-225).

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

- 화면 2개뿐: **신고 큐**(테이블 + 우측 상세 패널, 상태·사유 필터, 커서 페이징) / **사용자 상세**(기본 정보 블록 + 받은 신고·조치 이력·정지 이력 탭 — 진입은 신고 큐 경유만).
- **지표·차트 없음**(HP-228 Grafana 담당) · **회원 검색·목록 없음**(니즈 실증 후 별도 판단).
- 빨강은 파괴적 조치(정지) 전용 — 나머지는 잉크 톤.
