import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { bootFailureCause, isFramed, routerBasename } from './bootGuards'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

// env 검증(env.ts)은 모듈 평가 시점에 throw 한다 — 정적 import면 catch 밖이라 흰 화면만
// 남는다(리뷰 m7). auth/App을 동적 import로 catch 범위에 넣어 누락 안내를 그린다.
// 싱글파일 빌드(HP-456)는 동적 import까지 한 파일로 합쳐 즉시 평가하므로, 그 빌드에서 모듈 평가 중
// 난 예외는 index.html의 error 리스너가 받아 두고 아래 catch가 그 원인을 보인다(bootFailureCause).
async function boot() {
  const [{ initAuth }, { verifyEnvironment }, { default: App }] = await Promise.all([
    import('./auth'), import('./environmentGuard'), import('./App'),
  ])
  // 로그인(login-required)이 끝나기 전에는 화면을 그리지 않는다 — 콘솔의 모든 화면이 토큰 전제.
  await initAuth()
  // 잘못된 API/Keycloak 조합이면 목록 요청이 나가기 전에 fail-closed한다(HP-337).
  await verifyEnvironment()
  root.render(
      <StrictMode>
        {/* console.replix.tv/moderation/ 아래에서 돈다(HP-456) — 경로는 Vite base 하나가 정본. */}
        <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
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
        콘솔 초기화 실패 — 연결 환경 설정과 Keycloak redirect URI 등록을 확인하세요.
        ({String(bootFailureCause(window, e))})
      </div>))
}
