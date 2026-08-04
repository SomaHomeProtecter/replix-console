import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initAuth } from './auth'
import './styles.css'

// 로그인(login-required)이 끝나기 전에는 화면을 그리지 않는다 — 콘솔의 모든 화면이 토큰 전제.
const root = createRoot(document.getElementById('root')!)
initAuth()
  .then(() => root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>))
  .catch((e: unknown) => root.render(
      <div className="boot-error">Keycloak 로그인 초기화 실패 — .env.local·redirect URI 등록을 확인하세요. ({String(e)})</div>))
