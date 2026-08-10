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
          {/* 지표 화면은 만들지 않는다(HP-223 확정 제약 ③ — Redis 전수 스캔 회피 + HP-102 스택
              재사용). 대신 있는 곳으로 보낸다(HP-297). 이모지를 쓰지 않는 이유는 HP-310과 같다 —
              컬러 이모지만 다른 톤으로 렌더돼 한 줄 안에서 글자와 섞인다. */}
          {env.grafanaUrl && (
            <a
                className="grafana-link" href={env.grafanaUrl}
                target="_blank" rel="noreferrer noopener">
              Grafana · 모더레이션
            </a>
          )}
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
