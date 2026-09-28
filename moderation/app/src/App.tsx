import type { MouseEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { logout, roleLabel, switchEnvironment, userName } from './auth'
import { env } from './env'
import { CONSOLE_ENVIRONMENTS } from './environment'
import ActionLogPage from './pages/ActionLogPage'
import ModerationReviewPage from './pages/ModerationReviewPage'
import UserSearch from './components/UserSearch'
import ConsoleSwitcher from './components/ConsoleSwitcher'
import ReportQueuePage from './pages/ReportQueuePage'
import SuspensionBoardPage from './pages/SuspensionBoardPage'
import UserDetailPage from './pages/UserDetailPage'
import { useWriting, WritingProvider } from './writing'
import ProductionWriteGuard from './ProductionWriteGuard'
import FeatureControlPage from './pages/FeatureControlPage'
import FeatureChangeSetPage from './pages/FeatureChangeSetPage'
import FeatureControlPresetPage from './pages/FeatureControlPresetPage'
import ServiceNoticePage from './pages/ServiceNoticePage'
import FeatureDriftPage from './pages/FeatureDriftPage'
import IncidentTimelinePage from './pages/IncidentTimelinePage'
import IncidentModePage from './pages/IncidentModePage'
import IncidentPrimaryBanner from './components/IncidentPrimaryBanner'
import OperationCasesPage from './pages/OperationCasesPage'
import CleanbotPolicyPage from './pages/CleanbotPolicyPage'
import FeedbackPage from './pages/FeedbackPage'

/**
 * 주요 조치 화면 — 신고 큐(홈) · 정지 현황판 · 전역 조치 로그 · 클린봇 검토 · 기능 제어 · 사용자 상세.
 * 톱바 = 시안 cm-top.
 *
 * <p>상세는 신고 큐·현황판·조치 로그와 톱바 사용자 검색에서 들어간다. 검색은 상세 진입만 열고,
 * 빈 검색으로 펼쳐지는 회원 전체 목록은 만들지 않는다.
 */
function AppContent() {
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
        <ConsoleSwitcher disabled={writing} disabledTitle={writingTitle} />
        <label className={`env-selector env-${env.environment.toLowerCase()}`}>
          <span className="sr-only">연결 환경</span>
          <select
              aria-label="연결 환경" value={env.environment} disabled={writing}
              title={writingTitle ?? '환경을 바꾸면 현재 토큰과 선택 내용을 지우고 다시 로그인합니다'}
              onChange={(event) => switchEnvironment(event.target.value as typeof env.environment)}>
            {CONSOLE_ENVIRONMENTS.map((candidate) => (
              <option key={candidate} value={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
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
          <NavLink
              to="/actions" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            조치 로그
          </NavLink>
          <NavLink
              to="/moderation-reviews" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            오탐 검토
          </NavLink>
          <NavLink
              to="/operation-cases" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            운영 협업
          </NavLink>
          <NavLink
              to="/moderation-policies" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            정책 실험
          </NavLink>
          <NavLink
              to="/feature-control" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            기능 제어
          </NavLink>
          <NavLink
              to="/feedback" aria-disabled={writing || undefined}
              title={writingTitle} onClick={preventWhileWriting}>
            피드백
          </NavLink>
        </nav>
        <UserSearch disabled={writing} disabledTitle={writingTitle} />
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
          <span className="operator">{userName()} ({roleLabel()})</span>
          <button
              type="button" className="btn-logout" disabled={writing} title={writingTitle}
              onClick={() => logout()}>
            로그아웃
          </button>
        </div>
      </header>
      {env.environment === 'PROD' && (
        <div className="prod-environment-banner" role="status">
          PROD 운영 환경 · 실제 사용자 데이터에 즉시 반영됩니다
        </div>
      )}
      <IncidentPrimaryBanner />
      <main className="content">
        <Routes>
          <Route path="/" element={<ReportQueuePage />} />
          <Route path="/suspensions" element={<SuspensionBoardPage />} />
          <Route path="/actions" element={<ActionLogPage />} />
          <Route path="/moderation-reviews" element={<ModerationReviewPage />} />
          <Route path="/operation-cases" element={<OperationCasesPage />} />
          <Route path="/moderation-policies" element={<CleanbotPolicyPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/feature-control" element={<FeatureControlPage />} />
          <Route path="/feature-control/change-sets" element={<FeatureChangeSetPage />} />
          <Route path="/feature-control/presets" element={<FeatureControlPresetPage />} />
          <Route path="/feature-control/notices" element={<ServiceNoticePage />} />
          <Route path="/feature-control/drift" element={<FeatureDriftPage />} />
          <Route path="/feature-control/incidents" element={<IncidentTimelinePage />} />
          <Route path="/feature-control/incident-mode" element={<IncidentModePage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <WritingProvider>
      <ProductionWriteGuard><AppContent /></ProductionWriteGuard>
    </WritingProvider>
  )
}
