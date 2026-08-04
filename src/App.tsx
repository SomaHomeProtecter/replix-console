import { Link, Route, Routes } from 'react-router'
import { logout, userName } from './auth'
import { env } from './env'
import ReportQueuePage from './pages/ReportQueuePage'
import UserDetailPage from './pages/UserDetailPage'

/** 화면 2개가 전부다(정본) — 신고 큐(홈)와 신고 큐 경유로만 진입하는 사용자 상세. 톱바 = 시안 cm-top. */
export default function App() {
  const envLabel = env.apiBaseUrl.includes('replix-dev') ? 'DEV' : 'LOCAL'
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand"><span className="rx">Re</span>plix Admin</Link>
        <span className="env-chip">{envLabel}</span>
        <nav className="topnav"><span className="on">신고 큐</span></nav>
        <div className="topbar-right">
          <span>{userName()} (admin)</span>
          <button type="button" className="btn-logout" onClick={() => logout()}>로그아웃</button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<ReportQueuePage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
