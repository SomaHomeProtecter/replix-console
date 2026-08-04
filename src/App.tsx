import { Link, Route, Routes } from 'react-router-dom'
import { logout, userName } from './auth'
import ReportQueuePage from './pages/ReportQueuePage'
import UserDetailPage from './pages/UserDetailPage'

/** 화면 2개가 전부다(정본) — 신고 큐(홈)와 신고 큐 경유로만 진입하는 사용자 상세. */
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Replix 조치 콘솔</Link>
        <div className="topbar-right">
          <span className="topbar-user">{userName()}</span>
          <button type="button" className="btn btn-quiet" onClick={() => logout()}>로그아웃</button>
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
