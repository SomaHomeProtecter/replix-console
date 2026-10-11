import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isFramed } from '@core/bootGuards'
// 콘솔 공용 기반의 스타일(토큰·기본 요소·버튼·다이얼로그·톱바 부품·PROD 확인 창, HP-522)을 가장 먼저 깐다. 조치 화면의 규칙과
// 틀 자기 클래스(cs-)는 그 위에 더한다 — 순서가 곧 우선순위다.
import '@core/styles/core.css'
import '@moderation/styles.css'
import './shell/shell.css'

// 부팅 뒤 렌더 오류는 React가 루트를 비운다(에러 경계가 없다) — 흰 화면 대신 무엇이 났는지 알린다(HP-456).
const root = createRoot(document.getElementById('root')!, {
  onUncaughtError: (error) => root.render(
      <div className="boot-error">
        화면을 그리다 오류가 났습니다 — 새로고침하세요. 계속되면 이 문구를 알려 주세요. ({String(error)})
      </div>),
})

// 연결 환경은 부팅 안에서 정한다 — 모듈 평가 시점에는 어떤 모듈도 던지지 않으므로, 싱글파일 빌드(동적 import까지
// 한 파일로 합쳐 즉시 평가)에서도 부팅 중 예외가 모두 아래 catch에 닿는다(HP-456과 같은 규칙).
async function boot() {
  const [{ bootConsole }, { default: ConsoleApp }, { default: DeniedPage }] = await Promise.all([
    import('./boot'), import('./ConsoleApp'), import('./DeniedPage'),
  ])
  const result = await bootConsole()
  root.render(
      <StrictMode>
        {result.kind === 'denied' ? <DeniedPage /> : <ConsoleApp />}
      </StrictMode>)
}

if (isFramed(window)) {
  // 다른 사이트의 프레임 안에서는 로그인도 화면도 시작하지 않는다(HP-456 — GitHub Pages는 X-Frame-Options를 못 붙인다).
  root.render(
      <div className="boot-error">
        운영 콘솔은 다른 사이트 안에서 열 수 없습니다. 새 탭에서 직접 여세요.
      </div>)
} else {
  boot().catch((e: unknown) => root.render(
      <div className="boot-error">
        콘솔 초기화 실패 — 연결 환경 설정과 Keycloak redirect URI 등록을 확인하세요. ({String(e)})
      </div>))
}
