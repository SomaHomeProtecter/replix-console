import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isFramed } from '@moderation/bootGuards'
// 조치 콘솔의 스타일이 콘솔 전체의 시각 정본(토큰·톱바 부품·확인 창)이다. 틀은 그 토큰 위에 자기 클래스(cs-)만 더한다.
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
