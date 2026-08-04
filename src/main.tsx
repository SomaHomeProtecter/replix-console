import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

// env 검증(env.ts)은 모듈 평가 시점에 throw 한다 — 정적 import면 catch 밖이라 흰 화면만
// 남는다(리뷰 m7). auth/App을 동적 import로 catch 범위에 넣어 누락 안내를 그린다.
async function boot() {
  const [{ initAuth }, { default: App }] = await Promise.all([import('./auth'), import('./App')])
  // 로그인(login-required)이 끝나기 전에는 화면을 그리지 않는다 — 콘솔의 모든 화면이 토큰 전제.
  await initAuth()
  root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>)
}

boot().catch((e: unknown) => root.render(
    <div className="boot-error">
      콘솔 초기화 실패 — .env.local 값과 Keycloak redirect URI 등록을 확인하세요. ({String(e)})
    </div>))
