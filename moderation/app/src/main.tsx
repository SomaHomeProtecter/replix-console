import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { isFramed } from './bootGuards'
import './styles.css'

// 부팅 뒤 렌더 오류는 React가 루트를 비운다(에러 경계가 없다) — 흰 화면 대신 무엇이 났는지 알린다(HP-456).
const root = createRoot(document.getElementById('root')!, {
  onUncaughtError: (error) => root.render(
      <div className="boot-error">
        화면을 그리다 오류가 났습니다 — 새로고침하세요. 계속되면 이 문구를 알려 주세요. ({String(error)})
      </div>),
})

// 연결 환경은 부팅 안에서 initEnv()가 정한다 — 모듈 평가 시점에는 어떤 모듈도 던지지 않으므로, 싱글파일
// 빌드(동적 import까지 한 파일로 합쳐 즉시 평가)에서도 부팅 중 예외가 모두 아래 catch에 닿는다(HP-456).
async function boot() {
  const [{ initEnv }, { initAuth }, { verifyEnvironment }, { default: App }] = await Promise.all([
    import('./env'), import('./auth'), import('./environmentGuard'), import('./App'),
  ])
  // 주소를 먼저 정본으로 맞춘다 — 깊은 주소 복원(404.html의 ?p=)과 환경 경로(/moderation/<env>/…).
  // Keycloak 로그인 복귀 주소와 라우터 basename이 이 결과를 쓴다.
  const route = initEnv()
  // 로그인(login-required)이 끝나기 전에는 화면을 그리지 않는다 — 콘솔의 모든 화면이 토큰 전제.
  await initAuth()
  // 잘못된 API/Keycloak 조합이면 목록 요청이 나가기 전에 fail-closed한다(HP-337).
  await verifyEnvironment()
  root.render(
      <StrictMode>
        <BrowserRouter basename={route.basename}>
          <App />
        </BrowserRouter>
      </StrictMode>)
}

if (isFramed(window)) {
  // 다른 사이트의 프레임 안에서는 로그인도 화면도 시작하지 않는다(HP-456 — 이유는 bootGuards.ts).
  root.render(
      <div className="boot-error">
        조치 콘솔은 다른 사이트 안에서 열 수 없습니다. 새 탭에서 직접 여세요.
      </div>)
} else {
  boot().catch((e: unknown) => root.render(
      <div className="boot-error">
        콘솔 초기화 실패 — 연결 환경 설정과 Keycloak redirect URI 등록을 확인하세요. ({String(e)})
      </div>))
}
