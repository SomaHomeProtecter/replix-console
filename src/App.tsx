import type { MouseEvent } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { logout, userName } from './auth'
import { env } from './env'
import ReportQueuePage from './pages/ReportQueuePage'
import SuspensionBoardPage from './pages/SuspensionBoardPage'
import UserDetailPage from './pages/UserDetailPage'
import { useWriting, WritingProvider } from './writing'

/**
 * 화면 3개 — 신고 큐(홈) · 정지 현황판(HP-300) · 사용자 상세. 톱바 = 시안 cm-top.
 *
 * <p>상세는 여전히 <b>직접 가는 길이 없다</b>: 신고 큐나 현황판의 이름을 눌러 들어간다.
 * 회원 검색·목록은 만들지 않는다 — 콘솔의 동선은 "신고·정지에서 사람으로"이지 그 반대가 아니다.
 */
function AppContent() {
  const envLabel = env.apiBaseUrl.includes('replix-dev') ? 'DEV' : 'LOCAL'
  const { writing } = useWriting()
  const writingTitle = writing
    ? '정지 해제를 처리하는 중입니다 — 끝나면 이동할 수 있습니다'
    : undefined
  const preventWhileWriting = (event: MouseEvent<HTMLAnchorElement>) => {
    if (writing) event.preventDefault()
  }
  return (
    <div className="app">
      <header className="topbar">
        <Link
            to="/" className="brand" aria-disabled={writing || undefined}
            title={writingTitle} onClick={preventWhileWriting}>
          <span className="rx">Re</span>plix Admin
        </Link>
        <span className="env-chip">{envLabel}</span>
        {/* 신고 큐는 "/"라 다른 <b>모든</b> 경로의 접두사다. end는 "정확히 그 경로일 때만 켜진다"는
            뜻을 못박아 둔 것이지, 지금 동작을 바꾸지는 않는다 — react-router 8.3은 접두사 일치에
            경로 경계(다음 글자가 "/")를 함께 보므로(lib/dom/lib.js의 endSlashPosition) end 없이도
            /suspensions에서 켜지지 않는다. 2026-08-12 변이 테스트에서 end를 떼도 전 테스트가
            통과해 확인했다. 그 세부에 기대지 않으려고 남긴다 — 켜짐 판정은 App.test가 지킨다. */}
        <nav className="topnav">
          <NavLink
              to="/" end aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            신고 큐
          </NavLink>
          <NavLink
              to="/suspensions" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            정지 현황
          </NavLink>
        </nav>
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
          <button
              type="button" className="btn-logout" disabled={writing} title={writingTitle}
              onClick={() => logout()}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<ReportQueuePage />} />
          <Route path="/suspensions" element={<SuspensionBoardPage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return <WritingProvider><AppContent /></WritingProvider>
}
